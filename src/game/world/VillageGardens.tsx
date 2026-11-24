import { useMemo } from "react";
import { villageGardenPlots } from "../core/villageGardens";
import type { WorldId } from "../core/worlds";
import { NaturalTrees, type TreePlacement } from "./TreeArt";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

export function VillageGardens({ world }: { world: WorldId }) {
  const { parts, trees } = useMemo(() => {
    const parts: SceneryPart[] = [];
    const trees: TreePlacement[] = [];
    villageGardenPlots(world).forEach(({ x, z, orchard }, i) => {
      if (orchard) {
        trees.push({
          p: [x, 0, z],
          size: 0.77 + (i % 3) * 0.055,
          variant: i % 3,
        });
        // Mulch bowls and a few readable fruit clusters, not lawn confetti.
        parts.push({
          p: [x, 0.18, z],
          s: [1.3, 0.05, 1.3],
          c: "#80784a",
          shape: "rock",
        });
        for (let fruit = 0; fruit < 3; fruit++)
          parts.push({
            p: [
              x + Math.cos(fruit * 2.1) * 1.1,
              2.3 + fruit * 0.22,
              z + Math.sin(fruit * 2.1),
            ],
            s: [0.18, 0.19, 0.18],
            c: i % 2 ? "#d9aa49" : "#ba633e",
            shape: "rock",
          });
      } else {
        parts.push({ p: [x, 0.35, z], s: [1.7, 0.4, 3], c: "#826844" });
        parts.push({
          p: [x, 0.57, z],
          s: [1.42, 0.05, 2.7],
          c: "#64583a",
          shape: "block",
        });
        for (let row = 0; row < 4; row++)
          for (const side of [-1, 1]) {
            parts.push({
              p: [x + side * 0.36, 0.85, z - 0.95 + row * 0.64],
              s: [0.37, 0.36, 0.38],
              c: i % 3 ? "#74944d" : "#a1a55a",
              shape: "rock",
            });
            if (i % 3 === 0)
              parts.push({
                p: [x + side * 0.36, 1.04, z - 0.95 + row * 0.64],
                s: [0.14, 0.13, 0.14],
                c: "#d58a42",
                shape: "rock",
              });
          }
      }
    });
    return { parts, trees };
  }, [world]);
  return (
    <group name="village-orchards-and-allotments">
      <WorldSceneryParts parts={parts} />
      <NaturalTrees trees={trees} />
    </group>
  );
}
