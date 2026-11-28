/**
 * The sound palette: every one-shot in the game as a small layered recipe.
 * All synthesis (no recordings), built from four primitives: a filtered
 * noise burst, a pitched sweep (optionally a detuned pair), an FM bell and a
 * pitched thump. Recipes take a `BaseAudioContext`, so they render the same
 * live and offline.
 *
 * A recipe writes into `out` with a peak of about 1; the voice gain in front
 * of the bus sets the level from SPECS (× a per-recipe trim measured from
 * offline renders, so the level column is the true peak).
 */
import { seededNoise, type Bus } from "./graph";

export type Voicing = {
  /** Pitch multiplier (1 = as specified). */
  pitch: number;
  /** Random source in [0, 1) for grain and variation. */
  rnd: () => number;
  /** Seconds, for cues whose length follows an event (flight). */
  duration?: number;
  /** 0–1 strength (shuttle smash, cheer size); 1 when unset. */
  intensity?: number;
  /** Turning something off: toggles play their two notes reversed. */
  off?: boolean;
};
export type Built = { end: number; sources: AudioScheduledSourceNode[] };
type Build = (ctx: BaseAudioContext, out: AudioNode, t: number, v: Voicing) => Built;

export type Spec = {
  bus: Bus;
  /** Target peak at the bus input (the level column). */
  level: number;
  /** Reverb send. */
  send: number;
  /** Expected length in seconds (to -40 dB). */
  dur: number;
  /** Random pitch / level spread per play (fractions). */
  vary: { pitch: number; level: number };
  /** Ducks the music bus 6 dB while it plays. */
  ducks?: boolean;
  build: Build;
};

/* ------------------------------------------------------------ primitives */

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
/** Two seconds of zero-mean white noise per context, built once. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rnd = seededNoise(1234);
    let mean = 0;
    for (let i = 0; i < data.length; i++) mean += data[i] = rnd();
    mean /= data.length;
    for (let i = 0; i < data.length; i++) data[i] -= mean;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/**
 * Linear attack, exponential fall to 0.01 (absolute: -40 dB under a recipe's
 * peak of about 1, so a quieter long layer still sets the cue's length) at
 * `t + dur`, then to zero.
 */
function envelope(param: AudioParam, t: number, attack: number, dur: number, peak: number) {
  const a = Math.min(attack, dur * 0.5);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(Math.min(peak * 0.5, 0.01), t + dur);
  param.linearRampToValueAtTime(0, t + dur + 0.006);
}

type NoiseOpts = {
  type: BiquadFilterType;
  f: number;
  to?: number;
  q?: number;
  dur: number;
  attack?: number;
  level: number;
  /** Sweep shape: exponential (default) or linear. */
  linear?: boolean;
};
function noise(ctx: BaseAudioContext, out: AudioNode, t: number, v: Voicing, o: NoiseOpts) {
  const src = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  src.buffer = noiseBuffer(ctx);
  // Looped so a long layer never runs off the end of the 2 s buffer.
  src.loop = true;
  filter.type = o.type;
  filter.Q.value = o.q ?? 0.7;
  filter.frequency.setValueAtTime(o.f, t);
  if (o.to !== undefined) {
    if (o.linear) filter.frequency.linearRampToValueAtTime(o.to, t + o.dur);
    else filter.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  }
  envelope(gain.gain, t, o.attack ?? 0.003, o.dur, o.level);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(t, v.rnd() * 1.5);
  src.stop(t + o.dur + 0.03);
  return src;
}

type ToneOpts = {
  f: number;
  to?: number;
  type?: OscillatorType;
  dur: number;
  attack?: number;
  level: number;
  /** Detune in cents per oscillator: the first carries 70% of the level, the
   * rest share 30%, so the slow beating thickens the tone without ever
   * cancelling it (equal pairs null out every half beat). */
  detune?: readonly number[];
  /** Low-pass after the oscillators. */
  lowpass?: number;
  /** Sweep reaches `to` at this fraction of `dur` (default 1). */
  sweep?: number;
};
function tone(ctx: BaseAudioContext, out: AudioNode, t: number, o: ToneOpts) {
  const gain = ctx.createGain();
  envelope(gain.gain, t, o.attack ?? 0.004, o.dur, o.level);
  let head: AudioNode = gain;
  if (o.lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = o.lowpass;
    filter.Q.value = 0.6;
    filter.connect(gain);
    head = filter;
  }
  gain.connect(out);
  const cents = o.detune ?? [0];
  const sources = cents.map((c, i) => {
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.detune.value = c;
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur * (o.sweep ?? 1));
    let into: AudioNode = head;
    if (cents.length > 1) {
      const share = ctx.createGain();
      share.gain.value = i === 0 ? 0.7 : 0.3 / (cents.length - 1);
      share.connect(head);
      into = share;
    }
    osc.connect(into);
    osc.start(t);
    osc.stop(t + o.dur + 0.03);
    return osc;
  });
  return sources;
}

type BellOpts = { f: number; ratio: number; index: number; indexDecay: number; dur: number; level: number };
/** FM bell: sine carrier, sine modulator at f × ratio whose index decays. */
function bell(ctx: BaseAudioContext, out: AudioNode, t: number, o: BellOpts) {
  const carrier = ctx.createOscillator(),
    modulator = ctx.createOscillator(),
    depth = ctx.createGain(),
    gain = ctx.createGain();
  carrier.frequency.value = o.f;
  modulator.frequency.value = o.f * o.ratio;
  const deviation = o.index * o.f * o.ratio;
  depth.gain.setValueAtTime(deviation, t);
  depth.gain.exponentialRampToValueAtTime(Math.max(0.01, deviation * 0.01), t + o.indexDecay);
  envelope(gain.gain, t, 0.002, o.dur, o.level);
  modulator.connect(depth);
  depth.connect(carrier.frequency);
  carrier.connect(gain);
  gain.connect(out);
  carrier.start(t);
  modulator.start(t);
  carrier.stop(t + o.dur + 0.03);
  modulator.stop(t + o.dur + 0.03);
  return [carrier, modulator];
}

/** A pitched body: sine sweep with a fast attack (thump, knock). */
const thump = (ctx: BaseAudioContext, out: AudioNode, t: number, f: number, to: number, dur: number, level: number) =>
  tone(ctx, out, t, { f, to, dur, level, attack: 0.003, sweep: 0.7 });


const pluckBuffers = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
/**
 * A plucked steel string (Karplus–Strong, rendered once per context and
 * pitch): a noise-filled delay line averaged on each pass, so the bright
 * attack mellows into a ringing tone the way a real string does.
 */
function pluckBuffer(ctx: BaseAudioContext, f: number, seconds: number): AudioBuffer {
  let byF = pluckBuffers.get(ctx);
  if (!byF) pluckBuffers.set(ctx, (byF = new Map()));
  const key = Math.round(f * 10);
  let buffer = byF.get(key);
  if (!buffer) {
    const rate = ctx.sampleRate;
    buffer = ctx.createBuffer(1, Math.ceil(rate * seconds), rate);
    const data = buffer.getChannelData(0);
    const period = Math.max(2, Math.round(rate / f));
    const line = new Float32Array(period);
    const rnd = seededNoise(key);
    // A softened pick: low-passed noise, so the attack isn't a hiss.
    let prev = 0;
    for (let i = 0; i < period; i++) line[i] = prev = prev * 0.45 + rnd() * 0.55;
    let mean = 0;
    for (let i = 0; i < period; i++) mean += line[i];
    mean /= period;
    for (let i = 0; i < period; i++) line[i] -= mean;
    // Loss per pass tuned so low strings ring about 2 s, high ones less.
    const decay = Math.pow(0.001, 1 / (f * 1.05));
    let idx = 0;
    for (let i = 0; i < data.length; i++) {
      const next = (idx + 1) % period;
      const out = line[idx];
      line[idx] = decay * 0.5 * (out + line[next]);
      data[i] = out;
      idx = next;
    }
    byF.set(key, buffer);
  }
  return buffer;
}

function pluck(ctx: BaseAudioContext, out: AudioNode, t: number, o: { f: number; dur: number; level: number; pan?: number }) {
  const src = ctx.createBufferSource(),
    body = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  src.buffer = pluckBuffer(ctx, o.f, o.dur);
  // The guitar body: a broad resonance around 220 Hz warms the string.
  body.type = "peaking";
  body.frequency.value = 220;
  body.Q.value = 0.9;
  body.gain.value = 5;
  gain.gain.setValueAtTime(o.level, t);
  gain.gain.setValueAtTime(o.level, t + o.dur - 0.05);
  gain.gain.linearRampToValueAtTime(0, t + o.dur);
  src.connect(body).connect(gain).connect(out);
  src.start(t);
  src.stop(t + o.dur + 0.01);
  return src;
}

const built = (end: number, ...groups: (AudioScheduledSourceNode | AudioScheduledSourceNode[])[]): Built => ({
  end,
  sources: groups.flat(),
});

/* --------------------------------------------------------------- recipes */

const UI_VARY = { pitch: 0.04, level: 0.1 };
const MUSICAL = { pitch: 0.015, level: 0.1 };
const FIXED = { pitch: 0, level: 0.05 };

/** Two-note glassy tick shared by open, close and back. */
const sweepTick = (f: number, to: number, dur: number, attack = 0.006): Build =>
  (ctx, out, t, v) =>
    built(
      t + dur,
      tone(ctx, out, t, { f: f * v.pitch, to: to * v.pitch, dur, attack, level: 0.8, detune: [0, 10] }),
      tone(ctx, out, t, { f: 2 * f * v.pitch, to: 2 * to * v.pitch, dur: dur * 0.6, attack, level: 0.12 }),
    );

const arpeggio = (notes: readonly number[], gap: number, noteDur: number, lastDur: number, ratio = 2, index = 1.2): Build =>
  (ctx, out, t, v) => {
    const sources = notes.flatMap((f, i) => {
      const last = i === notes.length - 1;
      return bell(ctx, out, t + i * gap, {
        f: f * v.pitch,
        ratio,
        index,
        indexDecay: 0.12,
        dur: last ? lastDur : noteDur,
        level: 0.55,
      });
    });
    return { end: t + (notes.length - 1) * gap + lastDur, sources };
  };

/** Go stone on the board: a hard wood click and a short hollow knock. */
const stoneClick: Build = (ctx, out, t, v) =>
  built(t + 0.06,
    noise(ctx, out, t, v, { type: "bandpass", f: 2200 * v.pitch, q: 6, dur: 0.014, attack: 0.0008, level: 1 }),
    tone(ctx, out, t, { f: 420 * v.pitch, to: 300 * v.pitch, dur: 0.06, attack: 0.001, level: 0.6 }));

/* Footfalls by surface: layered grain and a heel thump (levels relative). */
const FOOT_VARY = { pitch: 0.06, level: 0.15 };
const foot = (layers: (ctx: BaseAudioContext, out: AudioNode, t: number, v: Voicing) => (AudioScheduledSourceNode | AudioScheduledSourceNode[])[], dur: number): Spec => ({
  bus: "sfx", level: 0.036, send: 0.06, dur, vary: FOOT_VARY,
  build: (ctx, out, t, v) => built(t + dur, ...layers(ctx, out, t, v)),
});

export const SPECS = {
  "ui-hover": {
    bus: "ui", level: 0.01, send: 0, dur: 0.018, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.018,
      tone(ctx, out, t, { f: 1900 * v.pitch, to: 2100 * v.pitch, dur: 0.018, attack: 0.003, level: 0.9, detune: [0, 8] })),
  },
  "ui-select": {
    bus: "ui", level: 0.022, send: 0.05, dur: 0.04, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.04,
      tone(ctx, out, t, { f: 1100 * v.pitch, to: 1500 * v.pitch, dur: 0.04, attack: 0.004, level: 0.75, detune: [0, 10] }),
      noise(ctx, out, t, v, { type: "bandpass", f: 6000, q: 2, dur: 0.012, attack: 0.001, level: 0.9 })),
  },
  "ui-confirm": {
    bus: "ui", level: 0.035, send: 0.12, dur: 0.25, vary: MUSICAL,
    build: (ctx, out, t, v) => built(t + 0.25,
      bell(ctx, out, t, { f: 880 * v.pitch, ratio: 2, index: 1.5, indexDecay: 0.12, dur: 0.22, level: 0.6 }),
      bell(ctx, out, t + 0.07, { f: 1320 * v.pitch, ratio: 2, index: 1.2, indexDecay: 0.1, dur: 0.18, level: 0.45 })),
  },
  "ui-back": { bus: "ui", level: 0.018, send: 0.05, dur: 0.05, vary: UI_VARY, build: sweepTick(1250, 760, 0.05, 0.004) },
  "ui-toggle": {
    bus: "ui", level: 0.02, send: 0, dur: 0.055, vary: UI_VARY,
    build: (ctx, out, t, v) => {
      const [a, b] = v.off ? [2100, 1400] : [1400, 2100];
      return built(t + 0.055,
        tone(ctx, out, t, { f: a * v.pitch, dur: 0.025, attack: 0.002, level: 0.8, detune: [0, 8] }),
        tone(ctx, out, t + 0.03, { f: b * v.pitch, dur: 0.025, attack: 0.002, level: 0.8, detune: [0, 8] }));
    },
  },
  "ui-open": { bus: "ui", level: 0.022, send: 0.08, dur: 0.05, vary: UI_VARY, build: sweepTick(900, 1380, 0.05) },
  "ui-close": { bus: "ui", level: 0.018, send: 0.08, dur: 0.05, vary: UI_VARY, build: sweepTick(1250, 760, 0.05) },
  "ui-error": {
    bus: "ui", level: 0.03, send: 0, dur: 0.14, vary: { pitch: 0.02, level: 0.1 },
    build: (ctx, out, t, v) => built(t + 0.14,
      tone(ctx, out, t, { f: 220 * v.pitch, to: 180 * v.pitch, type: "triangle", dur: 0.14, attack: 0.006, level: 0.9, lowpass: 900 }),
      tone(ctx, out, t, { f: 440 * v.pitch, to: 360 * v.pitch, dur: 0.1, attack: 0.006, level: 0.1 })),
  },
  toast: {
    bus: "ui", level: 0.025, send: 0.15, dur: 0.3, vary: MUSICAL,
    build: (ctx, out, t, v) => built(t + 0.3,
      bell(ctx, out, t, { f: 1046 * v.pitch, ratio: 3.01, index: 0.8, indexDecay: 0.15, dur: 0.3, level: 0.9 })),
  },
  tear: {
    bus: "sfx", level: 0.045, send: 0.2, dur: 0.38, vary: { pitch: 0.03, level: 0.08 },
    build: (ctx, out, t, v) => {
      // Paper: a rising band of noise whose amplitude is chopped by a 30 Hz
      // saw at 40% depth, so it reads as fibres parting, not hiss.
      const grain = ctx.createGain();
      grain.gain.value = 0.8;
      const lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      lfo.type = "sawtooth";
      lfo.frequency.value = 30;
      depth.gain.value = 0.2;
      lfo.connect(depth);
      depth.connect(grain.gain);
      // Tame the fizz above 6.5 kHz: paper, not static.
      const soften = ctx.createBiquadFilter();
      soften.type = "lowpass";
      soften.frequency.value = 6500;
      grain.connect(soften);
      soften.connect(out);
      lfo.start(t);
      lfo.stop(t + 0.42);
      return built(t + 0.38,
        lfo,
        noise(ctx, grain, t, v, { type: "bandpass", f: 900 * v.pitch, to: 3800 * v.pitch, q: 1.2, dur: 0.38, attack: 0.02, level: 1 }),
        noise(ctx, grain, t + 0.02, v, { type: "highpass", f: 5200, q: 0.7, dur: 0.3, attack: 0.03, level: 0.25 }),
        thump(ctx, out, t, 90, 50, 0.16, 0.45));
    },
  },
  flight: {
    bus: "sfx", level: 0.03, send: 0.3, dur: 4.6, vary: FIXED,
    build: (ctx, out, t, v) => {
      const d = v.duration ?? 4.6;
      const air = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      air.buffer = noiseBuffer(ctx);
      air.loop = true;
      filter.type = "lowpass";
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(1800, t + d * 0.45);
      filter.frequency.exponentialRampToValueAtTime(600, t + d);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + d * 0.45);
      gain.gain.linearRampToValueAtTime(0, t + d);
      air.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      air.start(t, v.rnd());
      air.stop(t + d + 0.05);
      // A soft open fifth under the rush (G3 + D4), in over 1.5 s.
      const pad = ctx.createGain();
      pad.gain.setValueAtTime(0, t);
      pad.gain.linearRampToValueAtTime(0.28, t + Math.min(1.5, d * 0.4));
      pad.gain.setValueAtTime(0.28, t + d * 0.7);
      pad.gain.linearRampToValueAtTime(0, t + d);
      const padTone = ctx.createBiquadFilter();
      padTone.type = "lowpass";
      padTone.frequency.value = 1400;
      padTone.connect(pad);
      pad.connect(out);
      const notes = [196, 294].flatMap((f) =>
        [-6, 6].map((c) => {
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = f;
          osc.detune.value = c;
          osc.connect(padTone);
          osc.start(t);
          osc.stop(t + d + 0.05);
          return osc;
        }),
      );
      return built(t + d, air, notes);
    },
  },
  land: {
    bus: "sfx", level: 0.035, send: 0.25, dur: 0.4, vary: MUSICAL,
    build: (ctx, out, t, v) => built(t + 0.4,
      thump(ctx, out, t, 120 * v.pitch, 60, 0.2, 0.75),
      noise(ctx, out, t, v, { type: "lowpass", f: 700, q: 0.7, dur: 0.06, attack: 0.002, level: 0.3 }),
      bell(ctx, out, t + 0.01, { f: 660 * v.pitch, ratio: 2, index: 1, indexDecay: 0.15, dur: 0.39, level: 0.4 })),
  },
  "travel-depart": {
    bus: "sfx", level: 0.04, send: 0.2, dur: 2.5, vary: FIXED,
    build: (ctx, out, t, v) => built(t + 2.5,
      noise(ctx, out, t, v, { type: "lowpass", f: 200, to: 1200, q: 0.9, dur: 2.5, attack: 1.6, level: 0.9 }),
      bell(ctx, out, t, { f: 784, ratio: 2, index: 1, indexDecay: 0.12, dur: 0.5, level: 0.45 }),
      bell(ctx, out, t + 0.16, { f: 988, ratio: 2, index: 1, indexDecay: 0.12, dur: 0.7, level: 0.45 })),
  },
  "travel-arrive": {
    bus: "sfx", level: 0.04, send: 0.25, dur: 0.72, vary: FIXED, ducks: true,
    build: arpeggio([988, 784, 1175], 0.11, 0.45, 0.5),
  },
  fountain: {
    // One-shot splash; the fountain bed itself is a loop (see `loops`).
    bus: "sfx", level: 0.03, send: 0.2, dur: 0.35, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.35,
      noise(ctx, out, t, v, { type: "bandpass", f: 2400 * v.pitch, to: 900, q: 0.9, dur: 0.35, attack: 0.01, level: 1 })),
  },
  door: {
    bus: "sfx", level: 0.05, send: 0.1, dur: 0.38, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.38,
      noise(ctx, out, t, v, { type: "bandpass", f: 3200 * v.pitch, q: 4, dur: 0.03, attack: 0.001, level: 0.6 }),
      noise(ctx, out, t + 0.012, v, { type: "bandpass", f: 1700 * v.pitch, q: 6, dur: 0.04, attack: 0.001, level: 0.5 }),
      noise(ctx, out, t + 0.05, v, { type: "bandpass", f: 520 * v.pitch, q: 1.2, dur: 0.32, attack: 0.004, level: 0.6 }),
      thump(ctx, out, t + 0.2, 120 * v.pitch, 64, 0.18, 1)),
  },
  score: {
    bus: "sfx", level: 0.07, send: 0.15, dur: 0.36, vary: MUSICAL,
    build: arpeggio([660, 990], 0.09, 0.26, 0.27, 2, 1),
  },
  perfect: {
    bus: "sfx", level: 0.07, send: 0.25, dur: 0.44, vary: MUSICAL, ducks: true,
    build: (ctx, out, t, v) => {
      const notes = arpeggio([784, 988, 1319], 0.07, 0.26, 0.3, 2, 1.1)(ctx, out, t, v);
      return built(Math.max(notes.end, t + 0.4), notes.sources,
        noise(ctx, out, t + 0.14, v, { type: "highpass", f: 7000, q: 0.7, dur: 0.25, attack: 0.02, level: 0.3 }));
    },
  },
  miss: {
    bus: "sfx", level: 0.04, send: 0.05, dur: 0.18, vary: { pitch: 0.02, level: 0.1 },
    build: (ctx, out, t, v) => built(t + 0.18,
      tone(ctx, out, t, { f: 330 * v.pitch, to: 247 * v.pitch, type: "triangle", dur: 0.18, attack: 0.008, level: 0.85, lowpass: 1200 }),
      tone(ctx, out, t, { f: 660 * v.pitch, to: 494 * v.pitch, dur: 0.12, attack: 0.008, level: 0.12 })),
  },
  win: {
    bus: "sfx", level: 0.08, send: 0.3, dur: 0.87, vary: { pitch: 0, level: 0.05 }, ducks: true,
    build: arpeggio([523, 659, 784, 1047], 0.09, 0.28, 0.6, 2, 1.2),
  },
  lose: {
    bus: "sfx", level: 0.05, send: 0.15, dur: 0.7, vary: { pitch: 0, level: 0.05 },
    build: (ctx, out, t, v) => {
      const sources = [392, 330, 262].flatMap((f, i) =>
        tone(ctx, out, t + i * 0.14, { f: f * v.pitch, type: "triangle", dur: i === 2 ? 0.42 : 0.26, attack: 0.01, level: 0.85, lowpass: 1500 }));
      return built(t + 0.7, sources);
    },
  },
  swish: {
    bus: "sfx", level: 0.05, send: 0.1, dur: 0.26, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.26,
      noise(ctx, out, t, v, { type: "bandpass", f: 2400 * v.pitch, to: 900 * v.pitch, q: 0.8, dur: 0.26, attack: 0.04, level: 1 })),
  },
  rim: {
    bus: "sfx", level: 0.06, send: 0.2, dur: 0.4, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.4,
      noise(ctx, out, t, v, { type: "bandpass", f: 3000, q: 1.5, dur: 0.02, attack: 0.001, level: 0.5 }),
      tone(ctx, out, t, { f: 1150 * v.pitch, to: 480 * v.pitch, type: "triangle", dur: 0.4, attack: 0.002, level: 0.65 }),
      tone(ctx, out, t, { f: 1150 * 2.76 * v.pitch, to: 480 * 2.76 * v.pitch, dur: 0.25, attack: 0.002, level: 0.26 })),
  },
  bounce: {
    bus: "sfx", level: 0.07, send: 0.05, dur: 0.16, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.16,
      thump(ctx, out, t, 100 * v.pitch, 40, 0.16, 1),
      // The rubbery knock that makes it read as a ball on small speakers.
      tone(ctx, out, t, { f: 240 * v.pitch, to: 170 * v.pitch, dur: 0.07, attack: 0.001, level: 0.45 }),
      noise(ctx, out, t, v, { type: "lowpass", f: 1400, q: 0.7, dur: 0.03, attack: 0.001, level: 0.45 })),
  },
  stone: { bus: "sfx", level: 0.06, send: 0.12, dur: 0.06, vary: UI_VARY, build: stoneClick },
  capture: {
    bus: "sfx", level: 0.05, send: 0.12, dur: 0.11, vary: UI_VARY,
    build: (ctx, out, t, v) => {
      const down = v.pitch * 2 ** (-3 / 12);
      const a = stoneClick(ctx, out, t, { ...v, pitch: down });
      const b = stoneClick(ctx, out, t + 0.05, { ...v, pitch: down * 0.97 });
      return built(t + 0.11, a.sources, b.sources);
    },
  },
  card: {
    bus: "sfx", level: 0.035, send: 0.03, dur: 0.045, vary: { pitch: 0.12, level: 0.1 },
    build: (ctx, out, t, v) => built(t + 0.045,
      noise(ctx, out, t, v, { type: "bandpass", f: 4200 * v.pitch, q: 0.6, dur: 0.045, attack: 0.001, level: 1 }),
      noise(ctx, out, t, v, { type: "bandpass", f: 1400 * v.pitch, q: 1.2, dur: 0.02, attack: 0.001, level: 0.35 })),
  },
  chip: {
    bus: "sfx", level: 0.03, send: 0.05, dur: 0.075, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.075,
      [0, 0.04].flatMap((dt, i) => [
        ...tone(ctx, out, t + dt, { f: 3100 * v.pitch * (i ? 1.02 : 1), dur: 0.035, attack: 0.001, level: 0.55 }),
        ...tone(ctx, out, t + dt, { f: 4650 * v.pitch * (i ? 1.02 : 1), dur: 0.03, attack: 0.001, level: 0.35 }),
      ])),
  },
  shuttle: {
    bus: "sfx", level: 0.06, send: 0.1, dur: 0.05, vary: UI_VARY,
    build: (ctx, out, t, v) => {
      const smash = (v.intensity ?? 0) > 0.5;
      const p = v.pitch * (smash ? 1.2 : 1),
        k = smash ? 1 : 0.5;
      return built(t + 0.05,
        noise(ctx, out, t, v, { type: "bandpass", f: 3200 * p, q: 3, dur: 0.025, attack: 0.001, level: k }),
        tone(ctx, out, t, { f: 900 * p, to: 500 * p, dur: 0.05, attack: 0.001, level: 0.6 * k }));
    },
  },
  paper: {
    bus: "sfx", level: 0.04, send: 0.03, dur: 0.12, vary: UI_VARY,
    build: (ctx, out, t, v) => {
      // Crumple: three quick dips in a band of noise.
      const dips = ctx.createGain();
      dips.gain.setValueAtTime(1, t);
      for (const at of [0.025, 0.055, 0.085]) {
        dips.gain.setValueAtTime(1, t + at - 0.006);
        dips.gain.linearRampToValueAtTime(0.25, t + at);
        dips.gain.linearRampToValueAtTime(1, t + at + 0.008);
      }
      dips.connect(out);
      return built(t + 0.12,
        noise(ctx, dips, t, v, { type: "bandpass", f: 1800 * v.pitch, q: 1.5, dur: 0.12, attack: 0.003, level: 1 }));
    },
  },
  oar: {
    bus: "sfx", level: 0.05, send: 0.1, dur: 0.42, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.42,
      noise(ctx, out, t, v, { type: "lowpass", f: 900 * v.pitch, to: 300, q: 1, dur: 0.42, attack: 0.03, level: 1 }),
      noise(ctx, out, t, v, { type: "bandpass", f: 1600, q: 2, dur: 0.08, attack: 0.004, level: 0.25 })),
  },
  kick: {
    bus: "sfx", level: 0.08, send: 0.15, dur: 0.25, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.25,
      thump(ctx, out, t, 150 * v.pitch, 45, 0.25, 1),
      noise(ctx, out, t, v, { type: "bandpass", f: 1200, q: 0.9, dur: 0.05, attack: 0.001, level: 0.8 }),
      tone(ctx, out, t, { f: 320 * v.pitch, to: 200 * v.pitch, dur: 0.06, attack: 0.001, level: 0.4 })),
  },
  whistle: {
    bus: "sfx", level: 0.08, send: 0.25, dur: 0.4, vary: { pitch: 0.02, level: 0.08 },
    build: (ctx, out, t, v) => {
      // Pea whistle: a sine with a fast flutter of its pitch.
      const flutter = ctx.createOscillator(),
        depth = ctx.createGain();
      flutter.frequency.value = 28;
      depth.gain.value = 90;
      flutter.connect(depth);
      const voice = tone(ctx, out, t, { f: 2400 * v.pitch, to: 2250 * v.pitch, dur: 0.4, attack: 0.012, level: 0.75 });
      for (const osc of voice) depth.connect(osc.frequency);
      flutter.start(t);
      flutter.stop(t + 0.44);
      return built(t + 0.4, voice, flutter,
        noise(ctx, out, t, v, { type: "bandpass", f: 2600, q: 3, dur: 0.38, attack: 0.02, level: 0.18 }));
    },
  },
  cheer: {
    bus: "sfx", level: 0.08, send: 0.3, dur: 1.5, vary: { pitch: 0.03, level: 0.1 },
    build: (ctx, out, t, v) => {
      // A crowd: a swelling band of noise and three detuned formant hums.
      const swell = (n: number) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(n, t + 0.35);
        g.gain.setValueAtTime(n, t + 0.9);
        g.gain.exponentialRampToValueAtTime(n * 0.01, t + 1.6);
        g.gain.linearRampToValueAtTime(0, t + 1.61);
        g.connect(out);
        return g;
      };
      const bed = swell(1),
        voices = swell(0.12);
      const src = ctx.createBufferSource(),
        band = ctx.createBiquadFilter();
      src.buffer = noiseBuffer(ctx);
      band.type = "bandpass";
      band.frequency.value = 1100 * v.pitch;
      band.Q.value = 0.6;
      src.connect(band);
      band.connect(bed);
      src.start(t, v.rnd());
      src.stop(t + 1.65);
      const hums = [520, 1040, 1560].flatMap((f) =>
        [-14, 11].map((c) => {
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = f * v.pitch;
          osc.detune.value = c;
          osc.connect(voices);
          osc.start(t);
          osc.stop(t + 1.65);
          return osc;
        }),
      );
      return built(t + 1.6, src, hums);
    },
  },
  groan: {
    bus: "sfx", level: 0.04, send: 0.25, dur: 0.8, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.8,
      noise(ctx, out, t, v, { type: "bandpass", f: 340 * v.pitch, to: 260 * v.pitch, q: 1.1, dur: 0.8, attack: 0.15, level: 1 })),
  },
  "foot-grass": foot((ctx, out, t, v) => [
    noise(ctx, out, t, v, { type: "bandpass", f: 2600 * v.pitch, q: 0.7, dur: 0.1, attack: 0.006, level: 1 }),
    noise(ctx, out, t + 0.02, v, { type: "bandpass", f: 4600 * v.pitch, q: 0.8, dur: 0.07, attack: 0.006, level: 0.22 }),
    noise(ctx, out, t, v, { type: "lowpass", f: 900 * v.pitch, q: 0.7, dur: 0.06, attack: 0.004, level: 0.45 }),
    thump(ctx, out, t, 64 * v.pitch, 40, 0.08, 0.39),
  ], 0.1),
  "foot-gravel": foot((ctx, out, t, v) => [
    ...[0, 1, 2].map((i) =>
      noise(ctx, out, t + i * 0.014 + v.rnd() * 0.008, v, { type: "bandpass", f: (2900 + v.rnd() * 900) * v.pitch, q: 1.3, dur: 0.055, attack: 0.004, level: 0.83 })),
    thump(ctx, out, t, 70 * v.pitch, 42, 0.08, 0.44),
  ], 0.085),
  "foot-stone": foot((ctx, out, t, v) => [
    noise(ctx, out, t, v, { type: "bandpass", f: 1900 * v.pitch, q: 2.2, dur: 0.035, attack: 0.003, level: 0.83 }),
    thump(ctx, out, t, 112 * v.pitch, 70, 0.065, 0.72),
  ], 0.065),
  "foot-wood": foot((ctx, out, t, v) => [
    thump(ctx, out, t, 158 * v.pitch, 92, 0.1, 1),
    noise(ctx, out, t, v, { type: "bandpass", f: 880 * v.pitch, q: 1.6, dur: 0.045, attack: 0.003, level: 0.61 }),
  ], 0.1),
  "foot-soft": foot((ctx, out, t, v) => [
    noise(ctx, out, t, v, { type: "lowpass", f: 520 * v.pitch, q: 0.7, dur: 0.075, attack: 0.006, level: 0.83 }),
    thump(ctx, out, t, 58 * v.pitch, 38, 0.07, 0.33),
  ], 0.075),
  /* Living world (PLAN_GAMES §4.6) and the stadium's hush. */
  flutter: {
    bus: "sfx", level: 0.04, send: 0.08, dur: 0.35, vary: { pitch: 0.08, level: 0.15 },
    build: (ctx, out, t, v) => {
      // Wings: a band of noise with an 18 Hz tremolo.
      const trem = ctx.createGain(),
        lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      trem.gain.value = 0.55;
      lfo.frequency.value = 18 * v.pitch;
      depth.gain.value = 0.45;
      lfo.connect(depth);
      depth.connect(trem.gain);
      trem.connect(out);
      lfo.start(t);
      lfo.stop(t + 0.38);
      return built(t + 0.35, lfo,
        noise(ctx, trem, t, v, { type: "bandpass", f: 2500 * v.pitch, q: 1.4, dur: 0.35, attack: 0.02, level: 1 }));
    },
  },
  purr: {
    bus: "sfx", level: 0.03, send: 0.05, dur: 1.4, vary: { pitch: 0.04, level: 0.1 },
    build: (ctx, out, t, v) => {
      // A 110 Hz triangle, amplitude-modulated at 26 Hz, held then let go.
      const body = ctx.createGain(),
        am = ctx.createGain(),
        lfo = ctx.createOscillator(),
        depth = ctx.createGain(),
        osc = ctx.createOscillator(),
        warm = ctx.createBiquadFilter();
      osc.type = "triangle";
      osc.frequency.value = 110 * v.pitch;
      lfo.type = "triangle";
      lfo.frequency.value = 26 * v.pitch;
      am.gain.value = 0.5;
      depth.gain.value = 0.5;
      warm.type = "lowpass";
      warm.frequency.value = 700;
      warm.Q.value = 0.6;
      body.gain.setValueAtTime(0, t);
      body.gain.linearRampToValueAtTime(1, t + 0.18);
      body.gain.setValueAtTime(1, t + 0.95);
      body.gain.exponentialRampToValueAtTime(0.01, t + 1.4);
      body.gain.linearRampToValueAtTime(0, t + 1.406);
      lfo.connect(depth);
      depth.connect(am.gain);
      osc.connect(warm);
      warm.connect(am);
      am.connect(body);
      body.connect(out);
      for (const o of [osc, lfo]) {
        o.start(t);
        o.stop(t + 1.43);
      }
      return built(t + 1.4, osc, lfo);
    },
  },
  quack: {
    bus: "sfx", level: 0.035, send: 0.08, dur: 0.28, vary: { pitch: 0.06, level: 0.1 },
    build: (ctx, out, t, v) => {
      // Two nasal calls: a falling sawtooth through a 1.2 kHz band.
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1200;
      band.Q.value = 2.2;
      band.connect(out);
      const sources = [0, 0.16].flatMap((dt, i) =>
        tone(ctx, band, t + dt, { f: 520 * v.pitch * (i ? 0.96 : 1), to: 380 * v.pitch, type: "sawtooth", dur: 0.12, attack: 0.008, level: 1 }));
      return built(t + 0.28, sources);
    },
  },
  splash: {
    bus: "sfx", level: 0.04, send: 0.12, dur: 0.22, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.22,
      noise(ctx, out, t, v, { type: "lowpass", f: 1400 * v.pitch, to: 700 * v.pitch, q: 0.8, dur: 0.22, attack: 0.004, level: 1 }),
      noise(ctx, out, t + 0.03, v, { type: "bandpass", f: 2600 * v.pitch, q: 1.5, dur: 0.12, attack: 0.004, level: 0.3 })),
  },
  rustle: {
    bus: "sfx", level: 0.03, send: 0.06, dur: 0.5, vary: { pitch: 0.06, level: 0.12 },
    build: (ctx, out, t, v) => {
      // Leaves: a 3.5 kHz band of noise with three dips.
      const dips = ctx.createGain();
      dips.gain.setValueAtTime(1, t);
      for (const at of [0.12, 0.25, 0.37]) {
        dips.gain.setValueAtTime(1, t + at - 0.02);
        dips.gain.linearRampToValueAtTime(0.3, t + at);
        dips.gain.linearRampToValueAtTime(1, t + at + 0.03);
      }
      dips.connect(out);
      return built(t + 0.5,
        noise(ctx, dips, t, v, { type: "bandpass", f: 3500 * v.pitch, q: 1.2, dur: 0.5, attack: 0.06, level: 1 }));
    },
  },
  chirp: {
    bus: "ambience", level: 0.02, send: 0.15, dur: 0.16, vary: { pitch: 0.06, level: 0.15 },
    build: (ctx, out, t, v) => built(t + 0.16,
      [0, 0.1].flatMap((dt) =>
        tone(ctx, out, t + dt, { f: 3200 * v.pitch, to: 4100 * v.pitch, dur: 0.06, attack: 0.004, level: 1 }))),
  },
  "crowd-hush": {
    bus: "sfx", level: 0.04, send: 0.3, dur: 1.1, vary: { pitch: 0.03, level: 0.08 },
    build: (ctx, out, t, v) => built(t + 1.1,
      // A stand going quiet: the murmur band falls and thins, with a soft "shh".
      noise(ctx, out, t, v, { type: "bandpass", f: 1000 * v.pitch, to: 420 * v.pitch, q: 0.7, dur: 1.1, attack: 0.04, level: 1 }),
      noise(ctx, out, t + 0.05, v, { type: "bandpass", f: 4200 * v.pitch, q: 1.2, dur: 0.6, attack: 0.08, level: 0.25 })),
  },
  /* Older names kept working. */
  shot: {
    bus: "sfx", level: 0.05, send: 0.08, dur: 0.18, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.2,
      thump(ctx, out, t, 180 * v.pitch, 70, 0.12, 0.6),
      noise(ctx, out, t + 0.01, v, { type: "bandpass", f: 1800 * v.pitch, to: 900, q: 0.9, dur: 0.19, attack: 0.03, level: 0.8 })),
  },
  step: {
    bus: "sfx", level: 0.04, send: 0.05, dur: 0.08, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.08,
      thump(ctx, out, t, 160 * v.pitch, 90, 0.08, 1),
      noise(ctx, out, t, v, { type: "bandpass", f: 900 * v.pitch, q: 1.6, dur: 0.04, attack: 0.001, level: 0.5 })),
  },
  tap: {
    bus: "sfx", level: 0.045, send: 0.06, dur: 0.09, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.09,
      tone(ctx, out, t, { f: 480 * v.pitch, to: 170 * v.pitch, type: "triangle", dur: 0.09, attack: 0.001, level: 1, lowpass: 2400 }),
      noise(ctx, out, t, v, { type: "bandpass", f: 2600 * v.pitch, q: 3, dur: 0.012, attack: 0.0006, level: 0.5 })),
  },
  chime: {
    bus: "sfx", level: 0.05, send: 0.25, dur: 0.6, vary: MUSICAL,
    build: (ctx, out, t, v) => built(t + 0.6,
      bell(ctx, out, t, { f: 1320 * v.pitch, ratio: 3.01, index: 0.9, indexDecay: 0.2, dur: 0.6, level: 0.7 }),
      bell(ctx, out, t + 0.12, { f: 990 * v.pitch, ratio: 2, index: 0.8, indexDecay: 0.2, dur: 0.45, level: 0.4 })),
  },
  strum: {
    // An open G chord strummed down, low string to high, about 16 ms apart.
    bus: "sfx", level: 0.07, send: 0.2, dur: 0.7, vary: MUSICAL,
    build: (ctx, out, t, v) => built(t + 0.75,
      [98, 123.47, 146.83, 196, 246.94, 392].map((f, i) =>
        pluck(ctx, out, t + i * (0.014 + v.rnd() * 0.006), { f: f * v.pitch, dur: 0.75 - i * 0.02, level: 0.32 - i * 0.025 }))),
  },
  whoosh: {
    bus: "sfx", level: 0.06, send: 0.1, dur: 0.24, vary: UI_VARY,
    build: (ctx, out, t, v) => built(t + 0.24,
      noise(ctx, out, t, v, { type: "bandpass", f: 1400 * v.pitch, to: 320 * v.pitch, q: 0.9, dur: 0.24, attack: 0.03, level: 1 })),
  },
} satisfies Record<string, Spec>;

export type PaletteName = keyof typeof SPECS;
export const PALETTE_NAMES = Object.keys(SPECS) as PaletteName[];
export const isPaletteName = (v: unknown): v is PaletteName => typeof v === "string" && v in SPECS;

/**
 * Per-recipe correction from the inner peak to 1, measured from offline
 * renders (median of 9 seeds, `tests/audioRender.test.ts` re-measures and
 * fails if the level column is missed by more than 2 dB).
 */
export const TRIM: Partial<Record<PaletteName, number>> = {
  "ui-hover": 1.231,
  "ui-select": 1.372,
  "ui-confirm": 1.828,
  "ui-back": 1.197,
  "ui-toggle": 1.412,
  "ui-open": 1.303,
  "ui-close": 1.254,
  "ui-error": 1.158,
  toast: 1.217,
  tear: 2.107,
  flight: 0.808,
  land: 1.182,
  "travel-depart": 1.785,
  "travel-arrive": 1.340,
  fountain: 1.846,
  door: 1.108,
  score: 1.626,
  perfect: 1.285,
  miss: 1.133,
  win: 1.496,
  lose: 1.261,
  swish: 1.813,
  rim: 1.186,
  bounce: 0.880,
  stone: 1.773,
  capture: 1.769,
  card: 1.631,
  chip: 1.297,
  shuttle: 2.848,
  paper: 2.689,
  oar: 2.722,
  kick: 0.913,
  whistle: 1.428,
  cheer: 1.136,
  groan: 4.835,
  flutter: 2.563,
  purr: 1.111,
  quack: 2.27,
  splash: 2.39,
  rustle: 1.685,
  chirp: 1.149,
  "crowd-hush": 2.139,
  "foot-grass": 1.389,
  "foot-gravel": 1.797,
  "foot-stone": 1.294,
  "foot-wood": 1.196,
  "foot-soft": 3.061,
  shot: 1.966,
  step: 1.197,
  tap: 1.153,
  chime: 1.561,
  strum: 2.133,
  whoosh: 2.636,
};

/** The gain the voice stage applies for a given play. */
export function voiceLevel(name: PaletteName, levelJitter = 1, gain = 1) {
  return SPECS[name].level * (TRIM[name] ?? 1) * levelJitter * gain;
}

/* ----------------------------------------------------------------- loops */

export type LoopName = "sizzle" | "wheels" | "fountain-bed" | "crowd" | "room-tone";
export type LoopHandle = {
  /** 0–1 drive (speed for wheels, swell for crowd). */
  set: (drive: number) => void;
  stop: (fade?: number) => void;
};
export const LOOP_SPECS: Record<LoopName, { bus: Bus; level: number; send: number }> = {
  sizzle: { bus: "sfx", level: 0.015, send: 0 },
  wheels: { bus: "sfx", level: 0.03, send: 0.05 },
  "fountain-bed": { bus: "ambience", level: 0.05, send: 0.15 },
  crowd: { bus: "ambience", level: 0.06, send: 0.2 },
  "room-tone": { bus: "ambience", level: 0.02, send: 0 },
};

/**
 * Builds a loop into `out` (whose gain is the loop's level). Returns its
 * sources and a `drive` setter. CPU: one buffer source and at most three
 * filters per loop.
 */
export function buildLoop(ctx: BaseAudioContext, out: GainNode, name: LoopName) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const sources: AudioScheduledSourceNode[] = [src];
  let set: (drive: number) => void = () => {};
  if (name === "sizzle") {
    const hp = ctx.createBiquadFilter(),
      flicker = ctx.createGain(),
      lfo = ctx.createOscillator(),
      lfoDepth = ctx.createGain();
    hp.type = "highpass";
    hp.frequency.value = 4500;
    flicker.gain.value = 0.7;
    // Fat crackle: a 6 Hz wobble of the level.
    lfo.type = "triangle";
    lfo.frequency.value = 6;
    lfoDepth.gain.value = 0.3;
    lfo.connect(lfoDepth);
    lfoDepth.connect(flicker.gain);
    src.connect(hp);
    hp.connect(flicker);
    flicker.connect(out);
    lfo.start(t);
    sources.push(lfo);
  } else if (name === "wheels") {
    const band = ctx.createBiquadFilter(),
      drive = ctx.createGain();
    band.type = "bandpass";
    band.Q.value = 0.7;
    band.frequency.value = 400;
    drive.gain.value = 0;
    src.connect(band);
    band.connect(drive);
    drive.connect(out);
    set = (d) => {
      const k = Math.min(1, Math.max(0, d)),
        now = ctx.currentTime;
      band.frequency.setTargetAtTime(400 + 1000 * k, now, 0.05);
      drive.gain.setTargetAtTime(k, now, 0.05);
    };
  } else if (name === "fountain-bed") {
    // Falling water: broad hiss plus a lower splash band, gently modulated.
    const hiss = ctx.createBiquadFilter(),
      body = ctx.createBiquadFilter(),
      mix = ctx.createGain();
    hiss.type = "highpass";
    hiss.frequency.value = 1800;
    body.type = "bandpass";
    body.frequency.value = 650;
    body.Q.value = 0.8;
    mix.gain.value = 0.6;
    src.connect(hiss);
    src.connect(body);
    hiss.connect(mix);
    body.connect(mix);
    mix.connect(out);
  } else if (name === "room-tone") {
    // A quiet hall: low air movement and the faintest ventilation hum.
    const low = ctx.createBiquadFilter(),
      hum = ctx.createOscillator(),
      humLevel = ctx.createGain();
    low.type = "lowpass";
    low.frequency.value = 220;
    low.Q.value = 0.5;
    hum.frequency.value = 118;
    humLevel.gain.value = 0.04;
    src.connect(low);
    low.connect(out);
    hum.connect(humLevel);
    humLevel.connect(out);
    hum.start(t);
    sources.push(hum);
  } else {
    const band = ctx.createBiquadFilter(),
      swell = ctx.createGain();
    band.type = "bandpass";
    band.frequency.value = 700;
    band.Q.value = 0.6;
    swell.gain.value = 1 / 3;
    src.connect(band);
    band.connect(swell);
    swell.connect(out);
    // drive 0 = murmur (level/3), 1 = full roar (the made-kick swell).
    set = (d) => swell.gain.setTargetAtTime(1 / 3 + (2 / 3) * Math.min(1, Math.max(0, d)), ctx.currentTime, 0.25);
  }
  src.start(t, Math.random());
  return { sources, set };
}
