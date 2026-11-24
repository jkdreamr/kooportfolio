import * as THREE from "three";
import { Ball, Cylinder } from "../world/Models";
import { CraftedBox } from "./CraftedDetails";

const columns = 24,
  rows = 28,
  layerSize = (columns + 1) * (rows + 1);
function point(u: number, v: number, face = 1): THREE.Vector3 {
  const x = u * 1.6 - 0.8;
  return new THREE.Vector3(
    x,
    1.04 - v * (1.92 + 0.32 * (1 - Math.abs(x) / 0.8)),
    0.12 +
      0.09 * Math.cos(x * 12) +
      0.015 * Math.sin(v * 7 + x * 2) +
      face * 0.065,
  );
}
// Front, back and sewn edges share the folds: this is solid cloth, not a decal.
const vertices: number[] = [],
  uv: number[] = [],
  indices: number[] = [];
for (let face = 0; face < 2; face++) {
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++) {
      vertices.push(...point(x / columns, y / rows, face).toArray());
      uv.push(x / columns, y / rows);
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const a = face * layerSize + y * (columns + 1) + x,
        b = a + 1,
        c = a + columns + 1,
        d = c + 1;
      indices.push(...(face ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
    }
}
function edge(a: number, b: number) {
  indices.push(a, a + layerSize, b, b, a + layerSize, b + layerSize);
}
for (let x = 0; x < columns; x++) {
  edge(x, x + 1);
  edge(rows * (columns + 1) + x + 1, rows * (columns + 1) + x);
}
for (let y = 0; y < rows; y++) {
  edge((y + 1) * (columns + 1), y * (columns + 1));
  edge(y * (columns + 1) + columns, (y + 1) * (columns + 1) + columns);
}
const cloth = new THREE.BufferGeometry();
cloth.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
cloth.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
cloth.setIndex(indices);
cloth.computeVertexNormals();
const weave = new Uint8Array(64 * 64);
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 64; x++)
    weave[y * 64 + x] = ((x + y) % 4 < 2 ? 205 : 250) - (x % 3) * 7;
const grain = new THREE.DataTexture(weave, 64, 64, THREE.RedFormat);
grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
grain.repeat.set(7, 9);
grain.needsUpdate = true;
const material = new THREE.MeshStandardMaterial({
  color: "#285c43",
  roughness: 0.98,
  bumpMap: grain,
  bumpScale: 0.018,
});
const seamMaterial = new THREE.MeshStandardMaterial({
  color: "#b49a5d",
  roughness: 1,
});
const seamPaths = [
  Array.from({ length: 29 }, (_, i) => point(0.025, (i / 28) * 0.97)),
  Array.from({ length: 29 }, (_, i) => point(0.975, (i / 28) * 0.97)),
  Array.from({ length: 25 }, (_, i) => point(0.025 + (i / 24) * 0.95, 0.97)),
].map(
  (points) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        points.map((p) => p.add(new THREE.Vector3(0, 0, 0.015))),
      ),
      40,
      0.012,
      3,
      false,
    ),
);

export function HouseBanner() {
  return (
    <group>
      <mesh
        geometry={cloth}
        material={material}
        castShadow
        receiveShadow
        dispose={null}
      />
      {seamPaths.map((geometry, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={seamMaterial}
          dispose={null}
        />
      ))}
      <Cylinder
        p={[0, 1.16, 0.15]}
        s={[0.075, 1.94, 0.075]}
        r={[0, 0, Math.PI / 2]}
        c="#67462d"
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <CraftedBox
            p={[side * 0.72, 1.04, -0.02]}
            s={[0.14, 0.4, 0.24]}
            c="#533b2b"
          />
          <Ball
            p={[side * 1.02, 1.16, 0.15]}
            s={[0.12, 0.12, 0.12]}
            c="#b69a56"
          />
        </group>
      ))}
      {[-0.65, -0.32, 0, 0.32, 0.65].map((x) => (
        <CraftedBox
          key={x}
          p={[x, 1.06, 0.17]}
          s={[0.12, 0.28, 0.16]}
          c="#376c50"
        />
      ))}
    </group>
  );
}
