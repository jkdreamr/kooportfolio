import {
  FIELD_GOAL,
  goalCrossingTime,
  kickPosition,
  judgeKick,
  type Kick,
} from "./fieldGoal";

const AIM_LIMIT = 0.24;
const MIN_POWER = 0.15;

export const STADIUM_KICKS = [
  { x: 0, z: 9.2, wind: 0 },
  { x: -1.8, z: 10.7, wind: 0.6 },
  { x: 1.9, z: 12.2, wind: -1 },
  { x: -2.5, z: 13.2, wind: -1.2 },
  { x: 2.5, z: FIELD_GOAL.startZ, wind: 1.45 },
] as const satisfies NonNullable<Kick["spot"]>[];


/** The rushing defender each attempt: start gap before the kick spot and pace. */
export function stadiumRush(attempt: number) {
  return { distance: 9.5 - attempt * 0.5, speed: 2.4 + attempt * 0.35 };
}

/** Mid-flight steering: lateral acceleration, damping and velocity cap. */
export const STADIUM_STEER = { accel: 7, damp: 2.4, max: 3.2 } as const;

export function stadiumTiming(
  time: number,
  attempt: number,
  aiming: boolean,
  start = 0,
) {
  const sweep = start + time * ((aiming ? 0.58 : 0.63) + attempt * 0.095);
  const cycle = sweep % 2;
  return cycle <= 1 ? cycle : 2 - cycle;
}

export function stadiumTimingStart(
  attempt: number,
  window: readonly [number, number],
) {
  return attempt === 0 ? window[0] + (window[1] - window[0]) * 0.15 : 0;
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

export function stadiumAimWindow(
  spot: NonNullable<Kick["spot"]>,
  power: number,
) {
  return [
    stadiumAimTarget(spot, power, -2.1),
    stadiumAimTarget(spot, power, 2.1),
  ] as const;
}

