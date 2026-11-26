import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { sculptedMaterial } from "./Surface";

export type CampusShape =
  | "stone"
  | "block"
  | "round"
  | "column"
  | "arch"
  | "roof"
  | "dome";
export type CampusPart = {
  shape: CampusShape;
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  r?: [number, number, number];
};

const wedge = new THREE.BufferGeometry();
wedge.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(
    [
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1,
      0.5,
    ],
    3,
  ),
);
wedge.setIndex([
  0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
]);
wedge.computeVertexNormals();
const shapes: Record<CampusShape, THREE.BufferGeometry> = {
  stone: new RoundedBoxGeometry(1, 1, 1, 1, 0.08),
  block: new THREE.BoxGeometry(),
  round: new THREE.IcosahedronGeometry(1, 1),
  column: new THREE.CylinderGeometry(1, 1, 1, 10),
  arch: new THREE.TorusGeometry(1, 0.15, 5, 12, Math.PI),
  roof: wedge,
  dome: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
};
const matte = sculptedMaterial({ roughness: 0.86, metalness: 0 });

/** One draw call per shape, not per tile, arch, leaf or sandstone block. */
function Batch({
  parts,
  geometry,
}: {
  parts: CampusPart[];
  geometry: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const mesh = ref.current,
      object = new THREE.Object3D(),
      color = new THREE.Color();
    parts.forEach(({ p, s, c, r = [0, 0, 0] }, i) => {
      object.position.set(...p);
      object.scale.set(...s);
      object.rotation.set(...r);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, matte, parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

export function CampusDistrictParts({ parts }: { parts: CampusPart[] }) {
  const batches = useMemo(
    () =>
      (Object.keys(shapes) as CampusShape[]).map((shape) => ({
        shape,
        parts: parts.filter((part) => part.shape === shape),
      })),
    [parts],
  );
  return batches.map(({ shape, parts: batch }) => (
    <Batch key={shape} geometry={shapes[shape]} parts={batch} />
  ));
}
