/**
 * Daily Three, contract layer (PLAN_GAMES §3.4, J0). The day number and the
 * one hook every game calls when a run ends:
 *
 *   reportRun("basketball", { mode: "rush", score: 74, daily: false });
 *
 * J4 subscribes its task evaluator with `onRun` (and fills in the day's set);
 * until then a report reaches only the QA log. Pure apart from the listener
 * list: nothing here touches the store, so the store may import it.
 */
import { exposeQa } from "../../stage/qa";
import type { GameQaId } from "./gameQa";

const DAY_MS = 86_400_000;
/** UTC day number: floor(Date.UTC(y, m, d) / 86 400 000). Rolls at 00:00 UTC. */
export function dayNumber(date: Date = new Date()): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

/** Who can report a run: every game, plus the world activities the Korea
 * daily pool counts (fishing, ramen, the day's landmark, feeding ducks). */
export type RunGame = GameQaId | "fishing" | "ramen" | "landmark" | "ducks";

export type RunResult = {
  /** The mode played: "rush", "world", "sprint", "regatta", "drive",
   * "normal", "run", "streak", "capture", … (the game's own ids). */
  mode: string;
  /** The run's headline number (points, yards, accuracy %, seconds, reps). */
  score: number;
  /** Played on the day's seed (a Daily variant). */
  daily?: boolean;
  /** Won the match / cleared the level / passed the shift. */
  won?: boolean;
  /** Finishing place (rowing: 1–4). */
  place?: number;
  /** Anything else a daily task may need ("burnt": 0, "goals": 2, "opponent": "captain"). */
  stats?: Readonly<Record<string, number | boolean | string>>;
};

export type RunReport = { game: RunGame; result: RunResult; day: number; at: number };
type Listener = (report: RunReport) => void;

const listeners = new Set<Listener>();
/** QA builds: the last 20 reports, newest last (`window.__qa.runs`). */
const recent: RunReport[] = [];
exposeQa({ runs: recent });

/** Subscribes to every reported run; returns the unsubscribe. */
export function onRun(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Called by a game when a run ends (from the same code that writes its
 * bests and result card). Never throws into the game: a listener's failure
 * is swallowed.
 */
export function reportRun(game: RunGame, result: RunResult, now: Date = new Date()): void {
  const report: RunReport = { game, result, day: dayNumber(now), at: now.getTime() };
  recent.push(report);
  if (recent.length > 20) recent.shift();
  for (const listener of [...listeners]) {
    try {
      listener(report);
    } catch {
      /* The run is over either way. */
    }
  }
}

/* ------------------------------------------------------------ Daily Three */

export type DailyWorld = "home" | "stanford" | "korea";
export const DAILY_WORLDS: readonly DailyWorld[] = ["home", "stanford", "korea"];
export type DailyTask = {
  id: string;
  world: DailyWorld;
  /** What the chip and page say ("Field Goals Daily: score 150"). */
  label: string;
  /** True when this reported run finishes the task on `day`. */
  done: (report: RunReport, day: number) => boolean;
};

const stat = (r: RunReport, key: string) => r.result.stats?.[key];
/** The landmark of the day (Korea), from the four sights. */
export const DAILY_LANDMARKS = ["gwanghwamun", "bukchon", "sejong", "namsan"] as const;

/** Every task is a target one run of an existing mode can be judged on. */
export const DAILY_POOL: Readonly<Record<DailyWorld, readonly DailyTask[]>> = {
  home: [
    { id: "home.kick-daily", world: "home", label: "Field Goals Daily: score 150", done: (r) => r.game === "stadium" && !!r.result.daily && r.result.score >= 150 },
    { id: "home.beat-day", world: "home", label: "Beat Lab: a take on the day's beat", done: (r, d) => r.game === "music" && stat(r, "beat") === d % 8 },
    { id: "home.toss-four", world: "home", label: "Paper Toss: 4 of 6 on the day's level", done: (r, d) => r.game === "paper-toss" && stat(r, "level") === 1 + (d % 5) && r.result.score >= 4 },
    { id: "home.capture", world: "home", label: "Go: win First Capture", done: (r) => r.game === "go" && r.result.mode === "capture" && !!r.result.won },
    { id: "home.kitchen-clean", world: "home", label: "Kitchen: serve 4, nothing burnt", done: (r) => r.game === "kitchen" && r.result.score >= 4 && stat(r, "burnt") === 0 },
    { id: "home.banner-daily", world: "home", label: "Banner Rush: today's challenge", done: (r) => (r.game as string) === "banner-rush" && !!r.result.daily },
  ],
  stanford: [
    { id: "stanford.hot-daily", world: "stanford", label: "Hot Shot Daily: 45 points", done: (r) => r.game === "basketball" && !!r.result.daily && r.result.score >= 45 },
    { id: "stanford.river-daily", world: "stanford", label: "Daily river: top 2", done: (r) => r.game === "rowing" && !!r.result.daily && (r.result.place ?? 9) <= 2 },
    { id: "stanford.shuttle-day", world: "stanford", label: "Badminton: beat the day's opponent", done: (r, d) => r.game === "badminton" && !!r.result.won && stat(r, "opponent") === (d % 2 ? "captain" : "freshman") },
    { id: "stanford.skate-goals", world: "stanford", label: "Skate Daily: 2 of 3 goals", done: (r) => r.game === "skate" && !!r.result.daily && Number(stat(r, "goals") ?? 0) >= 2 },
    { id: "stanford.lights-daily", world: "stanford", label: "Lights: the daily board within par + 4", done: (r) => r.game === "math" && !!r.result.daily && Number(stat(r, "overPar") ?? 99) <= 4 },
  ],
  korea: [
    { id: "korea.fish-two", world: "korea", label: "Catch 2 fish", done: (r) => r.game === "fishing" && r.result.score >= 2 },
    { id: "korea.ramen", world: "korea", label: "Serve ramen to the picnic", done: (r) => r.game === "ramen" },
    { id: "korea.photo", world: "korea", label: "Take a photo strip", done: (r) => r.game === "photo-booth" },
    { id: "korea.landmark", world: "korea", label: "Visit the day's landmark", done: (r, d) => r.game === "landmark" && stat(r, "id") === DAILY_LANDMARKS[d % 4] },
    { id: "korea.ducks", world: "korea", label: "Feed the ducks a persimmon", done: (r) => r.game === "ducks" && stat(r, "food") === "persimmon" },
  ],
};
const ALL_TASKS = new Map(DAILY_WORLDS.flatMap((w) => DAILY_POOL[w].map((t) => [t.id, t] as const)));
export const dailyTask = (id: string) => ALL_TASKS.get(id);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * The day's three tasks, one per world. Each world's pool is split in two
 * halves; even days draw from the first, odd days from the second (seeded
 * with mulberry32(d × 3 + w)). So a world never repeats yesterday's task,
 * and the pick needs no look-back at earlier days at all.
 */
export function dailyThree(day: number): DailyTask[] {
  return DAILY_WORLDS.map((world, w) => {
    const pool = DAILY_POOL[world],
      n = pool.length,
      half = Math.ceil(n / 2);
    const r = mulberry32(day * 3 + w)();
    const odd = ((day % 2) + 2) % 2 === 1;
    const pick = odd ? half + Math.floor(r * (n - half)) : Math.floor(r * half);
    return pool[pick];
  });
}
/** Seconds until the next set (00:00 UTC). */
export function secondsToNextDay(now: Date = new Date()): number {
  return Math.max(0, Math.ceil(((dayNumber(now) + 1) * DAY_MS - now.getTime()) / 1000));
}
