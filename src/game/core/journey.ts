import { ISLAND_RAIL, railPose } from "./islandRail";
import type { TravelMode } from "./travel";
import { CatmullRomCurve3, Vector3 } from "three";

export const AIRPORT_GATE = [58, 61] as const;
export const STATION_GATE = [-73, ISLAND_RAIL.station[1]] as const;
export const journeyGate = (mode: TravelMode) =>
  mode === "plane" ? AIRPORT_GATE : STATION_GATE;

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

const planeBoarding = new CatmullRomCurve3([
  new Vector3(58, 0.18, 61),
  new Vector3(55.1, 0.18, 61.6),
  new Vector3(55.1, 0.18, 63.3),
  new Vector3(57.25, 0.72, 63.3),
  new Vector3(58, 0.72, 63.3),
]);

/** Walk round the tail and up the stairs, rather than through the fuselage. */
export function boardingPose(mode: TravelMode, progress: number) {
  const p = journeyEase(progress);
  if (mode === "plane") {
    const point = planeBoarding.getPointAt(p);
    const tangent = planeBoarding.getTangentAt(p);
    return {
      x: point.x,
      y: Math.max(0.18, Math.min(0.72, point.y)),
      z: point.z,
      heading: Math.atan2(tangent.x, tangent.z),
      visible: p < 0.97,
    };
  }
  const gate = journeyGate(mode),
    parked = journeyPose(mode, 0);
  return {
    x: gate[0] + (parked.x - gate[0]) * p,
    y: 0.18 + (parked.y - 0.18) * p,
    z: gate[1] + (parked.z - gate[1]) * p,
    heading: Math.atan2(parked.x - gate[0], parked.z - gate[1]),
    visible: p < 0.97,
  };
}

/** Same-world camera/vehicle path. The region changes offshore at the midpoint. */
export function journeyPose(mode: TravelMode, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  if (mode === "plane") {
    // Taxi before lifting off, ease into cruise, then flare and roll to a stop.
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
      x: 58 + 45 * (1 - Math.cos(a)),
      y: 1.2 + altitude(distance),
      z: 65 + 70 * Math.sin(a),
      heading: Math.atan2(45 * Math.sin(a), 70 * Math.cos(a)),
      // Local +Z is the nose: negative X rotation pitches it upwards.
      pitch: -Math.atan2(slope, horizontal),
      roll: -0.16 * airborne,
    };
  }
  const pose = railPose(journeyDistance(p));
  return {
    ...pose,
    y: mode === "train" ? ISLAND_RAIL.height : 0.4,
    pitch: 0,
    roll: 0,
  };
}
