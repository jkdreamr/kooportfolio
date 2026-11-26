import { useMemo } from "react";
import {
  KitPieces,
  hash,
  planks,
  tone,
  type KitPiece,
} from "../world/ArchitectureKit";

/**
 * Shared room craft for every walk-in interior: staggered floorboards with
 * per-board tone and length variance, board-and-batten wainscot over the
 * plaster on the two visible walls, a moulded dado rail and skirting, and
 * ceiling-height beams. Baked with the room's StaticBatch (one draw).
 */
export function InteriorCraft({
  width,
  depth,
  back,
  left,
  scene,
}: {
  width: number;
  depth: number;
  back: number;
  left: number;
  scene: string;
}) {
  const { wood, trim } = useMemo(() => {
    const wood: KitPiece[] = [],
      trim: KitPiece[] = [];
    const seed = scene.length * 7.3;
    // Floorboards: rows along x, staggered butt joints along z.
    const board = 0.42;
    const rows = Math.floor(width / board);
    for (let r = 0; r < rows; r++) {
      const x = -width / 2 + (r + 0.5) * (width / rows);
      let z = -depth / 2 + 0.15;
      let k = 0;
      while (z < depth / 2 - 0.15) {
        const len = Math.min(
          depth / 2 - 0.15 - z,
          1.6 + hash(r, k, seed) * 2.4,
        );
        const h = hash(r * 3.1, k, seed + 1);
        wood.push({
          p: [x, 0.025 + h * 0.006, z + len / 2],
          s: [(width / rows) * 0.95, 0.08, len - 0.03],
          c: tone(h > 0.85 ? "#b98f61" : "#c9a676", 0.86 + h * 0.2),
        });
        z += len;
        k++;
      }
    }
    // Wainscot boards on the back and left walls.
    wood.push(
      ...planks({
        center: [0, 0, back + 0.2],
        width: width - 0.6,
        y0: 0.55,
        height: 1.5,
        color: "#8a6644",
        board: 0.34,
      }),
      ...planks({
        center: [left + 0.2, 0, 0],
        width: depth - 0.6,
        y0: 0.55,
        height: 1.5,
        axis: "x",
        normal: 1,
        color: "#8a6644",
        board: 0.34,
      }),
    );
    trim.push(
      { p: [0, 2.1, back + 0.3], s: [width - 0.4, 0.12, 0.14], c: "#6e4f33" },
      { p: [left + 0.3, 2.1, 0], s: [0.14, 0.12, depth - 0.4], c: "#6e4f33" },
    );
    // Rafters running front-to-back, seen at the top of the walls.
    const beams = Math.max(3, Math.round(width / 3.2));
    for (let i = 0; i < beams; i++) {
      const x = -width / 2 + ((i + 0.5) * width) / beams;
      trim.push({
        p: [x, 5.25, back + 0.95],
        s: [0.3, 0.32, 1.3],
        c: tone("#6d4e33", 0.9 + hash(i, seed) * 0.2),
      });
    }
    return { wood, trim };
  }, [width, depth, back, left, scene]);
  return (
    <group name="interior-craft">
      <KitPieces pieces={wood} material="wood" />
      <KitPieces pieces={trim} material="wood" />
    </group>
  );
}
