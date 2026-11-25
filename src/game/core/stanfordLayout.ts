import { onStanfordLand } from "../../shared/stanford-ground";
import { STANFORD_TELESCOPE } from "../../shared/stanford-transport";

/** Full-size destinations share the campus frontage, rather than a village-wide grid. */
export const STANFORD_BUILDINGS = {
  gym: [5, 14.5],
  kappa: [17, 14.5],
  math: [28.5, 14.5],
  badminton: [41, 14.5],
  basketball: [-8, 29],
  boathouse: [-8, 42],
  skate: [-25, 61],
} as const;

// [center X, center Z, width, depth]. Short front walks feed two shared streets.
export const STANFORD_WALKS: readonly (readonly [
  number,
  number,
  number,
  number,
])[] = [
  [20, 21.7, 52, 3.4],
  [-1.5, 13, 2.5, 18],
  [-2, 44, 2.5, 44],
  [-5, 32.2, 8, 2.3],
  [-17, 47.2, 33, 2.2],
  [-8, 46.5, 2.5, 2],
  [5, 20.5, 2.7, 3],
  [17, 20.5, 2.7, 3],
  [28.5, 20.3, 2.7, 3.4],
  [41, 20.5, 2.7, 3],
  // Station and telescope share the campus frontage, without long land arms.
  [-12, 21.7, 23, 2.8],
  [45, 41, 2.5, 39],
  [51.5, 61, 15.5, 2.5],
  [-12, 17.5, 2.5, 8],
];

/** Clear the actual town and its walks, not a second layer of filler planting. */
export function isStanfordTownSpace(x: number, z: number, margin = 0) {
  return (
    Math.hypot(x - STANFORD_TELESCOPE[0], z - STANFORD_TELESCOPE[1]) <
      9 + margin ||
    (x > -44 - margin &&
      x < 49 + margin &&
      z > 8 - margin &&
      z < 78 + margin) ||
    STANFORD_WALKS.some(
      ([cx, cz, width, depth]) =>
        Math.abs(x - cx) < width / 2 + margin &&
        Math.abs(z - cz) < depth / 2 + margin,
    )
  );
}

/** Rendering and trunk collision must agree when clearing trees off the shore. */
export const isStanfordTreeSite = (x: number, z: number) =>
  !isStanfordTownSpace(x, z, 3) && onStanfordLand(x, z, 5);

// Residents stay by the moved destinations; other islands keep their authored routines.
export const STANFORD_NPC_WALKS: Record<string, [number, number][]> = {
  mapmaker: [
    [11, 21.4],
    [20, 21.4],
    [25, 25.5],
    [20, 28],
    [14, 25],
  ],
  boathouse: [
    [-8, 47],
    [-3, 47],
    [-3, 36.5],
    [-14, 36.5],
    [-14, 47],
  ],
  basketball: [
    [-8, 33.5],
    [-3, 33.5],
    [-3, 27],
    [-8, 25],
  ],
  gym: [
    [3, 22.3],
    [7, 22.3],
    [9, 24.5],
    [3, 24.5],
  ],
  kappa: [
    [14, 21.5],
    [19, 21.5],
    [21, 24],
    [14, 25],
  ],
  math: [
    [26, 21.8],
    [30, 22.4],
    [32, 25],
    [27, 25],
  ],
  badminton: [
    [39, 21.8],
    [44, 22],
    [44, 28],
    [40, 28],
  ],
  skate: [
    [-35, 47],
    [-25, 47],
    [-16, 47],
    [-16, 48],
  ],
};
