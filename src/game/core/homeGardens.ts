import type { GroundFootprint } from "./scenery";
import { villageGardenPlots } from "./villageGardens";

// Full-size outdoor rooms between the real destinations, not extra buildings.
// Dimensions are shared by rendered planting and the walkable aisles/collision.
export const HOME_FLOWER_BEDS: readonly GroundFootprint[] = [
  [-31, -25, 1.2, 8], // Narrow planted edges, never a district between shops.
  [20, -25, 1.2, 8],
  [-30, -9, 1.2, 8],
  [11, -10, 1.2, 8],
];

export const HOME_GARDEN_GROUNDS: readonly GroundFootprint[] = [
  [-6, -17, 52, 28], // One continuous village block, not separate landmark pads.
  [-13, 3.5, 24, 17], // Four working kitchen allotments, directly off the street.
  [10, 2, 13, 11], // Reading pergola, beside the village square.
];

export const HOME_GARDEN_WALKS: readonly GroundFootprint[] = [
  [-6, -18, 44, 3.2],
  [-10, -5, 38, 3.2],
  [-4.5, -11.5, 3, 13],
  [-32.5, -8, 3, 20],
  [18, -11.5, 2.8, 13],
  [-13, 3.5, 2.2, 17],
  [-13, 3.5, 24, 1.6],
];

const existing = villageGardenPlots("home");
const treeSites: readonly (readonly [number, number])[] = [
  [-34, -37],
  [-29, -40],
  [-9, -44],
  [-1, -43],
  [21, -34],
  [-37, -4],
  [-30, 4],
  [22, 0],
];
export const HOME_GARDEN_TREES = treeSites.filter(
  ([x, z]) =>
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
