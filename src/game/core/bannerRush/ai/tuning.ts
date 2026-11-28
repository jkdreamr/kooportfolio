/** AI tier parameters (§4.4). Ticks are 50 ms. */
export type TierParams = {
  name: string;
  thinkEvery: number;
  reaction: readonly [number, number];
  minGap: number;
  mistake: number;
  jitter: number;
  /** 0 none, 1 tags only, 2 full table. */
  counters: 0 | 1 | 2;
  /** Spells on troops: −1 never, 0 if ≥ 2 troops hit, else the value threshold per cost. */
  spellValue: number;
  pushAt: number;
  leakTolerance: number;
  punish: boolean;
  saveForDouble: boolean;
  bait: boolean;
  centrePull: boolean;
  respectsKeep: boolean;
  /** Net threat above which it defends. */
  defendAt: number;
  /** Opening: Glow it waits for before the first push. */
  openAt: number;
};

export const TIERS: readonly TierParams[] = [
  { name: "Sprout", thinkEvery: 24, reaction: [40, 80], minGap: 110, mistake: 0.3, jitter: 2.0, counters: 0, spellValue: -1, pushAt: 6, leakTolerance: 120, punish: false, saveForDouble: false, bait: false, centrePull: false, respectsKeep: false, defendAt: 3.5, openAt: 6 },
  { name: "Villager", thinkEvery: 14, reaction: [24, 48], minGap: 60, mistake: 0.18, jitter: 1.2, counters: 1, spellValue: 0, pushAt: 8, leakTolerance: 60, punish: false, saveForDouble: false, bait: false, centrePull: false, respectsKeep: true, defendAt: 1.4, openAt: 10 },
  { name: "Captain", thinkEvery: 8, reaction: [12, 26], minGap: 34, mistake: 0.08, jitter: 0.6, counters: 2, spellValue: 1.0, pushAt: 9, leakTolerance: 20, punish: true, saveForDouble: true, bait: false, centrePull: true, respectsKeep: true, defendAt: 0.9, openAt: 10 },
  { name: "Maxed", thinkEvery: 5, reaction: [8, 16], minGap: 24, mistake: 0.03, jitter: 0.3, counters: 2, spellValue: 0.8, pushAt: 9, leakTolerance: 8, punish: true, saveForDouble: true, bait: true, centrePull: true, respectsKeep: true, defendAt: 0.6, openAt: 10 },
];
