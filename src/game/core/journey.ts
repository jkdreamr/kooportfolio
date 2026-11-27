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

/* ------------------------------------------------ one continuous shot (B7) */

/**
 * The ride as one shot (ride progress p, 0–1):
 *  0.00–0.30 depart: the camera eases from the boarding framing to a chase
 *  0.30–0.44 veil in: fog closes to cloud, locked to the sky's horizon colour
 *  0.44–0.56 hold: only sky, cloud wisps and the vehicle; the world swaps at
 *            0.50, and only while fully veiled
 *  0.56–0.70 veil out over the destination
 *  0.70–1.00 approach and touch down (the depart mirrored)
 * The sky's hour moves along a cruise curve over 0.15–0.85, so the light
 * changes slowly and never in a step.
 */
export const JOURNEY_SHOT = {
  chaseIn: [0, 0.3],
  veilIn: [0.3, 0.44],
  swap: 0.5,
  veilOut: [0.56, 0.7],
  chaseOut: [0.7, 1],
  hour: [0.15, 0.85],
  /** Chase framing behind and above the vehicle (world units). */
  chaseBack: 14,
  chaseUp: 5,
  chaseFov: 50,
  /** Veiled fog (view depth): the vehicle 14 m away stays readable. */
  veilNear: 8,
  veilFar: 60,
  /** The train runs along the coast, so land can be nearer the lens than
   * the train: its veil is a full sea-fog white-out (train included), and
   * only the streaming wisps carry the motion through the swap. */
  trainVeilNear: 0.5,
  trainVeilFar: 3,
  /** Cap on holding the swap until the destination has been drawn. */
  holdCap: 2.5,
  /** Ride length in seconds (the Travel panel quotes the same numbers). */
  rideSeconds: { plane: 18, train: 14 },
  /** Reduced motion: whole ride, and the fog cross-fade at the midpoint. */
  reducedSeconds: 6,
  reducedVeilSeconds: 0.4,
} as const;

const ramp01 = (p: number, [a, b]: readonly [number, number]) =>
  journeyEase((p - a) / (b - a));

/** Signed shortest way round the clock from `from` to `to`, in (−12, 12]. */
export function shortestArc(from: number, to: number) {
  const d = ((((to - from) % 24) + 24) % 24);
  return d > 12 ? d - 24 : d;
}

/** Ease with zero velocity and acceleration at both ends and a steady
 * middle (peak speed 1.22× the mean, not 1.875× as a plain smootherstep). */
export const cruiseEase = (p: number) => journeyDistance(Math.max(0, Math.min(1, p)));

/** Veil (0 clear → 1 only sky) at ride progress `p`. Reduced motion: a short
 * cross-fade either side of the midpoint of a `seconds`-long ride. */
export function journeyVeil(p: number, reduced = false, seconds: number = JOURNEY_SHOT.reducedSeconds) {
  if (reduced) {
    const half = JOURNEY_SHOT.reducedVeilSeconds / seconds / 2;
    const d = Math.abs(p - JOURNEY_SHOT.swap);
    return 1 - journeyEase((d - half * 0.5) / (half * 0.5));
  }
  if (p <= JOURNEY_SHOT.veilIn[1]) return ramp01(p, JOURNEY_SHOT.veilIn);
  if (p < JOURNEY_SHOT.veilOut[0]) return 1;
  return 1 - ramp01(p, JOURNEY_SHOT.veilOut);
}

/** The world swaps only behind a complete veil. */
export const canSwapWorld = (veil: number) => veil >= 0.999;

/** Ride progress for a clock reading. Until the world has swapped it never
 * passes the swap point (where the veil is complete, reduced or not), so a
 * long frame cannot step over the narrow fully-veiled window. */
export function rideProgress(seconds: number, rideSeconds: number, swapped: boolean) {
  const p = Math.min(1, Math.max(0, seconds / rideSeconds));
  return swapped ? p : Math.min(p, JOURNEY_SHOT.swap);
}

/** Cancel, once the veil is up: swap back if this journey swapped (or the
 * store already shows another region). The `world` prop lags the store by
 * a render, so it cannot decide. */
export const cancelSwapsBack = (arrived: boolean, storeWorld: WorldId, from: WorldId) =>
  arrived || storeWorld !== from;

/** Chase-camera weight (0 boarding/overview framing → 1 chase). */
export function journeyChase(p: number, reduced = false) {
  if (reduced) return 0;
  if (p <= JOURNEY_SHOT.chaseIn[1]) return ramp01(p, JOURNEY_SHOT.chaseIn);
  if (p < JOURNEY_SHOT.chaseOut[0]) return 1;
  return 1 - ramp01(p, JOURNEY_SHOT.chaseOut);
}

const wrap24 = (h: number) => ((h % 24) + 24) % 24;
/** The sky's hour along the ride: origin hour → destination hour the short
 * way round, on the cruise curve. */
export function journeyHour(p: number, from: number, to: number) {
  const [a, b] = JOURNEY_SHOT.hour;
  return wrap24(from + shortestArc(from, to) * cruiseEase((p - a) / (b - a)));
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

export type JourneyPose = { x: number; y: number; z: number; heading: number; pitch: number; roll?: number };

/** Same-world camera/vehicle path. The region changes offshore at the midpoint. */
export function journeyPose(
  mode: TravelMode,
  progress: number,
  world?: WorldId,
  coach = 0,
): JourneyPose {
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
  // railPose hands back a fresh object: fill it in rather than copy it
  // (this runs per coach per frame for the whole ride).
  const pose = railPose(p, mode === "train" ? coach * rail.coachTurns : 0, world) as JourneyPose;
  pose.y = mode === "train" ? rail.height : 0.4;
  pose.pitch = 0;
  return pose;
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
