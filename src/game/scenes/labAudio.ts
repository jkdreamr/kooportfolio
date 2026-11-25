import { BEAT_INTERVAL } from "../core/labGames";
import { useGame } from "../core/store";

let context: AudioContext | undefined;
function playTone(
  audio: AudioContext,
  when: number,
  frequency: number,
  type: OscillatorType,
  volume: number,
  duration: number,
  onEnded?: () => void,
): OscillatorNode {
  const osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(when);
  osc.stop(when + duration + 0.01);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
    onEnded?.();
  };
  return osc;
}

export function labTone(lane: number) {
  if (useGame.getState().muted) return;
  try {
    const audio = (context ??= new AudioContext());
    if (audio.state === "suspended") void audio.resume().catch(() => {});
    playTone(
      audio,
      audio.currentTime,
      [130.81, 196, 261.63, 329.63][lane % 4],
      lane === 0 ? "sine" : "triangle",
      0.09,
      0.2,
    );
  } catch {
    /* Sound is optional. */
  }
}

export function scheduleLabBeatClicks(readTime: () => number, end: number) {
  const scheduled = new Set<OscillatorNode>();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    scheduled.forEach((click) => click.stop());
    scheduled.clear();
  };
  if (useGame.getState().muted) return cancel;
  try {
    const audio = (context ??= new AudioContext());
    const queue = () => {
      if (cancelled || useGame.getState().muted) return;
      const now = audio.currentTime;
      const time = readTime();
      const first = Math.max(0, Math.ceil((time - 0.03) / BEAT_INTERVAL));
      for (let beat = first; beat < Math.round(end / BEAT_INTERVAL); beat++) {
        const when = Math.max(now, now + beat * BEAT_INTERVAL - time);
        const click = playTone(audio, when, 740, "sine", 0.031, 0.045, () =>
          scheduled.delete(click),
        );
        scheduled.add(click);
      }
    };
    if (audio.state === "running") queue();
    else void audio.resume().then(queue).catch(cancel);
  } catch {
    cancel();
  }
  return cancel;
}
