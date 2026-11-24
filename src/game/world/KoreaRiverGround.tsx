import * as THREE from "three";
import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
import type { GroundFootprint } from "../core/scenery";

const river = { left: -12, right: 62, near: 22, far: 44 };
export const KOREA_RIVER_FOOTPRINT: GroundFootprint = [
  (river.left + river.right) / 2,
  (river.near + river.far) / 2,
  river.right - river.left,
  river.far - river.near,
];

const land = new THREE.Shape();
land.absellipse(
  0,
  WORLD_ELLIPSE.centerZ,
  WORLD_ELLIPSE.radiusX,
  WORLD_ELLIPSE.radiusZ,
  0,
  Math.PI * 2,
  false,
  0,
);
const hole = new THREE.Path();
hole.moveTo(river.left, river.near);
hole.lineTo(river.left, river.far);
hole.lineTo(river.right, river.far);
hole.lineTo(river.right, river.near);
hole.closePath();
land.holes.push(hole);
const terrain = new THREE.ExtrudeGeometry(land, {
  depth: 4.34,
  bevelEnabled: false,
  curveSegments: 96,
});
// Shape lives in XY; map its Y to world Z and extrusion downward from .14.
terrain.rotateX(Math.PI / 2);
terrain.translate(0, 0.14, 0);
terrain.computeVertexNormals();
const groundMaterial = new THREE.MeshStandardMaterial({
  color: "#78885f",
  roughness: 1,
});
const soilMaterial = new THREE.MeshStandardMaterial({
  color: "#706e50",
  roughness: 1,
});
const terrainMaterials = [groundMaterial, soilMaterial];
const walls: SceneryPart[] = [];
for (let x = -11; x < 62; x += 2.4) {
  for (const z of [22, 44]) {
    for (let row = 0; row < 4; row++)
      walls.push({
        p: [x + (row % 2) * 0.6, -0.3 - row * 0.68, z],
        s: [2.32, 0.63, 0.55],
        c: row % 2 ? "#8c958b" : "#a0a497",
      });
    walls.push({ p: [x, 0.08, z], s: [2.4, 0.25, 0.85], c: "#c1bdac" });
  }
}
for (const x of [-12, 62]) {
  walls.push({ p: [x, -1.3, 33], s: [0.5, 3, 22], c: "#929b8c" });
  walls.push({ p: [x, 0.08, 33], s: [0.85, 0.25, 22], c: "#c1bdac" });
}
walls.push({ p: [25, -3.4, 33], s: [74, 1, 22], c: "#52655c", shape: "block" });

/** Replaces ALL Korea base ground layers/tiles. Do not mount over uncut ground. */
export function KoreaRiverGround() {
  return (
    <group name="korea-carved-river-ground">
      <mesh
        geometry={terrain}
        material={terrainMaterials}
        receiveShadow
        castShadow
        dispose={null}
      />
      <WorldSceneryParts parts={walls} />
    </group>
  );
}
