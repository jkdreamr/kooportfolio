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
  /** Daily Three progress (PLAN_GAMES §3.4). Optional; a bad shape is
   * dropped, never the save. */
  daily?: DailyRecord;
  /** Cosmetic choices from the Passport's Kit page, slot → option
   * ("basketball.ball" → "sunset"). Optional; bad entries are dropped. */
  kit?: Record<string, string>;
};

/** Daily Three: `day` is the UTC day number of `done`; `last` the last day
 * all three were finished; `streak` consecutive such days; `best` the
 * longest streak. */
export type DailyRecord = { day: number; done: string[]; streak: number; best: number; last: number };

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
/* ------------------------------------------------------------ memories */

const MEMORY = /^[a-z0-9][a-z0-9:._-]{0,95}$/;
/** A memory flag is short lowercase text ("stamp:home.cat", "coach:rowing"). */
export const isMemoryId = (id: string) => MEMORY.test(id);

/** True when the save holds memory flag `id`. */
export const hasMemory = (save: Pick<Save, "memories">, id: string) => save.memories.includes(id);

/** Adds memory flag `id`. Pure: returns the same save when it is already
 * there or `id` is not a valid flag, else a new save. */
export function addMemory<S extends Pick<Save, "memories">>(save: S, id: string): S {
  if (!isMemoryId(id) || save.memories.includes(id)) return save;
  return { ...save, memories: [...save.memories, id] };
}

/* --------------------------------------------------------- daily and kit */

const DAY_MAX = 1e6;
const isCount = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const TASK = /^[a-z0-9][a-z0-9:._-]{0,63}$/;

/** A well-formed Daily Three record, or undefined (the field is dropped). */
export function cleanDaily(raw: unknown): DailyRecord | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  if (
    !isCount(d.day, DAY_MAX) ||
    !isCount(d.last, DAY_MAX) ||
    !isCount(d.streak, 1e5) ||
    !isCount(d.best, 1e5) ||
    !Array.isArray(d.done) ||
    d.done.length > 8 ||
    !d.done.every((t) => typeof t === "string" && TASK.test(t))
  )
    return undefined;
  return {
    day: d.day,
    done: [...new Set(d.done as string[])],
    streak: d.streak,
    best: Math.max(d.best, d.streak),
    last: d.last,
  };
}

export type DailyResult = { daily: DailyRecord; changed: boolean; completed: boolean };
/**
 * Marks `task` done on UTC day `day`. Pure. A new day starts an empty list;
 * a day earlier than the stored one (the device clock went back) is shown as
 * today without touching the streak. When `setSize` tasks are done the day is
 * complete: `streak` grows if `last` was the day before, else restarts at 1,
 * and `best` keeps the longest. Nothing is ever revoked.
 */
export function recordDaily(
  daily: Readonly<DailyRecord> | undefined,
  day: number,
  task: string,
  setSize = 3,
): DailyResult {
  const base: DailyRecord = daily
    ? { ...daily, done: [...daily.done] }
    : { day, done: [], streak: 0, best: 0, last: 0 };
  if (!isCount(day, DAY_MAX) || !TASK.test(task)) return { daily: base, changed: false, completed: false };
  const done = base.day === day ? base.done : [];
  if (done.includes(task)) return { daily: base, changed: false, completed: false };
  const next: DailyRecord = { ...base, day, done: [...done, task] };
  const completed = next.done.length === setSize;
  if (completed && day > base.last) {
    next.streak = base.last === day - 1 && base.last > 0 ? base.streak + 1 : 1;
    next.best = Math.max(base.best, next.streak);
    next.last = day;
  }
  return { daily: next, changed: true, completed };
}

const KIT_VALUE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Keeps only well-formed kit choices (best-key style slot, short option). */
export function cleanKit(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>))
    if (n < 64 && isBestKey(k) && typeof v === "string" && KIT_VALUE.test(v)) {
      out[k] = v;
      n++;
    }
  return Object.keys(out).length ? out : undefined;
}
export const isKitChoice = (slot: string, option: string) => isBestKey(slot) && KIT_VALUE.test(option);

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
  if (s.daily !== undefined) {
    const daily = cleanDaily(s.daily);
    if (daily) s.daily = daily;
    else delete (s as Record<string, unknown>).daily;
  }
  if (s.kit !== undefined) {
    const kit = cleanKit(s.kit);
    if (kit) s.kit = kit;
    else delete (s as Record<string, unknown>).kit;
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
