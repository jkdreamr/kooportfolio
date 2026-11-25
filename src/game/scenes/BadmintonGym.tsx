import { useMemo } from "react";
import * as THREE from "three";
import { useGame } from "../core/store";
import { Box, Cylinder } from "../world/Models";
import { CraftedBox } from "./CraftedDetails";

function Bleachers({ side }: { side: number }) {
  return (
    <group position={[side * 12.1, 0, -2.6]}>
      {[0, 1, 2].map((row) => (
        <group key={row} position={[side * row * 1.05, row * 0.5, 0]}>
          <Box p={[0, 0.2, 0]} s={[1.05, 0.4, 8]} c="#647177" />
          <Box
            p={[0, 0.48, 0]}
            s={[0.88, 0.19, 8.1]}
            c={row % 2 ? "#bd8c52" : "#cd9c5c"}
          />
          {[-3.1, -1.55, 0, 1.55, 3.1].map((z) => (
            <group key={z}>
              <Box
                p={[side * 0.23, 0.84, z]}
                s={[0.25, 0.64, 1.25]}
                c="#45616b"
              />
              <Box
                p={[-side * 0.1, 0.61, z]}
                s={[0.64, 0.11, 1.25]}
                c="#3c5964"
              />
            </group>
          ))}
        </group>
      ))}
      {[-4.18, 4.18].map((z) => (
        <group key={z}>
          <Cylinder
            p={[side * 2.7, 1.65, z]}
            s={[0.065, 3.3, 0.065]}
            c="#51616a"
          />
          <Cylinder
            p={[side * 1.25, 2.35, z]}
            s={[0.065, 3.25, 0.065]}
            r={[0, 0, side * 1.12]}
            c="#a88c59"
          />
        </group>
      ))}
      <Box p={[side * 1.1, 1.68, -1.55]} s={[0.65, 0.14, 0.6]} c="#e4ddc7" />
      <Box p={[side * 1.24, 1.53, -1.55]} s={[0.12, 0.38, 0.6]} c="#d3cbb1" />
    </group>
  );
}

/** Cutaway gym fixtures, sized for the host's 34×40 hall. */export function BadmintonGym() {
  const quality = useGame((s) => s.quality);
  const target = useMemo(() => {
    const object = new THREE.Object3D();
    object.position.set(0, 0, -3);
    return object;
  }, []);
  return (
    <group>
      {/* Low padded walls leave the playing surface unobstructed. */}
      {Array.from({ length: 15 }, (_, i) => (
        <group key={i} position={[(i - 7) * 2.1, 0, -19.45]}>
          <Box
            p={[0, 1.35, 0]}
            s={[2.03, 2.5, 0.35]}
            c={i % 3 ? "#365862" : "#2d4b55"}
          />
          <Box p={[0, 2.65, 0.02]} s={[2.07, 0.1, 0.4]} c="#d0ac6d" />
        </group>
      ))}
      {[-15.7, 15.7].map((x) => (
        <group key={x}>
          {[-16.4, -8.2, 0, 8.2, 16.2].map((z) => (
            <group key={z} position={[x, 0, z]}>
              <Box p={[0, 0.4, 0]} s={[1.2, 0.8, 1.2]} c="#72817b" />
              <Box p={[0, 4.3, 0]} s={[0.55, 8, 0.6]} c="#34515c" />
              <CraftedBox
                p={[0, 2.2, 0]}
                s={[0.65, 0.18, 0.7]}
                c="#a68a57"
                metal
              />
              <CraftedBox
                p={[0, 7.8, 0]}
                s={[0.85, 0.5, 0.85]}
                c="#a68a57"
                metal
              />
            </group>
          ))}
          <Box p={[x, 8.15, 0]} s={[0.7, 0.6, 34]} c="#34515c" />
          <Box p={[x, 6.2, 0]} s={[0.35, 0.28, 34]} c="#516a72" />
          {[-12.3, -4.1, 4.1, 12.3].map((z) => (
            <Box
              key={z}
              p={[x, 7.17, z]}
              s={[0.22, 0.22, 8.45]}
              r={[0.22, 0, 0]}
              c="#5b7378"
            />
          ))}
        </group>
      ))}
      <Box p={[0, 8.15, -17.7]} s={[31.8, 0.65, 0.65]} c="#34515c" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            p={[side * 12.5, 6.75, -17.7]}
            s={[0.35, 3.5, 0.35]}
            r={[0, 0, -side * 0.82]}
            c="#5b7378"
          />
          <CraftedBox
            p={[side * 10.1, 8, -17.7]}
            s={[0.12, 0.8, 0.86]}
            c="#b0945f"
            metal
          />
          <Bleachers side={side} />
          {/* Cantilevered light housings sit outside the court silhouette. */}
          {[-12, 3].map((z) => (
            <group key={z} position={[side * 11.4, 7.5, z]}>
              <Box
                p={[side * 2.1, 0.52, 0]}
                s={[4.7, 0.22, 0.22]}
                c="#51666c"
              />
              <CraftedBox s={[2.5, 0.32, 0.8]} c="#253e48" metal />
              <mesh position={[0, -0.18, 0]}>
                <boxGeometry args={[2.2, 0.1, 0.58]} />
                <meshStandardMaterial
                  color="#fff0cd"
                  emissive="#ffe0a6"
                  emissiveIntensity={1.4}
                />
              </mesh>
              {[-0.85, 0, 0.85].map((x) => (
                <Box
                  key={x}
                  p={[x, -0.18, 0]}
                  s={[0.045, 0.1, 0.8]}
                  c="#56666b"
                />
              ))}
            </group>
          ))}
        </group>
      ))}
      {/* Rack with rolled mats, cubbies and bottles; no wall-sized text panels. */}
      <group position={[-13.5, 0, 9.7]}>
        <Box p={[0, 1.1, 0]} s={[3.8, 2.2, 1.2]} c="#35505a" />
        <Box p={[0, 2.3, 0]} s={[4, 0.2, 1.35]} c="#ba925b" />
        {[-1.2, 0, 1.2].map((x, i) => (
          <group key={x}>
            <Box p={[x, 1.18, 0.62]} s={[1.03, 1.72, 0.04]} c="#213a43" />
            <Cylinder
              p={[x, 0.68, 0.5]}
              s={[0.33, 0.96, 0.33]}
              r={[Math.PI / 2, 0, 0]}
              c={["#899a84", "#b27857", "#688e96"][i]}
            />
            <Cylinder p={[x, 2.59, 0]} s={[0.16, 0.45, 0.16]} c="#658d98" />
            <Cylinder p={[x, 2.85, 0]} s={[0.11, 0.08, 0.11]} c="#d7bd89" />
          </group>
        ))}
      </group>
      <primitive object={target} />
      <spotLight
        position={[8, 9, 4]}
        target={target}
        color="#fff1d1"
        intensity={65}
        angle={1.05}
        penumbra={0.65}
        distance={40}
        decay={2}
        castShadow={quality === "high"}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.035}
      />
      <pointLight
        position={[-10, 7, -12]}
        color="#b7d9e2"
        intensity={20}
        distance={30}
        decay={2}
      />
    </group>
  );
}
