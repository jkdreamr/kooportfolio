import { NaturalTrees, type TreePlacement } from "./TreeArt";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

const parts: SceneryPart[] = [];
const shrubs: SceneryPart[] = [];
const trees: TreePlacement[] = [];
export const HOME_SCENERY_TREES: readonly TreePlacement[] = trees;
/** Solid decorative footprints passed to the integrator; lanes and gates stay open. */
const homeObstacles: [number, number, number, number][] = [
  [-58, -25, 8.5, 6.5],
  [57, -25, 8.5, 6.5],
  [-57, 24, 8.5, 6.5],
  [58, 27, 8.5, 6.5],
];
export const HOME_YARD_OBSTACLES: readonly (readonly [
  number,
  number,
  number,
  number,
])[] = homeObstacles;

function block(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  c: string,
) {
  parts.push({ p: [x, y, z], s: [sx, sy, sz], c });
}
function fence(x: number, z: number, length: number, turn = false) {
  homeObstacles.push([x, z, turn ? 0.2 : length / 2, turn ? length / 2 : 0.2]);
  const rotate = (dx: number, dz: number): [number, number] =>
    turn ? [x + dz, z + dx] : [x + dx, z + dz];
  for (let i = 0; i <= length; i += 1.6) {
    const [px, pz] = rotate(i - length / 2, 0);
    block(px, 1.05, pz, 0.2, 1.8, 0.2, "#877357");
    block(px, 1.98, pz, 0.28, 0.12, 0.28, "#b29a74");
  }
  for (const y of [0.75, 1.52]) {
    parts.push({
      p: [x, y, z],
      s: turn ? [0.12, 0.14, length] : [length, 0.14, 0.12],
      c: "#a28b65",
    });
  }
  for (let i = 0; i < length; i += 0.42) {
    const [px, pz] = rotate(i - length / 2, 0);
    parts.push({
      p: [px, 1.12, pz],
      s: turn ? [0.095, 1.45, 0.28] : [0.28, 1.45, 0.095],
      c: (i * 10) % 3 > 1 ? "#9a805e" : "#a98f6b",
    });
  }
}
// Low-eave, post-and-beam neighborhood houses: context, not interactive rooms.
for (const [x, z, variant] of [
  [-58, -25, 0],
  [57, -25, 1],
  [-57, 24, 1],
  [58, 27, 0],
] as const) {
  const w = Math.abs(x) > 56 ? 16 : 14;
  block(x, 0.17, z + 10, w + 4, 0.05, 7, "#849364");
  block(x, 0.195, z + 6.7, w + 2.5, 0.045, 1.3, "#b1a48a");
  block(x, 0.24, z, w + 1.2, 0.38, 12, "#aaa18c");
  block(x, 2.15, z, w, 3.8, 10, variant ? "#d2c6a8" : "#bfb49b");
  block(x, 4.2, z, w + 2, 0.38, 12, "#555e58");
  block(x, 4.45, z - 1.2, w + 1.7, 0.16, 9.3, "#69736a");
  // Cedar siding, wide glass bays, an inset porch and broad roof fascia.
  for (let i = 0; i < 15; i++)
    block(
      x - w / 2 + 0.25 + (i * (w - 0.5)) / 14,
      2.1,
      z + 5.05,
      0.12,
      3.4,
      0.11,
      "#9c8665",
    );
  for (let i = -1; i <= 1; i++) {
    block(x + i * 3.5, 2.3, z + 5.12, 3.1, 2.5, 0.11, "#587774");
    block(x + i * 3.5, 2.3, z + 5.2, 0.11, 2.6, 0.08, "#ded2b9");
    block(x + i * 3.5, 1, z + 5.2, 3.2, 0.12, 0.12, "#e2d8c0");
  }
  for (const dx of [-w / 2 + 0.55, w / 2 - 0.55]) {
    block(x + dx, 2.1, z + 5.6, 0.22, 4.1, 0.22, "#73664f");
  }
  block(x + w / 2 - 2, 1.5, z + 5.25, 1.3, 2.7, 0.2, "#765c45");
  block(x + w / 2 - 1.55, 1.45, z + 5.4, 0.1, 0.12, 0.1, "#c4ad74");
  block(x - w / 2 + 2.3, 4.9, z - 2, 1.6, 1.5, 1.5, "#9e8e76");
  block(x - w / 2 + 2.3, 5.7, z - 2, 1.9, 0.18, 1.8, "#696b5e");
  // Succulents, flax blades and low bunchgrass leave coherent planted beds.
  for (let i = 0; i < 8; i++) {
    const px = x - w / 2 + 1 + (i * (w - 2)) / 7;
    shrubs.push({
      p: [px, 0.55, z + 6],
      s: [0.65, 0.4, 0.45],
      c: i % 2 ? "#72815c" : "#8b9366",
      shape: "rock",
    });
    for (let j = 0; j < 3; j++)
      shrubs.push({
        p: [px + Math.sin(j * 2.4) * 0.25, 0.9, z + 6.2],
        s: [0.08, 1, 0.14],
        r: [0.3 * Math.cos(j * 2.4), 0, 0.4 * Math.sin(j * 2.4)],
        c: "#6b7d54",
        shape: "block",
      });
  }
  trees.push({ p: [x - w / 2 + 2, 0, z - 7], size: 1.6, variant: 2 });
  trees.push({ p: [x + w / 2 - 1.5, 0, z - 8], size: 1.8, variant: 1 });
}
fence(-66.75, -13, 3.5);
fence(-53.25, -13, 11.5);
fence(-68.3, -20, 14, true);
fence(51.25, -13, 9.5);
fence(64.75, -13, 5.5);
fence(67.3, -20, 14, true);

// Residential asphalt with concrete gutters, scored sidewalks and driveway cuts.
block(0, 0.19, 1, 143, 0.045, 7.2, "#676d6a");
for (const side of [-1, 1]) {
  block(0, 0.23, 1 + side * 3.75, 143, 0.12, 0.32, "#c6c1ad");
  block(0, 0.21, 1 + side * 5.25, 143, 0.07, 2.55, "#bdbba9");
  for (let x = -71; x < 72; x += 2.4)
    parts.push({
      p: [x, 0.251, 1 + side * 5.25],
      s: [0.018, 0.012, 2.5],
      c: "#9b9e91",
      shape: "block",
    });
}
// Deliberate crossings at main village lanes instead of paint everywhere.
for (const x of [-43, 0, 43]) {
  for (let z = -1.8; z < 4; z += 0.9)
    block(x, 0.224, z, 3.2, 0.015, 0.5, "#d4d1b9");
}
for (const x of [-62, 59]) {
  block(x, 0.22, -7, 5.7, 0.06, 12, "#b5b4a2");
  block(x + 3.8, 1.15, -9, 0.13, 2, 0.13, "#686c60");
  block(x + 3.8, 2.1, -9, 0.65, 0.4, 0.6, "#4c5e59");
}
// Recessed drainage grates keep street detailing functional rather than ornamental.
for (const x of [-66, -30, 28, 66]) {
  block(x, 0.255, 4.4, 1.1, 0.025, 0.55, "#545e5a");
  for (let i = 0; i < 5; i++)
    block(x - 0.4 + i * 0.2, 0.273, 4.4, 0.04, 0.018, 0.48, "#899288");
}

// Rear groves stay rooted inside the ellipse and leave the Writing room clear.
for (const [i, [x, z]] of [
  [-54, -45],
  [-42, -56],
  [-21, -63],
  [14, -61],
  [43, -49],
].entries()) {
  for (const [j, [dx, dz]] of [
    [0, 0],
    [3, -3],
    [-2, -5],
  ].entries())
    trees.push({
      p: [x + dx, 0, z + dz],
      size: 1.2 + ((i + j) % 4) * 0.1,
      variant: 0,
      species: "redwood",
    });
}

export function HomeNeighborhood() {
  return (
    <group name="bay-area-neighborhood">
      <WorldSceneryParts parts={parts} />
      <WorldSceneryParts parts={shrubs} />
      <NaturalTrees trees={trees} />
    </group>
  );
}
