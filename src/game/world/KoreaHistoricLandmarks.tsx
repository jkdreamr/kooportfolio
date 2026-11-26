import { StaticBatch } from "./StaticBatch";
import * as THREE from "three";
import { BUKCHON_HOMES, KOREA_LANDMARKS } from "../core/koreaLandmarks";
import { sculptedMaterial } from "./Surface";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

type Vec3 = SceneryPart["p"];
type Roof = { p: Vec3; s: Vec3 };

const tileMaterial = sculptedMaterial({ vertexColors: true }, "shingle");
const granite = sculptedMaterial({ color: "#bcb29e" }, "stone");
const timber = "#624236";
const darkTile = "#414947";
const stone = "#b6ab94";

function giwaGeometry() {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  // The shallow eave steepens toward the ridge. Corners lift on both axes.
  const profile = [
    [1, 0, 1],
    [0.93, 0.15, 0.72],
    [0.84, 0.36, 0.45],
    [0.77, 0.64, 0.23],
    [0.72, 1, 0.018],
  ];
  const color = new THREE.Color(darkTile);
  const corners = [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ];
  for (let side = 0; side < corners.length; side++) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % corners.length];
    const tiles = ax === bx ? 12 : 24;
    const intervals = tiles * 4;
    const start = positions.length / 3;
    profile.forEach(([w, y, d], row) => {
      for (let step = 0; step <= intervals; step++) {
        const t = step / intervals;
        const cornerLift = 0.21 * Math.abs(2 * t - 1) ** 5 * (1 - y);
        const acrossTile = Math.sin((step * Math.PI) / 4) ** 2;
        const relief = 0.052 * acrossTile * (1 - y);
        positions.push(
          THREE.MathUtils.lerp(ax, bx, t) * w * 0.5,
          y + cornerLift + relief,
          THREE.MathUtils.lerp(az, bz, t) * d * 0.5,
        );
        const light = 0.78 + acrossTile * 0.29 + (row % 2) * 0.035;
        colors.push(color.r * light, color.g * light, color.b * light);
        if (row === 0 || step === intervals) continue;
        const below = start + (row - 1) * (intervals + 1) + step;
        const above = below + intervals + 1;
        indices.push(below, below + 1, above, below + 1, above + 1, above);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const giwa = giwaGeometry();
const palaceParts: SceneryPart[] = [],
  villageParts: SceneryPart[] = [],
  palacePaving: SceneryPart[] = [],
  villagePaving: SceneryPart[] = [];
const palaceRoofs: Roof[] = [],
  villageRoofs: Roof[] = [];

function block(parts: SceneryPart[], p: Vec3, s: Vec3, c: string) {
  parts.push({ p, s, c, shape: "block" });
}

function roof(parts: SceneryPart[], roofs: Roof[], p: Vec3, s: Vec3) {
  roofs.push({ p, s });
  block(parts, [p[0], p[1] + s[1], p[2]], [s[0] * 0.73, 0.12, 0.16], darkTile);
}

const portals = [
  { x: -2.73, radius: 0.69, spring: 0.92 },
  { x: 0, radius: 0.89, spring: 1.05 },
  { x: 2.73, radius: 0.69, spring: 0.92 },
];
const arcadeShape = new THREE.Shape();
arcadeShape.moveTo(-6, 0);
for (const { x, radius, spring } of portals) {
  arcadeShape.lineTo(x - radius, 0);
  arcadeShape.lineTo(x - radius, spring);
  arcadeShape.absarc(x, spring, radius, Math.PI, 0, true);
  arcadeShape.lineTo(x + radius, 0);
}
arcadeShape.lineTo(6, 0);
arcadeShape.lineTo(6, 2.32);
arcadeShape.lineTo(-6, 2.32);
arcadeShape.closePath();
const arcade = new THREE.ExtrudeGeometry(arcadeShape, {
  depth: 4.1,
  bevelEnabled: false,
  curveSegments: 12,
});
arcade.translate(0, 0.48, -2.05);

block(palacePaving, [0, 0.185, 0.75], [15.5, 0.08, 10.25], "#bbb29f");
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 10; col++) {
    const x = (col - 4.5) * 1.48;
    block(
      palacePaving,
      [x, 0.227, 2.83 + row * 0.78],
      [1.44, 0.012, 0.74],
      ["#c9bdab", "#c4b9a7", "#c0b5a2"][(row * 2 + col) % 3],
    );
  }
}
block(palaceParts, [0, 0.33, 0], [12.4, 0.3, 4.9], "#a69c8b");
block(palaceParts, [0, 2.83, 0], [12.3, 0.14, 4.35], "#d1c4b0");
for (const { x, radius, spring } of portals) {
  for (const side of [-1, 1]) {
    block(
      palaceParts,
      [x + side * radius * 0.46, 0.48 + spring / 2, 1.48],
      [radius * 0.9, spring, 0.09],
      "#513c34",
    );
    block(
      palaceParts,
      [x + side * radius * 0.22, 0.96, 1.54],
      [0.07, 0.09, 0.045],
      "#ac9062",
    );
  }
}
for (const z of [-2.057, 2.057]) {
  for (const y of [0.88, 1.28, 1.68, 2.08, 2.48]) {
    for (let i = -11; i <= 11; i++) {
      const x = i * 0.51;
      if (portals.some((p) => Math.abs(p.x - x) < p.radius + 0.38 && y < 2.45))
        continue;
      block(palaceParts, [x, y, z], [0.48, 0.027, 0.013], "#a99d8a");
    }
  }
}

function dancheongPavilion(
  width: number,
  depth: number,
  base: number,
  height: number,
  bays: number,
) {
  const top = base + height;
  block(
    palaceParts,
    [0, base + height / 2, 0],
    [width, height, depth],
    "#547263",
  );
  for (let i = 0; i <= bays; i++) {
    const x = width * (i / bays - 0.5);
    for (const z of [-depth / 2, depth / 2]) {
      block(
        palaceParts,
        [x, base + height / 2, z],
        [0.18, height, 0.19],
        "#973f31",
      );
      block(palaceParts, [x, top - 0.17, z], [0.28, 0.28, 0.49], "#78917a");
      if (i === bays) continue;
      const bay = width / bays;
      block(
        palaceParts,
        [x + bay / 2, base + height * 0.47, z],
        [bay * 0.72, height * 0.49, 0.08],
        "#354941",
      );
      for (let j = 1; j <= 4; j++) {
        block(
          palaceParts,
          [x + (j * bay) / 5, base + height * 0.47, z * 1.015],
          [0.027, height * 0.47, 0.085],
          "#91a58b",
        );
      }
    }
  }
  block(
    palaceParts,
    [0, top - 0.035, 0],
    [width + 0.18, 0.19, depth + 0.19],
    "#6f3932",
  );
  block(
    palaceParts,
    [0, top + 0.12, 0],
    [width + 0.44, 0.13, depth + 0.42],
    "#c6a36f",
  );
}

dancheongPavilion(9.8, 3.75, 2.9, 1.06, 5);
roof(palaceParts, palaceRoofs, [0, 4.08, 0], [12.15, 1.35, 4.85]);
dancheongPavilion(6.65, 2.55, 4.6, 1.14, 3);
roof(palaceParts, palaceRoofs, [0, 5.86, 0], [8.9, 1.18, 3.65]);

block(villagePaving, [0, 0.19, 0], [15.45, 0.09, 2.8], "#a9a296");
for (let i = 0; i < 12; i++) {
  for (const z of [-1.22, 1.22]) {
    block(
      villagePaving,
      [(i - 5.5) * 1.26, 0.239, z],
      [1.2, 0.014, 0.24],
      i % 3 === 0 ? "#c7beaa" : "#b8ae9b",
    );
  }
}
for (const [i, [x, z, reverse]] of BUKCHON_HOMES.entries()) {
  const front = reverse ? -1 : 1;
  const wid = 4.6,
    body = 2.26,
    faceZ = z + (front * body) / 2,
    ridgeY = [2.18, 2.38, 2.28, 2.12][i];
  block(villageParts, [x, 0.43, z], [wid, 0.54, body], "#918a7c");
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      block(
        villageParts,
        [x + (col - 3.5) * 0.557, 0.29 + row * 0.22, faceZ],
        [0.54, 0.2, 0.065],
        ["#b6aa95", "#a59a87", "#a99e8e"][(col + i + row * 2) % 3],
      );
    }
  }
  block(
    villageParts,
    [x, ridgeY / 2 + 0.325, z],
    [wid - 0.13, ridgeY - 0.65, body - 0.12],
    ["#d1bfa2", "#baa489", "#c9b696", "#d8c9af"][i],
  );
  for (const side of [-1, 1]) {
    const wallX = x + side * (wid / 2 - 0.055);
    for (const dz of [-0.98, 0.98]) {
      block(
        villageParts,
        [wallX, ridgeY / 2 + 0.28, z + dz],
        [0.13, ridgeY - 0.56, 0.15],
        timber,
      );
    }
    block(villageParts, [wallX, 0.74, z], [0.12, 0.13, body - 0.1], timber);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        block(
          villageParts,
          [wallX + side * 0.055, 0.32 + row * 0.21, z + (col - 1.5) * 0.51],
          [0.024, 0.185, 0.49],
          ["#ac9f8c", "#a1988b", "#bdb09c"][(col + i + row) % 3],
        );
      }
    }
  }
  const backZ = z - (front * body) / 2;
  block(villageParts, [x, 1.48, backZ], [2.3, 0.49, 0.13], timber);
  for (let slat = -4; slat <= 4; slat++) {
    block(
      villageParts,
      [x + slat * 0.22, 1.48, backZ - front * 0.072],
      [0.12, 0.34, 0.032],
      "#b3a68b",
    );
  }
  for (const dx of [-2.17, -0.72, 0.72, 2.17]) {
    block(
      villageParts,
      [x + dx, ridgeY / 2 + 0.28, faceZ],
      [0.14, ridgeY - 0.56, 0.14],
      timber,
    );
  }
  for (const dx of [-1.45, 1.45]) {
    block(villageParts, [x + dx, 1.44, faceZ], [1.15, 0.65, 0.16], timber);
    block(
      villageParts,
      [x + dx, 1.44, faceZ + front * 0.08],
      [1.03, 0.52, 0.03],
      "#bdaf92",
    );
    for (const bar of [-0.34, -0.17, 0, 0.17, 0.34]) {
      block(
        villageParts,
        [x + dx + bar, 1.44, faceZ + front * 0.105],
        [0.034, 0.54, 0.028],
        timber,
      );
    }
    block(
      villageParts,
      [x + dx, 1.43, faceZ + front * 0.11],
      [1.1, 0.034, 0.024],
      timber,
    );
  }
  block(villageParts, [x, 1.05, faceZ], [0.92, 1.38, 0.13], timber);
  block(
    villageParts,
    [x + 0.09, 1.1, faceZ + front * 0.09],
    [0.035, 0.46, 0.037],
    "#a2916b",
  );
  block(
    villageParts,
    [x, 0.255, faceZ + front * 0.11],
    [1.08, 0.19, 0.36],
    stone,
  );
  block(
    villageParts,
    [x, ridgeY - 0.16, z],
    [wid + 0.04, 0.2, body + 0.1],
    timber,
  );
  for (let rafter = -9; rafter <= 9; rafter++) {
    for (const dz of [-1, 1]) {
      block(
        villageParts,
        [x + rafter * 0.25, ridgeY - 0.07, z + dz * 1.22],
        [0.07, 0.08, 0.27],
        "#8a7058",
      );
    }
  }
  roof(
    villageParts,
    villageRoofs,
    [x, ridgeY - 0.035, z],
    [5.05, 0.95 + (i % 2) * 0.13, 2.87],
  );
}

function TiledRoofs({ roofs }: { roofs: Roof[] }) {
  return roofs.map(({ p, s }) => (
    <mesh
      key={p.join(",")}
      position={p}
      scale={s}
      geometry={giwa}
      material={tileMaterial}
      castShadow
      receiveShadow
      dispose={null}
    />
  ));
}

export function KoreaHistoricLandmarks({
  onVisit,
}: {
  onVisit: (x: number, z: number) => void;
}) {
  const { palace, village } = KOREA_LANDMARKS;
  return (
    <StaticBatch id="KoreaHistoricLandmarks">
      <>
        <group
          name="gwanghwamun"
          position={[palace.origin[0], 0, palace.origin[1]]}
        >
          <WorldSceneryParts parts={palacePaving} />
          <group
            onPointerDown={(event) => {
              event.stopPropagation();
              onVisit(...palace.approach);
            }}
          >
            <mesh
              geometry={arcade}
              material={granite}
              castShadow
              receiveShadow
              dispose={null}
            />
            <WorldSceneryParts parts={palaceParts} />
            <TiledRoofs roofs={palaceRoofs} />
          </group>
        </group>
        <group
          name="bukchon-hanok-village"
          position={[village.origin[0], 0, village.origin[1]]}
        >
          <WorldSceneryParts parts={villagePaving} />
          <group
            onPointerDown={(event) => {
              event.stopPropagation();
              onVisit(...village.approach);
            }}
          >
            <WorldSceneryParts parts={villageParts} />
            <TiledRoofs roofs={villageRoofs} />
          </group>
        </group>
      </>
    </StaticBatch>
  );
}
