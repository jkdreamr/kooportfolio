import { useGame } from "./store";
let audio: AudioContext | undefined;
// All sounds are synthesized here. No recordings, tracking, or remote requests.
type Tone = { f0: number; f1: number; type?: OscillatorType; hold?: number };
const TONES: Record<string, Tone> = {
  shot: { f0: 180, f1: 40 },
  bounce: { f0: 100, f1: 40, type: "sine" },
  score: { f0: 660, f1: 990 },
  win: { f0: 440, f1: 880 },
  step: { f0: 70, f1: 40 },
  kick: { f0: 150, f1: 45, type: "sine" },
  clang: { f0: 1150, f1: 480, hold: 0.4 },
  cheer: { f0: 320, f1: 620, type: "sine", hold: 0.7 },
  whistle: { f0: 2400, f1: 1900, hold: 0.4 },
};

export function sound(
  kind:
    | "shot"
    | "bounce"
    | "score"
    | "win"
    | "step"
    | "kick"
    | "clang"
    | "cheer"
    | "whistle",
) {
  if (useGame.getState().muted) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const tone = TONES[kind];
    const osc = audio.createOscillator(),
      gain = audio.createGain(),
      t = audio.currentTime;
    const hold = tone.hold ?? 0.25;
    osc.type = tone.type ?? "triangle";
    osc.frequency.setValueAtTime(tone.f0, t);
    osc.frequency.exponentialRampToValueAtTime(tone.f1, t + hold * 0.6);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + hold);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + hold + 0.02);
  } catch {
    /* Audio is optional. */
  }
}
