/**
 * "Kick for the Win" (PLAN_GAMES §2.4): the distance ladder, the two bars,
 * the two clocks, over-swing and scoring. Pure; the scene and the tuning
 * bots drive the same functions.
 *
 * - Ladder: 25, 30, 35, 39, 43, 46, 49, 52, 55, 58, 60, then +1 yd. A miss
 *   repeats the distance; three misses end the drive.
 * - Power bar: a ping-pong sweep 0 → 1 in POWER_SWEEP_S and back, the same
 *   on every rung, starting at 0 on the snap. Each distance has a needed
 *   power p*; the green zone is p* … p* + powerZone(yards), which narrows
 *   from 0.12 at 25 yd to 0.04 at 55 yd (the tuning bots set this: with a
 *   fixed 0.12 zone the bar's turn at the top made 65-yarders easy). Above
 *   it is over-swing.
 * - Aim bar (and the arrow on the turf): ±AIM_LIMIT rad, sweeping faster on
 *   later rungs, starting from a seeded edge when power locks.
 * - Snap clock (snap → power lock) and swing window (power lock → aim lock),
 *   from rung 3; a lock after either runs out is blocked.
 */
import { attemptMetres, attemptYards, planeCrossing, simulateKick, type Kick, type KickFlight, type KickSpot } from "./fieldGoal";

export const LADDER = [25, 30, 35, 39, 43, 46, 49, 52, 55, 58, 60] as const;
export const MISSES_ALLOWED = 3;
export const DAILY_DISTANCES = [33, 38, 42, 47, 51, 54] as const;
export const HASHES = [-2.82, 0, 2.82] as const;
export const AIM_LIMIT = 0.24;
export const POWER_SWEEP_S = 1;
export const POWER_ZONE = 0.12;
/** The green zone narrows with distance: POWER_ZONE at 25 yd, ZONE_MIN by ZONE_MIN_AT yd. */
export const ZONE_MIN = 0.04;
export const ZONE_MIN_AT = 55;
export const powerZone = (yards: number) =>
  Math.max(ZONE_MIN, POWER_ZONE - ((POWER_ZONE - ZONE_MIN) * Math.max(0, yards - 25)) / (ZONE_MIN_AT - 25));
/** Margin above the bare minimum that clears the bar, so p* is a real make. */
export const POWER_MARGIN = 0.005;
export const WIND_MAX = 1.6;
export const OVERSWING_ERROR = 6;
export const OVERSWING_HOOK = 0.03;
export const GAME_WINNER_EVERY = 5;
export const STREAK_BONUS = 5;

/** Yards of ladder rung `rung` (0-based). */
export const ladderYards = (rung: number) => (rung < LADDER.length ? LADDER[rung] : 60 + (rung - LADDER.length + 1));
/** Rung number (1-based) used by the clocks and sweep. */
const n = (rung: number) => rung + 1;
/** Snap clock (s) from the snap to the power lock; Infinity on rungs 1–2. */
export const snapClock = (rung: number) => (n(rung) <= 2 ? Infinity : Math.max(1.25, 1.6 - 0.05 * (n(rung) - 1)));
/** Swing window (s) from the power lock to the aim lock; Infinity on rungs 1–2. */
export const swingWindow = (rung: number) => (n(rung) <= 2 ? Infinity : Math.max(1.4, 2.0 - 0.05 * (n(rung) - 1)));
/** Aim sweep, bar widths per second. */
export const aimSweep = (rung: number) => Math.min(1.05, 0.55 + 0.035 * (n(rung) - 1));
export const isGameWinner = (rung: number) => n(rung) % GAME_WINNER_EVERY === 0;

/** A triangle wave 0 → 1 → 0 with period 2 (in bar widths). */
const tri = (u: number) => {
  const c = ((u % 2) + 2) % 2;
  return c <= 1 ? c : 2 - c;
};
/** Power bar value `t` s after the snap. */
export const powerAt = (t: number) => tri(Math.max(0, t) / POWER_SWEEP_S);
/** Aim bar value `t` s after the power lock, from `start` (0 or 1). */
export const aimAt = (t: number, rung: number, start: 0 | 1) => tri(start + Math.max(0, t) * aimSweep(rung));
/** Aim bar value → launch angle. */
export const aimAngle = (aim: number) => (2 * aim - 1) * AIM_LIMIT;

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
/** The seeded conditions of one attempt: hash, wind and the aim bar's start edge. */
export type Attempt = { rung: number; yards: number; spot: KickSpot; aimStart: 0 | 1; gameWinner: boolean };
export function attemptFor(seed: number, rung: number, kickNo: number, yards = ladderYards(rung)): Attempt {
  const r = mulberry32((seed ^ Math.imul(kickNo + 1, 0x9e3779b1)) >>> 0);
  const hash = rung === 0 ? 0 : HASHES[Math.floor(r() * 3)];
  const wind = n(rung) <= 3 ? 0 : Math.round((r() * 2 - 1) * WIND_MAX * 100) / 100;
  return { rung, yards, spot: { x: hash, d: attemptMetres(yards), wind }, aimStart: r() < 0.5 ? 0 : 1, gameWinner: isGameWinner(rung) };
}
/** Wind as the HUD says it ("8 mph"). */
export const windMph = (wind: number) => Math.round(Math.abs(wind) * 6);

const centre = (spot: KickSpot): KickSpot => ({ x: 0, d: spot.d, wind: 0 });
/** Needed power p* for a distance: the least power that clears the bar
 * from the middle with no wind, plus POWER_MARGIN. May exceed 1 (out of range). */
export function neededPower(spot: KickSpot): number {
  let lo = 0,
    hi = 1.2;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const c = planeCrossing({ angle: 0, power: Math.min(1, mid), spot: centre(spot) });
    if (mid > 1 || (c && c[1] > 3.05 + 0.13 + 0.085)) hi = mid;
    else lo = mid;
  }
  return hi + POWER_MARGIN;
}
/** The aim that sends the ball through the middle of the posts at power `p`. */
export function idealAngle(spot: KickSpot, power: number): number {
  let lo = -AIM_LIMIT * 1.5,
    hi = AIM_LIMIT * 1.5;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const c = planeCrossing({ angle: mid, power, spot });
    if (c && c[0] < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** Aim bar value for an angle. */
export const aimForAngle = (angle: number) => Math.max(0, Math.min(1, (angle / AIM_LIMIT + 1) / 2));

/**
 * The kick that a power lock `p` and aim lock `aim` make. Over-swing (above
 * the green zone) multiplies the aim error and hooks the ball toward the
 * plant side (left for this right-footed kicker).
 */
export function buildKick(spot: KickSpot, p: number, aim: number): Kick & { overswing: number } {
  const pStar = neededPower(spot);
  const excess = Math.max(0, p - pStar - powerZone(attemptYards(spot.d)));
  let angle = aimAngle(aim);
  if (excess > 0) {
    const ideal = idealAngle(spot, p);
    angle = ideal + (angle - ideal) * (1 + OVERSWING_ERROR * excess) - OVERSWING_HOOK * excess * 10;
  }
  return { spot, power: p, angle, overswing: excess };
}

/** Score for a make: its yards, ×2 on a game-winner, +5 for each make after the second in a row. */
export function makeScore(yards: number, gameWinner: boolean, streak: number): number {
  return yards * (gameWinner ? 2 : 1) + (streak > 2 ? STREAK_BONUS : 0);
}

/* ------------------------------------------------------------ the drive */
export type DriveMode = "drive" | "daily";
export type Drive = {
  mode: DriveMode;
  seed: number;
  rung: number;
  kicks: number;
  misses: number;
  made: number;
  streak: number;
  bestStreak: number;
  score: number;
  longest: number;
  over: boolean;
  history: { yards: number; result: string; points: number }[];
};
export function newDrive(mode: DriveMode, seed: number): Drive {
  return { mode, seed, rung: 0, kicks: 0, misses: 0, made: 0, streak: 0, bestStreak: 0, score: 0, longest: 0, over: false, history: [] };
}
/** The attempt the drive is on. */
export function currentAttempt(d: Drive): Attempt {
  if (d.mode === "daily") {
    const yards = DAILY_DISTANCES[Math.min(d.kicks, DAILY_DISTANCES.length - 1)];
    const a = attemptFor(d.seed, Math.max(3, d.kicks + 3), d.kicks, yards);
    return { ...a, rung: d.kicks, gameWinner: d.kicks === DAILY_DISTANCES.length - 1 };
  }
  return attemptFor(d.seed, d.rung, d.kicks);
}
/** Records a kick's result; returns the points it scored. */
export function recordKick(d: Drive, a: Attempt, result: string): number {
  d.kicks++;
  let points = 0;
  if (result === "Good") {
    d.made++;
    d.streak++;
    d.bestStreak = Math.max(d.bestStreak, d.streak);
    points = makeScore(a.yards, a.gameWinner, d.streak);
    d.score += points;
    d.longest = Math.max(d.longest, a.yards);
    d.rung++;
  } else {
    d.misses++;
    d.streak = 0;
  }
  d.history.push({ yards: a.yards, result, points });
  if (d.mode === "daily") d.over = d.kicks >= DAILY_DISTANCES.length;
  else d.over = d.misses >= MISSES_ALLOWED;
  return points;
}

/**
 * Resolves a whole attempt from lock times: `powerT` s after the snap and
 * `aimT` s after the power lock (null = never locked). A lock after its
 * clock has run out is blocked.
 */
export function resolveAttempt(a: Attempt, powerT: number | null, aimT: number | null): { result: string; flight: KickFlight | null; power: number; aim: number; overswing: number } {
  if (powerT === null || powerT > snapClock(a.rung) || aimT === null || aimT > swingWindow(a.rung))
    return { result: "Blocked", flight: null, power: powerT === null ? 0 : powerAt(powerT), aim: 0.5, overswing: 0 };
  const power = powerAt(powerT),
    aim = aimAt(aimT, a.rung, a.aimStart);
  const kick = buildKick(a.spot, power, aim);
  const flight = simulateKick(kick);
  return { result: flight.result, flight, power, aim, overswing: kick.overswing };
}

/* --------------------------------------------------------- tuning bots */
/** The earliest power-lock time for the middle of the green zone, and the
 * earliest aim-lock time for the ideal aim: what a perfect player does. */
export function perfectTimes(a: Attempt): { powerT: number; aimT: number } {
  const pStar = neededPower(a.spot);
  const p = Math.min(1, pStar + powerZone(a.yards) / 2);
  const powerT = p * POWER_SWEEP_S;
  const target = aimForAngle(idealAngle(a.spot, p));
  const sweep = aimSweep(a.rung);
  const aimT = a.aimStart === 0 ? target / sweep : (1 - target) / sweep;
  return { powerT, aimT };
}
