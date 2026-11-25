import * as THREE from "three";
import { HOME_ISLAND } from "../core/homeIsland";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

// Art only. The playable ellipse, ground level, rail and gates remain owned by
// homeIsland/world. Keep this module store-free: Landscape is in world's graph.
const { centerX, centerZ, radiusX, radiusZ } = HOME_ISLAND;
const segments = 128;
const strata = [
  [0.1, 2.03, "#7b7854"],
  [-0.26, 2.38, "#b3a17b"],
  [-0.57, 2.46, "#c1ad89"],
  [-0.73, 2.12, "#716e63"],
  [-1.24, 2.42, "#9c9381"],
  [-1.43, 2.16, "#626968"],
  [-2.16, 2.48, "#818a84"],
  [-2.4, 2.08, "#4c5c60"],
  [-3.22, 2.36, "#687a7d"],
  [-4.2, 2.18, "#41545c"],
] as const;

function cliffGeometry() {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const color = new THREE.Color();
  strata.forEach(([height, ledge, shade], row) => {
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      // Paired vertices make continuous, geological folds, not detached rocks.
      // All displacement is inward from the accepted 2.5-unit coastal skirt.
      const fold = (Math.sin(a * 11) + Math.sin(a * 23 + 0.7) + 2) * 0.085;
      const dip = row === 0 ? 0 : Math.sin(a * 9 + 0.3) * 0.065;
      positions.push(
        centerX + Math.cos(a) * (radiusX + ledge - fold),
        height + dip,
        centerZ + Math.sin(a) * (radiusZ + ledge - fold),
      );
      color.set(shade).multiplyScalar(0.94 + Math.sin(a * 17) * 0.055);
      colors.push(color.r, color.g, color.b);
      if (row < strata.length - 1 && i < segments) {
        const n = row * (segments + 1) + i,
          next = n + segments + 1;
        indices.push(n, n + 1, next, n + 1, next + 1, next);
      }
    }
  });
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  indexed.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

const cliff = cliffGeometry();
const lawn = new THREE.CylinderGeometry(1, 1, 1, segments);
const lawnMaterial = new THREE.MeshStandardMaterial({
  color: "#6c8653",
  roughness: 1,
});
const cliffMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.94,
});
const details: SceneryPart[] = [];
for (let i = 0; i < 96; i++) {
  const a = (i / 96) * Math.PI * 2;
  const x = centerX + Math.cos(a) * (radiusX + 2.05);
  const z = centerZ + Math.sin(a) * (radiusZ + 2.05);
  // Leave transport's west station and east runway silhouettes untouched.
  if ((x < -40 && Math.abs(z - centerZ) < 5) || (x > 22 && z > -27 && z < 2))
    continue;
  if (i % 3 === 0 && Math.sin(a * 5 + 1.1) > -0.2) {
    details.push({
      p: [x, -0.14, z],
      s: [1.1 + (i % 4) * 0.2, 0.54, 0.72],
      r: [0, -a, 0.1],
      c: i % 2 ? "#949484" : "#aeb099",
      shape: "rock",
    });
    details.push({
      p: [x - Math.cos(a) * 0.4, 0.12, z - Math.sin(a) * 0.4],
      s: [1.02, 0.26, 0.61],
      r: [0, -a, 0],
      c: "#667951",
      shape: "rock",
    });
  }
}

/** Stratified coast; the sky island's hanging rock lives in IslandUnderside. */
export function HomeCoastArt() {
  return (
    <group name="home-stratified-coast">
      <mesh
        position={[centerX, -0.01, centerZ]}
        scale={[radiusX + 2, 0.3, radiusZ + 2]}
        geometry={lawn}
        material={lawnMaterial}
        receiveShadow
        dispose={null}
      />
      <mesh
        geometry={cliff}
        material={cliffMaterial}
        receiveShadow
        dispose={null}
      />
      <WorldSceneryParts parts={details} />
    </group>
  );
}
