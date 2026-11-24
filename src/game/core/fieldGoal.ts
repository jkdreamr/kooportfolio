// Small, deterministic ballistic model. The rendering and score use this same arc.
export const FIELD_GOAL = {
  startZ: 6.2,
  goalZ: -9.7,
  crossbar: 2.9,
  halfWidth: 1.65,
  ballRadius: 0.13,
  postRadius: 0.085,
  gravity: 9.8,
  loft: 0.73,
  attempts: 5,
} as const;

export type Kick = { angle: number; power: number };
export type KickResult = "Good" | "Wide left" | "Wide right" | "Short";

export function kickPosition(
  kick: Kick,
  time: number,
): [number, number, number] {
  const speed = 11 + Math.max(0, Math.min(1, kick.power)) * 5.5;
  const horizontal = Math.cos(FIELD_GOAL.loft) * speed;
  const t = Math.max(0, time);
  return [
    Math.sin(kick.angle) * horizontal * t,
    0.48 +
      Math.sin(FIELD_GOAL.loft) * speed * t -
      0.5 * FIELD_GOAL.gravity * t * t,
    FIELD_GOAL.startZ - Math.cos(kick.angle) * horizontal * t,
  ];
}

export function goalCrossingTime(kick: Kick): number {
  const speed = 11 + Math.max(0, Math.min(1, kick.power)) * 5.5;
  return (
    (FIELD_GOAL.startZ - FIELD_GOAL.goalZ) /
    (Math.cos(kick.angle) * Math.cos(FIELD_GOAL.loft) * speed)
  );
}

export function judgeKick(kick: Kick): KickResult {
  const [x, y] = kickPosition(kick, goalCrossingTime(kick));
  const clearance = FIELD_GOAL.ballRadius + FIELD_GOAL.postRadius;
  if (y - clearance <= FIELD_GOAL.crossbar) return "Short";
  if (x - clearance <= -FIELD_GOAL.halfWidth) return "Wide left";
  if (x + clearance >= FIELD_GOAL.halfWidth) return "Wide right";
  return "Good";
}

export function kickPower(time: number): number {
  return 0.15 + (0.5 + Math.sin(time * 2.6) * 0.5) * 0.85;
}
