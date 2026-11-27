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
  { name: "Sprout", thinkEvery: 16, reaction: [30, 60], minGap: 50, mistake: 0.3, jitter: 2.0, counters: 0, spellValue: -1, pushAt: 6, leakTolerance: 120, punish: false, saveForDouble: false, bait: false, centrePull: false, respectsKeep: false, defendAt: 1.2, openAt: 6 },
  { name: "Villager", thinkEvery: 10, reaction: [16, 36], minGap: 30, mistake: 0.14, jitter: 1.2, counters: 1, spellValue: 0, pushAt: 8, leakTolerance: 60, punish: false, saveForDouble: false, bait: false, centrePull: false, respectsKeep: true, defendAt: 0.5, openAt: 10 },
  { name: "Captain", thinkEvery: 6, reaction: [8, 20], minGap: 16, mistake: 0.05, jitter: 0.6, counters: 2, spellValue: 1.0, pushAt: 9, leakTolerance: 20, punish: true, saveForDouble: true, bait: false, centrePull: true, respectsKeep: true, defendAt: 0.5, openAt: 10 },
  { name: "Maxed", thinkEvery: 4, reaction: [5, 12], minGap: 10, mistake: 0.02, jitter: 0.3, counters: 2, spellValue: 0.8, pushAt: 9, leakTolerance: 8, punish: true, saveForDouble: true, bait: true, centrePull: true, respectsKeep: true, defendAt: 0.5, openAt: 10 },
];
