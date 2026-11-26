import {
  ccwLoop,
  displaceLoop,
  distanceToPolygon,
  insidePolygon,
  loopCentroid,
  loopNormals,
  offsetLoop,
  rayToPolygon,
  resampleCorners,
  resampleLoop,
  smoothLoop,
  type P2,
} from "../game/core/coast";
import { STANFORD_RAIL_POINTS } from "./stanford-transport";

/** Stanford's occupied parcels and transport approaches, not the old village lawn. */
export const STANFORD_SHORE = [
  [-28.5, 13],
  [-22, -5.5],
  [5, -5.5],
  [12, 6],
  [45, 6],
  [50, 11],
  [50, 39],
  [65, 42],
  [70, 50],
  [70, 63],
  [63, 74],
  [49, 75],
  [-5, 75],
  [-43, 77],
  [-45, 67],
  [-44, 48],
  [-34, 35],
  [-29, 28],
] as const;

/** The same avatar clearance applies to movement and persisted positions. */
export const STANFORD_SHORE_CLEARANCE = 0.45;

/** Rendering, movement and old-save migration share this coastline. */
export function onStanfordLand(x: number, z: number, inset = 0) {
  let inside = false;
  for (
    let i = 0, j = STANFORD_SHORE.length - 1;
    i < STANFORD_SHORE.length;
    j = i++
  ) {
    const [ax, az] = STANFORD_SHORE[j],
      [bx, bz] = STANFORD_SHORE[i];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
    if (inset > 0) {
      const dx = bx - ax,
        dz = bz - az;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)),
      );
      if (Math.hypot(x - ax - t * dx, z - az - t * dz) < inset) return false;
    }
  }
  return inside;
}

// Render-only lawn edge. STANFORD_SHORE above stays the walking limit. The
// drawn lawn follows the viaduct's own curve, a pier's width inside it, and
// falls back to the parcels' rounded verge in a few bays that show the shelf.
export const STANFORD_COAST_VERGE = 1.2;
export const STANFORD_COAST_RAIL_CLEARANCE = 2.6;
/** Bays, by bearing in degrees about the rail's centre (0 east, 90 south). */
export const STANFORD_COAST_BAYS = [
  { name: "east bay", at: -8, width: 10, depth: 0.9 },
  { name: "south bay", at: 78, width: 9, depth: 0.8 },
  { name: "west bay", at: 152, width: 9, depth: 0.85 },
  { name: "north bay", at: -103, width: 7, depth: 0.75 },
] as const;
const stanfordVerge = smoothLoop(
  offsetLoop(
    resampleCorners(ccwLoop(STANFORD_SHORE), 256),
    STANFORD_COAST_VERGE,
  ),
  8,
);
const stanfordRail = resampleLoop(ccwLoop(STANFORD_RAIL_POINTS), 256);
const stanfordRailCentre = loopCentroid(stanfordRail);
const inward = loopNormals(stanfordRail).map(([x, z]): P2 => [-x, -z]);
const stanfordRolled = smoothLoop(
  stanfordRail.map((point, i) => {
    const room = rayToPolygon(point, inward[i], stanfordVerge);
    const bearing = Math.atan2(
      point[1] - stanfordRailCentre[1],
      point[0] - stanfordRailCentre[0],
    );
    let bay = 0;
    for (const { at, width, depth } of STANFORD_COAST_BAYS) {
      const d =
        Math.atan2(
          Math.sin(bearing - (at * Math.PI) / 180),
          Math.cos(bearing - (at * Math.PI) / 180),
        ) /
        ((width * Math.PI) / 180);
      bay = Math.max(bay, depth * Math.exp(-d * d));
    }
    const c = STANFORD_COAST_RAIL_CLEARANCE;
    const reach = Number.isFinite(room)
      ? Math.max(Math.min(c, room), c + (room - c) * bay)
      : c;
    return [
      point[0] + inward[i][0] * reach,
      point[1] + inward[i][1] * reach,
    ] as const;
  }),
  3,
);
/** Smoothing rounds across parcel corners: keep a grass edge outside each. */
function outsideShore(loop: readonly P2[], margin: number): P2[] {
  let current = [...loop];
  for (let pass = 0; pass < 4; pass++) {
    const normals = loopNormals(current);
    current = current.map(([x, z], i) => {
      const edge = distanceToPolygon(x, z, STANFORD_SHORE);
      const outside = insidePolygon(x, z, STANFORD_SHORE) ? -edge : edge;
      const push = Math.max(0, margin - outside);
      return [x + normals[i][0] * push, z + normals[i][1] * push] as const;
    });
  }
  return current;
}
/** Counter-clockwise, 256 vertices, outside the shore and inside the rail. */
export const STANFORD_COAST: readonly P2[] = outsideShore(stanfordRolled, 0.45);

// Render-only rock shelf under the viaduct: 2.4 beyond the rail all round,
// swelling behind the campus (north and west, the far side from the overview
// camera) into ground for the golden foothills. Nothing here is walkable.
export const STANFORD_MESA_SWELLS = [
  { name: "north range", at: [-6, -11], reach: 12.5, spread: 19 },
  { name: "north-west shoulder", at: [-31, -5], reach: 6, spread: 10 },
  { name: "west range", at: [-33, 14], reach: 11.5, spread: 11 },
  { name: "north-east spur", at: [37, -1], reach: 8, spread: 10 },
] as const;
/** Counter-clockwise, 160 even vertices. */
export const STANFORD_MESA: readonly P2[] = resampleLoop(
  smoothLoop(
    displaceLoop(
      offsetLoop(resampleLoop(ccwLoop(STANFORD_RAIL_POINTS), 256), 2.4),
      (_, [x, z]) =>
        STANFORD_MESA_SWELLS.reduce(
          (sum, { at, reach, spread }) =>
            sum +
            reach *
              Math.exp(-(((x - at[0]) ** 2 + (z - at[1]) ** 2) / spread ** 2)),
          0,
        ),
    ),
    9,
  ),
  160,
);
