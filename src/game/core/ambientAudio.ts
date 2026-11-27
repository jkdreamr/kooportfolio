import { ambientMix, planePose } from "./wildlife";
import { undersideSpec } from "./islandUnderside";
import { POND } from "./pond";
import { campusFountainWorld } from "./campus";
import type { WorldId } from "./worlds";

export type AmbientEnvironment = {
  muted: boolean;
  paused: boolean;
  active: boolean;
  hidden: boolean;
  scene: string;
  hour: number;
  x: number;
  z: number;
  seconds: number;
  /** Hub world; selects the emitter layout. Defaults to home. */
  world?: WorldId;
  /** Camera forward projected onto the ground (need not be normalised). The
   * listener faces where the camera looks, so a fall on screen-left is heard
   * on the left whatever the follow camera does. */
  facing?: readonly [number, number];
};
const FILES = {
  birds: "/audio/birds.mp3",
  crickets: "/audio/crickets.mp3",
  water: "/audio/water.mp3",
  rain: "/audio/rain.mp3",
} as const;
type Layer = keyof typeof FILES;

/** A looped recording placed in the world. Same buffers as the bed, started
 * at different offsets and rates so no two emitters phase against each other. */
export type Emitter = {
  id: string;
  /** A recording, or "spray": fountain splash synthesised in code. */
  layer: Layer | "spray";
  position: readonly [number, number, number];
  /** Linear gain at the reference distance. */
  level: number;
  rate: number;
  /** Optional voicing: a low-passed fall rumbles, a high-passed pond laps. */
  tone?: { type: BiquadFilterType; frequency: number };
  /** Gated by daylight: birds by day, crickets by night. */
  when: "day" | "night" | "always";
  /** Distance at which the emitter sits at `level`; falls carry farther. */
  ref: number;
};

const OUTDOOR = new Set(["hub", "rowing", "basketball"]);
/** Interiors that play their own programme keep the world fully quiet. */
const SILENT_INTERIORS = new Set(["theater"]);
/** Muffled outdoor bed heard through walls. */
export const INTERIOR_CUTOFF = 560;
const OPEN_CUTOFF = 18000;
const INTERIOR_LEVEL = 0.42;

/**
 * Where the world's sounds live. Falls come from the floating-island springs,
 * the pond (Korea, Stanford) from its centre, and birdsong/crickets from three
 * and two points on the island rim, pulled a quarter of the way to the middle,
 * where the groves are. Pure, deterministic and testable.
 */
export function emittersFor(world: WorldId = "home"): Emitter[] {
  const spec = undersideSpec(world);
  const list: Emitter[] = spec.falls.flatMap((fall, i) => [
    {
      id: `falls-${i}`,
      layer: "water" as const,
      position: [fall.at[0], 0, fall.at[1]] as const,
      level: 0.34,
      rate: 0.78 + i * 0.05,
      tone: { type: "lowpass" as BiquadFilterType, frequency: 1500 },
      when: "always" as const,
      ref: 9,
    },
  ]);
  if (world !== "home")
    list.push({
      id: "pond",
      layer: "water",
      position: [POND.x, 0, POND.z],
      level: 0.2,
      rate: 1.12,
      tone: { type: "highpass", frequency: 420 },
      when: "always",
      ref: 5,
    });
  if (world === "stanford")
    list.push({
      id: "quad-fountain",
      layer: "spray",
      position: [campusFountainWorld[0], 0.9, campusFountainWorld[1]],
      level: 0.16,
      rate: 1,
      tone: { type: "highpass", frequency: 700 },
      when: "always",
      ref: 2.5,
    });
  const outline = spec.outline,
    n = outline.length;
  let cx = 0,
    cz = 0;
  for (const [x, z] of outline) {
    cx += x / n;
    cz += z / n;
  }
  const rim = (fraction: number) => {
    const [x, z] = outline[Math.floor(fraction * n) % n];
    return [cx + (x - cx) * 0.74, 2.5, cz + (z - cz) * 0.74] as const;
  };
  [0.08, 0.41, 0.74].forEach((fraction, i) =>
    list.push({
      id: `grove-${i}`,
      layer: "birds",
      position: rim(fraction),
      level: 0.2,
      rate: [1, 0.94, 1.06][i],
      when: "day",
      ref: 10,
    }),
  );
  [0.25, 0.58].forEach((fraction, i) =>
    list.push({
      id: `crickets-${i}`,
      layer: "crickets",
      position: rim(fraction),
      level: 0.17,
      rate: [1, 0.97][i],
      when: "night",
      ref: 9,
    }),
  );
  return list;
}

/** Bed (non-positional) mix for a scene: open-air activities keep the old
 * policy; houses hear a muffled version of the outdoors, never the river. */
export function bedMix(e: AmbientEnvironment) {
  if (OUTDOOR.has(e.scene) && e.scene !== "hub")
    return ambientMix(e.hour, e.x, e.z, e.scene);
  const outside = ambientMix(e.hour, e.x, e.z, "hub");
  if (e.scene === "hub")
    // Emitters carry the birds, crickets and water; the bed keeps a faint,
    // everywhere wash of birdsong so the far side of the island is not dead.
    return {
      birds: outside.birds * 0.3,
      crickets: outside.crickets * 0.3,
      water: 0,
      rain: outside.rain,
      wind: outside.wind,
    };
  return {
    birds: outside.birds * INTERIOR_LEVEL,
    crickets: outside.crickets * INTERIOR_LEVEL,
    water: 0,
    rain: outside.rain * 0.7,
    wind: outside.wind * 0.3,
  };
}

type Voice = {
  emitter: Emitter;
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode;
};

/** Owns every source so mute, navigation and async loads cannot leave orphan audio. */
export class AmbientAudio {
  private context?: AudioContext;
  private buffers = new Map<Layer, AudioBuffer>();
  private sprayBuffer?: AudioBuffer;
  private gains = new Map<Layer, GainNode>();
  private sources: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private voices: Voice[] = [];
  private voiceWorld?: WorldId;
  private interior?: BiquadFilterNode;
  private spatial?: GainNode;
  private engineGain?: GainNode;
  private engine?: OscillatorNode;
  private enginePanner?: PannerNode;
  private windGain?: GainNode;
  private request?: AbortController;
  private generation = 0;
  private starting = false;
  private disposed = false;

  constructor(private environment: () => AmbientEnvironment) {}

  /** Must be called synchronously from a pointer/keyboard gesture, never on mount. */
  unlock() {
    if (this.disposed) return;
    try {
      this.context ??= new AudioContext();
      void this.context
        .resume()
        .then(() => this.sync())
        .catch(() => {});
    } catch {
      /* No WebAudio is a supported silent fallback. */
    }
  }

  private enabled() {
    const e = this.environment();
    return (
      !e.muted &&
      !e.paused &&
      e.active &&
      !e.hidden &&
      !SILENT_INTERIORS.has(e.scene)
    );
  }

  sync() {
    if (this.disposed) return;
    if (!this.enabled()) {
      this.stop();
      return;
    }
    const context = this.context;
    if (!context || context.state !== "running") return;
    if (!this.sources.length && !this.starting) void this.start(context);
    const e = this.environment(),
      t = context.currentTime,
      hub = e.scene === "hub",
      inside = !OUTDOOR.has(e.scene),
      mix = bedMix(e);
    for (const [layer, gain] of this.gains)
      gain.gain.setTargetAtTime(mix[layer], t, 0.5);
    // Doors: walls close over the bed in ~0.4 s, open back up a touch slower.
    this.interior?.frequency.setTargetAtTime(
      inside ? INTERIOR_CUTOFF : OPEN_CUTOFF,
      t,
      inside ? 0.12 : 0.22,
    );
    this.spatial?.gain.setTargetAtTime(hub ? 1 : 0, t, hub ? 0.35 : 0.15);
    if (hub && this.voices.length && this.voiceWorld !== (e.world ?? "home"))
      this.retireVoices(context);
    if (hub && !this.voices.length && this.sources.length)
      this.buildVoices(context, e.world ?? "home");
    if (hub) this.placeListener(context, e);
    const outside = ambientMix(e.hour, e.x, e.z, "hub");
    const birdScale = outside.birds / 0.23;
    const cricketScale = outside.crickets / 0.16;
    for (const voice of this.voices) {
      const level =
        voice.emitter.when === "day"
          ? voice.emitter.level * birdScale
          : voice.emitter.when === "night"
            ? voice.emitter.level * cricketScale
            : voice.emitter.level;
      voice.gain.gain.setTargetAtTime(level, t, 0.6);
    }
    const plane = planePose(e.seconds);
    this.engineGain?.gain.setTargetAtTime(
      hub ? plane.volume * 0.011 : 0,
      t,
      0.35,
    );
    this.engine?.frequency.setTargetAtTime(plane.x < 0 ? 82 : 71, t, 0.5);
    if (this.enginePanner) setPosition(this.enginePanner, t, plane.x, plane.y, plane.z);
    this.windGain?.gain.setTargetAtTime(mix.wind, t, 0.8);
  }

  private placeListener(context: AudioContext, e: AmbientEnvironment) {
    const listener = context.listener;
    if (!listener) return;
    const [fx, fz] = e.facing ?? [-70, -95];
    const length = Math.hypot(fx, fz) || 1;
    const t = context.currentTime;
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(e.x, t, 0.06);
      listener.positionY.setTargetAtTime(1.6, t, 0.06);
      listener.positionZ.setTargetAtTime(e.z, t, 0.06);
      listener.forwardX.setTargetAtTime(fx / length, t, 0.12);
      listener.forwardY.setTargetAtTime(0, t, 0.12);
      listener.forwardZ.setTargetAtTime(fz / length, t, 0.12);
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      // Firefox / older Safari: the deprecated setters, without smoothing.
      const legacy = listener as unknown as {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (...v: number[]) => void;
      };
      legacy.setPosition?.(e.x, 1.6, e.z);
      legacy.setOrientation?.(fx / length, 0, fz / length, 0, 1, 0);
    }
  }

  private panner(context: AudioContext, ref: number) {
    const panner = context.createPanner();
    // HRTF is cheap at this voice count on desktop; phones get equal-power.
    const coarse =
      typeof matchMedia === "function" &&
      matchMedia("(pointer: coarse)").matches;
    panner.panningModel = coarse ? "equalpower" : "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = ref;
    panner.rolloffFactor = 1.3;
    panner.maxDistance = 400;
    return panner;
  }

  private buildVoices(context: AudioContext, world: WorldId) {
    if (!this.spatial) return;
    this.voiceWorld = world;
    for (const emitter of emittersFor(world)) {
      const buffer =
        emitter.layer === "spray"
          ? (this.sprayBuffer ??= sprayBuffer(context))
          : this.buffers.get(emitter.layer);
      if (!buffer) continue;
      const source = context.createBufferSource(),
        gain = context.createGain(),
        panner = this.panner(context, emitter.ref);
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = emitter.rate;
      gain.gain.value = 0;
      let head: AudioNode = source;
      if (emitter.tone) {
        const tone = context.createBiquadFilter();
        tone.type = emitter.tone.type;
        tone.frequency.value = emitter.tone.frequency;
        source.connect(tone);
        head = tone;
        this.nodes.push(tone);
      }
      head.connect(gain);
      gain.connect(panner);
      panner.connect(this.spatial);
      setPosition(panner, context.currentTime, ...emitter.position, true);
      // Deterministic offset per emitter so twin loops never line up.
      const offset = buffer.duration
        ? ((emitter.id.length * 0.37 + emitter.rate * 3.1) % 1) * buffer.duration
        : 0;
      source.start(0, offset);
      this.sources.push(source);
      this.nodes.push(gain, panner);
      this.voices.push({ emitter, source, gain, panner });
    }
  }

  /** Travel: fade the old island's emitters out, then let the new ones in. */
  private retireVoices(context: AudioContext) {
    const t = context.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.setTargetAtTime(0, t, 0.25);
      try {
        voice.source.stop(t + 1.2);
      } catch {
        /* Already stopped. */
      }
      this.sources = this.sources.filter((s) => s !== voice.source);
      const { source, gain, panner } = voice;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        panner.disconnect();
      };
    }
    this.voices = [];
    this.voiceWorld = undefined;
  }

  private async start(context: AudioContext) {
    this.starting = true;
    const generation = ++this.generation;
    const request = new AbortController();
    this.request = request;
    await Promise.all(
      (Object.keys(FILES) as Layer[]).map(async (layer) => {
        if (this.buffers.has(layer)) return;
        try {
          const response = await fetch(FILES[layer], {
            signal: request.signal,
          });
          if (!response.ok) return;
          const buffer = await context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (!this.disposed) this.buffers.set(layer, buffer);
        } catch {
          /* Missing/blocked media never interrupts the world. */
        }
      }),
    );
    if (this.disposed || generation !== this.generation || !this.enabled()) {
      // A start superseded by stop() was already reset there; only a still-
      // current start that ended disabled (e.g. muted mid-load) clears here,
      // or `starting` would stay true and audio would never restart.
      if (generation === this.generation) {
        this.starting = false;
        this.request = undefined;
      }
      return;
    }
    this.starting = false;
    this.request = undefined;
    // master ← [interior low-pass ← bed] + [spatial ← panned emitters] + engine
    const master = context.createGain(),
      interior = context.createBiquadFilter(),
      spatial = context.createGain();
    master.gain.value = 0;
    // Unmute swells in rather than snapping on.
    master.gain.setTargetAtTime(1, context.currentTime, 0.45);
    interior.type = "lowpass";
    interior.frequency.value = OPEN_CUTOFF;
    interior.Q.value = 0.5;
    spatial.gain.value = 0;
    interior.connect(master);
    spatial.connect(master);
    master.connect(context.destination);
    this.interior = interior;
    this.spatial = spatial;
    this.nodes.push(master, interior, spatial);
    for (const [layer, buffer] of this.buffers) {
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(interior);
      source.start();
      this.gains.set(layer, gain);
      this.sources.push(source);
      this.nodes.push(gain);
    }
    // Original, very quiet propeller synthesis; the nature layers are field recordings.
    const engine = context.createOscillator(),
      filter = context.createBiquadFilter(),
      gain = context.createGain(),
      enginePanner = this.panner(context, 18);
    engine.type = "sawtooth";
    engine.frequency.value = 76;
    filter.type = "lowpass";
    filter.frequency.value = 340;
    gain.gain.value = 0;
    engine.connect(filter);
    filter.connect(gain);
    gain.connect(enginePanner);
    enginePanner.connect(spatial);
    engine.start();
    this.engine = engine;
    this.engineGain = gain;
    this.enginePanner = enginePanner;
    this.sources.push(engine);
    this.nodes.push(filter, gain, enginePanner);
    // Seeded filtered air noise under the snow/mist, not a downloaded wind sample.
    const wind = context.createBufferSource(),
      windFilter = context.createBiquadFilter(),
      windGain = context.createGain();
    const windBuffer = context.createBuffer(1, 44100, 22050),
      samples = windBuffer.getChannelData(0);
    let seed = 731;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      samples[i] = seed / 2147483648;
    }
    wind.buffer = windBuffer;
    wind.loop = true;
    windFilter.type = "lowpass";
    windFilter.frequency.value = 420;
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(interior);
    wind.start();
    this.windGain = windGain;
    this.sources.push(wind);
    this.nodes.push(windFilter, windGain);
    this.sync();
  }

  stop() {
    // Invalidate even a decode that was already in flight when fetch was aborted.
    if (this.starting || this.sources.length) this.generation++;
    this.request?.abort();
    this.request = undefined;
    this.starting = false;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Never started. */
      }
      source.disconnect();
    }
    for (const node of this.nodes) node.disconnect();
    this.sources = [];
    this.nodes = [];
    this.voices = [];
    this.voiceWorld = undefined;
    this.gains.clear();
    this.interior = undefined;
    this.spatial = undefined;
    this.engine = undefined;
    this.engineGain = undefined;
    this.enginePanner = undefined;
    this.windGain = undefined;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.buffers.clear();
    this.sprayBuffer = undefined;
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}

/**
 * Fountain splash, synthesised (no download): seeded white noise under a
 * slow, loop-periodic swell, plus a sprinkle of short droplet ticks. The
 * envelope is made of whole cycles over the buffer, so the loop is seamless.
 */
export function sprayBuffer(context: BaseAudioContext) {
  const rate = 22050,
    length = rate * 3,
    buffer = context.createBuffer(1, length, rate),
    samples = buffer.getChannelData(0);
  let seed = 4127;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return seed / 2147483648;
  };
  let drop = 0,
    dropGain = 0;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const swell =
      0.72 +
      0.14 * Math.sin(2 * Math.PI * 2 * t) +
      0.09 * Math.sin(2 * Math.PI * 5 * t + 1.3) +
      0.05 * Math.sin(2 * Math.PI * 11 * t + 0.4);
    // ~40 droplets a second, each a 4 ms decaying tick (away from the seam).
    if (i > rate * 0.01 && i < length - rate * 0.01 && next() > 0.9982) {
      drop = rate * 0.004;
      dropGain = 0.4 + 0.5 * Math.abs(next());
    }
    const tick = drop > 0 ? (drop-- / (rate * 0.004)) * dropGain * next() : 0;
    samples[i] = 0.55 * swell * next() + tick;
  }
  return buffer;
}

function setPosition(
  panner: PannerNode,
  t: number,
  x: number,
  y: number,
  z: number,
  immediate = false,
) {
  if (panner.positionX) {
    if (immediate) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      panner.positionX.setTargetAtTime(x, t, 0.1);
      panner.positionY.setTargetAtTime(y, t, 0.1);
      panner.positionZ.setTargetAtTime(z, t, 0.1);
    }
  } else
    (
      panner as unknown as { setPosition?: (...v: number[]) => void }
    ).setPosition?.(x, y, z);
}
