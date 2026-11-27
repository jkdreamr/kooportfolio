/**
 * Synthesised ambience: the beds and the occasional events that make each
 * world sound like a place (wind, distant city, a crowd by the stadium,
 * birdsong calls by day, a wind chime at home), layered over the field
 * recordings in `ambientAudio.ts`.
 *
 * CPU is bounded by construction: beds are looping buffers computed once in
 * JS (no per-sample work at run time beyond one or two biquads each), and
 * events are short voices capped at MAX_EVENTS at a time.
 */
import { seededNoise } from "./graph";
import type { WorldId } from "../worlds";

export const MAX_EVENTS = 3;

export type BirdKind = "warbler" | "finch" | "sparrow" | "magpie";
export type WorldAmbience = {
  /** Distant traffic bed level (0 = none). */
  city: number;
  birds: readonly BirdKind[];
  /** Bird calls per second at full daylight. */
  birdRate: number;
  /** Distant car passes per second. */
  cars: number;
  /** Wind-chime phrases per second at full wind (home only). */
  chimes: number;
};
export const WORLD_AMBIENCE: Readonly<Record<WorldId, WorldAmbience>> = {
  home: { city: 0, birds: ["warbler", "finch"], birdRate: 0.42, cars: 0, chimes: 0.05 },
  stanford: { city: 0.012, birds: ["sparrow", "finch"], birdRate: 0.34, cars: 0.025, chimes: 0 },
  korea: { city: 0.022, birds: ["magpie", "sparrow"], birdRate: 0.22, cars: 0.07, chimes: 0 },
};

/* ------------------------------------------------------------- buffers */

const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
function cached(ctx: BaseAudioContext, key: string, make: () => AudioBuffer) {
  let m = cache.get(ctx);
  if (!m) cache.set(ctx, (m = new Map()));
  let b = m.get(key);
  if (!b) m.set(key, (b = make()));
  return b;
}

/** Crossfades the last `fade` samples into the start so the loop has no click. */
export function makeLoopable(data: Float32Array, fade: number) {
  const n = data.length - fade;
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] = data[i] * w + data[n + i] * (1 - w);
  }
  return data.subarray(0, n);
}

/** Removes the mean and scales to a peak of `peak`. */
export function normalise(data: Float32Array, peak = 0.9) {
  let mean = 0;
  for (let i = 0; i < data.length; i++) mean += data[i];
  mean /= data.length || 1;
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs((data[i] -= mean)));
  const k = max > 0 ? peak / max : 0;
  for (let i = 0; i < data.length; i++) data[i] *= k;
  return data;
}

/** Pink noise (Paul Kellet's economy filter): the body of wind. */
export function pinkSamples(length: number, seed: number) {
  const rnd = seededNoise(seed);
  const out = new Float32Array(length);
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < length; i++) {
    const w = rnd();
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = b0 + b1 + b2 + w * 0.1848;
  }
  return out;
}

/** Brown noise (leaky integrator): distant rumble. */
export function brownSamples(length: number, seed: number) {
  const rnd = seededNoise(seed);
  const out = new Float32Array(length);
  let y = 0;
  for (let i = 0; i < length; i++) {
    y = 0.996 * y + rnd() * 0.06;
    out[i] = y;
  }
  return out;
}

/**
 * A murmuring crowd: three noise bands near speech formants (one-pole
 * band-pass approximations), each with its own slow syllabic amplitude
 * wobble, so it never sounds like a steady hiss.
 */
export function murmurSamples(length: number, sampleRate: number, seed: number) {
  const out = new Float32Array(length);
  const bands = [
    { f: 450, rate: 3.1, depth: 0.5 },
    { f: 1100, rate: 4.3, depth: 0.6 },
    { f: 2500, rate: 5.2, depth: 0.55 },
  ];
  bands.forEach((band, k) => {
    const rnd = seededNoise(seed + k * 101);
    const hi = Math.exp((-2 * Math.PI * band.f * 1.6) / sampleRate),
      lo = Math.exp((-2 * Math.PI * band.f * 0.6) / sampleRate);
    let a = 0,
      b = 0,
      phase = rnd() * 6.28,
      wobble = 1;
    for (let i = 0; i < length; i++) {
      const w = rnd();
      a = (1 - hi) * w + hi * a;
      b = (1 - lo) * w + lo * b;
      // Rate drifts slowly so the "syllables" are irregular.
      if (i % 2048 === 0) wobble = 0.7 + Math.abs(rnd()) * 0.6;
      phase += (2 * Math.PI * band.rate * wobble) / sampleRate;
      const am = 1 - band.depth * (0.5 + 0.5 * Math.sin(phase));
      out[i] += (a - b) * am;
    }
  });
  return out;
}

const buffer = (ctx: BaseAudioContext, data: Float32Array) => {
  const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.getChannelData(0).set(data);
  return b;
};

export const windBuffer = (ctx: BaseAudioContext) =>
  cached(ctx, "wind", () => {
    const n = Math.round(ctx.sampleRate * 6);
    return buffer(ctx, normalise(makeLoopable(pinkSamples(n, 731), Math.round(ctx.sampleRate * 0.5))));
  });
export const rumbleBuffer = (ctx: BaseAudioContext) =>
  cached(ctx, "rumble", () => {
    const n = Math.round(ctx.sampleRate * 7);
    return buffer(ctx, normalise(makeLoopable(brownSamples(n, 419), Math.round(ctx.sampleRate * 0.6))));
  });
export const murmurBuffer = (ctx: BaseAudioContext) =>
  cached(ctx, "murmur", () => {
    const n = Math.round(ctx.sampleRate * 5);
    return buffer(ctx, normalise(makeLoopable(murmurSamples(n, ctx.sampleRate, 977), Math.round(ctx.sampleRate * 0.5))));
  });

/* -------------------------------------------------------------- beds */

export type Bed = { sources: AudioScheduledSourceNode[]; nodes: AudioNode[]; gain: GainNode };

/**
 * Wind: pink noise, low-passed at 400 Hz, with a slow gust LFO on the level
 * and the cutoff. `out` receives the bed; set `gain` for the level.
 */
export function windBed(ctx: BaseAudioContext, out: AudioNode): Bed {
  const src = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    gust = ctx.createGain(),
    gain = ctx.createGain(),
    lfo = ctx.createOscillator(),
    lfoLevel = ctx.createGain(),
    lfoTone = ctx.createGain();
  src.buffer = windBuffer(ctx);
  src.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 400;
  filter.Q.value = 0.9;
  gust.gain.value = 0.75;
  gain.gain.value = 0;
  lfo.frequency.value = 0.11;
  lfoLevel.gain.value = 0.25;
  lfoTone.gain.value = 140;
  lfo.connect(lfoLevel);
  lfo.connect(lfoTone);
  lfoLevel.connect(gust.gain);
  lfoTone.connect(filter.frequency);
  src.connect(filter);
  filter.connect(gust);
  gust.connect(gain);
  gain.connect(out);
  src.start(0, 0.37 * (src.buffer.duration || 0));
  lfo.start();
  return { sources: [src, lfo], nodes: [filter, gust, gain, lfoLevel, lfoTone], gain };
}

/** Distant city: brown-noise rumble under a faint mid band of traffic. */
export function cityBed(ctx: BaseAudioContext, out: AudioNode): Bed {
  const src = ctx.createBufferSource(),
    low = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  src.buffer = rumbleBuffer(ctx);
  src.loop = true;
  low.type = "lowpass";
  low.frequency.value = 520;
  low.Q.value = 0.5;
  gain.gain.value = 0;
  src.connect(low);
  low.connect(gain);
  gain.connect(out);
  src.start(0, 0.61 * (src.buffer.duration || 0));
  return { sources: [src], nodes: [low, gain], gain };
}

/* ------------------------------------------------------------- events */

const env = (p: AudioParam, t: number, a: number, d: number, peak: number) => {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(peak * 0.01, t + d);
  p.linearRampToValueAtTime(0, t + d + 0.005);
};

/** Pans and attenuates by a source's bearing and distance from the listener. */
export function placeEvent(
  listener: { x: number; z: number; fx: number; fz: number },
  at: readonly [number, number],
  ref: number,
) {
  const dx = at[0] - listener.x,
    dz = at[1] - listener.z;
  const d = Math.hypot(dx, dz);
  const fl = Math.hypot(listener.fx, listener.fz) || 1;
  const fx = listener.fx / fl,
    fz = listener.fz / fl;
  // Right of forward (fx, fz) on the ground plane is (-fz, fx).
  const side = d > 0.001 ? (dx * -fz + dz * fx) / d : 0;
  return { pan: Math.max(-0.9, Math.min(0.9, side * 0.9)), gain: ref / Math.max(ref, d) };
}

/** One bird call: a few FM-chirped notes in the species' range. */
export function birdCall(ctx: BaseAudioContext, out: AudioNode, t: number, kind: BirdKind, rnd: () => number, level: number) {
  const sources: AudioScheduledSourceNode[] = [];
  const shape = {
    warbler: { f: 3600, spread: 900, notes: 6, gap: 0.055, len: 0.045, sweep: 1.25 },
    finch: { f: 4300, spread: 600, notes: 3, gap: 0.09, len: 0.07, sweep: 0.8 },
    sparrow: { f: 4800, spread: 500, notes: 2, gap: 0.12, len: 0.06, sweep: 1.15 },
    magpie: { f: 2100, spread: 300, notes: 4, gap: 0.085, len: 0.06, sweep: 0.9 },
  }[kind];
  const base = shape.f + rnd() * shape.spread;
  let end = t;
  for (let i = 0; i < shape.notes; i++) {
    const at = t + i * shape.gap * (0.85 + Math.abs(rnd()) * 0.3);
    const f = base * (1 + rnd() * 0.06);
    const osc = ctx.createOscillator(),
      g = ctx.createGain();
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(f * shape.sweep, at + shape.len);
    if (kind === "magpie") {
      // Harsh chatter: a fast amplitude buzz.
      osc.type = "sawtooth";
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = f;
      band.Q.value = 3;
      osc.connect(band);
      band.connect(g);
    } else osc.connect(g);
    env(g.gain, at, 0.006, shape.len, level * (kind === "magpie" ? 2.2 : 1));
    g.connect(out);
    osc.start(at);
    osc.stop(at + shape.len + 0.02);
    sources.push(osc);
    end = at + shape.len;
  }
  return { sources, end };
}

/** A far car passing: band of noise swelling and falling over ~3 s. */
export function carPass(ctx: BaseAudioContext, out: AudioNode, t: number, noise: AudioBuffer, rnd: () => number, level: number) {
  const d = 2.6 + Math.abs(rnd()) * 1.4;
  const src = ctx.createBufferSource(),
    band = ctx.createBiquadFilter(),
    g = ctx.createGain();
  src.buffer = noise;
  src.loop = true;
  band.type = "bandpass";
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(380, t);
  band.frequency.linearRampToValueAtTime(820, t + d * 0.5);
  band.frequency.linearRampToValueAtTime(340, t + d);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + d * 0.5);
  g.gain.linearRampToValueAtTime(0, t + d);
  src.connect(band);
  band.connect(g);
  g.connect(out);
  src.start(t, Math.abs(rnd()));
  src.stop(t + d + 0.05);
  return { sources: [src], end: t + d };
}

/** Wind chime: two or three soft FM bells from a pentatonic set. */
export function windChime(ctx: BaseAudioContext, out: AudioNode, t: number, rnd: () => number, level: number) {
  const scale = [1047, 1175, 1319, 1568, 1760, 2093];
  const n = 2 + Math.floor(Math.abs(rnd()) * 2);
  const sources: AudioScheduledSourceNode[] = [];
  let end = t;
  for (let i = 0; i < n; i++) {
    const at = t + i * (0.18 + Math.abs(rnd()) * 0.25);
    const f = scale[Math.floor(Math.abs(rnd()) * scale.length) % scale.length];
    const c = ctx.createOscillator(),
      m = ctx.createOscillator(),
      depth = ctx.createGain(),
      g = ctx.createGain();
    c.frequency.value = f;
    m.frequency.value = f * 3.5;
    depth.gain.setValueAtTime(f * 1.2, at);
    depth.gain.exponentialRampToValueAtTime(f * 0.01, at + 0.6);
    m.connect(depth);
    depth.connect(c.frequency);
    c.connect(g);
    env(g.gain, at, 0.002, 1.4, level);
    g.connect(out);
    c.start(at);
    m.start(at);
    c.stop(at + 1.45);
    m.stop(at + 1.45);
    sources.push(c, m);
    end = at + 1.4;
  }
  return { sources, end };
}

export type EventKind = "bird" | "car" | "chime";
/**
 * Which events start in the next `dt` seconds. Pure: Poisson arrivals at
 * each kind's rate, gated by daylight and wind, never more than `room`.
 */
export function pickEvents(
  world: WorldId,
  conditions: { day: number; wind: number; outdoors: boolean },
  dt: number,
  room: number,
  rnd: () => number,
): EventKind[] {
  if (!conditions.outdoors || room <= 0) return [];
  const w = WORLD_AMBIENCE[world];
  const rates: [EventKind, number][] = [
    ["bird", w.birdRate * conditions.day],
    ["car", w.cars],
    ["chime", w.chimes * Math.min(1, conditions.wind * 2.5)],
  ];
  const out: EventKind[] = [];
  for (const [kind, rate] of rates) {
    if (out.length >= room) break;
    if (rate > 0 && Math.abs(rnd()) < 1 - Math.exp(-rate * dt)) out.push(kind);
  }
  return out;
}
