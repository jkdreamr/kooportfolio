import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { create } from "zustand";
import * as THREE from "three";
import { Box, Cylinder, Ball, Bench, Flowers, Ring } from "../world/Models";
import { useGame } from "../core/store";

export const useGym = create<{
  reps: number;
  liftedAt: number;
  lift: () => void;
}>((set, get) => ({
  reps: 0,
  liftedAt: -Infinity,
  lift() {
    const now = performance.now();
    if (now - get().liftedAt < 900) return;
    const reps = get().reps + 1;
    set({ reps, liftedAt: now });
    if (reps === 8)
      useGame
        .getState()
        .award(`gym-${new Date().toISOString().slice(0, 10)}`, 15, 10);
  },
}));

export function CognitionFurnishings() {
  return (
    <group>
      <Box p={[0, 0.08, -1.8]} s={[7.4, 0.08, 5.2]} c="#3c5f56" />
      {[-2.4, 2.4].map((x) => (
        <group key={x} position={[x, 0, -3.4]}>
          <Box p={[0, 1.25, 0]} s={[3.2, 0.2, 1.4]} c="#b59b6b" />
          {[-1.15, 1.15].map((leg) => (
            <Box key={leg} p={[leg, 0.6, 0]} s={[0.15, 1.2, 1.1]} c="#3c4e48" />
          ))}
          <Box p={[0, 1.87, -0.25]} s={[1.6, 1, 0.14]} c="#263c39" />
          <Box p={[0, 1.88, -0.16]} s={[1.35, 0.77, 0.03]} c="#8dc0b4" />
          {Array.from({ length: 4 }, (_, i) => (
            <Box
              key={i}
              p={[-0.4 + (i % 2) * 0.2, 2.08 - i * 0.14, -0.13]}
              s={[0.3 + (i % 3) * 0.2, 0.035, 0.015]}
              c={i % 2 ? "#d9b56a" : "#3e7869"}
            />
          ))}
          <Box p={[0, 1.39, 0.35]} s={[1.1, 0.06, 0.35]} c="#46554c" />
          <Bench p={[0, 0, 1.1]} />
        </group>
      ))}
      <Box p={[-4.9, 1.6, -0.1]} s={[0.4, 3.2, 4.1]} c="#456a53" />
      {[0.7, 1.5, 2.3].map((y) => (
        <Box key={y} p={[-4.58, y, -0.1]} s={[0.6, 0.1, 3.7]} c="#b79c6c" />
      ))}
      <Flowers p={[-4.4, 2.4, -0.5]} />
      <Flowers p={[4.4, 0, -4.5]} />
      <Ring p={[0, 0.16, -1.8]} radius={1.1} c="#c8b575" />
      <Cylinder p={[3.8, 0.7, 0.9]} s={[0.55, 1.4, 0.55]} c="#aa8e61" />
      <Cylinder p={[3.8, 1.5, 0.9]} s={[0.6, 0.2, 0.6]} c="#c6c8ae" />
    </group>
  );
}

export function GymFurnishings() {
  const bar = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!bar.current) return;
    const t = (performance.now() - useGym.getState().liftedAt) / 900;
    const lift = t >= 0 && t <= 1 ? Math.sin(t * Math.PI) * 0.9 : 0;
    bar.current.position.y = 1.65 + lift;
  });
  return (
    <group>
      <Box p={[0, 0.1, -2]} s={[5.8, 0.14, 5.3]} c="#354c46" />
      <Box p={[0, 0.7, -2]} s={[1.1, 0.28, 3.6]} c="#a9563e" />
      <Box p={[0, 0.35, -2]} s={[0.7, 0.7, 2.8]} c="#52665c" />
      {[-1.9, 1.9].map((x) => (
        <group key={x}>
          <Box p={[x, 1.15, -3]} s={[0.16, 2.3, 0.18]} c="#91a497" />
          <Box p={[x, 0.2, -3]} s={[0.7, 0.18, 1.5]} c="#91a497" />
        </group>
      ))}
      <group ref={bar} position={[0, 1.65, -3]}>
        <Cylinder s={[0.07, 4.8, 0.07]} r={[0, 0, Math.PI / 2]} c="#c0c7b0" />
        {[-1.9, 1.9].map((x) => (
          <group key={x}>
            <Cylinder
              p={[x, 0, 0]}
              s={[0.6, 0.3, 0.6]}
              r={[0, 0, Math.PI / 2]}
              c="#344438"
            />
            <Cylinder
              p={[x + Math.sign(x) * 0.28, 0, 0]}
              s={[0.45, 0.18, 0.45]}
              r={[0, 0, Math.PI / 2]}
              c="#d9b956"
            />
          </group>
        ))}
      </group>
      <Box p={[0, 2.9, -5.65]} s={[6.6, 2, 0.1]} c="#a6c4b5" />
      <Box p={[0, 2.9, -5.55]} s={[0.08, 2, 0.1]} c="#d7d6b5" />
      {[-4.1, 4.1].map((x) => (
        <group key={x}>
          <Box p={[x, 0.7, -2.6]} s={[1.1, 0.15, 3.2]} c="#80927c" />
          {[-3.6, -2.6, -1.6].map((z) => (
            <group key={z}>
              <Cylinder
                p={[x, 0.95, z]}
                s={[0.07, 0.8, 0.07]}
                r={[0, 0, Math.PI / 2]}
                c="#b3bca3"
              />
              {[-0.4, 0.4].map((side) => (
                <Ball
                  key={side}
                  p={[x + side, 0.95, z]}
                  s={[0.24, 0.26, 0.26]}
                  c="#3d5544"
                />
              ))}
            </group>
          ))}
        </group>
      ))}
      <Ring p={[0, 0.2, -0.3]} radius={1.1} c="#d1b463" />
    </group>
  );
}
