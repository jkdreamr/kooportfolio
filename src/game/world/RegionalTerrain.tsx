import * as THREE from "three";
import { WORLD_ELLIPSE } from "../../shared/world-bounds";

function ridgeGeometry(korea: boolean) {
  const vertices: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const cols = 112,
    rows = 56;
  const color = new THREE.Color(),
    near = new THREE.Color(korea ? "#516c61" : "#9b9865"),
    far = new THREE.Color(korea ? "#8c9b89" : "#9aa18a");
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let col = 0; col <= cols; col++) {
      const u = col / cols,
        angle = (u - 0.5) * Math.PI;
      // A tapered crescent attached to the northern ellipse: no rectangular
      // sheets, cliff-like skirts, detached islands or constant-Z straight ends.
      const taper = Math.sin(u * Math.PI) ** 0.45;
      // A narrow planted rim, not another enormous empty island behind town.
      const radius = 0.99 + v * 0.12 * taper;
      const x = Math.sin(angle) * WORLD_ELLIPSE.radiusX * radius;
      const z =
        WORLD_ELLIPSE.centerZ -
        Math.cos(angle) * WORLD_ELLIPSE.radiusZ * radius;
      const first =
        Math.exp(-Math.pow((v - 0.22) / 0.16, 2)) *
        (3 + Math.sin(angle * 5 + 0.3));
      const second =
        Math.exp(-Math.pow((v - 0.51) / 0.15, 2)) *
        (4 + Math.sin(angle * 4 - 1.5));
      const third =
        Math.exp(-Math.pow((v - 0.77) / 0.13, 2)) *
        (5 + Math.sin(angle * 3 + 0.6));
      const fold =
        Math.sin(angle * 15 + v * 6) * 0.25 +
        Math.sin(angle * 29 - v * 14) * 0.15;
      const envelope = Math.sin(v * Math.PI) ** 0.5;
      const height =
        0.06 - v + (Math.max(first, second, third) + fold) * envelope * taper;
      vertices.push(x, height, z);
      color
        .copy(near)
        .lerp(far, v)
        .multiplyScalar(0.94 + Math.sin(angle * 16 + v * 12) * 0.045);
      colors.push(color.r, color.g, color.b);
      if (row < rows && col < cols) {
        const i = row * (cols + 1) + col;
        indices.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  const edge: number[] = [];
  for (let col = 0; col <= cols; col++) edge.push(col);
  for (let row = 1; row <= rows; row++) edge.push(row * (cols + 1) + cols);
  for (let col = cols - 1; col >= 0; col--) edge.push(rows * (cols + 1) + col);
  for (let row = rows - 1; row > 0; row--) edge.push(row * (cols + 1));
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i] * 3,
      b = edge[(i + 1) % edge.length] * 3,
      start = vertices.length / 3;
    vertices.push(
      vertices[a],
      vertices[a + 1],
      vertices[a + 2],
      vertices[b],
      vertices[b + 1],
      vertices[b + 2],
      vertices[a],
      -4.3,
      vertices[a + 2],
      vertices[b],
      -4.3,
      vertices[b + 2],
    );
    for (let j = 0; j < 4; j++) {
      color.set(korea ? "#637363" : "#787451").multiplyScalar(j > 1 ? 0.8 : 1);
      colors.push(color.r, color.g, color.b);
    }
    indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const bayRidges = ridgeGeometry(false),
  seoulRidges = ridgeGeometry(true);
const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  side: THREE.DoubleSide,
});

/** Three folded ridgelines on one continuous, rounded landform. */
export function RegionalTerrain({ region }: { region: "bay" | "seoul" }) {
  return (
    <mesh
      name={`${region}-layered-ridges`}
      geometry={region === "bay" ? bayRidges : seoulRidges}
      material={terrainMaterial}
      receiveShadow
      dispose={null}
    />
  );
}
