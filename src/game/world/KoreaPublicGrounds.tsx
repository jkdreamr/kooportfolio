import * as THREE from "three";
import { POND } from "../core/pond";
import { NaturalTrees, type TreePlacement } from "./TreeArt";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

type Point = readonly [number, number];

function ground(name: string, color: string, outline: readonly Point[]) {
  const shape = new THREE.Shape(
    outline.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return { name, geometry, color };
}

const grounds = [
  ground("namsan-terrace", "#789172", [
    [-53, -28],
    [-39, -39],
    [-17, -46],
    [25, -41],
    [45, -34],
    [45, -28.4],
    [-28, -28.4],
    [-35, -24],
    [-53, -24],
  ]),
  ground("gwanghwamun-square", "#b8a897", [
    [-31.8, -13],
    [-7, -13],
    [-7, -7.7],
    [-5, -7.7],
    [-5, 10.2],
    [-28.2, 10.2],
    [-28.2, 5],
    [-31.8, 5],
  ]),
  ground("bukchon-courts", "#9c9b82", [
    [-57.3, -13],
    [-47, -13],
    [-47, -7.5],
    [-31, -7.5],
    [-31, 11],
    [-57.5, 11],
  ]),
  ground("market-court", "#b29279", [
    [7.5, -13],
    [49, -13],
    [49, 11],
    [25, 11],
    [25, 8.8],
    [7.5, 8.8],
  ]),
  ground("market-edge-grove", "#748c71", [
    [52, -22],
    [56, -21],
    [63, -6],
    [67.5, 10],
    [51, 10],
    [51, -14],
  ]),
  ground("pond-garden", "#798a6d", [
    [-54.5, 14],
    [-17, 14],
    [-17, 55.5],
    [-39, 49.5],
    [-52, 38],
    [-56.5, 24],
  ]),
  ground("hangang-bank-park", "#7d9277", [
    [-15, 51.5],
    [46, 51.5],
    [48, 74],
    [27.5, 64],
    [-14, 58],
  ]),
];

const parts: SceneryPart[] = [];
function tile(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  c: string,
) {
  parts.push({ p: [x, y, z], s: [w, h, d], c, shape: "block" });
}

for (const x of [-31.2, -16.2, -7.4])
  tile(x, 0.191, -1, 0.18, 0.022, 20, "#d5c2ab");
for (const z of [-8.6, 5.4, 9.2])
  tile(-19, 0.192, z, 24, 0.022, 0.18, "#cfbda6");
for (let i = 0; i < 14; i++) {
  const x = 9 + i * 2.85;
  tile(x, 0.19, -11.5, 2.78, 0.026, 1.35, i % 4 ? "#c5a38b" : "#cfac8e");
  tile(x, 0.19, 9.7, 2.78, 0.026, 1.15, "#c5a38b");
}

// Stop just short of the water; the deck joins the two west bank approaches.
const [pondX, pondZ] = [POND.x, POND.z];
tile(pondX - 4, 0.196, pondZ - 5.2, 13.2, 0.105, 2, "#886e55");
tile(pondX - 9.6, 0.196, pondZ, 2, 0.105, 10.4, "#886e55");
for (let i = 0; i < 22; i++)
  tile(
    pondX - 10.3 + i * 0.6,
    0.252,
    pondZ - 5.2,
    0.07,
    0.014,
    1.95,
    "#6f5a49",
  );
for (let i = 0; i < 17; i++)
  tile(pondX - 9.6, 0.252, pondZ - 4.8 + i * 0.6, 1.95, 0.014, 0.07, "#6f5a49");
for (let i = 0; i < 9; i++) {
  const a = 1.15 + i * 0.77;
  const x = pondX + Math.cos(a) * (4.5 + (i % 3) * 0.36);
  const z = pondZ + Math.sin(a) * (2.65 + (i % 2) * 0.45);
  parts.push({
    p: [x, 0.3, z],
    s: [0.8, 0.035, 0.67],
    c: "#638657",
    shape: "column",
  });
  if (i % 2 === 0)
    parts.push({
      p: [x, 0.4, z],
      s: [0.26, 0.2, 0.26],
      c: "#d7a1a6",
      shape: "rock",
    });
}

export const KOREA_PUBLIC_TREES: readonly TreePlacement[] = [
  { p: [-51, 0, -24], size: 0.85, variant: 2 },
  { p: [-49, 0, -29], size: 1, variant: 2 },
  { p: [2, 0, -35], size: 1.05, variant: 1 },
  { p: [11, 0, -37], size: 0.95, variant: 2 },
  { p: [23, 0, -34], size: 0.96, variant: 2 },
  { p: [32, 0, -32], size: 0.9, variant: 1 },
  { p: [53, 0, -17], size: 0.86, variant: 1 },
  { p: [57, 0, -11], size: 0.95, variant: 2 },
  { p: [59, 0, -3], size: 0.95, variant: 2 },
  { p: [62, 0, 6], size: 1, variant: 1 },
  { p: [-47, 0, 32], size: 0.9, variant: 2 },
  { p: [-43, 0, 42], size: 1.05, variant: 1 },
  { p: [-39, 0, 45], size: 0.85, variant: 2 },
];

export function KoreaPublicGrounds() {
  return (
    <>
      {grounds.map(({ name, geometry, color }) => (
        <mesh
          key={name}
          name={name}
          geometry={geometry}
          position-y={0.168}
          receiveShadow
          dispose={null}
        >
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      ))}
      <WorldSceneryParts parts={parts} />
      <NaturalTrees trees={KOREA_PUBLIC_TREES} />
    </>
  );
}
