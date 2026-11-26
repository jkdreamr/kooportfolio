import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { chamferBoxGeometry, pieceBox } from "./chamferBox";
import {
  sculptedMaterial,
  surfaceKindForColor,
  type SurfaceKind,
} from "./Surface";

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
  /** Surface kind (detail layer); default: sandstone → stone, else guessed. */
  k?: SurfaceKind;
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
  stone: chamferBoxGeometry(0.08),
  block: new THREE.BoxGeometry(),
  round: new THREE.IcosahedronGeometry(1, 1),
  column: new THREE.CylinderGeometry(1, 1, 1, 10),
  arch: new THREE.TorusGeometry(1, 0.15, 5, 12, Math.PI),
  roof: wedge,
  dome: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
};
const mattes = new Map<SurfaceKind, THREE.MeshStandardMaterial>();
const matte = (kind: SurfaceKind) => {
  let m = mattes.get(kind);
  if (!m)
    mattes.set(kind, (m = sculptedMaterial({ roughness: 0.86, metalness: 0 }, kind)));
  return m;
};
const scratch = new THREE.Color();
/** Warm, light sandstone tints read as cut stone. */
export function campusKind(part: CampusPart): SurfaceKind {
  if (part.k) return part.k;
  const hsl = scratch.set(part.c).getHSL({ h: 0, s: 0, l: 0 });
  if (hsl.h >= 0.07 && hsl.h <= 0.15 && hsl.l >= 0.45 && hsl.s >= 0.15)
    return "stone";
  return surfaceKindForColor(part.c);
}

/** One draw call per shape, not per tile, arch, leaf or sandstone block. */
function Batch({
  parts,
  geometry,
  kind,
  bakedShadow = true,
}: {
  parts: CampusPart[];
  geometry: THREE.BufferGeometry;
  kind: SurfaceKind;
  /** false: casts nothing once baked (tiles on a roof wedge that casts). */
  bakedShadow?: boolean;
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
    // Mutated, never a `userData` prop (R3F would drop the baker's mark).
    if (bakedShadow) delete mesh.userData.castCount;
    else mesh.userData.castCount = 0;
  }, [parts, bakedShadow]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, matte(kind), parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

export function CampusDistrictParts({ parts }: { parts: CampusPart[] }) {
  const batches = useMemo(() => {
    const groups = new Map<
      string,
      { shape: CampusShape; kind: SurfaceKind; parts: CampusPart[] }
    >();
    for (const part of parts) {
      const kind = campusKind(part);
      const key = `${part.shape}:${kind}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { shape: part.shape, kind, parts: [] }));
      group.parts.push(part);
    }
    return [...groups.entries()];
  }, [parts]);
  return batches.map(([key, { shape, kind, parts: batch }]) => (
    <Batch
      key={key}
      geometry={shape === "stone" ? pieceBox(shapes.stone) : shapes[shape]}
      kind={kind}
      parts={batch}
      // Roof tiles sit on the solid roof wedge, which casts the same shadow.
      bakedShadow={!(shape === "stone" && kind === "shingle")}
    />
  ));
}
