import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { REFLECT_LAYER } from "./reflection";

/**
 * A reflection-only stand-in for a large static mesh (budget §1.5): the
 * source geometry (usually a coarser build of it) split into XZ cells, each
 * its own mesh on the reflection layer only. The planar pass culls cells
 * outside the water's screen rectangle, so a lake mirrors only the terrain
 * or rocks that can actually appear in it; the main and shadow passes never
 * see these meshes (layer 0 is off).
 */

/** Split a non-indexed geometry into cells of `cell` units by triangle
 * centroid. Every attribute is carried over. */
export function splitByCell(geometry: THREE.BufferGeometry, cell: number): THREE.BufferGeometry[] {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const buckets = new Map<string, number[]>();
  for (let t = 0; t < position.count; t += 3) {
    const x = (position.getX(t) + position.getX(t + 1) + position.getX(t + 2)) / 3,
      z = (position.getZ(t) + position.getZ(t + 1) + position.getZ(t + 2)) / 3;
    const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(t);
    else buckets.set(key, [t]);
  }
  const names = Object.keys(source.attributes);
  const out: THREE.BufferGeometry[] = [];
  for (const triangles of buckets.values()) {
    const part = new THREE.BufferGeometry();
    for (const name of names) {
      const attribute = source.getAttribute(name) as THREE.BufferAttribute;
      const size = attribute.itemSize;
      const array = new Float32Array(triangles.length * 3 * size);
      let o = 0;
      for (const t of triangles)
        for (let v = 0; v < 3; v++)
          for (let c = 0; c < size; c++) array[o++] = attribute.getComponent(t + v, c);
      part.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    part.computeBoundingSphere();
    out.push(part);
  }
  if (source !== geometry) source.dispose();
  return out;
}

const cache = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry[]>>();
function cells(geometry: THREE.BufferGeometry, cell: number) {
  let byCell = cache.get(geometry);
  if (!byCell) cache.set(geometry, (byCell = new Map()));
  let parts = byCell.get(cell);
  if (!parts) byCell.set(cell, (parts = splitByCell(geometry, cell)));
  return parts;
}

const noRaycast = () => undefined;

export function ReflectionProxy({
  geometry,
  material,
  cell = 24,
}: {
  geometry: THREE.BufferGeometry | null;
  material: THREE.Material;
  cell?: number;
}) {
  const parts = useMemo(() => (geometry ? cells(geometry, cell) : []), [geometry, cell]);
  const group = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    group.current?.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) child.layers.set(REFLECT_LAYER);
    });
  }, [parts]);
  return (
    <group ref={group} name="env-reflection-proxy">
      {parts.map((part, i) => (
        <mesh key={i} geometry={part} material={material} raycast={noRaycast} dispose={null} />
      ))}
    </group>
  );
}
