import { ISLAND_RAIL, railPose, railForWorld } from "./islandRail";
import type { TravelMode } from "./travel";
import type { WorldId } from "./worlds";
import { HOME_AIRPORT_GATE } from "./homeIsland";

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
    : world === "home"
      ? [railForWorld(world).station[0] + 3, railForWorld(world).centerZ]
      : STATION_GATE;

/** Same-world camera/vehicle path. The region changes offshore at the midpoint. */
export function journeyPose(
  mode: TravelMode,
  progress: number,
  world?: WorldId,
  coach = 0,
) {
  const p = Math.max(0, Math.min(1, progress));
  if (mode === "plane") {
    const [x, z] = journeyGate(mode, world);
    const a = p * Math.PI * 2;
    return {
      x: x + 45 * (1 - Math.cos(a)),
      y: 1.2 + 36 * Math.sin(p * Math.PI) ** 1.25,
      z: z + 4 + 70 * Math.sin(a),
      heading: Math.atan2(45 * Math.sin(a), 70 * Math.cos(a)),
      pitch: Math.sin(a) * 0.18,
    };
  }
  const rail = railForWorld(world);
  const pose = railPose(
    p,
    mode === "train" ? coach * rail.coachTurns : 0,
    world,
  );
  return { ...pose, y: mode === "train" ? rail.height : 0.4, pitch: 0 };
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
