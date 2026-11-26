import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { sculptedMaterial } from "./Surface";

export type SceneryPart = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  r?: [number, number, number];
  shape?: "block" | "stone" | "column" | "rock" | "ring";
};

const geometries = {
  block: new THREE.BoxGeometry(),
  stone: new RoundedBoxGeometry(1, 1, 1, 1, 0.045),
  column: new THREE.CylinderGeometry(0.8, 1, 1, 10),
  rock: new THREE.IcosahedronGeometry(1, 1),
  ring: new THREE.TorusGeometry(0.5, 0.045, 5, 16),
};
const material = sculptedMaterial({ roughness: 0.88 });

function Batch({
  parts,
  geometry,
}: {
  parts: SceneryPart[];
  geometry: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    parts.forEach(({ p, s, c, r = [0, 0, 0] }, index) => {
      object.position.set(...p);
      object.scale.set(...s);
      object.rotation.set(...r);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      mesh.setColorAt(index, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

/** Fixed, module-owned geometry and material survive world switches. */
export function WorldSceneryParts({ parts }: { parts: SceneryPart[] }) {
  const batches = useMemo(
    () =>
      Object.entries(geometries).map(([shape, geometry]) => ({
        shape,
        geometry,
        parts: parts.filter((part) => (part.shape ?? "stone") === shape),
      })),
    [parts],
  );
  return batches
    .filter((batch) => batch.parts.length > 0)
    .map((batch) => (
      <Batch key={batch.shape} geometry={batch.geometry} parts={batch.parts} />
    ));
}

export function beam(
  parts: SceneryPart[],
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  color: string,
) {
  const direction = end.clone().sub(start);
  const rotation = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    ),
  );
  parts.push({
    p: start.clone().add(end).multiplyScalar(0.5).toArray(),
    s: [width, direction.length(), width],
    r: [rotation.x, rotation.y, rotation.z],
    c: color,
    shape: "block",
  });
}
