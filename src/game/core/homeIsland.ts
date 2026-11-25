import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import type { WorldId } from "./worlds";

// The land fits the full-size village, telescope, allotments and two gates.
// Other regions retain their own, larger coastline and travel coordinates.
export const HOME_ISLAND = {
  centerX: -6,
  centerZ: -18,
  radiusX: 42,
  radiusZ: 32,
} as const;
const regionalIsland = { centerX: 0, ...WORLD_ELLIPSE };
export const islandForWorld = (world?: WorldId) =>
  world === "home" ? HOME_ISLAND : regionalIsland;
export const isHomeLand = (x: number, z: number, margin = 0) =>
  ((x - HOME_ISLAND.centerX) / (HOME_ISLAND.radiusX - margin)) ** 2 +
    ((z - HOME_ISLAND.centerZ) / (HOME_ISLAND.radiusZ - margin)) ** 2 <=
  1;
export const HOME_AIRPORT_GATE = [27, -12] as const;
