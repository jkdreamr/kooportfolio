import { useGame } from "../core/store";

let context: AudioContext | undefined;
function playTone(
  frequency: number,
  type: OscillatorType,
  volume: number,
  duration: number,
) {
  if (useGame.getState().muted) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
    const osc = context.createOscillator(),
      gain = context.createGain();
    const now = context.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    /* Sound is optional. */
  }
}

export function labTone(lane: number) {
  playTone(
    [130.81, 196, 261.63, 329.63][lane % 4],
    lane === 0 ? "sine" : "triangle",
    0.09,
    0.2,
  );
}

export function labBeatClick() {
  playTone(740, "sine", 0.031, 0.045);
}
