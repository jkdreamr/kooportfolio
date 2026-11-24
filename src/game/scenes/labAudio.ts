import { useGame } from "../core/store";

let context: AudioContext | undefined;
// Original synthesized notes only; respects the world's sound setting.
export function labTone(lane: number, quiet = false) {
  if (useGame.getState().muted) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const osc = context.createOscillator(),
      gain = context.createGain();
    const now = context.currentTime;
    osc.type = lane === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime([130.81, 196, 261.63, 329.63][lane % 4], now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(quiet ? 0.025 : 0.09, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.21);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    /* Sound is optional. */
  }
}
