import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import { HOME_ISLAND, HOME_RAIL_POINTS } from "./homeIsland";
import { arcLengthTable, poseOnLoop } from "./coast";
import type { WorldId } from "./worlds";
import {
  STANFORD_RAIL_PROFILE,
  stanfordRailPose,
} from "../../shared/stanford-transport";

export const ISLAND_RAIL = {
  centerX: 0,
  radiusX: 86.5,
  radiusZ: WORLD_ELLIPSE.radiusZ + 2.5,
  centerZ: WORLD_ELLIPSE.centerZ,
  height: 1,
  lapSeconds: 130,
  coachTurns: 0.009,
  station: [-76, WORLD_ELLIPSE.centerZ] as const,
};
const homeTable = arcLengthTable(HOME_RAIL_POINTS);
/** Length of Home's coastal loop, in world units. */
export const HOME_RAIL_LENGTH = homeTable.length;
const homeRail = {
  ...ISLAND_RAIL,
  ...HOME_ISLAND,
  // Bounds only: the lobed shoreline curve, not an ellipse, defines the route.
  radiusX: Math.max(
    ...HOME_RAIL_POINTS.map(([x]) => Math.abs(x - HOME_ISLAND.centerX)),
  ),
  radiusZ: Math.max(
    ...HOME_RAIL_POINTS.map(([, z]) => Math.abs(z - HOME_ISLAND.centerZ)),
  ),
  // Preserve full-size car clearance on the shorter loop.
  coachTurns: 5.5 / HOME_RAIL_LENGTH,
  // The platform reaches from the village street out to the western track.
  station: [HOME_RAIL_POINTS[0][0] + 10.5, HOME_ISLAND.centerZ] as const,
};
const stanfordRail = { ...ISLAND_RAIL, ...STANFORD_RAIL_PROFILE };
export const railForWorld = (world?: WorldId) =>
  world === "stanford"
    ? stanfordRail
    : world === "home"
      ? homeRail
      : ISLAND_RAIL;

/** Distance-like phase, in turns. Locomotive and coaches share this route. */
export function railPose(turns: number, offset = 0, world?: WorldId) {
  if (world === "stanford") return stanfordRailPose(turns, offset);
  if (world === "home") return poseOnLoop(homeTable, turns, offset);
  const rail = railForWorld(world);
  const angle = (turns - offset) * Math.PI * 2 + Math.PI;
  return {
    x: rail.centerX + Math.cos(angle) * rail.radiusX,
    z: rail.centerZ + Math.sin(angle) * rail.radiusZ,
    heading: Math.atan2(
      -Math.sin(angle) * rail.radiusX,
      Math.cos(angle) * rail.radiusZ,
    ),
  };
}
