export const THROW_Z = 2.55;
export const THROW_Y = 1.52;
export const BIN_Z = -3.35;
export const BIN_RIM = 1.4;
export const BIN_RADIUS = 0.65;
export const AIM_LIMIT = 2.4;
export const LANDING_TIME = 0.28;
const GRAVITY = 12;
const UP_SPEED = 4.9;
export const RIM_AGE =
  (UP_SPEED + Math.sqrt(UP_SPEED ** 2 + 2 * GRAVITY * (THROW_Y - BIN_RIM))) /
  GRAVITY;

export type TossLevel = {
  name: string;
  target: number;
  attempts: number;
  binZ: number;
  binRadius: number;
  railSpeed: number;
  wind: number;
};

export const TOSS_LEVELS: TossLevel[] = [
  {
    name: "Warm-up",
    target: 3,
    attempts: 6,
    binZ: BIN_Z,
    binRadius: BIN_RADIUS,
    railSpeed: 1,
    wind: 0,
  },
  {
    name: "Crosswind",
    target: 3,
    attempts: 6,
    binZ: BIN_Z,
    binRadius: BIN_RADIUS,
    railSpeed: 1.1,
    wind: 2.2,
  },
  {
    name: "Long shot",
    target: 3,
    attempts: 6,
    binZ: -4.35,
    binRadius: BIN_RADIUS,
    railSpeed: 1.25,
    wind: 0,
  },
  {
    name: "Tight rim",
    target: 3,
    attempts: 6,
    binZ: -3.6,
    binRadius: 0.5,
    railSpeed: 1.4,
    wind: 0,
  },
  {
    name: "Final bell",
    target: 4,
    attempts: 7,
    binZ: -4.35,
    binRadius: 0.52,
    railSpeed: 1.6,
    wind: 1.4,
  },
];

type Shot = { age: number; forward: number; side: number; wind: number };
export type TossRound = {
  level: number;
  railAngle: number;
  attempts: number;
  made: number;
  shot: Shot | null;
  landing: { age: number; x: number; z: number } | null;
  result: "hit" | "miss" | null;
};

export const newTossRound = (level = 0): TossRound => ({
  level: Math.max(0, Math.min(TOSS_LEVELS.length - 1, level)),
  railAngle: 0,
  attempts: 0,
  made: 0,
  shot: null,
  landing: null,
  result: null,
});

export function chargePower(seconds: number) {
  const cycle = (Math.max(0, seconds) / 0.95) % 2;
  return cycle <= 1 ? cycle : 2 - cycle;
}

export function swipeToss(startAim: number, sideways: number, upward: number) {
  return {
    aim: Math.max(
      -AIM_LIMIT,
      Math.min(AIM_LIMIT, startAim + sideways * AIM_LIMIT * 2),
    ),
    power: Math.max(0, Math.min(1, upward)),
  };
}

export function binPosition(angle: number) {
  return 1.82 * Math.sin(angle);
}

export function shotPosition(shot: Shot, age = shot.age) {
  return {
    x: shot.side * age + (shot.wind * age ** 2) / 2,
    y: THROW_Y + UP_SPEED * age - (GRAVITY * age ** 2) / 2,
    z: THROW_Z - shot.forward * age,
  };
}

export function launchPaper(
  aim: number,
  power: number,
  level: TossLevel = TOSS_LEVELS[0],
): Shot {
  const centeredPower = Math.max(-1, Math.min(1, power * 2 - 1));
  const distance = THROW_Z - level.binZ;
  const forward =
    ((7 + 3.6 * Math.sign(centeredPower) * Math.abs(centeredPower) ** 1.4) *
      distance) /
    (THROW_Z - BIN_Z);
  const lane = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, aim));
  return {
    age: 0,
    forward,
    side: (lane * forward) / distance,
    wind: level.wind,
  };
}

export function canThrowPaper(round: TossRound) {
  return (
    !round.shot &&
    !round.landing &&
    round.attempts < TOSS_LEVELS[round.level].attempts
  );
}

export function throwPaper(
  round: TossRound,
  aim: number,
  power: number,
): TossRound {
  if (!canThrowPaper(round)) return round;
  return {
    ...round,
    result: null,
    shot: launchPaper(aim, power, TOSS_LEVELS[round.level]),
  };
}

export function levelCleared(round: TossRound) {
  return round.made >= TOSS_LEVELS[round.level].target;
}

export function roundOver(round: TossRound) {
  return (
    round.attempts >= TOSS_LEVELS[round.level].attempts &&
    !round.shot &&
    !round.landing
  );
}

export function stepToss(round: TossRound, dt: number): TossRound {
  const level = TOSS_LEVELS[round.level];
  if (round.attempts >= level.attempts && !round.landing) return round;
  const railSpeed =
    round.attempts === 0 || round.attempts >= level.attempts
      ? 0
      : (0.3 + round.attempts * 0.36) * level.railSpeed;
  const railAngle = round.railAngle + railSpeed * dt;
  if (round.landing) {
    const age = round.landing.age + dt;
    return {
      ...round,
      railAngle,
      landing: age >= LANDING_TIME ? null : { ...round.landing, age },
    };
  }
  if (!round.shot) return { ...round, railAngle };
  const shot = { ...round.shot, age: round.shot.age + dt };
  const settle = (
    hit: boolean,
    { x, z }: ReturnType<typeof shotPosition>,
  ): TossRound => ({
    ...round,
    railAngle,
    attempts: round.attempts + 1,
    made: round.made + Number(hit),
    shot: null,
    landing: { age: 0, x, z },
    result: hit ? "hit" : "miss",
  });
  if (round.shot.age < RIM_AGE && shot.age >= RIM_AGE) {
    const paper = shotPosition(shot, RIM_AGE);
    const binX = binPosition(
      round.railAngle + railSpeed * (RIM_AGE - round.shot.age),
    );
    if (
      Math.hypot(paper.x - binX, paper.z - level.binZ) <=
      level.binRadius - 0.12
    ) {
      return settle(true, paper);
    }
  }
  const paper = shotPosition(shot);
  return paper.y <= 0.15 ? settle(false, paper) : { ...round, railAngle, shot };
}
