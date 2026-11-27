/**
 * Voice accounting: at most `cap` one-shots sound at once. When a new voice
 * would exceed the cap, the quietest voice goes first (the oldest among
 * equals), faded over 15 ms rather than cut. Pure bookkeeping; the engine
 * supplies `kill`.
 */
export const VOICE_CAP = 24;
export const STEAL_FADE = 0.015;

export type VoiceRecord = {
  id: number;
  start: number;
  end: number;
  level: number;
  /** Fade out from `at` over STEAL_FADE and stop the sources. */
  kill: (at: number) => void;
};

export class VoicePool {
  private voices: VoiceRecord[] = [];
  private next = 1;
  stolen = 0;
  constructor(readonly cap = VOICE_CAP) {}

  /** Voices still sounding at `now`. */
  active(now: number): readonly VoiceRecord[] {
    this.voices = this.voices.filter((v) => v.end > now);
    return this.voices;
  }

  /** Picks the voice to steal: lowest level, then earliest start. */
  static victim(voices: readonly VoiceRecord[]): VoiceRecord | undefined {
    let best: VoiceRecord | undefined;
    for (const v of voices)
      if (!best || v.level < best.level - 1e-9 || (Math.abs(v.level - best.level) <= 1e-9 && v.start < best.start))
        best = v;
    return best;
  }

  /** Registers a voice, stealing first if the pool is full. */
  admit(now: number, voice: Omit<VoiceRecord, "id">): VoiceRecord {
    this.active(now);
    while (this.voices.length >= this.cap) {
      const victim = VoicePool.victim(this.voices)!;
      victim.kill(now);
      this.stolen++;
      this.voices = this.voices.filter((v) => v !== victim);
    }
    const record = { ...voice, id: this.next++ };
    this.voices.push(record);
    return record;
  }

  /** Ends a voice early (loops stopped by their owner). */
  release(id: number) {
    this.voices = this.voices.filter((v) => v.id !== id);
  }

  clear(now: number) {
    for (const v of this.voices) v.kill(now);
    this.voices = [];
  }
}
