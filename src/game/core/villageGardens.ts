import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import type { WorldId } from "./worlds";

type Plot = {
  x: number;
  z: number;
  orchard: boolean;
  worlds: readonly WorldId[];
};
const all: readonly WorldId[] = ["home", "stanford", "korea"];
const domestic: readonly WorldId[] = ["home", "stanford"];
const plots: Plot[] = [];

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
];

function reserved(x: number, z: number) {
  return (
    Math.abs(x) < 4 ||
    Math.abs(z + 9) < 3 ||
    Math.abs(z - 10) < 3 ||
    Math.abs(z - 29) < 3 ||
    (Math.abs(x + 38) < 8 && Math.abs(z + 39) < 7) ||
    (Math.abs(x) < 7 && Math.abs(z + 46) < 6) ||
    (Math.abs(x + 19) < 9 && Math.abs(z + 38) < 9) ||
    (Math.abs(x + 28) < 5 && Math.abs(z + 48) < 5) ||
    (Math.abs(x - 58) < 12 && Math.abs(z - 57) < 15) ||
    (Math.abs(x + 50) < 19 && Math.abs(z - 50) < 16)
  );
}

for (const [cx, cz, cols, rows, orchard, worlds] of districts) {
  for (let col = 0; col < cols; col++)
    for (let row = 0; row < rows; row++) {
      const x = cx + (col - (cols - 1) / 2) * 4.2;
      const z = cz + (row - (rows - 1) / 2) * 5;
      if (
        reserved(x, z) ||
        (x / (WORLD_ELLIPSE.radiusX - 5)) ** 2 +
          ((z - WORLD_ELLIPSE.centerZ) / (WORLD_ELLIPSE.radiusZ - 5)) ** 2 >
          0.93
      )
        continue;
      plots.push({ x, z, orchard, worlds });
    }
}

export function villageGardenPlots(world: WorldId) {
  return plots.filter((plot) => plot.worlds.includes(world));
}

export function villageGardenSolids(world: WorldId) {
  return villageGardenPlots(world).map(
    ({ x, z, orchard }) =>
      [x, z, orchard ? 0.35 : 0.85, orchard ? 0.35 : 1.5] as const,
  );
}
