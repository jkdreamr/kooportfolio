/** AI tier parameters (§4.4). Ticks are 50 ms. Retuned (N=30, pusherBot):
 * Sprout 100 / Villager 53 / Captain 30 / Maxed 7%; randomBot 10% vs Sprout. */
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
  { name: "Sprout", thinkEvery: 40, reaction: [40, 80], minGap: 200, mistake: 0.5, jitter: 3.0, counters: 0, spellValue: -1, pushAt: 4, leakTolerance: 120, punish: false, saveForDouble: false, bait: false, centrePull: false, respectsKeep: false, defendAt: 3.5, openAt: 4 },
  { name: "Villager", thinkEvery: 16, reaction: [28, 54], minGap: 70, mistake: 0.22, jitter: 1.2, counters: 1, spellValue: 0, pushAt: 8, leakTolerance: 60, punish: false, saveForDouble: false, bait: false, centrePull: false, respectsKeep: true, defendAt: 1.7, openAt: 10 },
  { name: "Captain", thinkEvery: 15, reaction: [26, 50], minGap: 58, mistake: 0.21, jitter: 0.6, counters: 2, spellValue: 1.0, pushAt: 9, leakTolerance: 20, punish: true, saveForDouble: true, bait: false, centrePull: true, respectsKeep: true, defendAt: 1.7, openAt: 10 },
  { name: "Maxed", thinkEvery: 12, reaction: [16, 30], minGap: 58, mistake: 0.27, jitter: 0.3, counters: 2, spellValue: 0.8, pushAt: 9, leakTolerance: 20, punish: true, saveForDouble: true, bait: true, centrePull: true, respectsKeep: true, defendAt: 1.2, openAt: 10 },
];
