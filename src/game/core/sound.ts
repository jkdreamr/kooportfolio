import { useGame } from "./store";
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
} as const satisfies Record<string, Tone>;
export type SoundKind = keyof typeof TONES | "whoosh";

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

export function sound(kind: SoundKind) {
  if (useGame.getState().muted) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const t = audio.currentTime;
    if (kind === "whoosh") {
      whoosh(audio, t);
      return;
    }
    const tone = TONES[kind];
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.f, t);
    osc.frequency.exponentialRampToValueAtTime(tone.to, t + tone.dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(tone.vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur + 0.09);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + tone.dur + 0.1);
  } catch {
    /* Audio is optional. */
  }
}

let lastStep = 0,
  stepFlip = false;
/** Quiet alternating footfalls while the avatar walks; call each moving frame. */
export function footstep() {
  const now = performance.now();
  if (now - lastStep < 340) return;
  lastStep = now;
  if (useGame.getState().muted) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const t = audio.currentTime,
      osc = audio.createOscillator(),
      gain = audio.createGain();
    stepFlip = !stepFlip;
    osc.type = "sine";
    osc.frequency.setValueAtTime(stepFlip ? 66 : 56, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.07);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.035, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  } catch {
    /* Audio is optional. */
  }
}
