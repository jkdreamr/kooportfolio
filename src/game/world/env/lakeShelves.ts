import { TERRAIN, terrainTierLoop } from "../../core/terrain";
import { distanceToPolygon, type P2 } from "../../core/coast";

/** Home's lowered cove shelves that hold lakes (a granite lip retains each). */
export const HOME_LAKE_SHELVES = [
  "home-south-east-notch-shelf",
  "home-north-east-cove-shelf",
  "home-north-notch-shelf",
  "home-north-west-cove-shelf",
];

/** The water level of a lake on a shelf whose top is `floorY`: high in the
 * cove, a short drop below the lawn (0.14), so the water shows from the
 * walkable rim at the explore camera's 12° instead of hiding behind the
 * lawn's edge. */
export const lakeWaterY = (floorY: number) => Math.min(floorY + 0.95, -0.28);

let loops: P2[][] | null = null;
/** Distance from (x, z) to the nearest lake shelf's top outline (pure). */
export function distanceToLakeShelf(x: number, z: number) {
  loops ??= TERRAIN.home
    .filter((feature) => feature.kind === "shelf" && HOME_LAKE_SHELVES.includes(feature.id))
    .map((feature) => terrainTierLoop(feature, feature.tiers.length - 1));
  let best = Infinity;
  for (const loop of loops) best = Math.min(best, distanceToPolygon(x, z, loop));
  return best;
}

/** The lip: a granite coping `LIP_WIDTH` wide round the water, then a stone
 * bank sloping `BANK_WIDTH` out and down to the shelf floor (it fills the
 * trench a raised lake would otherwise leave against the cliff). */
export const LIP_WIDTH = 0.5;
export const BANK_WIDTH = 1.1;
/** Height of the lip / bank at `d` units outside the water's edge. */
export function lakeBankY(lake: { y: number; floorY: number }, d: number) {
  const top = lake.y + 0.12;
  if (d <= LIP_WIDTH) return top;
  const t = Math.min(1, (d - LIP_WIDTH) / BANK_WIDTH);
  return top + (lake.floorY - top) * t;
}
