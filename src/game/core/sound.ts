import { useGame } from "./store";
let audio: AudioContext | undefined;
// All sounds are synthesized here. No recordings, tracking, or remote requests.
export function sound(kind: "shot" | "bounce" | "score" | "win" | "step") {
  if (useGame.getState().muted) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const osc = audio.createOscillator(),
      gain = audio.createGain(),
      t = audio.currentTime;
    osc.type = kind === "bounce" ? "sine" : "triangle";
    osc.frequency.setValueAtTime(
      { shot: 180, bounce: 100, score: 660, win: 440, step: 70 }[kind],
      t,
    );
    osc.frequency.exponentialRampToValueAtTime(
      kind === "win" ? 880 : kind === "score" ? 990 : 40,
      t + 0.16,
    );
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  } catch {
    /* Audio is optional. */
  }
}
