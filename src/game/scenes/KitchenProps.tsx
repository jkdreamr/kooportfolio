import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Box, Ball, Cylinder, Ring } from "../world/Models";
import { type Ingredient, type CookingGame } from "../core/interiorGames";
import { roomFor } from "../core/room";
import { gameIsActive, Fire } from "./InteriorProps";
import { CraftedBox } from "./CraftedDetails";
const backWall = -roomFor("kitchen").depth / 2 + 0.5;
export function Produce({
  kind,
  p,
}: {
  kind: Ingredient;
  p: [number, number, number];
}) {
  return (
    <group position={p}>
      {kind === "Tomato" ? (
        <>
          <Ball s={[0.17, 0.15, 0.17]} c="#cd5438" />
          <Box
            p={[0, 0.15, 0]}
            s={[0.13, 0.045, 0.06]}
            c="#477b3d"
            r={[0, 0.6, 0]}
          />
        </>
      ) : kind === "Carrot" ? (
        <>
          <mesh rotation={[0, 0, -0.9]}>
            <coneGeometry args={[0.12, 0.48, 6]} />
            <meshStandardMaterial color="#e69a37" roughness={0.9} />
          </mesh>
          <Box
            p={[0.16, 0.17, 0]}
            s={[0.06, 0.2, 0.06]}
            c="#527b38"
            r={[0, 0, -0.8]}
          />
        </>
      ) : (
        <>
          {[-1, 0, 1].map((i) => (
            <Ball
              key={i}
              p={[i * 0.1, Math.abs(i) * 0.08, 0]}
              s={[0.09, 0.2, 0.07]}
              c={i ? "#5c8c3d" : "#3b6d3d"}
            />
          ))}
        </>
      )}
    </group>
  );
}
export function Crate({
  p,
  kind,
  taken,
  onTake,
}: {
  p: [number, number, number];
  kind: Ingredient;
  taken: boolean;
  onTake: () => void;
}) {
  return (
    <group
      position={p}
      onClick={(e) => {
        e.stopPropagation();
        if (gameIsActive()) onTake();
      }}
    >
      <Box p={[0, 0.08, 0]} s={[1.03, 0.15, 0.9]} c="#966632" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box p={[side * 0.52, 0.25, 0]} s={[0.1, 0.5, 0.95]} c="#bb8848" />
          <Box p={[0, 0.2, side * 0.45]} s={[1.08, 0.25, 0.1]} c="#c29452" />
        </group>
      ))}
      {Array.from({ length: taken ? 1 : 6 }, (_, i) => (
        <Produce
          key={i}
          kind={kind}
          p={[
            -0.28 + (i % 3) * 0.28,
            0.29 + Math.floor(i / 3) * 0.11,
            -0.16 + Math.floor(i / 3) * 0.29,
          ]}
        />
      ))}
    </group>
  );
}
export function Cabinet({
  p,
  width = 1.5,
}: {
  p: [number, number, number];
  width?: number;
}) {
  return (
    <group position={p}>
      <CraftedBox p={[0, 0.58, 0]} s={[width, 1.16, 1.25]} c="#356b65" />
      <CraftedBox p={[0, 1.23, 0]} s={[width + 0.06, 0.25, 1.4]} c="#e1cb9d" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            p={[side * width * 0.24, 0.62, 0.64]}
            s={[width * 0.43, 0.9, 0.06]}
            c="#4c8378"
          />
          <Box
            p={[side * width * 0.24, 0.62, 0.68]}
            s={[width * 0.3, 0.64, 0.035]}
            c="#43766c"
          />
          <Cylinder
            p={[side * 0.12, 0.92, 0.71]}
            s={[0.035, 0.16, 0.035]}
            c="#d0aa59"
          />
        </group>
      ))}
    </group>
  );
}
export function HangingPan({
  p,
  radius = 0.35,
}: {
  p: [number, number, number];
  radius?: number;
}) {
  return (
    <group position={p} rotation={[0, Math.PI / 2, 0]}>
      <Cylinder
        s={[radius, 0.09, radius]}
        r={[Math.PI / 2, 0, 0]}
        c="#464b42"
      />
      <Cylinder
        p={[0, 0, 0.06]}
        s={[radius * 0.8, 0.03, radius * 0.8]}
        r={[Math.PI / 2, 0, 0]}
        c="#676c5c"
      />
      <Box p={[0, radius + 0.22, 0]} s={[0.09, 0.5, 0.08]} c="#785132" />
      <Ring
        p={[0, radius + 0.49, 0]}
        radius={0.065}
        tube={0.025}
        c="#b49a57"
        r={[0, 0, 0]}
      />
    </group>
  );
}
export function Stove({
  stage,
  onFinish,
  position = [5.8, 0, backWall + 1.2],
  scale = 1.3,
}: {
  stage: CookingGame["stage"];
  onFinish: () => void;
  position?: [number, number, number];
  scale?: number;
}) {
  const steam = useRef<THREE.Group>(null);
  const cooking = stage === "cook" || stage === "serve";
  useFrame(({ clock }) => {
    if (!steam.current || !gameIsActive()) return;
    steam.current.children.forEach((child, i) => {
      const t = (clock.elapsedTime * 0.45 + i * 0.33) % 1;
      child.position.y = 2.2 + t * 1.05;
      child.position.x = Math.sin(t * 4 + i) * 0.22;
      child.scale.setScalar(0.07 + t * 0.12);
    });
  });
  return (
    <group position={position} scale={scale}>
      <CraftedBox p={[0, 0.65, 0]} s={[2.5, 1.3, 1.6]} c="#a77e51" />
      <Box p={[0, 0.66, 0.84]} s={[1.75, 0.95, 0.09]} c="#3e453d" />
      <Box p={[0, 0.53, 0.91]} s={[1.3, 0.48, 0.05]} c="#252f2c" />
      <Box p={[0, 0.99, 0.97]} s={[1.45, 0.08, 0.09]} c="#c29c51" />
      {[-0.74, 0.74].map((x) => (
        <Cylinder
          key={x}
          p={[x, 1.16, 0.94]}
          s={[0.08, 0.07, 0.08]}
          r={[Math.PI / 2, 0, 0]}
          c="#d1b36c"
        />
      ))}
      <Box p={[0, 1.35, 0]} s={[2.7, 0.16, 1.75]} c="#414b42" />
      {[-0.7, 0.7].map((x) => (
        <Ring key={x} p={[x, 1.45, 0]} radius={0.37} tube={0.06} c="#232d29" />
      ))}
      <group
        position={[-0.65, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (stage === "cook" && gameIsActive()) onFinish();
        }}
      >
        {cooking && <Fire p={[0, 1.45, 0]} />}
        <Cylinder p={[0, 1.82, 0]} s={[0.48, 0.6, 0.48]} c="#b2793a" />
        <Ring p={[0, 2.11, 0]} radius={0.49} tube={0.055} c="#d9b56a" />
        <Cylinder
          p={[0, 2.1, 0]}
          s={[0.43, 0.025, 0.43]}
          c={cooking ? "#d77a35" : "#4e4937"}
        />
        {[-1, 1].map((side) => (
          <Ring
            key={side}
            p={[side * 0.53, 1.95, 0]}
            radius={0.12}
            tube={0.045}
            c="#735030"
            r={[0, 0, 0]}
          />
        ))}
        {cooking && (
          <group ref={steam}>
            {[0, 1, 2].map((i) => (
              <mesh key={i}>
                <sphereGeometry args={[1, 7, 5]} />
                <meshStandardMaterial
                  color="#fff4d8"
                  transparent
                  opacity={0.45}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        )}
      </group>
      <Cylinder p={[0.7, 1.52, 0]} s={[0.35, 0.12, 0.35]} c="#353e37" />
      <Box p={[1.16, 1.52, 0]} s={[0.65, 0.1, 0.14]} c="#714e2d" />
      <Box p={[0, 3.6, -0.15]} s={[2.85, 0.3, 1.85]} c="#9b6240" />
      <mesh position={[0, 4.04, -0.3]}>
        <cylinderGeometry args={[0.55, 1.35, 0.65, 4]} />
        <meshStandardMaterial color="#b47b45" flatShading roughness={0.9} />
      </mesh>
      <Box p={[0, 4.6, -0.35]} s={[0.8, 0.7, 0.7]} c="#9b6240" />
    </group>
  );
}
