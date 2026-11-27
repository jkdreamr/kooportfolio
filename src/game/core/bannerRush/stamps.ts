/**
 * Stamp hook (§7.5, owner decision): Banner Rush awards stamps through this
 * one wrapper. WS-J's `earnStamp(id)` in core/store.ts replaces the body at
 * merge; until then it only records the ids for QA.
 */
export type StampId =
  | "banner-rush.first-match"
  | "banner-rush.first-win"
  | "banner-rush.keep"
  | "banner-rush.daily"
  | "banner-rush.palace-court"
  | "banner-rush.stanford-quad"
  | "banner-rush.maxed";

export const awardedStamps: StampId[] = [];
export function awardStamp(id: StampId): void {
  if (!awardedStamps.includes(id)) awardedStamps.push(id);
}
