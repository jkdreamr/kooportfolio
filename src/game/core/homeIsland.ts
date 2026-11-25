import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import type { WorldId } from "./worlds";
import {
  distanceToPolygon,
  insidePolygon,
  lobeScale,
  lobedLoop,
  resampleLoop,
  type Lobe,
  type P2,
} from "./coast";

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
// The base ellipse above remains the village's bounds; the drawn and walked
// shore swells into headlands and pinches into coves around it. Angles follow
// the ellipse parameter: 0 east, 90 south (toward the camera), 180 west.
export const HOME_LOBES: readonly Lobe[] = [
  { name: "garden point", at: 112, amp: 0.18, width: 13 },
  { name: "pergola point", at: 48, amp: 0.09, width: 11 },
  { name: "telescope bluff", at: 236, amp: 0.2, width: 15 },
  { name: "airport spit", at: 16, amp: 0.16, width: 20 },
  { name: "north-east spit", at: 328, amp: 0.1, width: 9 },
  { name: "north-east cove", at: 300, amp: -0.2, width: 13 },
  { name: "south-east notch", at: 68, amp: -0.08, width: 8 },
  { name: "west notch", at: 160, amp: -0.08, width: 7 },
  { name: "north-west cove", at: 200, amp: -0.1, width: 9 },
  { name: "north notch", at: 272, amp: -0.07, width: 8 },
];
/** The organic coastline: lawn edge, cliff top and walking limit all use it. */
export const HOME_SHORE: readonly P2[] = lobedLoop(
  HOME_ISLAND,
  HOME_ISLAND.radiusX,
  HOME_ISLAND.radiusZ,
  HOME_LOBES,
  256,
);

// The railway rounds the same headlands on a wider, gentler line: broader
// lobes and shallow coves keep every curve easy for full-size coaches, and
// leave the deepest cove to be crossed on a trestle.
export const HOME_RAIL_RADII = { radiusX: 44, radiusZ: 34.5 } as const;
export const HOME_RAIL_LOBES: readonly Lobe[] = HOME_LOBES.map((lobe) => ({
  ...lobe,
  amp: lobe.amp < 0 ? lobe.amp * 0.35 : lobe.amp,
  width: lobe.width * 1.6,
}));
/** Even arc-length samples; index 0 is the west crossing of the station's
 * street (z = centerZ), then north and clockwise as seen from above. */
export const HOME_RAIL_POINTS: readonly P2[] = resampleLoop(
  lobedLoop(
    HOME_ISLAND,
    HOME_RAIL_RADII.radiusX,
    HOME_RAIL_RADII.radiusZ,
    HOME_RAIL_LOBES,
    720,
    Math.PI,
  ),
  480,
);

/** On the organic shore, at least `margin` in from its edge. */
export function isHomeLand(x: number, z: number, margin = 0) {
  const dx = (x - HOME_ISLAND.centerX) / HOME_ISLAND.radiusX;
  const dz = (z - HOME_ISLAND.centerZ) / HOME_ISLAND.radiusZ;
  // The loop is star-shaped about its centre, so the radial gap settles
  // almost every query without walking the polygon.
  const gap =
    (lobeScale(Math.atan2(dz, dx), HOME_LOBES) - Math.hypot(dx, dz)) *
    HOME_ISLAND.radiusZ;
  if (gap < -0.5) return false;
  if (gap > 4 * margin + 2.5) return true;
  return (
    insidePolygon(x, z, HOME_SHORE) &&
    (margin <= 0 || distanceToPolygon(x, z, HOME_SHORE) >= margin)
  );
}
/** The original ellipse: the outer limit of walking, inside every headland. */
export const isHomeEllipse = (x: number, z: number) =>
  ((x - HOME_ISLAND.centerX) / HOME_ISLAND.radiusX) ** 2 +
    ((z - HOME_ISLAND.centerZ) / HOME_ISLAND.radiusZ) ** 2 <=
  1;
export const HOME_AIRPORT_GATE = [27, -12] as const;
