import * as THREE from "three";
import { KOREA_COAST, KOREA_SHORE } from "../core/koreaDistrict";
import { KOREA_APRON_Y } from "../core/terrain";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
import { sculptedMaterial } from "./Surface";
import { reflect } from "./env/reflection";
import { useEnvTier } from "./env/tier";
import type { GroundFootprint } from "../core/scenery";

const river = { left: -12, right: 62, near: 22, far: 44 };
export const KOREA_RIVER_FOOTPRINT: GroundFootprint = [
  (river.left + river.right) / 2,
  (river.near + river.far) / 2,
  river.right - river.left,
  river.far - river.near,
];

const land = new THREE.Shape(
  KOREA_SHORE.map(([x, z]) => new THREE.Vector2(x, z)),
);
land.closePath();
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
});
// Shape lives in XY; map its Y to world Z and extrusion downward from .14.
terrain.rotateX(Math.PI / 2);
terrain.translate(0, 0.14, 0);
terrain.computeVertexNormals();
const groundMaterial = sculptedMaterial({ color: "#8b9480", roughness: 0.96 }, "ground");
const soilMaterial = sculptedMaterial({ color: "#6f7569", roughness: 0.96 }, "ground");
const terrainMaterials = [groundMaterial, soilMaterial];
// The streets end at a stone edge; a rounded, mossy apron of unwalkable rock
// lies a step below it and carries the pine hillside and the granite ridge.
const coast = new THREE.Shape(
  KOREA_COAST.map(([x, z]) => new THREE.Vector2(x, z)),
);
coast.closePath();
// The apron lies under the whole district: cut the Han's channel through it
// as well, or its top (above the water line) hides the river.
coast.holes.push(hole);
const apron = new THREE.ExtrudeGeometry(coast, {
  depth: 4.34 + KOREA_APRON_Y - 0.14,
  bevelEnabled: false,
});
apron.rotateX(Math.PI / 2);
apron.translate(0, KOREA_APRON_Y, 0);
apron.computeVertexNormals();
const apronMaterials = [
  sculptedMaterial({ color: "#7f8c6c", roughness: 0.96 }, "stone"),
  sculptedMaterial({ color: "#8f9087", roughness: 0.96 }, "stone"),
];
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
  // Medium's shadow budget: the carved banks cast on high only (fixed per
  // mount; the key remounts on a tier change).
  const cast = useEnvTier() === "high";
  return (
    <group name="korea-carved-river-ground" ref={reflect}>
      <mesh
        key={`banks:${cast}`}
        geometry={terrain}
        material={terrainMaterials}
        receiveShadow
        castShadow={cast}
        dispose={null}
      />
      <mesh
        geometry={apron}
        material={apronMaterials}
        receiveShadow
        dispose={null}
      />
      <WorldSceneryParts parts={walls} />
    </group>
  );
}
