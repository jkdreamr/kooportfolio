export const TICK = 1 / 60;
export type RaceState = { tick: number; time: number; distance: number; x: number; heading: number; speed: number; stamina: number; finished: boolean; splits: number[]; bank: boolean };
export type RaceInput = { steer: number; cadence: number; burst: boolean };
export const riverCenter = (s: number, seed = 1) => Math.sin(s / 75) * 7 + (Math.sin(s / 32 + seed) - Math.sin(seed)) * 3;
export const newRace = (): RaceState => ({ tick: 0, time: -3, distance: 0, x: 0, heading: 0, speed: 0, stamina: 100, finished: false, splits: [], bank: false });
export function stepRace(old: RaceState, input: RaceInput, length: number, seed = 1): RaceState {
  if (old.finished) return old;
  const s = { ...old, tick: old.tick + 1, time: old.time + TICK, splits: [...old.splits] };
  if (s.time < 0) return s;
  const cadence = Math.max(24, Math.min(36, input.cadence)), steer = Math.max(-1, Math.min(1, input.steer));
  const burst = input.burst && s.stamina > 8;
  s.stamina = Math.max(0, Math.min(100, s.stamina + ((30 - cadence) * .22 + .2 - (burst ? 4.5 : 0)) * TICK));
  s.heading = Math.max(-.65, Math.min(.65, s.heading + (steer * .65 - s.heading * 1.5) * TICK));
  const center = riverCenter(s.distance, seed), offset = Math.abs(s.x - center);
  s.bank = offset > 9.7;
  const current = Math.max(0, 1 - Math.abs(s.x - center - Math.sin(s.distance / 55) * 3) / 4) * .9;
  const target = (cadence / 30 * 10.5 + current + (burst ? 3.2 : 0)) * (s.stamina < 15 ? .65 : 1) * (s.bank ? .4 : 1) * (1 - Math.abs(s.heading) * .18);
  s.speed += (target - s.speed) * TICK * .7;
  s.x += Math.sin(s.heading) * s.speed * TICK;
  s.x = Math.max(center - 11, Math.min(center + 11, s.x));
  const previous = s.distance; s.distance += Math.cos(s.heading) * s.speed * TICK;
  for (let split = 100; split < length; split += 100) if (previous < split && s.distance >= split) s.splits.push(s.time);
  if (s.distance >= length) { s.finished = true; s.distance = length; }
  return s;
}
export function dailySeed(date = new Date()) { return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000) % 997; }
export const raceTime = (time: number) => `${Math.floor(Math.max(0, time) / 60)}:${(Math.max(0, time) % 60).toFixed(2).padStart(5, '0')}`;
