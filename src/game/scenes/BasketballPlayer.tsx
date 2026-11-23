import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Ball, Box } from "../world/Models";
import { runtime, useGame } from "../core/store";

// Court-only rig: planted feet, a two-handed gather, then a short follow-through.
export function BasketballPlayer({
  color,
  hat,
  release,
}: {
  color: string;
  hat: boolean;
  release: RefObject<number>;
}) {
  const body = useRef<THREE.Group>(null),
    arms = useRef<THREE.Group>(null),
    legs = useRef<THREE.Group>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    const g = useGame.getState();
    if (g.paused || g.result || g.panel !== "none" || !runtime.active) return;
    phase.current += Math.min(dt, 0.04) * (runtime.moving ? 11 : 2);
    const follow = Math.max(0, 1 - release.current / 0.65);
    const gather = runtime.shooting ? 0.8 : 0;
    if (body.current)
      body.current.position.y =
        0.12 + Math.sin(Math.min(1, release.current / 0.5) * Math.PI) * 0.28;
    if (arms.current) {
      const target = -(gather + follow * 1.8);
      arms.current.children.forEach((arm) => {
        arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, target, 18, dt);
      });
    }
    if (legs.current)
      legs.current.children.forEach((leg, i) => {
        leg.rotation.x = runtime.moving
          ? Math.sin(phase.current + i * Math.PI) * 0.65
          : 0;
      });
  });
  return (
    <group ref={body} scale={0.9}>
      <group ref={legs}>
        {[-0.17, 0.17].map((x) => (
          <group key={x} position={[x, 0.46, 0]}>
            <Box p={[0, -0.12, 0]} s={[0.26, 0.35, 0.29]} c="#344e50" />
            <Box p={[0, -0.33, 0.02]} s={[0.19, 0.25, 0.2]} c="#e6b48c" />
            <Box p={[0, -0.4, 0.1]} s={[0.28, 0.17, 0.43]} c="#fff1d8" />
            <Box p={[0, -0.45, 0.1]} s={[0.29, 0.05, 0.44]} c="#b65c3d" />
          </group>
        ))}
      </group>
      <Box p={[0, 0.83, 0]} s={[0.68, 0.64, 0.42]} c={color} />
      {[-0.27, 0.27].map((x) => (
        <Box key={x} p={[x, 0.85, 0.219]} s={[0.05, 0.55, 0.02]} c="#f5e4bf" />
      ))}
      <Box p={[0, 0.94, 0.22]} s={[0.17, 0.06, 0.03]} c="#f5e4bf" />
      <group ref={arms}>
        {[-0.43, 0.43].map((x) => (
          <group key={x} position={[x, 1.02, 0]}>
            <Box p={[0, -0.2, 0]} s={[0.2, 0.4, 0.24]} c="#efc5a0" />
            <Box p={[0, -0.32, 0]} s={[0.215, 0.1, 0.255]} c="#f7e7c8" />
            <Ball p={[0, -0.45, 0.02]} s={[0.13, 0.14, 0.13]} c="#efc5a0" />
          </group>
        ))}
      </group>
      <Box p={[0, 1.49, 0.02]} s={[0.76, 0.66, 0.65]} c="#efc5a0" />
      <Box p={[0, 1.81, -0.02]} s={[0.8, 0.22, 0.7]} c="#3e3936" />
      <Box p={[-0.34, 1.59, -0.1]} s={[0.15, 0.34, 0.59]} c="#3e3936" />
      {[-0.16, 0.16].map((x) => (
        <Ball
          key={x}
          p={[x, 1.5, 0.355]}
          s={[0.044, 0.062, 0.025]}
          c="#383330"
        />
      ))}
      <Box p={[0, 1.31, 0.36]} s={[0.13, 0.025, 0.02]} c="#a47362" />
      {hat && (
        <>
          <Box p={[0, 1.91, 0]} s={[0.88, 0.18, 0.76]} c="#c7754d" />
          <Box p={[0, 1.84, 0.4]} s={[0.86, 0.06, 0.46]} c="#df9762" />
        </>
      )}
    </group>
  );
}
