import {
  HOME_FLOWER_BEDS,
  HOME_GARDEN_GROUNDS,
  HOME_GARDEN_TREES,
  HOME_GARDEN_WALKS,
} from "../core/homeGardens";
import { NaturalTrees, type TreePlacement } from "./TreeArt";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

const parts: SceneryPart[] = [];
const add = (
  p: SceneryPart["p"],
  s: SceneryPart["s"],
  c: string,
  shape: SceneryPart["shape"] = "stone",
) => parts.push({ p, s, c, shape });

// Separate, ordered depth intervals: gravel below paths below planting edging.
for (const [x, z, w, d] of HOME_GARDEN_GROUNDS)
  add([x, 0.143, z], [w, 0.028, d], "#92916b");
for (const [x, z, w, d] of HOME_GARDEN_WALKS)
  add([x, 0.168, z], [w, 0.035, d], "#ad9f82", "block");

HOME_FLOWER_BEDS.forEach(([x, z, w, d], index) => {
  add([x, 0.33, z], [w, 0.34, d], "#8e8262");
  add([x, 0.515, z], [w - 0.4, 0.025, d - 0.4], "#635e44", "block");
  for (const side of [-1, 1]) {
    add([x + side * (w / 2 - 0.13), 0.55, z], [0.26, 0.2, d], "#b8aa86");
    add([x, 0.55, z + side * (d / 2 - 0.13)], [w, 0.2, 0.26], "#b8aa86");
  }
  // Broad planted ribbons are readable from overview; no random lawn confetti.
  const columns = Math.max(1, Math.floor((w - 0.5) / 1.5));
  const rows = Math.max(1, Math.floor((d - 0.5) / 1.5));
  for (let col = 0; col < columns; col++)
    for (let row = 0; row < rows; row++) {
      const px = x + (col - (columns - 1) / 2) * 1.45;
      const pz = z + (row - (rows - 1) / 2) * 1.45;
      const palette = index % 3;
      add(
        [px, 0.83, pz],
        [0.77, 0.42, 0.72],
        palette === 1 ? "#7d8c65" : "#657c55",
        "rock",
      );
      add(
        [px, 1.12, pz],
        [0.48, 0.34, 0.47],
        ["#9d8b9c", "#b0b490", "#bf9563"][palette],
        "rock",
      );
    }
});

const trees: TreePlacement[] = HOME_GARDEN_TREES.map(([x, z], i) => ({
  p: [x, 0, z],
  size: 0.9 + (i % 3) * 0.06,
  variant: i % 3,
}));
for (const [x, z] of HOME_GARDEN_TREES) {
  add([x, 0.18, z], [2.4, 0.08, 2.4], "#7c7755", "rock");
  for (let j = 0; j < 4; j++)
    add(
      [
        x + Math.cos(j * 1.57) * 1.1,
        2.7 + (j % 2) * 0.45,
        z + Math.sin(j * 1.57),
      ],
      [0.23, 0.24, 0.23],
      "#bf8950",
      "rock",
    );
}

/** Home-only outdoor rooms: connected flower courts, pond garden and fruit walk. */
export function HomeGardens() {
  return (
    <group name="home-planted-courts-and-fruit-walk">
      <WorldSceneryParts parts={parts} />
      <NaturalTrees trees={trees} />
    </group>
  );
}
