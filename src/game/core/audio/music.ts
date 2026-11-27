/**
 * Background music plumbing. There is no music yet: the owner is a musician,
 * and generated music was set aside. This module is the path real tracks will
 * take: one looping track per world on the music bus (own slider, ducking,
 * muffled in rooms, silent in mini-games and the cinema: see live.ts),
 * equal-power crossfades between worlds. With MUSIC_ENABLED false or no
 * tracks listed, nothing is fetched and no node is made.
 */
import type { WorldId } from "../worlds";

export const MUSIC_ENABLED = false;
/**
 * Mastered tracks sit around -14 dBFS RMS; this trim puts one at about
 * -28 dBFS RMS at the output with the slider at its default (measured with a
 * stand-in, tests/audioRender.test.ts), under the ambience and effects.
 */
export const TRACK_GAIN = 0.08;
export const CROSSFADE = 4;

export type Track = { url: string; gain?: number };
/** One entry per world when there are tracks to ship. */
export const TRACKS: Partial<Record<WorldId, Track>> = {};

/** Equal-power crossfade weights at progress x ∈ [0, 1]. */
export function equalPower(x: number): [fadeOut: number, fadeIn: number] {
  const p = Math.min(1, Math.max(0, x)) * (Math.PI / 2);
  return [Math.cos(p), Math.sin(p)];
}

type Host = { ctx: AudioContext | null; connect: (bus: "music", node: AudioNode) => () => void };

export class MusicPlayer {
  private current?: { world: WorldId; source: AudioBufferSourceNode; gain: GainNode; off: () => void };
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  constructor(
    private host: Host,
    private tracks: Partial<Record<WorldId, Track>> = TRACKS,
    private enabled = MUSIC_ENABLED,
  ) {}

  private load(ctx: AudioContext, url: string) {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  /** Crossfades to the world's track (no-op without one). */
  async setWorld(world: WorldId) {
    const track = this.tracks[world];
    const ctx = this.host.ctx;
    if (!this.enabled || !ctx || this.current?.world === world) return;
    if (!track) {
      this.stop();
      return;
    }
    const buffer = await this.load(ctx, track.url);
    if (!buffer || this.host.ctx !== ctx) return;
    const source = ctx.createBufferSource(),
      gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    const level = TRACK_GAIN * (track.gain ?? 1);
    const t = ctx.currentTime;
    // Equal-power curves sampled into the gain params.
    const steps = 16;
    const rise = new Float32Array(steps + 1),
      fall = new Float32Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      const [o, n] = equalPower(i / steps);
      rise[i] = n * level;
      fall[i] = o;
    }
    gain.gain.setValueAtTime(0, t);
    gain.gain.setValueCurveAtTime(rise, t, CROSSFADE);
    source.connect(gain);
    const off = this.host.connect("music", gain);
    source.start(t);
    const previous = this.current;
    this.current = { world, source, gain, off };
    if (previous) {
      const g = previous.gain.gain;
      const from = g.value || level;
      g.cancelScheduledValues(t);
      g.setValueCurveAtTime(fall.map((v) => v * from), t, CROSSFADE);
      previous.source.stop(t + CROSSFADE + 0.05);
      previous.source.onended = () => previous.off();
    }
  }

  stop() {
    const c = this.current;
    this.current = undefined;
    if (!c) return;
    const ctx = this.host.ctx;
    const t = ctx?.currentTime ?? 0;
    c.gain.gain.setTargetAtTime(0, t, 0.3);
    c.source.stop(t + 1.5);
    c.source.onended = () => c.off();
  }
}
