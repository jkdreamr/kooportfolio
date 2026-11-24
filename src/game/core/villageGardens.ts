import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import { isKoreaGardenWalk, isKoreaLandmarkArea } from "./koreaLandmarks";
import type { WorldId } from "./worlds";
import { POND } from "./pond";
import { isStanfordTownSpace } from "./stanfordLayout";
import { KOREA_EXERCISE_YARD } from "./regionalActivities";

type Plot = {
  x: number;
  z: number;
  orchard: boolean;
  worlds: readonly WorldId[];
};
const all: readonly WorldId[] = ["home", "stanford", "korea"];
const domestic: readonly WorldId[] = ["home", "stanford"];
const korea: readonly WorldId[] = ["korea"];
const plots: Plot[] = [];
const nearPlot = (x: number, z: number, world: WorldId) =>
  plots.some(
    (plot) =>
      plot.worlds.includes(world) && Math.hypot(plot.x - x, plot.z - z) < 2.8,
  );

// Deliberate orchard/crop districts, not random props or anonymous buildings.
// Aisles stay open, and each physical bed/trunk has one matching collider.
const districts: readonly (readonly [
  number,
  number,
  number,
  number,
  boolean,
  readonly WorldId[],
])[] = [
  [-60, -22, 4, 4, true, all],
  [60, -24, 4, 4, false, all],
  [-59, 23, 4, 4, true, all],
  [58, 25, 4, 4, false, domestic],
  [-25, -46, 6, 2, true, all],
  [13, -43, 10, 3, true, all],
  [46, -43, 5, 3, true, all],
  [-31, 77, 7, 3, true, all],
  [22, 81, 9, 3, false, all],
  [47, 65, 4, 3, true, ["home", "korea"]],
  [-57, -6, 6, 2, false, all],
  // The Home coast has no skate arena: use that whole district, not a bare
  // lawn reserved for a building which only exists at Stanford.
  [-48, 40, 8, 3, true, ["home"]],
  [-44, 60, 9, 4, false, ["home"]],
  [-21, 61, 4, 4, true, all],
  [-50, 2, 6, 2, false, all],
  [30, -36, 4, 2, false, domestic],
];

function reserved(x: number, z: number, world: WorldId) {
  return (
    (world === "stanford" && isStanfordTownSpace(x, z, 2)) ||
    Math.abs(x) < 4 ||
    Math.abs(z + 9) < 3 ||
    Math.abs(z - 10) < 3 ||
    Math.abs(z - 29) < 3 ||
    (Math.abs(x + 38) < 8 && Math.abs(z + 39) < 7) ||
    (Math.abs(x) < 7 && Math.abs(z + 46) < 6) ||
    (Math.abs(x + 19) < 9 && Math.abs(z + 38) < 9) ||
    (Math.abs(x + 28) < 5 && Math.abs(z + 48) < 5) ||
    (Math.abs(x - 58) < 12 && Math.abs(z - 57) < 15) ||
    (Math.abs(x - POND.x) < POND.radiusX + 2 &&
      Math.abs(z - POND.z) < POND.radiusZ + 2) ||
    (world === "stanford" && Math.abs(x + 50) < 19 && Math.abs(z - 50) < 16)
  );
}

for (const [cx, cz, cols, rows, orchard, worlds] of districts) {
  for (let col = 0; col < cols; col++)
    for (let row = 0; row < rows; row++) {
      const x = cx + (col - (cols - 1) / 2) * 4.2;
      const z = cz + (row - (rows - 1) / 2) * 5;
      if (
        (x / (WORLD_ELLIPSE.radiusX - 5)) ** 2 +
          ((z - WORLD_ELLIPSE.centerZ) / (WORLD_ELLIPSE.radiusZ - 5)) ** 2 >
        0.93
      )
        continue;
      const visibleWorlds = worlds.filter(
        (world) => !reserved(x, z, world) && !nearPlot(x, z, world),
      );
      if (visibleWorlds.length)
        plots.push({ x, z, orchard, worlds: visibleWorlds });
    }
}

// Groves and allotments flank the landmark walks and the path to the picnic deck.
const koreaGardenDistricts = [
  [-51, -27, 4, 3, true],
  [-34, -45, 4, 2, true],
  [-55, -5.5, 4, 3, false],
  [-35.5, -24.25, 4, 3, true],
  [-41.5, -7.5, 3, 2, false],
  [-29.4, 3, 2, 2, false],
  [-12.5, -22.75, 4, 2, false],
  [-15.1, -1, 2, 4, true],
  [-8.8, -1, 1, 4, false],
  [16, -7.5, 2, 3, false],
  [30, -13, 4, 3, true],
  [-75, 26, 1, 5, true],
  [-65.2, 43, 4, 3, true],
  [-54.6, 38.8, 2, 1, false],
  [-48.5, 24, 3, 3, false],
  [-31.6, 25, 5, 3, true],
  [-36.1, 36.8, 2, 1, false],
] as const;
for (const [cx, cz, cols, rows, orchard] of koreaGardenDistricts) {
  for (let col = 0; col < cols; col++)
    for (let row = 0; row < rows; row++) {
      const x = cx + (col - (cols - 1) / 2) * 4.2;
      const z = cz + (row - (rows - 1) / 2) * 5;
      if (
        (x / (WORLD_ELLIPSE.radiusX - 3)) ** 2 +
          ((z - WORLD_ELLIPSE.centerZ) / (WORLD_ELLIPSE.radiusZ - 3)) ** 2 <
          1 &&
        !nearPlot(x, z, "korea")
      )
        plots.push({ x, z, orchard, worlds: korea });
    }
}

const [yardX, yardZ, yardWidth, yardDepth] = KOREA_EXERCISE_YARD;
function koreaPlotClear(x: number, z: number, orchard: boolean) {
  const mx = orchard ? 0.65 : 0.85;
  const mz = orchard ? 0.65 : 1.5;
  return (
    !isKoreaLandmarkArea(x, z, 2) &&
    !isKoreaGardenWalk(x, z, mx, mz) &&
    (Math.abs(x - yardX) >= yardWidth / 2 + mx ||
      Math.abs(z - yardZ) >= yardDepth / 2 + mz)
  );
}

export function villageGardenPlots(world: WorldId) {
  return plots.filter(
    ({ worlds, x, z, orchard }) =>
      worlds.includes(world) &&
      (world !== "korea" || koreaPlotClear(x, z, orchard)),
  );
}

export function villageGardenSolids(world: WorldId) {
  return villageGardenPlots(world).map(
    ({ x, z, orchard }) =>
      [x, z, orchard ? 0.35 : 0.85, orchard ? 0.35 : 1.5] as const,
  );
}
