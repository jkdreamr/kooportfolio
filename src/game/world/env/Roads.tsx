import { useMemo } from "react";
import * as THREE from "three";
import type { WorldId } from "../../core/worlds";
import { StaticBatch } from "../StaticBatch";
import { ROAD_PATTERN, sculptedMaterial, type SurfaceKind } from "../Surface";
import { buildRoadMesh, type RoadPartName, type RoadStyle } from "./roadMesh";
import { ROAD_NETWORKS } from "./roads";

/**
 * Every world's roads (B2): one merged static mesh per world through the
 * shared bake (one draw, no new program). Each part keeps its own material
 * only so the bake can tag it with a surface kind or a road pattern code.
 */

type PartLook = { kind: SurfaceKind; code?: number; roughness: number };
const LOOKS: Record<RoadStyle, Partial<Record<RoadPartName, PartLook>>> = {
  lane: {
    surface: { kind: "ground", roughness: 0.97 },
    surfaceZ: { kind: "ground", roughness: 0.97 },
    kerbX: { kind: "stone", code: ROAD_PATTERN.kerbStonesX, roughness: 0.9 },
    kerbZ: { kind: "stone", code: ROAD_PATTERN.kerbStonesZ, roughness: 0.9 },
  },
  pavers: {
    surface: { kind: "stone", code: ROAD_PATTERN.paversX, roughness: 0.9 },
    surfaceZ: { kind: "stone", code: ROAD_PATTERN.paversZ, roughness: 0.9 },
    kerbX: { kind: "stone", code: ROAD_PATTERN.bricksX, roughness: 0.86 },
    kerbZ: { kind: "stone", code: ROAD_PATTERN.bricksZ, roughness: 0.86 },
  },
  setts: {
    surface: { kind: "stone", code: ROAD_PATTERN.settsX, roughness: 0.88 },
    surfaceZ: { kind: "stone", code: ROAD_PATTERN.settsZ, roughness: 0.88 },
  },
  spirit: {
    surface: { kind: "stone", code: ROAD_PATTERN.settsX, roughness: 0.88 },
    surfaceZ: { kind: "stone", code: ROAD_PATTERN.settsZ, roughness: 0.88 },
  },
  asphalt: {
    surface: { kind: "plain", roughness: 0.93 },
    surfaceZ: { kind: "plain", roughness: 0.93 },
  },
};
const DEFAULT_LOOK: Record<RoadPartName, PartLook> = {
  surface: { kind: "stone", roughness: 0.9 },
  surfaceZ: { kind: "stone", roughness: 0.9 },
  kerbX: { kind: "stone", roughness: 0.88 },
  kerbZ: { kind: "stone", roughness: 0.88 },
  apron: { kind: "stone", roughness: 0.86 },
  marking: { kind: "plain", roughness: 0.7 },
};

const materials = new Map<string, THREE.MeshStandardMaterial>();
function partMaterial(look: PartLook) {
  const key = `${look.kind}:${look.code ?? -1}:${look.roughness}`;
  let material = materials.get(key);
  if (!material) {
    material = sculptedMaterial({ vertexColors: true, roughness: look.roughness }, look.kind);
    if (look.code !== undefined) material.userData.bakeKind = look.code;
    materials.set(key, material);
  }
  return material;
}

const PARTS: readonly RoadPartName[] = ["surface", "surfaceZ", "kerbX", "kerbZ", "apron", "marking"];
const cache = new Map<WorldId, { geometry: THREE.BufferGeometry; material: THREE.Material }[]>();
/** Built once per world (module-owned, like the other static world art). */
export function roadMeshes(world: WorldId) {
  let meshes = cache.get(world);
  if (meshes) return meshes;
  meshes = [];
  for (const net of ROAD_NETWORKS[world]) {
    const built = buildRoadMesh(net);
    for (const name of PARTS) {
      const p = built[name];
      if (!p.indices.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(p.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(p.normals, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(p.colors, 3));
      geometry.setIndex(p.indices);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      meshes.push({ geometry, material: partMaterial(LOOKS[net.style][name] ?? DEFAULT_LOOK[name]) });
    }
  }
  cache.set(world, meshes);
  return meshes;
}

export function Roads({ world }: { world: WorldId }) {
  const meshes = useMemo(() => roadMeshes(world), [world]);
  return (
    <group name="env-roads">
      <StaticBatch id={`roads-${world}`} chunk={false}>
        {meshes.map(({ geometry, material }, i) => (
          <mesh key={i} geometry={geometry} material={material} receiveShadow dispose={null} />
        ))}
      </StaticBatch>
    </group>
  );
}
