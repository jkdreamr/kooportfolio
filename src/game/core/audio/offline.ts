/**
 * Offline audition: renders palette cues and a "busy play" mix in an
 * OfflineAudioContext with the same code the game runs, and measures them.
 * Browser-only entry (bundled by tests/audioRender.test.ts into a page);
 * nothing in the game imports it.
 */
import { buildMixGraph, BUS_GAIN, seededNoise, sliderGain } from "./graph";
import { PALETTE_NAMES, SPECS, type PaletteName } from "./palette";
import { buildVoice } from "./engine";
import { birdCall, cityBed, pinkSamples, normalise, windBed } from "./ambience";
import { activeSpan, dbfs, measure, peak, rms } from "./metrics";
import { encodeWav } from "./wav";
import { TRACK_GAIN } from "./music";

const rng01 = (seed: number) => {
  const r = seededNoise(seed);
  return () => (r() + 1) / 2;
};

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function channelsOf(buffer: AudioBuffer) {
  return Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
}

export type CueRender = {
  name: PaletteName;
  sampleRate: number;
  peakDb: number;
  activeRmsDb: number;
  length: number;
  start: number;
  dc: number;
  clipped: number;
  centroid: number;
  bands: Record<string, number>;
  /** Peak in the last 0.3 s of the render (silence after the cue). */
  tailDb: number;
  wav?: string;
};

/**
 * One cue. `wet`: through the full master chain (reverb, compressor,
 * limiter), as a visitor hears it; otherwise voice → bus gain only, which is
 * what the level column specifies.
 */
export async function renderCue(
  name: PaletteName,
  options: { seed?: number; sampleRate?: number; wet?: boolean; wav?: boolean; duration?: number } = {},
): Promise<CueRender> {
  const sampleRate = options.sampleRate ?? 48000;
  const spec = SPECS[name];
  const d = name === "flight" ? (options.duration ?? 4.6) : spec.dur;
  const tail = options.wet ? 2.4 : 0.6;
  const ctx = new OfflineAudioContext(2, Math.ceil((d + 0.05 + tail) * sampleRate), sampleRate);
  let target: { bus: AudioNode; send?: AudioNode };
  if (options.wet) {
    const g = buildMixGraph(ctx);
    target = { bus: g.bus[spec.bus], send: g.send[spec.bus] };
  } else {
    const bus = ctx.createGain();
    bus.gain.value = BUS_GAIN[spec.bus];
    bus.connect(ctx.destination);
    target = { bus };
  }
  buildVoice(ctx, target, name, { duration: d }, rng01(options.seed ?? 1));
  const buffer = await ctx.startRendering();
  const ch = channelsOf(buffer);
  const m = measure(sampleRate, ch);
  const span = activeSpan(sampleRate, -40, ...ch);
  const a = Math.floor(span.start * sampleRate),
    b = Math.max(a + 1, Math.ceil((span.start + span.length) * sampleRate));
  const tailFrom = buffer.length - Math.round(0.3 * sampleRate);
  return {
    name,
    sampleRate,
    peakDb: m.peakDb,
    activeRmsDb: dbfs(rms(...ch.map((c) => c.subarray(a, b)))),
    length: m.length,
    start: m.start,
    dc: m.dc,
    clipped: m.clipped,
    centroid: m.centroid,
    bands: m.bands,
    tailDb: dbfs(peak(...ch.map((c) => c.subarray(tailFrom)))),
    wav: options.wav ? base64(encodeWav(sampleRate, ch)) : undefined,
  };
}

export type BusyRender = {
  seconds: number;
  cues: number;
  mix: ReturnType<typeof measure>;
  music: { rmsDb: number; peakDb: number } | null;
  wav?: string;
};

/**
 * Sixty seconds of busy play: ambience beds (wind, far city, the field
 * recordings if given, bird calls), `cues` random palette one-shots, and
 * optionally a music stand-in (pink noise at -14 dBFS RMS, a mastered
 * track's typical level) on the music bus at the default slider (80).
 */
export async function renderBusy(
  options: {
    seconds?: number;
    seed?: number;
    cues?: number;
    sampleRate?: number;
    music?: boolean;
    recordings?: Record<string, string>;
    wav?: boolean;
  } = {},
): Promise<BusyRender> {
  const seconds = options.seconds ?? 60,
    sampleRate = options.sampleRate ?? 44100,
    count = options.cues ?? 200;
  const rnd = rng01(options.seed ?? 7);
  const build = async (withAmbience: boolean, withCues: boolean, withMusic: boolean) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const g = buildMixGraph(ctx);
    for (const bus of ["music"] as const) {
      g.bus[bus].gain.value = BUS_GAIN[bus] * sliderGain(80);
      g.send[bus].gain.value = BUS_GAIN[bus] * sliderGain(80);
    }
    if (withAmbience) {
      const amb = ctx.createGain();
      amb.connect(g.bus.ambience);
      const wind = windBed(ctx, amb);
      wind.gain.gain.value = 0.025;
      const city = cityBed(ctx, amb);
      city.gain.gain.value = 0.012;
      const levels: Record<string, number> = { birds: 0.07 + 0.2 * 0.5, water: 0.12, crickets: 0, rain: 0 };
      for (const [name, data] of Object.entries(options.recordings ?? {})) {
        if (!levels[name]) continue;
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const decoded = await ctx.decodeAudioData(bytes.buffer);
        const src = ctx.createBufferSource(),
          gain = ctx.createGain();
        src.buffer = decoded;
        src.loop = true;
        gain.gain.value = levels[name];
        src.connect(gain);
        gain.connect(amb);
        src.start(0);
      }
      for (let t = 1; t < seconds - 1; t += 1.6 + rnd() * 2.4)
        birdCall(ctx, amb, t, (["warbler", "finch", "sparrow"] as const)[Math.floor(rnd() * 3)], rnd, 0.03);
    }
    if (withCues) {
      const pool = PALETTE_NAMES.filter((n) => n !== "flight" && n !== "travel-depart");
      for (let i = 0; i < count; i++) {
        const name = pool[Math.floor(rnd() * pool.length)];
        const spec = SPECS[name];
        buildVoice(ctx, { bus: g.bus[spec.bus], send: g.send[spec.bus] }, name, { delay: rnd() * (seconds - 2), pan: rnd() * 1.2 - 0.6 }, rnd);
      }
      buildVoice(ctx, { bus: g.bus.sfx, send: g.send.sfx }, "flight", { delay: 20, duration: 4.6 }, rnd);
      buildVoice(ctx, { bus: g.bus.sfx, send: g.send.sfx }, "travel-depart", { delay: 40 }, rnd);
    }
    if (withMusic) {
      const n = Math.ceil(sampleRate * 8);
      const data = normalise(pinkSamples(n, 99), 1);
      // A mastered track's level, then the same trim real tracks get.
      const k = (10 ** (-14 / 20) / (rms(data) || 1)) * TRACK_GAIN;
      for (let i = 0; i < n; i++) data[i] *= k;
      const b = ctx.createBuffer(1, n, sampleRate);
      b.getChannelData(0).set(data);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.connect(g.bus.music);
      src.start(0);
    }
    return channelsOf(await ctx.startRendering());
  };
  const mixChannels = await build(true, true, !!options.music);
  const musicOnly = options.music ? await build(false, false, true) : null;
  return {
    seconds,
    cues: count + 2,
    mix: measure(sampleRate, mixChannels),
    music: musicOnly ? { rmsDb: dbfs(rms(...musicOnly)), peakDb: dbfs(peak(...musicOnly)) } : null,
    wav: options.wav ? base64(encodeWav(sampleRate, mixChannels)) : undefined,
  };
}

export const names = () => PALETTE_NAMES;
