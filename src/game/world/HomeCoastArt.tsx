import * as THREE from "three";
import { HOME_ISLAND, HOME_SHORE } from "../core/homeIsland";
import { loopNormals, resampleLoop, type P2 } from "../core/coast";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
import { sculptedMaterial } from "./Surface";
import { reflect } from "./env/reflection";
import { distanceToLakeShelf } from "./env/lakeShelves";

// Art only. The playable shore, ground level, rail and gates remain owned by
// homeIsland/world. Keep this module store-free: Landscape is in world's graph.
const { centerZ } = HOME_ISLAND;
const segments = 192;
// Even samples keep every cliff facet the same width round headland and cove.
const shore = resampleLoop(HOME_SHORE, segments);
const outward = loopNormals(shore);
/** A point `reach` beyond the lawn's edge at shore sample `i` (wraps). */
const beyond = (i: number, reach: number): P2 => {
  const [x, z] = shore[i % segments],
    [nx, nz] = outward[i % segments];
  return [x + nx * reach, z + nz * reach];
};
// Height, ledge beyond the lawn's edge, colour. The lawn overhangs the first.
const strata = [
  [0.1, 0.03, "#7b7854"],
  [-0.26, 0.38, "#b3a17b"],
  [-0.57, 0.46, "#c1ad89"],
  [-0.73, 0.12, "#716e63"],
  [-1.24, 0.42, "#9c9381"],
  [-1.43, 0.16, "#626968"],
  [-2.16, 0.48, "#818a84"],
  [-2.4, 0.08, "#4c5c60"],
  [-3.22, 0.36, "#687a7d"],
  [-4.2, 0.18, "#41545c"],
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
      const fold = (Math.sin(a * 11) + Math.sin(a * 23 + 0.7) + 2) * 0.05;
      const dip = row === 0 ? 0 : Math.sin(a * 9 + 0.3) * 0.065;
      const [x, z] = beyond(i, row === 0 ? ledge : ledge - fold);
      positions.push(x, height + dip, z);
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
  const geometry = indexed.index ? indexed.toNonIndexed() : indexed;
  if (geometry !== indexed) indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

/** The lawn: one slab cut to the shore, its top at the walking level. */
function lawnGeometry() {
  const shape = new THREE.Shape(shore.map(([x, z]) => new THREE.Vector2(x, z)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.3,
    bevelEnabled: false,
  });
  // Shape lives in XY; map its Y to world Z and extrude downward from .14.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.14, 0);
  geometry.computeVertexNormals();
  return geometry;
}

const cliff = cliffGeometry();
const lawn = lawnGeometry();
// Painted variation (shared noise) on the lawn and the strata.
const lawnMaterial = sculptedMaterial({ color: "#6f8c52", roughness: 0.96 }, "ground");
// Painted grain on the strata (R4): the block layer read as cobbles.
const cliffMaterial = sculptedMaterial({ vertexColors: true, roughness: 0.92 }, "plain");
const details: SceneryPart[] = [];
for (let i = 0; i < segments; i += 2) {
  const [x, z] = beyond(i, 0.12);
  const [nx, nz] = outward[i];
  const a = Math.atan2(nz, nx);
  const k = i / 2;
  // Leave transport's west station and east runway silhouettes untouched.
  if ((x < -40 && Math.abs(z - centerZ) < 5) || (x > 22 && z > -27 && z < 2))
    continue;
  // Keep the lawn's edge open above a lake: these rocks hid the water.
  if (distanceToLakeShelf(x, z) < 1.5) continue;
  if (k % 3 === 0 && Math.sin(k * 0.327 + 1.1) > -0.2) {
    details.push({
      p: [x, -0.14, z],
      s: [1.1 + (k % 4) * 0.2, 0.54, 0.72],
      r: [0, -a, 0.1],
      c: k % 2 ? "#949484" : "#aeb099",
      shape: "rock",
    });
    details.push({
      p: [x + nx * 0.1, 0.1, z + nz * 0.1],
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
    <group name="home-stratified-coast" ref={reflect}>
      <mesh
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
