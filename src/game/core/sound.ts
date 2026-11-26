import { runtime, useGame } from "./store";
import { keys } from "./input";
import { doorsInWorld, isInterior } from "./world";
import { POND } from "./pond";
import type { WorldId } from "./worlds";
let audio: AudioContext | undefined;
let noise: AudioBuffer | undefined;
// All sounds are synthesized here. No recordings, tracking, or remote requests.
type Tone = {
  f: number;
  to: number;
  type: OscillatorType;
  dur: number;
  vol: number;
};
const TONES = {
  shot: { f: 180, to: 40, type: "triangle", dur: 0.16, vol: 0.08 },
  bounce: { f: 100, to: 40, type: "sine", dur: 0.16, vol: 0.08 },
  score: { f: 660, to: 990, type: "triangle", dur: 0.16, vol: 0.08 },
  win: { f: 440, to: 880, type: "triangle", dur: 0.16, vol: 0.08 },
  step: { f: 70, to: 40, type: "triangle", dur: 0.16, vol: 0.08 },
  tap: { f: 480, to: 170, type: "triangle", dur: 0.09, vol: 0.07 },
  land: { f: 140, to: 45, type: "sine", dur: 0.14, vol: 0.09 },
  chime: { f: 1320, to: 660, type: "sine", dur: 0.35, vol: 0.06 },
  kick: { f: 150, to: 45, type: "sine", dur: 0.25, vol: 0.08 },
  clang: { f: 1150, to: 480, type: "triangle", dur: 0.4, vol: 0.08 },
  cheer: { f: 320, to: 620, type: "sine", dur: 0.7, vol: 0.08 },
  whistle: { f: 2400, to: 1900, type: "triangle", dur: 0.4, vol: 0.08 },
  /** Interface: a soft glassy tick up on open, down on close. */
  open: { f: 900, to: 1380, type: "sine", dur: 0.05, vol: 0.022 },
  close: { f: 1250, to: 760, type: "sine", dur: 0.05, vol: 0.018 },
} as const satisfies Record<string, Tone>;
export type SoundKind = keyof typeof TONES | "whoosh" | "door";

function context() {
  audio ??= new AudioContext();
  void audio.resume();
  return audio;
}

function noiseBuffer(audio: AudioContext) {
  if (!noise || noise.sampleRate !== audio.sampleRate) {
    noise = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * 0.5),
      audio.sampleRate,
    );
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** One shaped noise burst through a filter: the grain of every footfall. */
function burst(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  type: BiquadFilterType,
  frequency: number,
  q: number,
  vol: number,
  decay: number,
) {
  const src = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  src.buffer = noiseBuffer(ctx);
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  // Random read point: no two steps share a grain pattern.
  src.start(t, Math.random() * 0.4);
  src.stop(t + decay + 0.02);
}

/** A short pitched body (heel thump, hollow board). */
function thump(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  from: number,
  to: number,
  vol: number,
  decay: number,
) {
  const osc = ctx.createOscillator(),
    gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + decay * 0.7);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(gain);
  gain.connect(out);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

function whoosh(context: AudioContext, t: number) {
  const src = context.createBufferSource(),
    filter = context.createBiquadFilter(),
    gain = context.createGain();
  src.buffer = noiseBuffer(context);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1400, t);
  filter.frequency.exponentialRampToValueAtTime(320, t + 0.2);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  src.start(t);
  src.stop(t + 0.26);
}

/** A wooden door: latch click, then a soft hollow thud as it swings to. */
function door(ctx: AudioContext, t: number) {
  const out = ctx.destination;
  burst(ctx, out, t, "bandpass", 3200, 4, 0.03, 0.03);
  burst(ctx, out, t + 0.012, "bandpass", 1700, 6, 0.02, 0.04);
  burst(ctx, out, t + 0.05, "bandpass", 520, 1.2, 0.03, 0.32);
  thump(ctx, out, t + 0.2, 120, 64, 0.05, 0.18);
}

export function sound(kind: SoundKind) {
  if (useGame.getState().muted) return;
  try {
    const ctx = context();
    const t = ctx.currentTime;
    if (kind === "whoosh") {
      whoosh(ctx, t);
      return;
    }
    if (kind === "door") {
      door(ctx, t);
      return;
    }
    const tone = TONES[kind];
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.f, t);
    osc.frequency.exponentialRampToValueAtTime(tone.to, t + tone.dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(tone.vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + tone.dur + 0.1);
  } catch {
    /* Audio is optional. */
  }
}

export type Surface = "grass" | "gravel" | "stone" | "wood" | "soft";

/** Floors inside, by room. Anything unlisted is boards. */
const ROOM_FLOORS: Partial<Record<string, Surface>> = {
  skate: "stone",
  basketball: "stone",
  stadium: "stone",
  kitchen: "stone",
  secret: "stone",
  theater: "soft",
  cognition: "soft",
  gym: "soft",
};

/**
 * What the avatar is standing on. Interiors use the room's floor; outside,
 * doorsteps are flagstones, the pond rim is gravel, Stanford's walks are
 * decomposed granite and everything else is lawn. Pure and cheap: it runs at
 * most once per footfall.
 */
export function surfaceAt(
  scene: string,
  world: WorldId,
  x: number,
  z: number,
): Surface {
  if (scene === "rowing") return "wood";
  if (scene !== "hub")
    return ROOM_FLOORS[scene] ?? (isInterior(scene) ? "wood" : "stone");
  for (const door of doorsInWorld(world))
    if (Math.hypot(x - door.x, z - door.z) < 3.2) return "stone";
  if (world !== "home") {
    const rim = Math.hypot(
      ((x - POND.x) * POND.radiusZ) / POND.radiusX,
      z - POND.z,
    );
    if (rim < POND.radiusZ + 2.2) return "gravel";
  }
  return world === "stanford" ? "gravel" : "grass";
}

function step(ctx: AudioContext, surface: Surface, left: boolean, sprint: boolean) {
  const t = ctx.currentTime;
  // ±6% pitch and ±15% level: no machine-gun repetition.
  const pitch = 0.94 + Math.random() * 0.12,
    level = (0.85 + Math.random() * 0.3) * (sprint ? 1.2 : 1);
  let out: AudioNode = ctx.destination;
  if (typeof ctx.createStereoPanner === "function") {
    const pan = ctx.createStereoPanner();
    pan.pan.value = left ? -0.12 : 0.12;
    pan.connect(ctx.destination);
    out = pan;
  }
  switch (surface) {
    case "grass":
      burst(ctx, out, t, "bandpass", 2600 * pitch, 0.7, 0.036 * level, 0.1);
      burst(ctx, out, t + 0.02, "highpass", 4200 * pitch, 0.5, 0.014 * level, 0.07);
      thump(ctx, out, t, 64 * pitch, 40, 0.014 * level, 0.08);
      break;
    case "gravel":
      for (let i = 0; i < 3; i++)
        burst(ctx, out, t + i * 0.014 + Math.random() * 0.008, "bandpass",
          (2900 + Math.random() * 900) * pitch, 1.3, 0.03 * level, 0.055);
      thump(ctx, out, t, 70 * pitch, 42, 0.016 * level, 0.08);
      break;
    case "stone":
      burst(ctx, out, t, "bandpass", 1900 * pitch, 2.2, 0.03 * level, 0.035);
      thump(ctx, out, t, 112 * pitch, 70, 0.026 * level, 0.065);
      break;
    case "wood":
      thump(ctx, out, t, 158 * pitch, 92, 0.036 * level, 0.1);
      burst(ctx, out, t, "bandpass", 880 * pitch, 1.6, 0.022 * level, 0.045);
      break;
    case "soft":
      burst(ctx, out, t, "lowpass", 520 * pitch, 0.7, 0.03 * level, 0.075);
      thump(ctx, out, t, 58 * pitch, 38, 0.012 * level, 0.07);
      break;
  }
}

let lastStep = 0,
  stepFlip = false;
/** Quiet alternating footfalls while the avatar walks; call each moving frame.
 * The surface under the avatar voices each step; sprinting quickens the gait. */
export function footstep() {
  const now = performance.now(),
    sprint = keys.has("shift");
  if (now - lastStep < (sprint ? 250 : 340)) return;
  lastStep = now;
  const state = useGame.getState();
  if (state.muted) return;
  try {
    const ctx = context();
    stepFlip = !stepFlip;
    step(ctx, surfaceAt(state.scene, state.world, runtime.x, runtime.z), stepFlip, sprint);
  } catch {
    /* Audio is optional. */
  }
}
