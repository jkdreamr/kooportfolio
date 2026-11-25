import { useMemo } from "react";
import { PerspectiveCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cylinder, Ring } from "../world/Models";
import { CraftedBox } from "./CraftedDetails";

// A separate game set, far outside the room camera's frustum. Nothing moves the
// saved room avatar or furnishings when the player enters or leaves a game.
export const GAME_STAGE_Y = 1000;

export function InteriorGameStage({
  kind,
}: {
  kind: "blackjack" | "pong" | "kitchen";
}) {
  const portrait = useThree((s) => s.size.width / s.size.height < 0.85);
  const lightTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.position.y = GAME_STAGE_Y;
    return target;
  }, []);
  const eye: [number, number, number] =
    kind === "blackjack"
      ? portrait
        ? [0, 10.5, 6.2]
        : [0, 6.4, 3.9]
      : kind === "pong"
        ? portrait
          ? [0, 5.4, 7.4]
          : [0, 3.9, 5.6]
        : portrait
          ? [0, 13.8, 14.5]
          : [8, 10, 12];
  const look: [number, number, number] =
    kind === "pong"
      ? [0, 1.4, -1.3]
      : kind === "blackjack"
        ? portrait
          ? [0, 1.2, 1.4]
          : [0, 1.2, 0.75]
        : [0, 0.7, 0.6];
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[eye[0], GAME_STAGE_Y + eye[1], eye[2]]}
        fov={kind === "kitchen" ? 48 : 45}
        near={0.1}
        far={60}
        onUpdate={(camera) =>
          camera.lookAt(look[0], GAME_STAGE_Y + look[1], look[2])
        }
      />
      <primitive object={lightTarget} />
      <directionalLight
        position={[5, GAME_STAGE_Y + 9, 6]}
        target={lightTarget}
        intensity={1.7}
        color="#ffe4b4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-far={30}
        shadow-bias={-0.0005}
      />
      <group position={[0, GAME_STAGE_Y, 0]}>
        <Cylinder p={[0, -0.2, 0]} s={[7, 0.24, 7]} c="#3e4e3c" />
        {Array.from({ length: 15 }, (_, i) => {
          const x = (i - 7) * 0.9;
          return (
            <CraftedBox
              key={i}
              p={[x, -0.035, 0]}
              s={[0.86, 0.09, 2 * Math.sqrt(49 - x * x) - 0.15]}
              c={["#785a3d", "#836443", "#6c543b"][i % 3]}
            />
          );
        })}
        <Ring p={[0, -0.03, 0]} radius={6.95} tube={0.045} c="#ae8b50" />
        {kind === "kitchen" &&
          Array.from({ length: 80 }, (_, i) => (
            <CraftedBox
              key={i}
              p={[((i % 8) - 3.5) * 0.9, 0.03, (Math.floor(i / 8) - 4.5) * 0.9]}
              s={[0.87, 0.055, 0.87]}
              c={(i + Math.floor(i / 8)) % 2 ? "#81957d" : "#c6bea0"}
            />
          ))}
      </group>
    </>
  );
}
