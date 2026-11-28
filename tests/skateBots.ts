import { SKATE_RAILS, idleSkateInput, newSkateGame, stepSkate, type SkateInput, type SkateState } from "../src/game/core/skate";

const DT = 1 / 60;
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Runs a 60 s run with `brain` choosing the input each frame. */
export function runBot(brain: (g: SkateState, input: SkateInput, frame: number) => void, seed = 1): SkateState {
  const g = newSkateGame("run", seed),
    input = idleSkateInput();
  for (let f = 0; g.phase !== "done" && f < 80 * 60; f++) {
    input.jump = false;
    input.trick = null;
    brain(g, input, f);
    stepSkate(g, input, DT);
  }
  return g;
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Steering toward a point (park units). */
export function steerTo(g: SkateState, x: number, z: number) {
  const want = Math.atan2(x - g.x, -(z - g.z));
  return Math.max(-1, Math.min(1, wrap(want - g.heading) * 2.5));
}
export const standingSpam = () =>
  runBot((g, i, f) => {
    i.trick = f % 2 ? "kickflip" : "shove-it";
    i.jump = f % 3 === 0;
  });
export const masher = (seed: number) => {
  const r = mulberry(seed);
  return runBot((g, i, f) => {
    if (f % 20 === 0) {
      i.push = r() < 0.7 ? 1 : 0;
      i.steer = r() * 2 - 1;
      i.brake = r() < 0.1;
      i.grind = r() < 0.3;
      const k = r();
      if (k < 0.3) i.trick = "kickflip";
      else if (k < 0.5) i.trick = "shove-it";
      else if (k < 0.6) i.jump = true;
    }
  }, seed);
};
/** Kickflips on the flat as fast as the rules allow, steering a loop around the centre. */
export const flatKickflips = () => {
  let lap = 0;
  const points = [
    [-4.5, 7],
    [4.5, 7],
    [4.5, 2],
    [-4.5, 2],
  ];
  return runBot((g, i) => {
    const [tx, tz] = points[lap % points.length];
    if (Math.hypot(g.x - tx, g.z - tz) < 1.5) lap++;
    i.steer = steerTo(g, tx, tz);
    i.push = g.speed < 7.5 ? 1 : 0;
    if (g.grounded && g.recover === 0 && g.speed >= 6) i.trick = "kickflip";
  });
};
/**
 * The two-rail line with the same trick every time: grind rail 0, kickflip
 * off its end, manual, loop round to rail 1 (and the hip on the way), grind,
 * kickflip off, manual, repeat.
 */
export const parkKickflips = () => {
  type Leg = { x: number; z: number; grind?: number };
  const r0 = SKATE_RAILS[0],
    r1 = SKATE_RAILS[1];
  const legs: Leg[] = [
    { x: r0.x, z: r0.to + 2.5 },
    { x: r0.x, z: r0.from - 0.6, grind: 0 },
    { x: 0.5, z: -8.5 },
    { x: 3, z: -3 + 4.2 },
    { x: r1.x, z: r1.from - 2.5 },
    { x: r1.x, z: r1.to + 0.6, grind: 1 },
    { x: 1, z: 8.5 },
    { x: -3.6, z: 6.5 },
  ];
  let leg = 0;
  return runBot((g, i) => {
    let L = legs[leg % legs.length];
    const passed = L.grind !== undefined ? g.rail < 0 && Math.abs(g.z - L.z) < 0.9 : Math.hypot(g.x - L.x, g.z - L.z) < 1.4;
    if (passed) L = legs[++leg % legs.length];
    const steer = steerTo(g, L.x, L.z),
      off = Math.abs(steer) / 2.5;
    i.steer = g.manual ? Math.max(-1, Math.min(1, g.needle * 3)) : steer;
    // Slow for the turns; carry speed on the straights.
    const bank = Math.abs(g.x) > 6.8 || Math.abs(g.z) > 8.8;
    const want = off > 0.9 || bank ? 3.8 : 7.5;
    i.push = g.speed < want && !g.manual ? 1 : 0;
    i.grind = L.grind !== undefined;
    if (g.rail >= 0) {
      const rail = SKATE_RAILS[g.rail];
      const end = Math.cos(g.heading) > 0 ? rail.from : rail.to;
      if (Math.abs(g.z - end) < 0.3) i.trick = "kickflip";
    } else if (g.grounded && g.recover === 0 && g.slope > 0.25 && g.speed > 5 && Math.abs(g.x - 3) < 2 && Math.abs(g.z + 3) < 2.5) i.trick = "kickflip";
    const manual = !bank && g.grounded && g.rail < 0 && g.speed > 3.4 && off < 0.35 && (g.landWindow > 0 || g.manual) && g.manualTime < 3.5;
    i.brake = manual || (g.grounded && !g.manual && g.speed > want + 0.8);
  });
};
