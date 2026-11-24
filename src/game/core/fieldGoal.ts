// Small, deterministic ballistic model. The rendering and score use this same arc.
export const FIELD_GOAL = {
  startZ: 14.2,
  goalZ: -23.7,
  crossbar: 2.9,
  halfWidth: 2.82,
  ballRadius: 0.13,
  postRadius: 0.085,
  gravity: 9.8,
  loft: 0.73,
  attempts: 5,
} as const;

export type Kick = {
  angle: number;
  power: number;
  spot?: { x: number; z: number; wind: number };
};
export type KickResult = "Good" | "Wide left" | "Wide right" | "Short";

function kickSpeed(power: number): number {
  return 16 + Math.max(0, Math.min(1, power)) * 9;
}

export function kickPosition(
  kick: Kick,
  time: number,
): [number, number, number] {
  const speed = kickSpeed(kick.power);
  const horizontal = Math.cos(FIELD_GOAL.loft) * speed;
  const t = Math.max(0, time);
  return [
    (kick.spot?.x ?? 0) +
      Math.sin(kick.angle) * horizontal * t +
      0.5 * (kick.spot?.wind ?? 0) * t * t,
    0.48 +
      Math.sin(FIELD_GOAL.loft) * speed * t -
      0.5 * FIELD_GOAL.gravity * t * t,
    (kick.spot?.z ?? FIELD_GOAL.startZ) - Math.cos(kick.angle) * horizontal * t,
  ];
}

export function goalCrossingTime(kick: Kick): number {
  const speed = kickSpeed(kick.power);
  return (
    ((kick.spot?.z ?? FIELD_GOAL.startZ) - FIELD_GOAL.goalZ) /
    (Math.cos(kick.angle) * Math.cos(FIELD_GOAL.loft) * speed)
  );
}

export function goalClearanceTime(kick: Kick): number {
  const crossing = goalCrossingTime(kick);
  const forwardSpeed =
    ((kick.spot?.z ?? FIELD_GOAL.startZ) - FIELD_GOAL.goalZ) / crossing;
  return (
    crossing + (FIELD_GOAL.ballRadius + FIELD_GOAL.postRadius) / forwardSpeed
  );
}

// Sweep the ball past each post/crossbar, not just its center at the goal plane.
// Squared distance is convex within this narrow plane-overlap interval.
function edgeDistanceSquared(kick: Kick, axis: 0 | 1, edge: number): number {
  const crossing = goalCrossingTime(kick);
  const end = goalClearanceTime(kick);
  let low = 2 * crossing - end;
  let high = end;
  const distance = (time: number) => {
    const p = kickPosition(kick, time);
    return (p[axis] - edge) ** 2 + (p[2] - FIELD_GOAL.goalZ) ** 2;
  };
  for (let i = 0; i < 32; i++) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    if (distance(a) < distance(b)) high = b;
    else low = a;
  }
  return distance((low + high) / 2);
}

export function judgeKick(kick: Kick): KickResult {
  const [x, y] = kickPosition(kick, goalCrossingTime(kick));
  const clearance = FIELD_GOAL.ballRadius + FIELD_GOAL.postRadius;
  if (y - clearance <= FIELD_GOAL.crossbar) return "Short";
  if (x - clearance <= -FIELD_GOAL.halfWidth) return "Wide left";
  if (x + clearance >= FIELD_GOAL.halfWidth) return "Wide right";
  if (edgeDistanceSquared(kick, 1, FIELD_GOAL.crossbar) <= clearance ** 2)
    return "Short";
  if (edgeDistanceSquared(kick, 0, -FIELD_GOAL.halfWidth) <= clearance ** 2)
    return "Wide left";
  if (edgeDistanceSquared(kick, 0, FIELD_GOAL.halfWidth) <= clearance ** 2)
    return "Wide right";
  return "Good";
}

export function kickPower(time: number): number {
  return 0.15 + (0.5 + Math.sin(time * 2.6) * 0.5) * 0.85;
}
