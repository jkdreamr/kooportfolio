import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { forest } from "../core/scenery";

type Part = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
};
const crown = new THREE.IcosahedronGeometry(1, 1);
const trunk = new THREE.CylinderGeometry(0.8, 1, 1, 7);
const reed = new THREE.ConeGeometry(1, 1, 5);
const matte = new THREE.MeshStandardMaterial({ roughness: 0.92 });
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
const trunks: Part[] = [],
  crowns: Part[] = [],
  rocks: Part[] = [],
  grass: Part[] = [];
forest.forEach(({ x, z, height: h }, i) => {
  trunks.push({ p: [x, h / 2, z], s: [0.28, h, 0.28], c: "#755032" });
  for (let j = 0; j < 3; j++)
    crowns.push({
      p: [
        x + Math.sin(j * 2.1) * 0.8,
        h - 0.5 + j * 0.7,
        z + Math.cos(j * 2.1) * 0.6,
      ],
      s: [1.5, 1.65, 1.5],
      c: ["#427535", "#568639", "#739746"][(i + j) % 3],
    });
  if (i % 3 === 0)
    rocks.push({
      p: [x + 1.7, 0.5, z - 0.7],
      s: [1.2, 0.85, 0.9],
      c: i % 2 ? "#8c9380" : "#aaa78c",
    });
});
for (let i = 0; i < 650; i++) {
  const a = i * 2.399963,
    r = Math.sqrt((i + 1) / 650),
    x = Math.cos(a) * 46 * r,
    z = Math.sin(a) * 39 * r;
  if (
    Math.abs(x) < 2.5 ||
    Math.abs(z - 10) < 2.5 ||
    Math.abs(z + 9) < 2.5 ||
    Math.abs(z - 29) < 2.5 ||
    Math.abs(Math.abs(x) - 34) < 2
  )
    continue;
  for (let j = 0; j < 3; j++)
    grass.push({
      p: [x + j * 0.16, 0.32, z + (j % 2) * 0.15],
      s: [0.12, 0.35 + (i % 4) * 0.1, 0.12],
      c: i % 3 ? "#638d3d" : "#8aab4d",
    });
}
export function Scenery() {
  return (
    <>
      <Instances parts={trunks} geometry={trunk} />
      <Instances parts={crowns} geometry={crown} />
      <Instances parts={rocks} geometry={crown} />
      <Instances parts={grass} geometry={reed} />
    </>
  );
}
