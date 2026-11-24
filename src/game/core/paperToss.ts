export const TOSS_LIMIT = 6;
export const THROW_Z = 2.55;
export const THROW_Y = 1.52;
export const BIN_Z = -3.35;
export const BIN_RIM = 1.4;
export const BIN_RADIUS = 0.65;
export const AIM_LIMIT = 2.4;
const GRAVITY = 12;
const UP_SPEED = 4.9;
export const RIM_AGE = (UP_SPEED + Math.sqrt(UP_SPEED ** 2 + 2 * GRAVITY * (THROW_Y - BIN_RIM))) / GRAVITY;

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

export function swipeToss(startAim: number, sideways: number, upward: number) {
  return {
    aim: Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, startAim + sideways * AIM_LIMIT * 2)),
    power: Math.max(0, Math.min(1, upward)),
  };
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

export function launchPaper(aim: number, power: number): Shot {
  const centeredPower = Math.max(-1, Math.min(1, power * 2 - 1));
  const forward = 7 + 3.6 * Math.sign(centeredPower) * Math.abs(centeredPower) ** 1.4;
  const lane = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, aim));
  return { age: 0, forward, side: lane * forward / (THROW_Z - BIN_Z) };
}

export function throwPaper(round: TossRound, aim: number, power: number): TossRound {
  if (round.shot || round.attempts >= TOSS_LIMIT) return round;
  return { ...round, result: null, shot: launchPaper(aim, power) };
}

export function stepToss(round: TossRound, dt: number): TossRound {
  if (round.attempts >= TOSS_LIMIT) return round;
  const railSpeed = round.attempts === 0 ? 0 : 0.3 + round.attempts * 0.36;
  const railAngle = round.railAngle + railSpeed * dt;
  if (!round.shot) return { ...round, railAngle };
  const shot = { ...round.shot, age: round.shot.age + dt };
  const settle = (hit: boolean): TossRound => ({
    railAngle, attempts: round.attempts + 1, score: round.score + Number(hit),
    shot: null, result: hit ? "hit" : "miss",
  });
  if (round.shot.age < RIM_AGE && shot.age >= RIM_AGE) {
    const paper = shotPosition(shot, RIM_AGE);
    const binX = binPosition(round.railAngle + railSpeed * (RIM_AGE - round.shot.age));
    if (Math.hypot(paper.x - binX, paper.z - BIN_Z) <= BIN_RADIUS - 0.12) return settle(true);
  }
  return shotPosition(shot).y <= 0.15 ? settle(false) : { ...round, railAngle, shot };
}
