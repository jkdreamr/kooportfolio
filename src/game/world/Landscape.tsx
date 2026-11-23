import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { Box, Cylinder, Ball, Tree, Bench, Boat, Cone, Sign } from "./Models";

type Block = [number, number, number, number, number, number, string, number?];
function Blocks({
  items,
  shadow = false,
}: {
  items: Block[];
  shadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!,
      object = new THREE.Object3D(),
      color = new THREE.Color();
    items.forEach(([x, y, z, sx, sy, sz, c, angle = 0], i) => {
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      object.rotation.y = angle;
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, items.length]}
      castShadow={shadow}
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  );
}

const tiles: Block[] = [];
for (let ix = -10; ix <= 10; ix++)
  for (let iz = -8; iz <= 8; iz++) {
    const x = ix * 2.12,
      z = iz * 2.12 - 1;
    if ((x / 22) ** 2 + ((z + 1) / 18.4) ** 2 < 1)
      tiles.push([
        x,
        0.13,
        z,
        2.08,
        0.025,
        2.08,
        (ix + iz) % 2 ? "#5d963d" : "#659e42",
      ]);
  }
const masonry: Block[] = [];
for (let i = 0; i < 55; i++) {
  const angle = Math.PI + (i / 54) * Math.PI;
  const x = Math.cos(angle) * 22,
    z = Math.sin(angle) * 17.6 - 0.5;
  masonry.push([
    x,
    0.55,
    z,
    1.14,
    1,
    0.85,
    i % 2 ? "#8f9276" : "#a4a98c",
    -angle,
  ]);
  masonry.push([x, 1.13, z, 1.23, 0.24, 0.98, "#c2c3a0", -angle]);
  if (i % 5 === 0)
    masonry.push([x, 1.48, z, 0.72, 0.55, 0.8, "#b1b48f", -angle]);
}
const roads: Block[] = [
  [0, 0.17, -2, 2, 0.1, 27, "#c9b381"],
  [0, 0.17, -4.25, 35, 0.1, 1.8, "#c9b381"],
  [-17.2, 0.17, 3.5, 1.8, 0.1, 17, "#c9b381"],
  [17.2, 0.17, 3.5, 1.8, 0.1, 17, "#c9b381"],
  [0, 0.17, 13, 35.5, 0.1, 1.8, "#c9b381"],
  [-11, 0.17, -5.7, 1.8, 0.1, 3.8, "#c9b381"],
  [11, 0.17, -5.7, 1.8, 0.1, 3.8, "#c9b381"],
  [-13, 0.17, 7.5, 1.8, 0.1, 4.5, "#c9b381"],
  [-15.1, 0.17, 9, 4.2, 0.1, 1.8, "#c9b381"],
  [14.1, 0.17, 6, 6.3, 0.1, 1.8, "#c9b381"],
  [-5, 0.17, 11, 1.7, 0.1, 4.8, "#c9b381"],
  [5.5, 0.17, 12.5, 1.8, 0.1, 2, "#c9b381"],
];
const paving: Block[] = [];
for (let i = 0; i < 48; i++)
  paving.push([
    i % 2 ? -0.4 : 0.4,
    0.235,
    -14.8 + i * 0.56,
    0.68,
    0.025,
    0.42,
    i % 3 ? "#d9c99d" : "#b9a37b",
  ]);

export function Landscape() {
  return (
    <group>
      <Cylinder p={[0, -1.25, -1]} s={[23.5, 2.2, 20.2]} c="#655e3e" />
      <Cylinder p={[0, -0.35, -1]} s={[23.7, 0.7, 20.4]} c="#b3aa77" />
      <Cylinder p={[0, -0.01, -1]} s={[23.4, 0.3, 20]} c="#568f38" />
      <Blocks items={tiles} />
      <Blocks items={masonry} shadow />
      <Blocks items={roads} />
      <Blocks items={paving} />
      <Box p={[-3, -0.07, 18.2]} s={[43, 0.2, 6]} c="#4b9f9c" />
      <Box p={[-3, -0.02, 18.2]} s={[43, 0.08, 5.7]} c="#64b3a7" />
      {Array.from({ length: 17 }, (_, i) => (
        <Box
          key={i}
          p={[Math.sin(i * 3.2) * 19 - 3, 0.03, 16.2 + (i % 5)]}
          s={[1.1 + (i % 3), 0.01, 0.035]}
          c="#99d4bf"
        />
      ))}
      <group position={[-13, 0.2, 15.7]}>
        <Box s={[3.3, 0.25, 6.1]} c="#805d36" />
        {Array.from({ length: 14 }, (_, i) => (
          <Box
            key={i}
            p={[0, 0.15, i * 0.42 - 2.65]}
            s={[3.5, 0.15, 0.36]}
            c={i % 2 ? "#b88a54" : "#c69b61"}
          />
        ))}
        {[-1.4, 1.4].flatMap((x) =>
          [-2.7, 2.7].map((z) => (
            <Cylinder
              key={`${x}:${z}`}
              p={[x, -0.5, z]}
              s={[0.16, 1.7, 0.16]}
              c="#6e5138"
            />
          )),
        )}
      </group>
      <group position={[-8.5, 0.1, 18.4]} rotation={[0, 1.4, 0]}>
        <Boat pace={0} color="#edc96e" />
      </group>
      {Array.from({ length: 24 }, (_, i) => {
        const a = Math.PI + (i / 23) * Math.PI;
        return (
          <Tree
            key={i}
            p={[Math.cos(a) * 23, 0, Math.sin(a) * 18.8 - 0.6]}
            size={0.8 + (i % 3) * 0.15}
            variant={i % 3 === 0 ? 0 : 2}
          />
        );
      })}
      <Orchard />
      <MusicCorner />
      <Windmill />
      <Bench p={[-2.7, 0.2, 3.4]} />
      <Bench p={[2.8, 0.2, -2.9]} rotation={Math.PI} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 2.4, 0, -4.3]}>
          <Cylinder p={[0, 2.25, 0]} s={[0.09, 4.5, 0.09]} c="#604a31" />
          <Box
            p={[0.5, 3.7, 0]}
            s={[1.1, 1, 0.08]}
            c={side === 1 ? "#c95134" : "#327b75"}
          />
          <Box p={[0.5, 3.7, 0.06]} s={[0.16, 0.65, 0.03]} c="#edc45e" />
          <Ball p={[0, 4.55, 0]} s={[0.16, 0.16, 0.16]} c="#e8bb4e" />
        </group>
      ))}
    </group>
  );
}

function Orchard() {
  return (
    <group position={[-7, 0, 13.6]}>
      {[-2.5, 0, 2.5].map((x) => (
        <group key={x}>
          <Box p={[x, 0.28, 0]} s={[1.5, 0.4, 3.2]} c="#705239" />
          {[-1, 0, 1].map((z) => (
            <group key={z}>
              <Ball p={[x, 0.65, z]} s={[0.44, 0.4, 0.4]} c="#438e3e" />
              <Ball
                p={[x + 0.18, 0.78, z + 0.15]}
                s={[0.12, 0.12, 0.12]}
                c="#cc6135"
              />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
function MusicCorner() {
  return (
    <group position={[14, 0, 12]}>
      <Cylinder p={[0, 0.24, 0]} s={[2.35, 0.45, 2.35]} c="#8c6b45" />
      <Box p={[0, 1.15, -0.5]} s={[2.7, 0.18, 1.1]} c="#b29a68" />
      {[-0.7, 0.7].map((x) => (
        <Cylinder key={x} p={[x, 1.3, -0.5]} s={[0.4, 0.1, 0.4]} c="#303e38" />
      ))}
      {[-1.8, 1.8].map((x) => (
        <group key={x}>
          <Box p={[x, 0.9, -0.5]} s={[0.65, 1.5, 0.65]} c="#37463d" />
          <Cylinder
            p={[x, 1.05, -0.12]}
            s={[0.22, 0.06, 0.22]}
            r={[Math.PI / 2, 0, 0]}
            c="#a28a52"
          />
        </group>
      ))}
      <Sign
        text="♪"
        p={[0, 1.5, 0.08]}
        size={[0.6, 0.6]}
        color="#3c6448"
        ink="#ebcc81"
      />
      <Bench p={[0, 0, 2.8]} />
    </group>
  );
}
function Windmill() {
  return (
    <group position={[-18, 0, -10.6]} scale={0.8}>
      <Cylinder p={[0, 1.9, 0]} s={[1.5, 3.8, 1.5]} c="#c5b188" />
      <Box p={[0, 4.2, 0]} s={[2.5, 1.6, 2.1]} c="#8d593b" />
      <Cone p={[0, 5.6, 0]} s={[2, 1.5, 1.8]} c="#c25132" />
      <group position={[0, 4.4, 1.3]} rotation={[0, 0, 0.7]}>
        <Box s={[6, 0.25, 0.25]} c="#68492f" />
        <Box s={[0.25, 6, 0.25]} c="#68492f" />
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <Box p={[1.9, 0.4, 0]} s={[1.7, 0.8, 0.15]} c="#e9d59b" />
          </group>
        ))}
        <Ball s={[0.35, 0.35, 0.25]} c="#c7984f" />
      </group>
    </group>
  );
}
