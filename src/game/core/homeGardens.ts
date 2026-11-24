import type { GroundFootprint } from "./scenery";
import { forest } from "./scenery";
import { villageGardenPlots } from "./villageGardens";

// Full-size outdoor rooms between the real destinations, not extra buildings.
// Dimensions are shared by rendered planting and the walkable aisles/collision.
export const HOME_FLOWER_BEDS: readonly GroundFootprint[] = [
  [-20, 2, 14, 8], // Reading garden; the record-shop errand stays north of it.
  [-42, -21, 12, 16], // Cinema's western approach.
  [16, -25, 6, 13],
  [28, -25, 6, 13],
  [17, 0, 13, 11], // Four planted courts, with a generous cross-shaped walk.
  [40, 0, 13, 11],
  [17, 18, 13, 10],
  [40, 18, 13, 10],
  [-20, 24, 10, 5], // Go garden: leave its players' west-side loop clear.
  [-11, 41, 11, 16], // Pond-side flowers, outside the water/stone bank.
  [4.7, 44.5, 1.2, 12], // Allotment edges leave a gap for the cross-walk.
  [4.7, 58, 1.2, 9],
  [10.5, 64, 13, 2],
  [31.5, 64, 16, 2],
];

export const HOME_GARDEN_GROUNDS: readonly GroundFootprint[] = [
  [-24, 1, 25, 15],
  [-42, -21, 18, 23],
  [22, -25, 25, 19],
  [28, 7, 42, 33],
  [-14, 41, 21, 23],
  [21, 49, 36, 30],
  [-4, 68, 26, 23],
];

export const HOME_GARDEN_WALKS: readonly GroundFootprint[] = [
  [-24, 7.5, 29, 3],
  [-35, -5, 3, 25],
  [-42, -10, 16, 3],
  [22, -16.8, 27, 3],
  [29, 10, 3.2, 34.4],
  [25, 10, 50, 3.4],
  [50, 10, 3, 38],
  [-3, 52, 3, 43],
  [1, 52, 38, 3],
  [-4, 73, 24, 3],
];

const existing = villageGardenPlots("home");
const treeSites: readonly (readonly [number, number])[] = [
  [-32, 1],
  [-30, 4],
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
