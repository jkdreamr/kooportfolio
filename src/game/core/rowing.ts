export const TICK = 1 / 60;
export type RaceState = {
  tick: number;
  time: number;
  distance: number;
  x: number;
  heading: number;
  speed: number;
  stamina: number;
  finished: boolean;
  splits: number[];
  bank: boolean;
  stroke: number;
  strokes: number;
  effort: number;
  current: number;
  bursting: boolean;
  boostedStroke: number | null;
};
export type RaceInput = {
  steer: number;
  cadence: number;
  burst: boolean;
  catchPressed?: boolean;
};
export const CATCH_WINDOW_START = 0.73;
export const catchReady = (race: RaceState) =>
  race.time > 0 &&
  !race.finished &&
  race.stroke >= CATCH_WINDOW_START &&
  race.boostedStroke !== race.strokes + 1;
export const catchBoosted = (race: RaceState) =>
  race.boostedStroke === race.strokes + 1 ||
  (race.boostedStroke === race.strokes && race.stroke < 0.38);
export const riverCenter = (s: number, seed = 1) =>
  Math.sin(s / 75) * 7 + (Math.sin(s / 32 + seed) - Math.sin(seed)) * 3;
export const riverTangent = (s: number, seed = 1) =>
  Math.cos(s / 75) * (7 / 75) + Math.cos(s / 32 + seed) * (3 / 32);
export const currentLine = (s: number, seed = 1) =>
  riverCenter(s, seed) + Math.sin(s / 48 + seed * 0.7) * 3.4;
export function riverCurrent(s: number, x: number, seed = 1) {
  const channel = Math.max(0, 1 - Math.abs(x - currentLine(s, seed)) / 4);
  return 0.15 + channel * channel * 1.45;
}
export function strokeDrive(phase: number) {
  return phase < 0.38 ? (Math.sin((phase / 0.38) * Math.PI) * Math.PI) / 2 : 0;
}
export const newRace = (): RaceState => ({
  tick: 0,
  time: -3,
  distance: 0,
  x: 0,
  heading: 0,
  speed: 0,
  stamina: 100,
  finished: false,
  splits: [],
  bank: false,
  stroke: 0,
  strokes: 0,
  effort: 0,
  current: 0,
  bursting: false,
  boostedStroke: null,
});
export function stepRace(
  old: RaceState,
  input: RaceInput,
  length: number,
  seed = 1,
): RaceState {
  if (old.finished) return old;
  const s = {
    ...old,
    tick: old.tick + 1,
    time: old.time + TICK,
    splits: [...old.splits],
  };
  if (s.time <= 0) return s;
  if (input.catchPressed && catchReady(old))
    s.boostedStroke = old.strokes + 1;
  const cadence = Math.max(24, Math.min(36, input.cadence)),
    steer = Math.max(-1, Math.min(1, input.steer));
  // Hysteresis prevents a held burst from flickering on/off at exhaustion.
  const burst = input.burst && s.stamina > (old.bursting ? 1 : 20);
  s.bursting = burst;
  s.stamina = Math.max(
    0,
    Math.min(
      100,
      s.stamina + ((30 - cadence) * 0.24 + 0.12 - (burst ? 9 : 0)) * TICK,
    ),
  );
  s.heading = Math.max(
    -0.65,
    Math.min(0.65, s.heading + (steer * 1.25 - s.heading * 3) * TICK),
  );
  const center = riverCenter(s.distance, seed),
    offset = Math.abs(s.x - center);
  s.bank = offset > 9.7;
  const phase = s.stroke + (cadence / 60) * TICK;
  s.strokes += Math.floor(phase);
  s.stroke = phase % 1;
  s.effort = strokeDrive(s.stroke);
  s.current = riverCurrent(s.distance, s.x, seed);
  const fatigue = 0.65 + Math.min(1, s.stamina / 18) * 0.35;
  const drive =
    s.effort *
    10.8 *
    (cadence / 30) ** 1.5 *
    fatigue *
    (burst ? 1.65 : 1) *
    (s.boostedStroke === s.strokes ? 1.32 : 1) *
    (s.bank ? 0.4 : 1);
  const throughWater = Math.max(0, s.speed - s.current);
  const drag =
    (throughWater ** 2 * 0.032 + throughWater * 0.065) * (s.bank ? 3.2 : 1) +
    Math.abs(steer) * s.speed * 0.055;
  s.speed = Math.max(0, s.speed + (drive - drag) * TICK);
  s.x +=
    (Math.sin(s.heading) * s.speed +
      riverTangent(s.distance, seed) * s.current) *
    TICK;
  const previous = s.distance;
  s.distance += Math.cos(s.heading) * s.speed * TICK;
  const nextCenter = riverCenter(s.distance, seed);
  s.x = Math.max(nextCenter - 11, Math.min(nextCenter + 11, s.x));
  const crossingTime = (distance: number) =>
    old.time +
    (TICK * (distance - previous)) / Math.max(1e-9, s.distance - previous);
  for (let split = 100; split < length; split += 100)
    if (previous < split && s.distance >= split)
      s.splits.push(crossingTime(split));
  if (s.distance >= length) {
    s.finished = true;
    s.time = crossingTime(length);
    s.distance = length;
  }
  return s;
}

export const RIVAL_LANES = [-7.5, -2.5, 7.5];
export function newRivals() {
  return RIVAL_LANES.map((x) => ({ ...newRace(), x }));
}
export function rivalInput(
  s: RaceState,
  rival: number,
  length: number,
  seed = 1,
): RaceInput {
  const lane = RIVAL_LANES[rival];
  const target = riverCenter(s.distance + 9, seed) + lane;
  const heading = Math.atan((target - s.x) / 9);
  // Crews have distinct pacing, not a speed tied to the player's position.
  const closing = s.distance > length - 110;
  const cadence =
    [29, 31, 30][rival] +
    Math.sin(s.time * 0.17 + rival * 2 + seed) * 1.2 +
    (closing ? 3 : 0);
  return {
    steer: Math.max(-1, Math.min(1, (heading - s.heading) * 3 + heading * 2.4)),
    cadence,
    burst:
      (closing && s.stamina > 25) ||
      (s.time > 0 && s.time < 3.5 && rival === 1),
  };
}
export function racePlace(player: RaceState, rivals: RaceState[]) {
  return (
    1 +
    rivals.filter((rival) =>
      player.finished
        ? rival.finished && rival.time < player.time
        : rival.finished || rival.distance > player.distance,
    ).length
  );
}
export function dailySeed(date = new Date()) {
  return (
    Math.floor(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
        86400000,
    ) % 997
  );
}
export const raceTime = (time: number) =>
  `${Math.floor(Math.max(0, time) / 60)}:${(Math.max(0, time) % 60).toFixed(2).padStart(5, "0")}`;
