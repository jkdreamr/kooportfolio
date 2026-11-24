import * as THREE from "three";
import { KOREA_LANDMARKS } from "../core/koreaLandmarks";
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
    [-47, -24],
    [-39, -34.5],
    [-27.8, -45.1],
    [-21, -45.6],
    [-11.4, -44.6],
    [-10.4, -29],
    [49, -29],
    [49, -25.6],
    [-28, -25.6],
    [-35, -24],
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
    [-55.5, -13],
    [-47, -13],
    [-47, -7.5],
    [-31, -7.5],
    [-31, 11],
    [-55.5, 11],
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
    [50.8, -23.7],
    [52.6, -23.7],
    [52.6, 10],
    [54.5, 12.5],
    [50.8, 12.5],
  ]),
  ground("pond-garden", "#798a6d", [
    [-54, 14],
    [-17, 14],
    [-17, 55.2],
    [-33.8, 49.1],
    [-38.6, 43.8],
    [-40.7, 37.2],
    [-50.6, 35.4],
    [-51.6, 20.9],
  ]),
  ground("hangang-bank-park", "#7d9277", [
    [-15, 51.5],
    [42, 51.5],
    [44, 57.8],
    [-12, 57.1],
    [-15, 56],
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
tile(pondX - 9.6, 0.196, pondZ - 0.4, 2, 0.105, 9.6, "#886e55");
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
for (let i = 0; i < 16; i++)
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
  { p: [-47, 0, -23], size: 0.85, variant: 2 },
  { p: [-37, 0, -33.5], size: 0.9, variant: 2 },
  { p: [4, 0, -28.8], size: 0.8, variant: 1 },
  { p: [27, 0, -28.8], size: 0.85, variant: 2 },
  { p: [51.4, 0, -17], size: 0.86, variant: 1 },
  { p: [51.4, 0, 6], size: 1, variant: 1 },
  { p: [-47, 0, 32], size: 0.9, variant: 2 },
  { p: [-38, 0, 39.5], size: 1.05, variant: 1 },
];

function MonumentPart({
  p,
  s,
  c,
  r,
  shape = "box",
}: {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  r?: [number, number, number];
  shape?: "box" | "ball" | "column";
}) {
  return (
    <mesh position={p} scale={s} rotation={r} castShadow receiveShadow>
      {shape === "box" && <boxGeometry />}
      {shape === "ball" && <sphereGeometry args={[0.5, 12, 8]} />}
      {shape === "column" && <cylinderGeometry args={[0.4, 0.5, 1, 12]} />}
      <meshStandardMaterial color={c} roughness={0.8} />
    </mesh>
  );
}

function KingSejong({ onVisit }: { onVisit: (x: number, z: number) => void }) {
  const {
    origin: [x, z],
    approach,
  } = KOREA_LANDMARKS.sejong;
  const bronze = "#8c683e";
  return (
    <group
      name="king-sejong-statue"
      position={[x, 0, z]}
      onPointerDown={(event) => {
        event.stopPropagation();
        onVisit(...approach);
      }}
    >
      <MonumentPart p={[0, 0.29, 0]} s={[4.1, 0.28, 3.4]} c="#9e9282" />
      <MonumentPart p={[0, 0.9, 0]} s={[3.35, 1.1, 2.8]} c="#6e6c63" />
      <MonumentPart p={[0, 1.5, 0]} s={[3.55, 0.22, 3]} c="#a39a87" />
      <MonumentPart p={[0, 1, 1.41]} s={[1.4, 0.4, 0.04]} c="#b09965" />
      <MonumentPart p={[0, 2.26, -0.74]} s={[2.5, 1.36, 0.41]} c="#654f37" />
      <MonumentPart
        shape="column"
        p={[0, 2.13, 0.29]}
        s={[2.5, 1.07, 1.95]}
        c={bronze}
      />
      <MonumentPart
        shape="column"
        p={[0, 3.18, -0.18]}
        s={[1.98, 1.67, 1.45]}
        c={bronze}
      />
      <MonumentPart p={[0, 3.28, 0.54]} s={[0.53, 0.48, 0.08]} c="#b3894c" />
      <MonumentPart
        shape="ball"
        p={[0.89, 2.77, 0.48]}
        s={[0.94, 1.13, 0.96]}
        c={bronze}
      />
      <MonumentPart
        p={[0.92, 3.07, 0.86]}
        s={[0.65, 0.13, 0.58]}
        r={[0.12, -0.11, 0]}
        c="#c6a563"
      />
      <MonumentPart
        shape="ball"
        p={[-0.98, 3.22, 0.34]}
        s={[0.88, 1.16, 1.03]}
        c={bronze}
      />
      <MonumentPart
        shape="ball"
        p={[-1.15, 3.94, 0.68]}
        s={[0.43, 0.61, 0.46]}
        c="#ab8250"
      />
      <MonumentPart
        shape="ball"
        p={[0, 4.23, 0.05]}
        s={[0.9, 1, 0.84]}
        c="#ab8250"
      />
      <MonumentPart
        shape="ball"
        p={[0, 3.89, 0.35]}
        s={[0.39, 0.72, 0.29]}
        c="#624d34"
      />
      <MonumentPart
        shape="column"
        p={[0, 4.79, -0.09]}
        s={[0.98, 0.82, 0.88]}
        c="#5d4d38"
      />
      {[1, -1].map((side) => (
        <MonumentPart
          key={side}
          p={[side * 0.6, 4.92, -0.1]}
          s={[0.51, 0.15, 0.33]}
          r={[0, 0, side * 0.3]}
          c="#5d4d38"
        />
      ))}
    </group>
  );
}

export function KoreaPublicGrounds({
  onVisit,
}: {
  onVisit: (x: number, z: number) => void;
}) {
  return (
    <>
      {grounds.map(({ name, geometry, color }) => (
        <mesh
          key={name}
          name={name}
          geometry={geometry}
          position-y={0.168}
          receiveShadow
        >
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      ))}
      <WorldSceneryParts parts={parts} />
      <NaturalTrees trees={KOREA_PUBLIC_TREES} />
      <KingSejong onVisit={onVisit} />
    </>
  );
}
