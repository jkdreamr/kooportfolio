import {
  FIELD_GOAL,
  goalCrossingTime,
  kickPosition,
  judgeKick,
  type Kick,
  type KickResult,
} from "./fieldGoal";

const AIM_LIMIT = 0.24;
const MIN_POWER = 0.15;
const BEST_KEY = "stadium-field-goals-best";

export const STADIUM_KICKS = [
  { x: 0, z: 9.2, wind: 0 },
  { x: -1.8, z: 10.7, wind: 0.6 },
  { x: 1.9, z: 12.2, wind: -1 },
  { x: -2.5, z: 13.2, wind: -1.2 },
  { x: 2.5, z: FIELD_GOAL.startZ, wind: 1.45 },
] as const satisfies NonNullable<Kick["spot"]>[];

export const STADIUM_TARGET = 12;

export function stadiumTiming(time: number, attempt: number, aiming: boolean) {
  const sweep = time * ((aiming ? 0.58 : 0.63) + attempt * 0.095);
  const cycle = sweep % 2;
  return cycle <= 1 ? cycle : 2 - cycle;
}

export function stadiumKick(
  spot: NonNullable<Kick["spot"]>,
  powerTiming: number,
  aimTiming: number,
): Kick {
  return {
    spot,
    power: MIN_POWER + (1 - MIN_POWER) * powerTiming,
    angle: (2 * aimTiming - 1) * AIM_LIMIT,
  };
}

export function stadiumPowerTarget(spot: NonNullable<Kick["spot"]>) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 10; i++) {
    const middle = (low + high) / 2;
    if (
      judgeKick(stadiumKick({ ...spot, x: 0, wind: 0 }, middle, 0.5)) ===
      "Short"
    )
      low = middle;
    else high = middle;
  }
  return high + 0.07;
}

export function stadiumAimTarget(
  spot: NonNullable<Kick["spot"]>,
  powerTiming: number,
  goalX: number,
) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 12; i++) {
    const middle = (low + high) / 2;
    const kick = stadiumKick(spot, powerTiming, middle);
    if (kickPosition(kick, goalCrossingTime(kick))[0] < goalX) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export type StadiumScore = { points: number; streak: number };

export function scoreStadiumKick(
  score: StadiumScore,
  result: KickResult,
): StadiumScore {
  if (result !== "Good") return { points: score.points, streak: 0 };
  return {
    points: score.points + 3 + score.streak,
    streak: score.streak + 1,
  };
}

export function loadStadiumBest() {
  try {
    const best = Number(localStorage.getItem(BEST_KEY));
    if (Number.isSafeInteger(best) && best > 0) return best;
  } catch {
    return 0;
  }
  return 0;
}

export function saveStadiumBest(points: number) {
  try {
    if (points > loadStadiumBest())
      localStorage.setItem(BEST_KEY, String(points));
  } catch {
    // The current round is still playable with storage disabled.
  }
}
