import { ISLAND_RAIL, railPose } from "./islandRail";
import type { TravelMode } from "./travel";

export const AIRPORT_GATE = [58, 61] as const;
export const STATION_GATE = [-73, ISLAND_RAIL.station[1]] as const;
export const journeyGate = (mode: TravelMode) =>
  mode === "plane" ? AIRPORT_GATE : STATION_GATE;

/** Same-world camera/vehicle path. The region changes offshore at the midpoint. */
export function journeyPose(mode: TravelMode, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  if (mode === "plane") {
    const a = p * Math.PI * 2;
    return {
      x: 58 + 45 * (1 - Math.cos(a)),
      y: 1.2 + 36 * Math.sin(p * Math.PI) ** 1.25,
      z: 65 + 70 * Math.sin(a),
      heading: Math.atan2(45 * Math.sin(a), 70 * Math.cos(a)),
      pitch: Math.sin(a) * 0.18,
    };
  }
  const pose = railPose(p);
  return { ...pose, y: mode === "train" ? ISLAND_RAIL.height : 0.4, pitch: 0 };
}
