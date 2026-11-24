export const TOSS_LIMIT = 6;
export const THROW_Z = 2.55;
export const THROW_Y = 1.52;
export const BIN_Z = -3.35;
export const BIN_RIM = 1.4;
export const BIN_RADIUS = 0.65;
export const AIM_LIMIT = 2.4;
const GRAVITY = 12;
const UP_SPEED = 4.9;

type Shot = { age: number; forward: number; side: number };
export type TossRound = {
  railAngle: number;
  attempts: number;
  score: number;
  shot: Shot | null;
  result: "hit" | "miss" | null;
};

export const newTossRound = (): TossRound => ({
  railAngle: 0, attempts: 0, score: 0, shot: null, result: null,
});

export function chargePower(seconds: number) {
  const cycle = (Math.max(0, seconds) / 0.95) % 2;
  return cycle <= 1 ? cycle : 2 - cycle;
}

export function binPosition(angle: number) {
  return 1.82 * Math.sin(angle);
}

export function shotPosition(shot: Shot, age = shot.age) {
  return {
    x: shot.side * age,
    y: THROW_Y + UP_SPEED * age - GRAVITY * age ** 2 / 2,
    z: THROW_Z - shot.forward * age,
  };
}

export function throwPaper(round: TossRound, aim: number, power: number): TossRound {
  if (round.shot || round.attempts >= TOSS_LIMIT) return round;
  const forward = 3.4 + 7.2 * Math.max(0, Math.min(1, power));
  const lane = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, aim));
  return {
    ...round, result: null,
    shot: { age: 0, forward, side: lane * forward / (THROW_Z - BIN_Z) },
  };
}

const rimAge = (UP_SPEED + Math.sqrt(UP_SPEED ** 2 + 2 * GRAVITY * (THROW_Y - BIN_RIM))) / GRAVITY;

export function stepToss(round: TossRound, dt: number): TossRound {
  if (round.attempts >= TOSS_LIMIT) return round;
  const railSpeed = round.attempts === 0 ? 0 : 0.55 + round.attempts * 0.4;
  const railAngle = round.railAngle + railSpeed * dt;
  if (!round.shot) return { ...round, railAngle };
  const shot = { ...round.shot, age: round.shot.age + dt };
  const settle = (hit: boolean): TossRound => ({
    railAngle, attempts: round.attempts + 1, score: round.score + Number(hit),
    shot: null, result: hit ? "hit" : "miss",
  });
  if (round.shot.age < rimAge && shot.age >= rimAge) {
    const paper = shotPosition(shot, rimAge);
    const binX = binPosition(round.railAngle + railSpeed * (rimAge - round.shot.age));
    if (Math.hypot(paper.x - binX, paper.z - BIN_Z) <= BIN_RADIUS - 0.12) return settle(true);
  }
  return shotPosition(shot).y <= 0.15 ? settle(false) : { ...round, railAngle, shot };
}
