import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HALF_WIDTH, toPlan, type Course } from "../core/rowCourse";
import { courseRibbon } from "./RowingWater";

/** Grass ribbons either side of the course, with instanced reeds and rocks
 * along both edges (static buffers, built once). */
export function RowingBanks({ course }: { course: Course }) {
  const rocks = useRef<THREE.InstancedMesh>(null);
  const reeds = useRef<THREE.InstancedMesh>(null);
  const count = Math.ceil(course.length / 5.5);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const left = useMemo(() => courseRibbon(course, HALF_WIDTH + 0.6, HALF_WIDTH + 13, 2, 0.02, 80), [course]);
  const right = useMemo(() => courseRibbon(course, -HALF_WIDTH - 13, -HALF_WIDTH - 0.6, 2, 0.02, 80), [course]);
  useEffect(
    () => () => {
      left.dispose();
      right.dispose();
    },
    [left, right],
  );
  useLayoutEffect(() => {
    const color = new THREE.Color();
    const p = { x: 0, y: 0 };
    for (let i = 0; i < count * 2; i++) {
      const side = i % 2 ? 1 : -1;
      const s = Math.floor(i / 2) * 5.5 + Math.sin(i * 28.7) * 2.1;
      const variation = Math.sin(i * 73.13) * 0.5 + 0.5;
      const second = Math.sin(i * 13.37) * 0.5 + 0.5;
      toPlan(course, Math.max(0, Math.min(course.length, s)), side * (HALF_WIDTH + 0.9 + second * 1.5), p);
      dummy.position.set(p.x, -0.04, -p.y);
      dummy.rotation.set(variation * 0.5, i * 2.3, side * 0.17);
      dummy.scale.set(0.25 + variation * 0.7, 0.2 + second * 0.32, 0.4 + variation * 0.8);
      if (i % 5 === 1) dummy.scale.setScalar(0);
      dummy.updateMatrix();
      rocks.current?.setMatrixAt(i, dummy.matrix);
      rocks.current?.setColorAt(i, color.set(i % 3 ? "#70847c" : "#99a492"));
      for (let blade = 0; blade < 3; blade++) {
        toPlan(course, Math.max(0, Math.min(course.length, s + 0.35 * blade)), side * (HALF_WIDTH + 1.6 + variation * 1.2 + blade * 0.17), p);
        dummy.position.set(p.x, 0.25 + variation * 0.2, -p.y);
        dummy.rotation.set(side * 0.15, i * 0.3 + blade, side * (blade - 1) * 0.2);
        dummy.scale.set(0.8, 0.6 + variation * 0.65, 0.8);
        dummy.updateMatrix();
        reeds.current?.setMatrixAt(i * 3 + blade, dummy.matrix);
        reeds.current?.setColorAt(i * 3 + blade, color.set(blade % 2 ? "#6d9e3d" : "#436f35"));
      }
    }
    for (const mesh of [rocks.current, reeds.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [count, course, dummy]);
  return (
    <group>
      <mesh geometry={left} receiveShadow>
        <meshStandardMaterial color="#6a9c4f" roughness={0.95} />
      </mesh>
      <mesh geometry={right} receiveShadow>
        <meshStandardMaterial color="#6a9c4f" roughness={0.95} />
      </mesh>
      <instancedMesh ref={rocks} args={[undefined, undefined, count * 2]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.94} flatShading />
      </instancedMesh>
      <instancedMesh ref={reeds} args={[undefined, undefined, count * 6]}>
        <coneGeometry args={[0.17, 1, 4]} />
        <meshStandardMaterial roughness={0.86} flatShading />
      </instancedMesh>
    </group>
  );
}
