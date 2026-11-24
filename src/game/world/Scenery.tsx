import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { forest, grassSites, type GroundFootprint } from "../core/scenery";
import { NaturalTrees } from "./TreeArt";
import { sculptedMaterial } from "./Surface";

type Part = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
};
const crown = new THREE.IcosahedronGeometry(1, 1);
const reed = new THREE.ConeGeometry(1, 1, 5);
const matte = sculptedMaterial({ roughness: 0.92 });
function Instances({
  parts,
  geometry,
}: {
  parts: Part[];
  geometry: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!,
      object = new THREE.Object3D(),
      color = new THREE.Color();
    parts.forEach(({ p, s, c }, i) => {
      object.position.set(...p);
      object.scale.set(...s);
      object.rotation.y = i * 1.7;
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
const rocks: Part[] = [];
const trees = forest.map(({ x, z, height }, i) => ({
  p: [x, 0, z] as const,
  size: (height + 1.8) / 4.8,
  variant: i % 7,
}));
forest.forEach(({ x, z }, i) => {
  if (i % 3 === 0)
    rocks.push({
      p: [x + 1.7, 0.5, z - 0.7],
      s: [1.2, 0.85, 0.9],
      c: i % 2 ? "#8c9380" : "#aaa78c",
    });
});
export function GroundGrass({ avoid }: { avoid: readonly GroundFootprint[] }) {
  const parts = useMemo(
    () =>
      grassSites(avoid).map<Part>(({ x, z, variant }) => ({
        p: [x, 0.32, z],
        s: [0.12, 0.35 + (variant % 4) * 0.1, 0.12],
        c: variant % 3 ? "#638143" : "#8b9c59",
      })),
    [avoid],
  );
  return <Instances parts={parts} geometry={reed} />;
}
export function Scenery() {
  return (
    <>
      <NaturalTrees trees={trees} />
      <Instances parts={rocks} geometry={crown} />
    </>
  );
}
