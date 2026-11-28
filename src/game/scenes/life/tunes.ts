/**
 * Room tunes: short original loops for the record players, synthesised note
 * by note on the shared audio context and routed through the effects bus,
 * so they obey mute, the effects level and the master chain. Nothing is
 * sampled or quoted; each tune is a few chords and a line written here.
 */
import { audioContext, connectBus } from "../../core/audio/live";
import { useGame } from "../../core/store";

type Note = [beat: number, midi: number, beats: number, level?: number];
type Tune = { bpm: number; beats: number; wave: OscillatorType; notes: Note[]; bass: Note[] };

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export const TUNES: Record<string, Tune> = {
  /** Mellow keys over a walking root: the studio's turntable. */
  backroom: {
    bpm: 76,
    beats: 16,
    wave: "triangle",
    notes: [
      [0, 64, 1.5], [1.5, 67, 0.5], [2, 71, 1], [3, 69, 1],
      [4, 67, 1.5], [5.5, 64, 0.5], [6, 62, 2],
      [8, 60, 1.5], [9.5, 64, 0.5], [10, 67, 1], [11, 69, 1],
      [12, 71, 1], [13, 67, 1], [14, 64, 2],
    ],
    bass: [[0, 45, 4], [4, 43, 4], [8, 41, 4], [12, 43, 4]],
  },
  /** A slow three-in-a-bar turn for the house's record cabinet. */
  parlour: {
    bpm: 96,
    beats: 12,
    wave: "sine",
    notes: [
      [0, 72, 1], [1, 76, 1], [2, 79, 1],
      [3, 77, 1], [4, 74, 1], [5, 71, 1],
      [6, 72, 1], [7, 69, 1], [8, 65, 1],
      [9, 67, 2], [11, 71, 1],
    ],
    bass: [[0, 48, 3], [3, 43, 3], [6, 41, 3], [9, 43, 3]],
  },
  /** Sparse and unhurried, for reading by. */
  lamplight: {
    bpm: 62,
    beats: 16,
    wave: "sine",
    notes: [
      [0, 69, 2], [2, 72, 1], [3, 76, 3],
      [6, 74, 2], [8, 72, 2], [10, 67, 1], [11, 69, 3],
      [14, 64, 2],
    ],
    bass: [[0, 45, 8], [8, 41, 4], [12, 43, 4]],
  },
};

type Playing = { name: string; out: GainNode; timer: ReturnType<typeof setInterval>; disconnect: () => void };
let playing: Playing | null = null;

export const tunePlaying = () => playing?.name ?? null;

export function stopTune() {
  const p = playing;
  if (!p) return;
  playing = null;
  clearInterval(p.timer);
  const ctx = audioContext();
  try {
    if (ctx) {
      p.out.gain.cancelScheduledValues(ctx.currentTime);
      p.out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    }
  } catch {
    /* Context closed: nothing left to fade. */
  }
  setTimeout(p.disconnect, 500);
}

function voice(ctx: AudioContext, out: AudioNode, wave: OscillatorType, f: number, t: number, dur: number, level: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = f;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * 0.3), t + dur * 0.7);
  gain.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** Starts a tune (stopping any other). Returns false when sound is off or
 * the context does not exist yet; the turntable still spins. */
export function startTune(name: string): boolean {
  stopTune();
  const tune = TUNES[name];
  const ctx = audioContext();
  if (!tune || !ctx || useGame.getState().muted) return false;
  try {
    const out = ctx.createGain();
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 2200;
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.05, ctx.currentTime, 0.2);
    out.connect(warm);
    const off = connectBus("sfx", warm);
    const beat = 60 / tune.bpm;
    const loop = tune.beats * beat;
    let next = ctx.currentTime + 0.08;
    const schedule = () => {
      while (next < ctx.currentTime + 0.6) {
        for (const [b, midi, len, level = 1] of tune.notes) voice(ctx, out, tune.wave, hz(midi), next + b * beat, len * beat * 1.15, 0.5 * level);
        for (const [b, midi, len] of tune.bass) voice(ctx, out, "sine", hz(midi), next + b * beat, len * beat, 0.55);
        next += loop;
      }
    };
    schedule();
    const timer = setInterval(schedule, 250);
    playing = {
      name,
      out,
      timer,
      disconnect: () => {
        try {
          off?.();
          out.disconnect();
          warm.disconnect();
        } catch {
          /* Already gone. */
        }
      },
    };
    return true;
  } catch {
    return false;
  }
}
