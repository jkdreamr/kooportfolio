import {
  ccwLoop,
  nearestOnPolygon,
  offsetLoop,
  resampleCorners,
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

// Render-only lawn edge: the same parcels with their corners rounded and a
// narrow grass verge. STANFORD_SHORE above stays the walking limit. Wherever
// the viaduct runs close, the verge narrows to leave the piers clear.
export const STANFORD_COAST_VERGE = 1.2;
export const STANFORD_COAST_RAIL_CLEARANCE = 1.5;
const stanfordLawn = resampleCorners(ccwLoop(STANFORD_SHORE), 256);
/** Counter-clockwise, 256 vertices, outside the shore and inside the rail. */
export const STANFORD_COAST: readonly P2[] = smoothLoop(
  offsetLoop(stanfordLawn, STANFORD_COAST_VERGE),
  8,
).map((point, i) => {
  const [sx, sz] = stanfordLawn[i];
  const reach = Math.hypot(point[0] - sx, point[1] - sz);
  const room =
    nearestOnPolygon(sx, sz, STANFORD_RAIL_POINTS).distance -
    STANFORD_COAST_RAIL_CLEARANCE;
  if (reach <= room || reach === 0) return point;
  const t = Math.max(0, room) / reach;
  return [sx + (point[0] - sx) * t, sz + (point[1] - sz) * t] as const;
});
