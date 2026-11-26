import { useMemo } from "react";
import {
  KitPieces,
  barrel,
  chimney,
  crate,
  flagstones,
  planks,
  rivetedDoor,
  rowboat,
  arcade,
  shutters,
  tub,
  type KitPiece,
} from "./ArchitectureKit";

/**
 * Per-building craft layer: board cladding with per-plank variance, riveted
 * round-top doors, shutters, flagstone approaches and the working clutter of
 * a lived-in village (tubs, barrels, crates, rowboats). Coordinates are in
 * each landmark's local frame (front faces +z), inside its StaticBatch, so a
 * building still bakes to a single draw. Props stay inside the footprint
 * skirt or beside walls: no walking route or door approach is blocked.
 */

type Spec = {
  wood: KitPiece[];
  paint: KitPiece[];
  stone: KitPiece[];
  metal: KitPiece[];
};
const empty = (): Spec => ({ wood: [], paint: [], stone: [], metal: [] });

/** The Study (home) and Boathouse (Stanford) cabin facade. */
export function houseCraft(study: boolean): Spec {
  const s = empty();
  const wall = study ? "#b88d5e" : "#9c6b45";
  const front = planks({
    center: [0, 0, 2.05],
    width: 5.5,
    y0: 0.9,
    height: 2.5,
    color: wall,
    openings: [
      [-0.85, 0.85, -1, 2.45],
      [-2.5, -1.0, 0.25, 1.75],
      [1.0, 2.5, 0.25, 1.75],
      [-1.3, 1.3, 1.95, 2.6],
    ],
  });
  const sides = [-1, 1].flatMap((side) =>
    planks({
      center: [side * 2.9, 0, 0],
      width: 3.8,
      y0: 0.9,
      height: 2.5,
      axis: "x",
      normal: side as 1 | -1,
      color: wall,
    }),
  );
  s.wood.push(...front, ...sides);
  s.paint.push(
    ...rivetedDoor({
      p: [0, 0.12, 2.09],
      color: study ? "#5b84a6" : "#4f7fa3",
    }),
    ...shutters({
      p: [-1.75, 1.85, 2.2],
      width: 0.8,
      color: study ? "#4f7566" : "#6d8fa3",
    }),
    ...shutters({
      p: [1.75, 1.85, 2.2],
      width: 0.8,
      color: study ? "#4f7566" : "#6d8fa3",
    }),
  );
  s.stone.push(...flagstones(0, 3.4, 5.6, 0.22, 1.5));
  s.wood.push(
    ...tub([2.75, 0.2, 2.75], 0.36, 0.38),
    ...crate([-3.25, 0.2, 1.4], 0.55, 0.3),
    ...crate([-3.2, 0.75, 1.45], 0.42, -0.2, "#b48a5a"),
  );
  if (!study) {
    s.wood.push(
      ...rowboat([4.1, 0.2, -0.6], 0.15),
      ...barrel([-3.4, 0.2, -0.6]),
      ...tub([3.4, 0.2, 2.1], 0.3, 0.32),
    );
  } else {
    s.wood.push(...barrel([-3.35, 0.2, -0.4], 0.4));
  }
  return s;
}

/** Village landmarks in the Home world. */
const HOME: Record<string, () => Spec> = {
  kitchen: () => {
    const s = empty();
    s.wood.push(
      ...[-1, 1].flatMap((side) =>
        planks({
          center: [side * 2.25, 0, 0],
          width: 3.5,
          y0: 0.5,
          height: 2.55,
          axis: "x",
          normal: side as 1 | -1,
          color: "#b07a48",
        }),
      ),
      ...barrel([-2.7, 0.2, 1.2], 0.6),
      ...crate([-2.75, 0.2, 0.3], 0.5, 0.2, "#b98b52"),
      ...tub([2.75, 0.2, 0.2], 0.32, 0.36, false),
    );
    s.paint.push(
      ...shutters({ p: [-1.5, 1.8, 2.0], width: 0.8, color: "#5f7a46" }),
      ...shutters({ p: [1.5, 1.8, 2.0], width: 0.8, color: "#5f7a46" }),
    );
    s.stone.push(...flagstones(0, 3.15, 4.9, 0.22, 1.3));
    return s;
  },
  office: () => empty(),
  writing: () => {
    const s = empty();
    s.wood.push(
      ...[-1, 1].flatMap((side) =>
        planks({
          center: [side * 3.5, 0, 0],
          width: 4.5,
          y0: 1.75,
          height: 2.8,
          axis: "x",
          normal: side as 1 | -1,
          color: "#8f6a43",
          board: 0.34,
        }),
      ),
      ...crate([3.95, 0.2, 1.7], 0.6, 0.4),
      ...crate([3.9, 0.8, 1.75], 0.45, -0.1, "#c29a66"),
      ...barrel([-3.95, 0.2, 1.6], 0.2),
    );
    s.paint.push(
      ...shutters({
        p: [-2.2, 2.7, 2.7],
        width: 1.3,
        height: 1.25,
        color: "#3f6b5a",
      }),
      ...shutters({
        p: [2.2, 2.7, 2.7],
        width: 1.3,
        height: 1.25,
        color: "#3f6b5a",
      }),
    );
    s.stone.push(...flagstones(0, 3.75, 5.6, 0.22, 1.6));
    return s;
  },
  music: () => {
    const s = empty();
    s.wood.push(
      ...[-1, 1].flatMap((side) =>
        planks({
          center: [side * 3.1, 0, 0],
          width: 3.9,
          y0: 0.95,
          height: 2.75,
          axis: "x",
          normal: side as 1 | -1,
          color: "#a4623b",
        }),
      ),
      ...crate([-3.55, 0.2, 1.5], 0.55, 0.25, "#7f5f9a"),
      ...tub([3.6, 0.2, 1.5], 0.33, 0.36),
    );
    s.stone.push(...flagstones(0, 3.0, 4.9, 0.22, 1.4));
    return s;
  },
  go: () => {
    const s = empty();
    s.wood.push(
      ...[-1, 1].flatMap((side) =>
        planks({
          center: [side * 3.25, 0, 0],
          width: 4.3,
          y0: 1.02,
          height: 2.35,
          axis: "x",
          normal: side as 1 | -1,
          color: "#9f8152",
          board: 0.26,
        }),
      ),
      ...barrel([3.75, 0.2, 1.7], 0.1),
      ...barrel([3.75, 0.2, 0.95], 1.1),
    );
    s.stone.push(...chimney([-2.2, 3.7, -1.3], 1.5, "#8d8478"));
    s.stone.push(...flagstones(0, 3.25, 5.1, 0.22, 1.5));
    return s;
  },
  theater: () => {
    const s = empty();
    s.wood.push(
      ...crate([-5.4, 0.2, 2.9], 0.6, 0.2, "#8a5a46"),
      ...barrel([5.4, 0.2, 2.9]),
    );
    return s;
  },
};

/** Stanford: sandstone arcades and red tile, the Main Quad vocabulary. */
const STANFORD: Record<string, () => Spec> = {
  math: () => {
    const s = empty();
    s.stone.push(
      ...arcade({ z: 2.1, columns: [-3.0, -1.1, 1.1, 3.0], height: 2.3 }),
    );
    s.stone.push(...flagstones(0, 3.6, 5.2, 0.22, 1.6));
    s.wood.push(
      ...barrel([-3.6, 0.2, -1.2]),
      ...crate([3.6, 0.2, -1.4], 0.55, 0.3),
    );
    return s;
  },
  gym: () => {
    const s = empty();
    s.stone.push(
      ...arcade({
        z: 2.4,
        columns: [-2.75, -1.05, 1.05, 2.75],
        height: 2.0,
        depth: 1.1,
      }),
    );
    s.wood.push(...crate([-3.3, 0.2, 1.8], 0.55, 0.3, "#5f7d8a"));
    return s;
  },
};

export function BuildingDressing({ id, world }: { id: string; world: string }) {
  const spec = useMemo(() => {
    if (world === "home") return HOME[id]?.() ?? null;
    if (world === "stanford") return STANFORD[id]?.() ?? null;
    return null;
  }, [id, world]);
  if (!spec) return null;
  return <SpecPieces spec={spec} />;
}

export function SpecPieces({ spec }: { spec: Spec }) {
  return (
    <group name="building-craft">
      <KitPieces pieces={spec.wood} material="wood" />
      <KitPieces pieces={spec.paint} material="paint" />
      <KitPieces pieces={spec.stone} material="stone" />
      <KitPieces pieces={spec.metal} material="metal" />
    </group>
  );
}

export function HouseCraft({ study }: { study: boolean }) {
  const spec = useMemo(() => houseCraft(study), [study]);
  return <SpecPieces spec={spec} />;
}
