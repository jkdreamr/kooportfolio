import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import { HOME_ISLAND } from "./homeIsland";
import type { WorldId } from "./worlds";

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
const homeRail = {
  ...ISLAND_RAIL,
  ...HOME_ISLAND,
  radiusX: HOME_ISLAND.radiusX + 2,
  radiusZ: HOME_ISLAND.radiusZ + 2.5,
  // Preserve full-size car clearance on the shorter loop.
  coachTurns: 0.022,
  station: [
    HOME_ISLAND.centerX - HOME_ISLAND.radiusX + 8.5,
    HOME_ISLAND.centerZ,
  ] as const,
};
export const railForWorld = (world?: WorldId) =>
  world === "home" ? homeRail : ISLAND_RAIL;

/** Distance-like phase, in turns. Locomotive and coaches share this route. */
export function railPose(turns: number, offset = 0, world?: WorldId) {
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
