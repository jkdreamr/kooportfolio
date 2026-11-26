import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { Box, Cylinder, Ring, Sign } from "../world/Models";
import { BrassStud, CraftedBox, WallSconce } from "./CraftedDetails";

const coinGeometry = new THREE.CylinderGeometry(0.21, 0.21, 0.075, 12);
const coinMaterial = new THREE.MeshStandardMaterial({
  color: "#f3c651",
  roughness: 0.34,
  metalness: 0.55,
});
const coins = Array.from({ length: 128 }, (_, i) => {
  const stack = Math.floor(i / 4);
  return {
    x: (stack % 8) * 0.48 - 1.68 + Math.sin(stack * 7) * 0.06,
    y: 1.6 + (i % 4) * 0.078,
    z: Math.floor(stack / 8) * 0.53 - 0.8,
    tilt: Math.sin(stack * 3) * 0.04,
  };
});

function GoldCoins({ claimed }: { claimed: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    const mesh = ref.current;
    if (!mesh) return;
    const remaining = claimed ? coins.filter((_, i) => i < 8) : coins;
    mesh.count = remaining.length;
    remaining.forEach(({ x, y, z, tilt }, i) => {
      object.position.set(x, claimed ? 0.5 + (i % 4) * 0.078 : y, z);
      object.rotation.set(tilt, i * 0.41, tilt / 2);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(i % 3 ? "#f4d06d" : "#c89932"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [claimed]);
  return (
    <instancedMesh
      ref={ref}
      args={[coinGeometry, coinMaterial, coins.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

function CoinChest({ claimed }: { claimed: boolean }) {
  return (
    <group position={[0, 0, -3]}>
      <CraftedBox p={[0, 0.2, 0]} s={[4.9, 0.28, 3.1]} c="#4c3528" />
      <Box p={[0, 0.44, 0]} s={[4.25, 0.14, 2.5]} c="#743d38" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <CraftedBox
            p={[side * 2.25, 1.05, 0]}
            s={[0.25, 1.5, 2.8]}
            c="#70442c"
          />
          {Array.from({ length: 10 }, (_, i) => (
            <CraftedBox
              key={i}
              p={[(i - 4.5) * 0.45, 1.05, side * 1.3]}
              s={[0.43, 1.5, 0.22]}
              c={i % 3 ? "#78472c" : "#8e5833"}
            />
          ))}
          <CraftedBox
            p={[0, 1.77, side * 1.36]}
            s={[4.8, 0.16, 0.16]}
            c="#c7a34d"
            metal
          />
          {[-1.5, 1.5].map((x) => (
            <group key={x}>
              <CraftedBox
                p={[x, 1.05, side * 1.44]}
                s={[0.2, 1.5, 0.1]}
                c="#b38c3e"
                metal
              />
              {[0.5, 1.05, 1.6].map((y) => (
                <BrassStud key={y} p={[x, y, side * 1.51]} />
              ))}
            </group>
          ))}
        </group>
      ))}
      {!claimed && <Box p={[0, 1.2, 0]} s={[4.15, 0.65, 2.4]} c="#b69036" />}
      <GoldCoins claimed={claimed} />
      <group position={[0, 1.8, -1.4]} rotation={[-1.1, 0, 0]}>
        {Array.from({ length: 10 }, (_, i) => (
          <CraftedBox
            key={i}
            p={[(i - 4.5) * 0.46, 0, 1.4]}
            s={[0.44, 0.23, 2.8]}
            c={i % 3 ? "#875432" : "#98613a"}
          />
        ))}
        <Box p={[0, 0.13, 1.4]} s={[4.1, 0.05, 2.4]} c="#813e39" />
        {[-1.55, 1.55].map((x) => (
          <CraftedBox
            key={x}
            p={[x, 0.18, 1.4]}
            s={[0.17, 0.1, 2.85]}
            c="#c9a54e"
            metal
          />
        ))}
        {[0, 2.8].map((z) => (
          <CraftedBox
            key={z}
            p={[0, 0.12, z]}
            s={[4.8, 0.16, 0.14]}
            c="#c9a54e"
            metal
          />
        ))}
      </group>
      <CraftedBox p={[0, 1.32, 1.5]} s={[0.55, 0.6, 0.13]} c="#c6a04c" metal />
      <Ring
        p={[0, 1.1, 1.61]}
        radius={0.12}
        tube={0.04}
        c="#513a23"
        r={[0, 0, 0]}
      />
    </group>
  );
}

function PlatinumDisplay() {
  // USACO Platinum is owner-confirmed; no other achievements are invented.
  return (
    <group position={[-6.2, 0, -6]} rotation={[0, 0.2, 0]}>
      <CraftedBox p={[0, 0.18, 0]} s={[3.2, 0.36, 1.6]} c="#78644c" />
      <CraftedBox p={[0, 1.25, 0]} s={[2.6, 1.9, 1.1]} c="#506d60" />
      <CraftedBox p={[0, 2.22, 0]} s={[3.15, 0.22, 1.55]} c="#c6c8b6" metal />
      <Cylinder p={[0, 2.42, 0]} s={[0.6, 0.18, 0.6]} c="#aabbb8" />
      <Cylinder p={[0, 2.8, 0]} s={[0.13, 0.65, 0.13]} c="#aabbb8" />
      <mesh position={[0, 3.22, 0]} castShadow>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial
          color="#d0dedc"
          roughness={0.24}
          metalness={0.65}
        />
      </mesh>
      <Ring
        p={[0, 3.2, 0]}
        radius={0.8}
        tube={0.035}
        c="#c7d1c8"
        r={[0.2, 0, 0.2]}
      />
      <Sign
        text="USACO PLATINUM"
        p={[0, 1.32, 0.59]}
        size={[2.3, 0.6]}
        color="#334d43"
        ink="#edf0da"
      />
      {[-1.1, 1.1].flatMap((x) =>
        [0.65, 1.85].map((y) => (
          <BrassStud key={`${x}:${y}`} p={[x, y, 0.62]} radius={0.035} />
        )),
      )}
    </group>
  );
}

/** Furnishings for the shared 22×26 interior shell. State, reward and Walker belong to the scene owner. */
export function SecretRoomInterior({ claimed = false }: { claimed?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.09, -3]} s={[7.3, 0.08, 6.8]} c="#4b6859" />
      {[-3.5, 3.5].map((x) => (
        <Box key={x} p={[x, 0.14, -3]} s={[0.07, 0.025, 6.4]} c="#c2a764" />
      ))}
      <CoinChest claimed={claimed} />
      <PlatinumDisplay />
      {[-8, 8].map((x) => (
        <WallSconce key={x} p={[x, 2.8, -12.1]} />
      ))}
      <group position={[6.8, 0, -7]}>
        <CraftedBox p={[0, 0.45, 0]} s={[2.1, 0.9, 1.4]} c="#73543a" />
        <CraftedBox p={[0, 0.93, 0]} s={[2.2, 0.14, 1.5]} c="#9b7950" />
        {[-0.65, 0.65].map((x) => (
          <CraftedBox
            key={x}
            p={[x, 0.5, 0.73]}
            s={[0.12, 0.82, 0.08]}
            c="#aa8841"
            metal
          />
        ))}
        {[-0.5, 0, 0.5].map((x) => (
          <Cylinder
            key={x}
            p={[x, 1.14, 0]}
            s={[0.17, 1.05, 0.17]}
            r={[0, 0, Math.PI / 2]}
            c="#d7c596"
          />
        ))}
      </group>
    </group>
  );
}
