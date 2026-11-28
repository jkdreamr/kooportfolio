/**
 * Stamps [R2-2]: three ids owned by the village Passport. Banner Rush awards
 * them through this one wrapper; at merge the lead points it at WS-J's
 * `earnStamp(id): boolean` (true = newly earned). Until then it returns false
 * (no chip is shown) and records the ids for QA.
 */
export type StampId = "home.banner" | "home.keep" | "home.ground";

export const awardedStamps: StampId[] = [];
let earn: ((id: StampId) => boolean) | null = null;
/** The engine wires WS-J's earnStamp here once it exists. */
export function setStampSink(fn: ((id: StampId) => boolean) | null) {
  earn = fn;
}
export function awardStamp(id: StampId): boolean {
  if (!awardedStamps.includes(id)) awardedStamps.push(id);
  return earn ? earn(id) : false;
}
