/**
 * The mix graph every sound in the game goes through. Pure WebAudio on a
 * `BaseAudioContext`, so the same code runs live and in an
 * `OfflineAudioContext` (tests, audition renders).
 *
 *   voice ─► bus (ui | sfx | ambience | music) ─► duck ─► master ─► drive ─► glue
 *     └─► send (scaled like its bus) ─► reverb (outdoor | room) ─┘            compressor
 *                                                                  ─► limiter ─► trim ─► out
 */

export type Bus = "ui" | "sfx" | "ambience" | "music";
export const BUSES: readonly Bus[] = ["ui", "sfx", "ambience", "music"];

/** Fixed bus gains: the balance between families of sound. */
export const BUS_GAIN: Readonly<Record<Bus, number>> = {
  ui: 0.6,
  sfx: 0.9,
  ambience: 0.7,
  music: 0.5,
};
export const MASTER_GAIN = 0.8;
/**
 * Fixed gain into the compressor. The bus gains and the palette's level
 * column set the balance; this sets the absolute loudness, so a busy mix sits
 * at about -21 dBFS RMS (measured, tests/audioRender.test.ts) and the glue
 * compressor and limiter actually catch the big moments.
 */
export const DRIVE = 5;
/** Output ceiling after the limiter; keeps true peaks under -1 dBFS even
 * with the compressor's own make-up gain. */
export const OUTPUT_TRIM = 0.84;

export const COMPRESSOR = { threshold: -14, knee: 12, ratio: 3, attack: 0.005, release: 0.18 } as const;
export const LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.05 } as const;

export type Space = "outdoor" | "room";
/** Synthesised impulse responses: length (s), decay constant (s), low-pass (Hz), pre-delay (s). */
export const SPACES: Readonly<Record<Space, { length: number; tau: number; lowpass: number; predelay: number }>> = {
  outdoor: { length: 1.4, tau: 0.35, lowpass: 4500, predelay: 0.012 },
  room: { length: 0.6, tau: 0.16, lowpass: 6000, predelay: 0.004 },
};

export type MixGraph = {
  ctx: BaseAudioContext;
  /** Per-bus input: voices connect here. */
  bus: Record<Bus, GainNode>;
  /** Per-bus reverb send scaler (follows the bus level). */
  send: Record<Bus, GainNode>;
  /** Ducking stage per bus (1 = no duck). */
  duck: Record<Bus, GainNode>;
  /** Music only: low-pass that closes inside rooms. */
  musicTone: BiquadFilterNode;
  master: GainNode;
  /** Final node before the output (for metering in tests). */
  out: GainNode;
  reverb: {
    input: GainNode;
    space: Space;
    wet: Record<Space, GainNode>;
    convolver: Record<Space, ConvolverNode | null>;
  };
  /** Nodes created by the graph itself (not by voices). */
  nodeCount: number;
};

/** Deterministic xorshift noise in [-1, 1). */
export function seededNoise(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 2147483648 - 1;
  };
}

/**
 * Stereo noise × exp(-t/τ), one-pole low-passed, with a pre-delay and a 2 ms
 * fade-in, normalised to unit energy per channel. Pure on the sample arrays.
 */
export function impulseSamples(sampleRate: number, space: Space, seed = 7): [Float32Array, Float32Array] {
  const spec = SPACES[space];
  const length = Math.ceil(sampleRate * spec.length);
  const pre = Math.round(sampleRate * spec.predelay);
  const fade = Math.max(1, Math.round(sampleRate * 0.002));
  const a = Math.exp((-2 * Math.PI * spec.lowpass) / sampleRate);
  const channels: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)];
  channels.forEach((data, c) => {
    const rnd = seededNoise(seed * 31 + c * 977 + 1);
    let y = 0,
      energy = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sampleRate;
      y = (1 - a) * rnd() + a * y;
      // Last 5% fades to zero so the tail never ends on a step.
      const tail = Math.min(1, (length - i) / (length * 0.05));
      const v = y * Math.exp(-t / spec.tau) * Math.min(1, (i - pre) / fade) * tail;
      data[i] = v;
      energy += v * v;
    }
    const k = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    for (let i = 0; i < length; i++) data[i] *= k;
  });
  return channels;
}

export function impulseResponse(ctx: BaseAudioContext, space: Space): AudioBuffer {
  const [l, r] = impulseSamples(ctx.sampleRate, space);
  const buffer = ctx.createBuffer(2, l.length, ctx.sampleRate);
  buffer.getChannelData(0).set(l);
  buffer.getChannelData(1).set(r);
  return buffer;
}

function compressor(ctx: BaseAudioContext, spec: typeof COMPRESSOR | typeof LIMITER): AudioNode | null {
  if (typeof ctx.createDynamicsCompressor !== "function") return null;
  const node = ctx.createDynamicsCompressor();
  node.threshold.value = spec.threshold;
  node.knee.value = spec.knee;
  node.ratio.value = spec.ratio;
  node.attack.value = spec.attack;
  node.release.value = spec.release;
  return node;
}

/** Builds the bus/master chain into `destination` (the context's by default). */
export function buildMixGraph(
  ctx: BaseAudioContext,
  options: { destination?: AudioNode; reverb?: boolean; space?: Space; masterGain?: number } = {},
): MixGraph {
  let nodeCount = 0;
  const gain = (value: number) => {
    nodeCount++;
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  };
  const master = gain(options.masterGain ?? MASTER_GAIN);
  const drive = gain(DRIVE);
  master.connect(drive);
  const out = gain(OUTPUT_TRIM);
  const glue = compressor(ctx, COMPRESSOR),
    limiter = compressor(ctx, LIMITER);
  let tail: AudioNode = drive;
  for (const stage of [glue, limiter]) {
    if (!stage) continue;
    nodeCount++;
    tail.connect(stage);
    tail = stage;
  }
  tail.connect(out);
  out.connect(options.destination ?? ctx.destination);

  const bus = {} as Record<Bus, GainNode>,
    send = {} as Record<Bus, GainNode>,
    duck = {} as Record<Bus, GainNode>;
  nodeCount++;
  const musicTone = ctx.createBiquadFilter();
  musicTone.type = "lowpass";
  musicTone.frequency.value = 18000;
  musicTone.Q.value = 0.5;
  const reverbInput = gain(1);
  for (const name of BUSES) {
    bus[name] = gain(BUS_GAIN[name]);
    duck[name] = gain(1);
    send[name] = gain(BUS_GAIN[name]);
    if (name === "music") {
      bus[name].connect(musicTone);
      musicTone.connect(duck[name]);
    } else bus[name].connect(duck[name]);
    duck[name].connect(master);
    send[name].connect(reverbInput);
  }
  const space = options.space ?? "outdoor";
  const wet = { outdoor: gain(space === "outdoor" ? 1 : 0), room: gain(space === "room" ? 1 : 0) };
  const convolver: Record<Space, ConvolverNode | null> = { outdoor: null, room: null };
  if (options.reverb !== false && typeof ctx.createConvolver === "function") {
    for (const s of ["outdoor", "room"] as const) {
      nodeCount++;
      const c = ctx.createConvolver();
      c.normalize = false;
      c.buffer = impulseResponse(ctx, s);
      convolver[s] = c;
      c.connect(wet[s]);
      wet[s].connect(master);
    }
    // Only the active space convolves: the idle one is disconnected (CPU).
    reverbInput.connect(convolver[space]!);
  }
  return {
    ctx,
    bus,
    send,
    duck,
    musicTone,
    master,
    out,
    reverb: { input: reverbInput, space, wet, convolver },
    nodeCount,
  };
}

/**
 * Crossfades the reverb to another space over `fade` seconds. Returns a
 * function that disconnects the idle convolver; call it after the fade
 * (live code does so on a timer), so only one convolver ever runs.
 */
export function setSpace(graph: MixGraph, space: Space, fade = 0.3): () => void {
  const r = graph.reverb;
  if (r.space === space) return () => {};
  const from = r.space;
  r.space = space;
  const t = graph.ctx.currentTime;
  const next = r.convolver[space];
  if (next) r.input.connect(next);
  r.wet[space].gain.cancelScheduledValues(t);
  r.wet[space].gain.setValueAtTime(r.wet[space].gain.value, t);
  r.wet[space].gain.linearRampToValueAtTime(1, t + fade);
  r.wet[from].gain.cancelScheduledValues(t);
  r.wet[from].gain.setValueAtTime(r.wet[from].gain.value, t);
  r.wet[from].gain.linearRampToValueAtTime(0, t + fade);
  return () => {
    const idle = r.convolver[from];
    if (idle && r.space !== from)
      try {
        r.input.disconnect(idle);
      } catch {
        /* Already disconnected. */
      }
  };
}

/** Slider value 0–100 → linear gain (squared: close to perceived loudness). */
export const sliderGain = (value: number) => {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)) / 100;
  return v * v;
};

export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity);
