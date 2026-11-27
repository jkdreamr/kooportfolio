export type Save = {
  version: 1;
  revision: number;
  position: [number, number];
  world: WorldId;
  color: string;
  hat: boolean;
  memories: string[];
  /** Hub camera the visitor last chose. Optional: older saves have none,
   * and an unknown value is dropped rather than rejecting the save. */
  view?: "diorama" | "explore";
  /** Personal bests per mini-game measure (see `recordBest`). Optional:
   * older saves have none; bad entries are dropped, never the save. */
  bests?: Record<string, number>;
};

/** Higher is better (points, streaks) or lower is better (times, throws). */
export type BestRule = "max" | "min";
export type BestResult = { bests: Record<string, number>; improved: boolean; previous?: number };
const BEST_KEY = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+){1,3}$/;
export const isBestKey = (key: string) => BEST_KEY.test(key) && key.length <= 64;

/**
 * Records `value` under `key` if it beats the stored best. Pure: returns a
 * new map (the same one when nothing changed). A first value is a best.
 */
export function recordBest(
  bests: Readonly<Record<string, number>> | undefined,
  key: string,
  value: number,
  rule: BestRule = "max",
): BestResult {
  const current = bests ?? {};
  const previous = current[key];
  if (!isBestKey(key) || !Number.isFinite(value) || value < 0 || value > 1e9)
    return { bests: { ...current }, improved: false, previous };
  const improved = previous === undefined || (rule === "max" ? value > previous : value < previous);
  return { bests: improved ? { ...current, [key]: value } : { ...current }, improved, previous };
}

/** Adds one to a counter best (matches won, wins at a level). */
export function countBest(bests: Readonly<Record<string, number>> | undefined, key: string): BestResult {
  const previous = bests?.[key] ?? 0;
  return recordBest(bests, key, previous + 1, "max");
}

/** Keeps only well-formed entries (string key, finite non-negative number). */
export function cleanBests(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>))
    if (isBestKey(k) && typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e9) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}
import { WORLD_BOUNDS } from "./world-bounds";
import { onStanfordLand, STANFORD_SHORE_CLEARANCE } from "./stanford-ground";
import { isWorld, type WorldId } from "./worlds";

export const SAVE_KEY = "joshua-exe-save-v1";
export function writeGuestSave(
  storage: Pick<Storage, "getItem" | "setItem">,
  save: Save,
  expected: string | null,
): string | null {
  if (storage.getItem(SAVE_KEY) !== expected) return null;
  const raw = JSON.stringify(save);
  storage.setItem(SAVE_KEY, raw);
  return raw;
}
export const freshSave = (): Save => ({
  version: 1,
  revision: 0,
  position: [0, 5],
  world: "home",
  color: "#6f8670",
  hat: true,
  memories: [],
});
const finiteRange = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
export function parseSave(raw: string | null): Save {
  if (!raw) return freshSave();
  const s = JSON.parse(raw) as Save;
  // Version-one saves predate the three regions; all other progress survives.
  if (s.world === undefined) s.world = "home";
  if (
    s.version !== 1 ||
    !isWorld(s.world) ||
    !finiteRange(s.revision, 0, 1e15) ||
    !Array.isArray(s.position) ||
    s.position.length !== 2 ||
    !finiteRange(s.position[0], WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX) ||
    // Accept the old northern apron long enough to migrate its position below.
    !finiteRange(s.position[1], -76, WORLD_BOUNDS.maxZ) ||
    typeof s.color !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(s.color) ||
    typeof s.hat !== "boolean" ||
    !Array.isArray(s.memories) ||
    !s.memories.every((x) => typeof x === "string")
  )
    throw new Error("Unrecognized save");
  if (
    s.position[1] < WORLD_BOUNDS.minZ ||
    (s.world === "stanford" &&
      !onStanfordLand(...s.position, STANFORD_SHORE_CLEARANCE))
  )
    s.position = [0, 5];
  if (s.view !== undefined && s.view !== "diorama" && s.view !== "explore")
    delete (s as Record<string, unknown>).view;
  if (s.bests !== undefined) {
    const bests = cleanBests(s.bests);
    if (bests) s.bests = bests;
    else delete (s as Record<string, unknown>).bests;
  }
  // Coins, levels, upgrades and best marks from retired saves are dropped.
  delete (s as Record<string, unknown>).coins;
  delete (s as Record<string, unknown>).xp;
  delete (s as Record<string, unknown>).upgrades;
  delete (s as Record<string, unknown>).collectedAt;
  delete (s as Record<string, unknown>).rewards;
  delete (s as Record<string, unknown>).bestRace;
  delete (s as Record<string, unknown>).bestBasket;
  return s;
}
