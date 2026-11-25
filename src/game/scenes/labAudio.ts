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

let noise: AudioBuffer | undefined;
function noiseBuffer(audio: AudioContext) {
  if (!noise || noise.sampleRate !== audio.sampleRate) {
    noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.5), audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function kick(audio: AudioContext, when: number): OscillatorNode {
  const osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(46, when + 0.1);
  gain.gain.setValueAtTime(0.55, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(when);
  osc.stop(when + 0.22);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  return osc;
}

function noiseHit(
  audio: AudioContext,
  when: number,
  filterType: BiquadFilterType,
  frequency: number,
  volume: number,
  duration: number,
): AudioBufferSourceNode {
  const src = audio.createBufferSource(),
    filter = audio.createBiquadFilter(),
    gain = audio.createGain();
  src.buffer = noiseBuffer(audio);
  filter.type = filterType;
  filter.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  src.start(when);
  src.stop(when + duration + 0.01);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  return src;
}

// 16-step drum patterns per bar. `beat` marks which steps the ball/pads light on.
export const LAB_BEAT_PATTERNS: Record<
  string,
  { kick: number[]; snare: number[]; hat: number[] }
> = {
  boombap: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  lofi: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  house: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] },
  trap: { kick: [0, 6, 10], snare: [8], hat: [0, 1, 2, 4, 6, 8, 9, 10, 12, 14] },
};

export function scheduleLabBeat(
  readTime: () => number,
  end: number,
  beatInterval = 0.6,
  pattern = "boombap",
  beatsPerBar = 4,
  countInBars = 1,
) {
  const scheduled = new Set<AudioScheduledSourceNode>();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    scheduled.forEach((node) => node.stop());
    scheduled.clear();
  };
  if (useGame.getState().muted) return cancel;
  try {
    const audio = (context ??= new AudioContext());
    const stepsPerBar = beatsPerBar * 4;
    const stepInterval = beatInterval / 4;
    const countInSteps = countInBars * stepsPerBar;
    const drums = LAB_BEAT_PATTERNS[pattern] ?? LAB_BEAT_PATTERNS.boombap;
    const schedule = (node: AudioScheduledSourceNode, onEnded?: () => void) => {
      scheduled.add(node);
      const done = onEnded;
      node.onended = () => {
        node.disconnect();
        scheduled.delete(node);
        done?.();
      };
    };
    const queue = () => {
      if (cancelled || useGame.getState().muted) return;
      const now = audio.currentTime;
      const time = readTime();
      const first = Math.max(0, Math.ceil((time - 0.03) / stepInterval));
      for (let step = first; step < Math.round(end / stepInterval); step++) {
        const when = Math.max(now, now + step * stepInterval - time);
        if (step < countInSteps) {
          // Metronome count-in: a click per beat before the beat drops.
          if (step % 4 !== 0) continue;
          const click = playTone(
            audio,
            when,
            step === 0 ? 190 : 740,
            step === 0 ? "triangle" : "sine",
            0.05,
            0.06,
          );
          schedule(click);
          continue;
        }
        const slot = (step - countInSteps) % stepsPerBar;
        if (drums.kick.includes(slot)) schedule(kick(audio, when));
        if (drums.snare.includes(slot)) {
          schedule(noiseHit(audio, when, "bandpass", 1900, 0.32, 0.12));
          schedule(
            playTone(audio, when, 185, "triangle", 0.12, 0.07),
          );
        }
        if (drums.hat.includes(slot))
          schedule(noiseHit(audio, when, "highpass", 7600, 0.1, 0.035));
      }
    };
    if (audio.state === "running") queue();
    else void audio.resume().then(queue).catch(cancel);
  } catch {
    cancel();
  }
  return cancel;
}
