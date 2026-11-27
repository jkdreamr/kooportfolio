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
