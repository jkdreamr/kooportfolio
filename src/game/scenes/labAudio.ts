import { useGame } from "../core/store";
import { audio as host } from "../core/audio/live";

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
type LabVoice = "piano" | "guitar" | "synth" | "pad" | "bass";
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

// A melodic loop layered over the drums: `step`/`length` count 16th-note
// slots inside `steps` (16 = one bar), `midi` is the note number.
type LabMelodyEvent = { step: number; midi: number; length?: number };
type LabMelody = { voice: LabVoice; steps: number; events: LabMelodyEvent[] };

// 16-step drum patterns per bar. `beat` marks which steps the ball/pads light on.
export const LAB_BEAT_PATTERNS: Record<
  string,
  { kick: number[]; snare: number[]; hat: number[]; melody?: LabMelody[] }
> = {
  boombap: {
    kick: [0, 7, 10],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  },
  lofi: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  house: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] },
  trap: {
    kick: [0, 6, 10],
    snare: [8],
    hat: [0, 1, 2, 4, 6, 8, 9, 10, 12, 14],
  },
  // Melodic variants: drums plus an instrument loop per pattern.
  pianobap: {
    kick: [0, 8, 10],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    melody: [
      {
        voice: "piano",
        steps: 32,
        events: [
          { step: 0, midi: 50 },
          { step: 0, midi: 53 },
          { step: 0, midi: 57 },
          { step: 7, midi: 57 },
          { step: 7, midi: 60 },
          { step: 7, midi: 65 },
          { step: 14, midi: 55 },
          { step: 14, midi: 59 },
          { step: 14, midi: 62 },
          { step: 22, midi: 57 },
          { step: 22, midi: 60 },
          { step: 22, midi: 64 },
          { step: 26, midi: 53 },
          { step: 26, midi: 57 },
          { step: 26, midi: 60 },
        ],
      },
      {
        voice: "bass",
        steps: 32,
        events: [
          { step: 0, midi: 38, length: 6 },
          { step: 16, midi: 45, length: 6 },
        ],
      },
    ],
  },
  soulbap: {
    kick: [0, 7, 11],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    melody: [
      {
        voice: "guitar",
        steps: 32,
        events: [
          { step: 0, midi: 57, length: 2 },
          { step: 3, midi: 60 },
          { step: 6, midi: 62 },
          { step: 10, midi: 64, length: 3 },
          { step: 14, midi: 62 },
          { step: 18, midi: 57 },
          { step: 22, midi: 60 },
          { step: 26, midi: 64, length: 3 },
          { step: 30, midi: 67, length: 2 },
        ],
      },
      {
        voice: "bass",
        steps: 32,
        events: [
          { step: 0, midi: 33, length: 6 },
          { step: 16, midi: 40, length: 6 },
        ],
      },
    ],
  },
  darktrap: {
    kick: [0, 6, 10],
    snare: [8],
    hat: [0, 1, 2, 4, 6, 7, 8, 9, 10, 12, 14, 15],
    melody: [
      {
        voice: "synth",
        steps: 16,
        events: [
          60, 63, 67, 70, 60, 63, 67, 72, 60, 63, 67, 70, 67, 70, 75, 72,
        ].map((midi, step) => ({ step, midi, length: 1 })),
      },
      {
        voice: "bass",
        steps: 32,
        events: [
          { step: 0, midi: 36, length: 5 },
          { step: 10, midi: 36, length: 4 },
          { step: 16, midi: 31, length: 6 },
          { step: 26, midi: 34, length: 4 },
        ],
      },
    ],
  },
  cloudtrap: {
    kick: [0, 7, 10],
    snare: [8],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    melody: [
      {
        voice: "pad",
        steps: 64,
        events: [
          { step: 0, midi: 57, length: 15 },
          { step: 0, midi: 60, length: 15 },
          { step: 0, midi: 64, length: 15 },
          { step: 16, midi: 53, length: 15 },
          { step: 16, midi: 57, length: 15 },
          { step: 16, midi: 60, length: 15 },
          { step: 32, midi: 50, length: 15 },
          { step: 32, midi: 53, length: 15 },
          { step: 32, midi: 57, length: 15 },
          { step: 48, midi: 52, length: 15 },
          { step: 48, midi: 55, length: 15 },
          { step: 48, midi: 59, length: 15 },
        ],
      },
      {
        voice: "synth",
        steps: 64,
        events: [
          { step: 4, midi: 76, length: 2 },
          { step: 20, midi: 79, length: 2 },
          { step: 36, midi: 81, length: 2 },
          { step: 52, midi: 71, length: 2 },
        ],
      },
    ],
  },
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
    const audio = labContext();
    if (!audio) return cancel;
    const stepsPerBar = beatsPerBar * 4;
    const stepInterval = beatInterval / 4;
    const countInSteps = countInBars * stepsPerBar;
    const drums = LAB_BEAT_PATTERNS[pattern] ?? LAB_BEAT_PATTERNS.boombap;
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
        if (drums.kick.includes(slot)) schedule(kick(audio, when));
        if (drums.snare.includes(slot)) {
          schedule(noiseHit(audio, when, "bandpass", 1900, 0.32, 0.12));
          schedule(playTone(audio, when, 185, "triangle", 0.12, 0.07));
        }
        if (drums.hat.includes(slot))
          schedule(noiseHit(audio, when, "highpass", 7600, 0.1, 0.035));
        for (const layer of drums.melody ?? []) {
          const melodyStep = (step - countInSteps) % layer.steps;
          for (const event of layer.events) {
            if (event.step !== melodyStep) continue;
            for (const node of voiceNote(
              audio,
              when,
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
