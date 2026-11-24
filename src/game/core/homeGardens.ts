import type { GroundFootprint } from "./scenery";
import { forest } from "./scenery";
import { villageGardenPlots } from "./villageGardens";

// Full-size outdoor rooms between the real destinations, not extra buildings.
// Dimensions are shared by rendered planting and the walkable aisles/collision.
export const HOME_FLOWER_BEDS: readonly GroundFootprint[] = [
  [-31, -25, 1.2, 8], // Narrow planted edges, never a district between shops.
  [20, -25, 1.2, 8],
  [-30, -9, 1.2, 8],
  [11, -10, 1.2, 8],
  [-15, 44, 1.2, 12], // Pond-side border.
  [4.7, 44.5, 1.2, 12], // Allotment edges leave a gap for the cross-walk.
  [4.7, 58, 1.2, 9],
  [10.5, 64, 13, 2],
  [31.5, 64, 16, 2],
];

export const HOME_GARDEN_GROUNDS: readonly GroundFootprint[] = [
  [-6, -17, 52, 28], // One continuous village block, not separate landmark pads.
  [-14, 41, 6, 17],
  [21, 49, 36, 30],
  [-4, 68, 26, 23],
];

export const HOME_GARDEN_WALKS: readonly GroundFootprint[] = [
  [-6, -18, 44, 3.2],
  [-10, -5, 38, 3.2],
  [-4.5, -11.5, 3, 13],
  [-32.5, -8, 3, 20],
  [18, -11.5, 2.8, 13],
  [25, 10, 50, 3.4],
  [50, 10, 3, 38],
  [-3, 52, 3, 43],
  [1, 52, 38, 3],
  [-4, 73, 24, 3],
];

const existing = villageGardenPlots("home");
const treeSites: readonly (readonly [number, number])[] = [
  [-35, -27],
  [-48, -29],
  [-49, -17],
  [14, -36],
  [23, -36],
  [32, -36],
  [53, -3],
  [55, 5],
  [54, 14],
  [53, 22],
  [-16, 53],
  [-12, 68],
  [-12, 76],
  [-7, 59],
  [3, 59],
  [-7, 66],
  [3, 66],
  [-7, 79],
  [3, 79],
];
export const HOME_GARDEN_TREES = treeSites.filter(
  ([x, z]) =>
    !forest.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 4) &&
    !existing.some((plot) => Math.hypot(plot.x - x, plot.z - z) < 3.5) &&
    !HOME_FLOWER_BEDS.some(
      ([cx, cz, w, d]) =>
        Math.abs(x - cx) < w / 2 + 1 && Math.abs(z - cz) < d / 2 + 1,
    ) &&
    !HOME_GARDEN_WALKS.some(
      ([cx, cz, w, d]) =>
        Math.abs(x - cx) < w / 2 + 1 && Math.abs(z - cz) < d / 2 + 1,
    ),
);

// Only actual raised beds and trunks block movement; grounds/walks do not.
export const HOME_GARDEN_OBSTACLES = [
  ...HOME_FLOWER_BEDS.map(([x, z, w, d]) => [x, z, w / 2, d / 2] as const),
  ...HOME_GARDEN_TREES.map(([x, z]) => [x, z, 0.36, 0.36] as const),
];
export const HOME_GARDEN_FOOTPRINTS = [
  ...HOME_GARDEN_GROUNDS,
  ...HOME_GARDEN_WALKS,
];
