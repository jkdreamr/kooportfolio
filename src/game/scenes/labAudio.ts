import { useGame } from "../core/store";
import { audio as host } from "../core/audio/live";
import { LAB_BEAT_PATTERNS, beatBar, beatSwing, type LabVoice } from "../core/labBeats";

/** Beat Lab's own voices sit on the effects bus at this trim, under the
 * engine's master chain (mute, levels, compressor, limiter). */
export const LAB_LEVEL = 0.32;
let out: GainNode | undefined;
let outContext: BaseAudioContext | undefined;
function output(audio: AudioContext): AudioNode {
  if (!out || outContext !== audio) {
    out = audio.createGain();
    out.gain.value = LAB_LEVEL;
    outContext = audio;
    host.connect("sfx", out);
  }
  return out;
}
/** The engine's context, when a sound may be made now. */
function labContext(): AudioContext | null {
  return host.ready() ? (host.ctx ?? null) : null;
}
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
  gain.connect(output(audio));
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
    const audio = labContext();
    if (!audio) return;
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

function kick(audio: AudioContext, when: number): OscillatorNode {
  const osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(46, when + 0.1);
  gain.gain.setValueAtTime(0.55, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
  osc.connect(gain);
  gain.connect(output(audio));
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
  gain.connect(output(audio));
  src.start(when);
  src.stop(when + duration + 0.01);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  return src;
}

// Simple synth voices: stacked partials through an optional filter, all
// sharing one pluck/pad envelope.

const LAB_VOICES: Record<
  LabVoice,
  {
    partials: [OscillatorType, number, number][];
    filter?: [BiquadFilterType, number];
    attack: number;
    decay: number;
    volume: number;
  }
> = {
  piano: {
    partials: [
      ["triangle", 1, 1],
      ["sine", 2, 0.35],
    ],
    attack: 0.005,
    decay: 0.5,
    volume: 0.07,
  },
  guitar: {
    partials: [
      ["sawtooth", 1, 0.6],
      ["sawtooth", 1.004, 0.4],
    ],
    filter: ["lowpass", 1800],
    attack: 0.004,
    decay: 0.45,
    volume: 0.06,
  },
  synth: {
    partials: [
      ["square", 1, 0.4],
      ["sine", 2, 0.5],
    ],
    filter: ["lowpass", 3200],
    attack: 0.003,
    decay: 0.14,
    volume: 0.05,
  },
  pad: {
    partials: [
      ["sawtooth", 0.998, 0.5],
      ["sawtooth", 1.003, 0.5],
    ],
    filter: ["lowpass", 1400],
    attack: 0.1,
    decay: 0.9,
    volume: 0.045,
  },
  bass: {
    partials: [
      ["sine", 1, 1],
      ["triangle", 0.5, 0.3],
    ],
    attack: 0.008,
    decay: 0.8,
    volume: 0.11,
  },
};

const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function voiceNote(
  audio: AudioContext,
  when: number,
  midi: number,
  length: number,
  voice: LabVoice,
): AudioScheduledSourceNode[] {
  const spec = LAB_VOICES[voice];
  const duration = Math.max(length, spec.decay);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.exponentialRampToValueAtTime(spec.volume, when + spec.attack);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
  gain.connect(output(audio));
  let input: AudioNode = gain;
  let filter: BiquadFilterNode | undefined;
  if (spec.filter) {
    filter = audio.createBiquadFilter();
    filter.type = spec.filter[0];
    filter.frequency.value = spec.filter[1];
    filter.connect(gain);
    input = filter;
  }
  const nodes = spec.partials.map(([type, ratio, level], index) => {
    const osc = audio.createOscillator(),
      part = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(midiToFreq(midi) * ratio, when);
    part.gain.value = level;
    osc.connect(part);
    part.connect(input);
    osc.start(when);
    osc.stop(when + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      part.disconnect();
      if (index === spec.partials.length - 1) {
        filter?.disconnect();
        gain.disconnect();
      }
    };
    return osc;
  });
  return nodes;
}

export { LAB_BEAT_PATTERNS } from "../core/labBeats";

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
    const audio = labContext();
    if (!audio) return cancel;
    const stepsPerBar = beatsPerBar * 4;
    const stepInterval = beatInterval / 4;
    const countInSteps = countInBars * stepsPerBar;
    const drums = LAB_BEAT_PATTERNS[pattern] ?? LAB_BEAT_PATTERNS.boombap;
    const swing = beatSwing(pattern);
    const schedule = (node: AudioScheduledSourceNode) => {
      scheduled.add(node);
      const cleanup = node.onended;
      node.onended = (event) => {
        cleanup?.call(node, event);
        scheduled.delete(node);
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
        const bar = beatBar(pattern, Math.floor((step - countInSteps) / stepsPerBar));
        const at = slot % 2 === 1 ? when + swing * stepInterval : when;
        if (bar.kick.includes(slot)) schedule(kick(audio, at));
        if (bar.snare.includes(slot)) {
          schedule(noiseHit(audio, at, "bandpass", 1900, 0.32, 0.12));
          schedule(playTone(audio, at, 185, "triangle", 0.12, 0.07));
        }
        if (bar.hat.includes(slot))
          schedule(noiseHit(audio, at, "highpass", 7600, 0.1, 0.035));
        for (const layer of drums.melody ?? []) {
          const melodyStep = (step - countInSteps) % layer.steps;
          for (const event of layer.events) {
            if (event.step !== melodyStep) continue;
            for (const node of voiceNote(
              audio,
              at,
              event.midi,
              (event.length ?? 3) * stepInterval,
              layer.voice,
            ))
              schedule(node);
          }
        }
      }
    };
    if (audio.state === "running") queue();
    else void audio.resume().then(queue).catch(cancel);
  } catch {
    cancel();
  }
  return cancel;
}
