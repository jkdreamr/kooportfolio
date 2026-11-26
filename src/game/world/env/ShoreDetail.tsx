import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldId } from "../../core/worlds";
import { sculptedMaterial } from "../Surface";
import { grassMaterialShared } from "./Grass";
import { shoreField, type ShorePiece } from "./placement";

/**
 * Shoreline dressing for lakes and ponds: pebbles at the waterline and lily
 * pads in small rafts (one merged static mesh), and reed beds swaying with
 * the grass wind (one instanced draw sharing the grass program).
 */

const pebble = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
pebble.scale(1, 0.45, 0.8);
pebble.deleteAttribute("uv");
const lily = (() => {
  // A disc with a notch, slightly cupped.
  const shape = new THREE.Shape();
  const steps = 14;
  shape.moveTo(0, 0);
  for (let i = 0; i <= steps; i++) {
    const a = 0.32 + (i / steps) * (Math.PI * 2 - 0.64);
    shape.lineTo(Math.cos(a), Math.sin(a));
  }
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute("uv");
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    p.setY(i, r * r * 0.06);
  }
  g.computeVertexNormals();
  return g;
})();

/** Three narrow blades and a seed head: a single reed stem cluster. */
const reed = (() => {
  const positions: number[] = [],
    uvs: number[] = [],
    normals: number[] = [];
  for (let b = 0; b < 3; b++) {
    const a = b * 2.1;
    const dx = Math.cos(a) * 0.08,
      dz = Math.sin(a) * 0.08;
    const sx = -Math.sin(a) * 0.035,
      sz = Math.cos(a) * 0.035;
    const h = 0.9 + b * 0.18;
    const quad = [
      [-sx, 0, -sz, 0],
      [sx, 0, sz, 0],
      [dx * 1.6, h, dz * 1.6, 1],
    ];
    for (const [x, y, z, t] of quad) {
      positions.push(x, y, z);
      uvs.push(0.5, t);
      normals.push(dx, 1, dz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.normalizeNormals();
  return g;
})();

const material = sculptedMaterial({ vertexColors: true, roughness: 0.7 });
const noRaycast = () => undefined;

const PEBBLES: Record<WorldId, string[]> = {
  home: ["#a7a49b", "#bdb8aa", "#8f8c84", "#c9c1ae"],
  korea: ["#b6b6ae", "#c8c6bc", "#9a9b94", "#d1cdc1"],
  stanford: ["#c9ad83", "#b99a70", "#d6bf98", "#a98d66"],
};

function bakeStatic(world: WorldId, pieces: readonly ShorePiece[]) {
  const color = new THREE.Color();
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  const parts = pieces
    .filter((p) => p.kind !== "reed")
    .map((p, i) => {
      const g = (p.kind === "lily" ? lily : pebble).clone();
      q.setFromAxisAngle(up, p.angle);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.size, p.size, p.size));
      g.applyMatrix4(m);
      if (p.kind === "lily")
        color.set(p.tone > 0.8 ? "#8fb35a" : p.tone > 0.4 ? "#5f8f45" : "#4e7e3e");
      else color.set(PEBBLES[world][i % 4]).multiplyScalar(0.9 + p.tone * 0.2);
      const colors = new Float32Array(g.getAttribute("position").count * 3);
      for (let k = 0; k < colors.length; k += 3) color.toArray(colors, k);
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return g;
    });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

export function ShoreDetail({ world }: { world: WorldId }) {
  const { geometry, reeds } = useMemo(() => {
    const pieces = shoreField(world);
    return { geometry: bakeStatic(world, pieces), reeds: pieces.filter((p) => p.kind === "reed") };
  }, [world]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      color = new THREE.Color();
    reeds.forEach((p, i) => {
      q.setFromAxisAngle(up, p.angle);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.size, p.size, p.size));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(p.tone > 0.5 ? "#7d9446" : "#97a453"));
    });
    mesh.count = reeds.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [reeds]);
  return (
    <group name="env-shore">
      {geometry && (
        <mesh geometry={geometry} material={material} receiveShadow raycast={noRaycast} dispose={null} />
      )}
      {reeds.length > 0 && (
        <instancedMesh
          key={reeds.length}
          ref={ref}
          args={[reed, grassMaterialShared, reeds.length]}
          frustumCulled={false}
          raycast={noRaycast}
          dispose={null}
        />
      )}
    </group>
  );
}
