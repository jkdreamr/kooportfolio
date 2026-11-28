/**
 * Crowd LOD tiers (0 primitive, 1 mid sculpt, 2 hero sculpt), handed out
 * nearest first and counted as they go, so the caps hold exactly. Villagers
 * already in a tier sort as if TIER_BIAS metres closer per tier level: two
 * walkers trading places at a cap no longer swap bakes every frame.
 */
export type TierSlots = {
  /** In: last frame's tiers; out: this frame's. */
  tier: Uint8Array;
  /** Ground distance to the camera, per villager. */
  dist: Float32Array;
  /** Scratch: every villager index once (reordered in place). */
  order: number[];
};
export const TIER_BIAS = 1.5;

let sortDist: Float32Array, sortTier: Uint8Array;
const byBiasedDistance = (a: number, b: number) =>
  sortDist[a] - TIER_BIAS * sortTier[a] - (sortDist[b] - TIER_BIAS * sortTier[b]);

export function assignTiers(
  slots: TierSlots,
  rule: {
    heroMax: number;
    midMax: number;
    /** Within the hero radius (with its own hysteresis when `was`). */
    heroIn: (i: number, was: boolean) => boolean;
    midIn: (i: number, was: boolean) => boolean;
  },
) {
  const { tier, dist, order } = slots;
  sortDist = dist;
  sortTier = tier;
  order.sort(byBiasedDistance);
  let heroes = 0,
    mids = 0;
  for (let k = 0; k < order.length; k++) {
    const i = order[k],
      was = tier[i];
    let next = 0;
    if (heroes < rule.heroMax && rule.heroIn(i, was === 2)) {
      next = 2;
      heroes++;
    } else if (mids < rule.midMax && rule.midIn(i, was >= 1)) {
      next = 1;
      mids++;
    }
    tier[i] = next;
  }
}
