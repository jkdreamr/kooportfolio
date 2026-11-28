/**
 * Beat Lab drum and melody tables (PLAN_GAMES §2.5), pure data shared by the
 * synth (`scenes/labAudio.ts`) and the flow rules (`core/labFlow.ts`).
 *
 * Each beat has four one-bar drum variants: `A` (the original loop), `B`
 * (A with a hat variation and a ghost kick), `drop` (kick and melody only)
 * and `fill` (B with a snare roll on steps 12–15). A 16-bar take plays
 * A ×4, B ×4, drop ×4, B ×3, fill; "Keep going" loops bars 5–16.
 */
export type LabVoice = "piano" | "guitar" | "synth" | "pad" | "bass";
export type LabDrums = { kick: number[]; snare: number[]; hat: number[] };
export type LabPattern = LabDrums & { melody?: LabMelody[] };

// A melodic loop layered over the drums: `step`/`length` count 16th-note
// slots inside `steps` (16 = one bar), `midi` is the note number.
export type LabMelodyEvent = { step: number; midi: number; length?: number };
export type LabMelody = { voice: LabVoice; steps: number; events: LabMelodyEvent[] };

// 16-step drum patterns per bar. `beat` marks which steps the ball/pads light on.
export const LAB_BEAT_PATTERNS: Record<string, LabPattern> = {
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

export type BeatVariant = "A" | "B" | "drop" | "fill";
/** Which variant bar `bar` (0-based, after the count-in) plays. Bars past 15
 * (Loop mode) repeat bars 4–15. */
export function variantForBar(bar: number): BeatVariant {
  const b = bar < 16 ? bar : 4 + ((bar - 16) % 12);
  if (b < 4) return "A";
  if (b < 8) return "B";
  if (b < 12) return "drop";
  return b === 15 ? "fill" : "B";
}
const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
function variants(p: LabDrums): Record<BeatVariant, LabDrums> {
  const ghost = [3, 14, 11, 5, 13, 9].find((s) => !p.kick.includes(s) && !p.snare.includes(s)) ?? 15;
  // Hat variation: an open sixteenth pair before the last snare.
  const B: LabDrums = { kick: uniq([...p.kick, ghost]), snare: p.snare, hat: uniq([...p.hat, 11, 15]) };
  return {
    A: p,
    B,
    drop: { kick: p.kick, snare: [], hat: [] },
    fill: { kick: B.kick, snare: uniq([...B.snare, 12, 13, 14, 15]), hat: B.hat.filter((s) => s < 12) },
  };
}
const VARIANTS = new Map<string, Record<BeatVariant, LabDrums>>();
/** The drums of a beat's variant. */
export function beatVariant(pattern: string, variant: BeatVariant): LabDrums {
  let v = VARIANTS.get(pattern);
  if (!v) {
    v = variants(LAB_BEAT_PATTERNS[pattern] ?? LAB_BEAT_PATTERNS.boombap);
    VARIANTS.set(pattern, v);
  }
  return v[variant];
}
/** The drums for take bar `bar`. */
export const beatBar = (pattern: string, bar: number) => beatVariant(pattern, variantForBar(bar));

/** Swing, as a fraction of a sixteenth that odd steps are pushed late. */
export const LAB_SWING: Readonly<Record<string, number>> = {
  boombap: 0.12,
  pianobap: 0.1,
  soulbap: 0.16,
  lofi: 0.18,
  house: 0,
  trap: 0,
  darktrap: 0,
  cloudtrap: 0.06,
};
export const beatSwing = (pattern: string) => LAB_SWING[pattern] ?? 0;
/** Offset of 16th step `step` from the straight grid, in steps. */
export const swingOffset = (step: number, swing: number) => (step % 2 === 1 ? swing : 0);
