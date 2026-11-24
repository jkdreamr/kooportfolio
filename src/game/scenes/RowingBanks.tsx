import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { riverCenter } from "../core/rowing";
import { Box, Cylinder, Ball } from "../world/Models";

/** Instanced shoreline dressing keeps a long course cheap to draw. */
export function RowingBanks({
  length,
  seed,
}: {
  length: number;
  seed: number;
}) {
  const rocks = useRef<THREE.InstancedMesh>(null);
  const reeds = useRef<THREE.InstancedMesh>(null);
  const count = Math.ceil(length / 5.5) + 25;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const color = new THREE.Color();
    for (let i = 0; i < count * 2; i++) {
      const side = i % 2 ? 1 : -1;
      const s = Math.floor(i / 2) * 5.5 - 30 + Math.sin(i * 28.7) * 2.1;
      const c = riverCenter(Math.max(0, s), seed);
      const variation = Math.sin(i * 73.13 + seed) * 0.5 + 0.5;
      const second = Math.sin(i * 13.37 + seed * 1.7) * 0.5 + 0.5;
      dummy.position.set(c + side * (12.5 + second * 1.5), -0.04, -s);
      dummy.rotation.set(variation * 0.5, i * 2.3, side * 0.17);
      dummy.scale.set(
        0.25 + variation * 0.7,
        0.2 + second * 0.32,
        0.4 + variation * 0.8,
      );
      if (i % 5 === 1) dummy.scale.setScalar(0);
      dummy.updateMatrix();
      rocks.current?.setMatrixAt(i, dummy.matrix);
      rocks.current?.setColorAt(i, color.set(i % 3 ? "#70847c" : "#99a492"));
      for (let blade = 0; blade < 3; blade++) {
        dummy.position.set(
          c + side * (13.4 + variation * 1.2) + blade * 0.17,
          0.25 + variation * 0.2,
          -s + 0.35 * blade,
        );
        dummy.rotation.set(
          side * 0.15,
          i * 0.3 + blade,
          side * (blade - 1) * 0.2,
        );
        dummy.scale.set(0.8, 0.6 + variation * 0.65, 0.8);
        dummy.updateMatrix();
        reeds.current?.setMatrixAt(i * 3 + blade, dummy.matrix);
        reeds.current?.setColorAt(
          i * 3 + blade,
          color.set(blade % 2 ? "#6d9e3d" : "#436f35"),
        );
      }
    }
    for (const mesh of [rocks.current, reeds.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [count, seed, dummy]);
  return (
    <>
      <instancedMesh
        ref={rocks}
        args={[undefined, undefined, count * 2]}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.94} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={reeds}
        args={[undefined, undefined, count * 6]}
        castShadow
      >
        <coneGeometry args={[0.17, 1, 4]} />
        <meshStandardMaterial roughness={0.86} flatShading />
      </instancedMesh>
      {[80, 220, 400, 600]
        .filter((s) => s < length - 35)
        .map((s, i) => {
          const side = i % 2 ? -1 : 1;
          return (
            <group
              key={s}
              position={[riverCenter(s, seed) + side * 12.6, 0, -s]}
            >
              <Box p={[side * 1.1, 0.2, 0]} s={[3.5, 0.32, 5.5]} c="#765238" />
              {Array.from({ length: 9 }, (_, plank) => (
                <Box
                  key={plank}
                  p={[side * 1.1, 0.39, -2.4 + plank * 0.6]}
                  s={[3.4, 0.12, 0.53]}
                  c={plank % 3 ? "#ac7c49" : "#bd9257"}
                />
              ))}
              {[-2.2, 2.2].map((z) => (
                <group key={z}>
                  <Cylinder
                    p={[side * 2.4, 0.8, z]}
                    s={[0.17, 1.9, 0.17]}
                    c="#5d422f"
                  />
                  <Ball
                    p={[side * 2.4, 1.78, z]}
                    s={[0.24, 0.14, 0.24]}
                    c="#d4b36d"
                  />
                </group>
              ))}
              <Cylinder
                p={[side * 2.4, 2.4, 0]}
                s={[0.065, 4.6, 0.065]}
                c="#5d422f"
              />
              <Box
                p={[side * 2.9, 4.4, 0]}
                s={[1.05, 0.7, 0.1]}
                c={i % 2 ? "#c96e42" : "#e4ad3c"}
              />
            </group>
          );
        })}
    </>
  );
}
