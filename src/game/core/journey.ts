import { ISLAND_RAIL, railPose, railForWorld } from "./islandRail";
import type { TravelMode } from "./travel";
import type { WorldId } from "./worlds";
import { HOME_AIRPORT_GATE } from "./homeIsland";
import { CatmullRomCurve3, Vector3 } from "three";

export const AIRPORT_GATE = [58, 61] as const;
export const STATION_GATE = [-73, ISLAND_RAIL.station[1]] as const;
export const journeyGate = (
  mode: TravelMode,
  world?: WorldId,
): readonly [number, number] =>
  mode === "plane"
    ? world === "home"
      ? HOME_AIRPORT_GATE
      : AIRPORT_GATE
    : [railForWorld(world).station[0] + 3, railForWorld(world).station[1]];

/** Zero velocity and acceleration at either end of a movement. */
export function journeyEase(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  return p * p * p * (p * (p * 6 - 15) + 10);
}

// Integrate a smooth acceleration ramp, with a steady-speed cruise between
// the ramps. A whole-trip ease would concentrate too much speed at the middle.
function journeyDistance(p: number): number {
  const ramp = 0.18;
  if (p > 1 - ramp) return 1 - journeyDistance(1 - p);
  if (p >= ramp) return (p - ramp / 2) / (1 - ramp);
  const t = p / ramp;
  return (ramp * (t ** 3 - 0.5 * t ** 4)) / (1 - ramp);
}

const boardingCurves = new Map<string, CatmullRomCurve3>();
// Around the tail and up the stairs beside the parked jet's nose, rather than
// through the fuselage. Offsets from the gate match the apron/stairs layout.
function boardingCurve(gate: readonly [number, number]) {
  const key = `${gate[0]},${gate[1]}`;
  let curve = boardingCurves.get(key);
  if (!curve) {
    curve = new CatmullRomCurve3([
      new Vector3(gate[0], 0.18, gate[1]),
      new Vector3(gate[0] - 2.9, 0.18, gate[1] + 0.6),
      new Vector3(gate[0] - 2.9, 0.18, gate[1] + 2.3),
      new Vector3(gate[0] - 0.75, 0.72, gate[1] + 2.3),
      new Vector3(gate[0], 0.72, gate[1] + 2.3),
    ]);
    boardingCurves.set(key, curve);
  }
  return curve;
}

/** Walk round the tail and up the stairs, rather than through the fuselage. */
export function boardingPose(
  mode: TravelMode,
  progress: number,
  world?: WorldId,
) {
  const p = journeyEase(progress);
  if (mode === "plane") {
    const curve = boardingCurve(journeyGate(mode, world));
    const point = curve.getPointAt(p);
    const tangent = curve.getTangentAt(p);
    return {
      x: point.x,
      y: Math.max(0.18, Math.min(0.72, point.y)),
      z: point.z,
      heading: Math.atan2(tangent.x, tangent.z),
      visible: p < 0.97,
    };
  }
  const gate = journeyGate(mode, world),
    parked = journeyPose(mode, 0, world);
  return {
    x: gate[0] + (parked.x - gate[0]) * p,
    y: 0.18 + (parked.y - 0.18) * p,
    z: gate[1] + (parked.z - gate[1]) * p,
    heading: Math.atan2(parked.x - gate[0], parked.z - gate[1]),
    visible: p < 0.97,
  };
}

/** Same-world camera/vehicle path. The region changes offshore at the midpoint. */
export function journeyPose(
  mode: TravelMode,
  progress: number,
  world?: WorldId,
  coach = 0,
) {
  const p = Math.max(0, Math.min(1, progress));
  if (mode === "plane") {
    // Taxi before lifting off, ease into cruise, then flare and roll to a stop.
    const [x, z] = journeyGate(mode, world);
    const distance = journeyDistance(p);
    const a = distance * Math.PI * 2;
    const altitude = (s: number) =>
      36 * Math.sin(Math.PI * journeyEase((s - 0.025) / 0.95));
    const slope =
      (altitude(distance + 0.0001) - altitude(distance - 0.0001)) / 0.0002;
    const horizontal =
      Math.hypot(45 * Math.sin(a), 70 * Math.cos(a)) * Math.PI * 2;
    const airborne =
      journeyEase((distance - 0.025) / 0.12) *
      journeyEase((0.975 - distance) / 0.12);
    return {
      x: x + 45 * (1 - Math.cos(a)),
      y: 1.2 + altitude(distance),
      z: z + 4 + 70 * Math.sin(a),
      heading: Math.atan2(45 * Math.sin(a), 70 * Math.cos(a)),
      // Local +Z is the nose: negative X rotation pitches it upwards.
      pitch: -Math.atan2(slope, horizontal),
      roll: -0.16 * airborne,
    };
  }
  const rail = railForWorld(world);
  const pose = railPose(
    journeyDistance(p),
    mode === "train" ? coach * rail.coachTurns : 0,
    world,
  );
  return { ...pose, y: mode === "train" ? rail.height : 0.4, pitch: 0, roll: 0 };
}

/** Trains follow the mounted region's rails, never an interpolated coastline. */
export function journeyRidePose(
  mode: TravelMode,
  progress: number,
  fromWorld: WorldId,
  toWorld: WorldId,
  visibleWorld: WorldId,
  coach = 0,
) {
  if (mode === "train") return journeyPose(mode, progress, visibleWorld, coach);
  const p = Math.max(0, Math.min(1, progress));
  const from = journeyPose(mode, p, fromWorld);
  const to = journeyPose(mode, p, toWorld);
  const blend = p * p * (3 - 2 * p);
  const mix = (a: number, b: number) => a + (b - a) * blend;
  return {
    ...from,
    x: mix(from.x, to.x),
    z: mix(from.z, to.z),
    heading: Math.atan2(
      mix(Math.sin(from.heading), Math.sin(to.heading)),
      mix(Math.cos(from.heading), Math.cos(to.heading)),
    ),
  };
}
