import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RaceState } from "../core/rowing";
import { Box, Ball, Cylinder } from "../world/Models";

const SEATS = [-1.65, -0.55, 0.55, 1.65];
const SKIN = ["#e6b28b", "#ae7354", "#f2c8a2", "#ca916e"];

/** Race-only model: the boathouse's static boat remains untouched. */
export function RowingShell({
  state,
  color,
  player = false,
}: {
  state: () => RaceState;
  color: string;
  player?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const crew = useRef<THREE.Group>(null);
  const oars = useRef<THREE.Group>(null);
  const wake = useRef<THREE.Group>(null);
  const hull = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -4.8);
    shape.bezierCurveTo(0.45, -3.7, 0.48, -1.8, 0.44, 0);
    shape.bezierCurveTo(0.48, 2.8, 0.35, 4, 0, 4.8);
    shape.bezierCurveTo(-0.35, 4, -0.48, 2.8, -0.44, 0);
    shape.bezierCurveTo(-0.48, -1.8, -0.45, -3.7, 0, -4.8);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.09,
      bevelSegments: 2,
      curveSegments: 12,
    });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  useFrame(() => {
    const s = state();
    const moving = s.time >= 0;
    const drive = s.stroke < 0.38;
    const sweep = drive ? s.stroke / 0.38 : 1 - (s.stroke - 0.38) / 0.62;
    const lean = (sweep - 0.5) * 0.65;
    if (root.current) {
      root.current.position.set(
        s.x,
        0.02 + (moving ? Math.sin(s.stroke * Math.PI * 2) * 0.035 : 0),
        -s.distance,
      );
      root.current.rotation.set(
        0,
        -s.heading,
        -s.heading * Math.min(s.speed / 12, 1) * 0.11,
      );
    }
    crew.current?.children.forEach((rower) => {
      rower.rotation.x = moving ? lean : -0.3;
      rower.position.z =
        SEATS[Number(rower.userData.seat)] +
        (moving ? (sweep - 0.5) * 0.26 : -0.13);
    });
    oars.current?.children.forEach((oar, i) => {
      const side = i % 2 ? 1 : -1;
      oar.rotation.y = (moving ? (sweep - 0.5) * 1.35 : -0.67) * side;
      oar.rotation.z = side * (drive && moving ? 0.065 : -0.06);
      // Blade lies flat through recovery and squares up for the catch.
      oar.children[1].rotation.x = moving && drive ? 0 : Math.PI / 2;
    });
    if (wake.current) {
      wake.current.visible = s.speed > 0.8;
      wake.current.scale.set(1, 1, Math.min(1.5, s.speed / 9));
      wake.current.children.forEach((ripple, i) => {
        const t = (s.distance * 0.16 + i / 8) % 1;
        ripple.position.set(
          (i % 2 ? 1 : -1) * (0.35 + t * 1.6),
          -0.02,
          3 + t * 9,
        );
        ripple.scale.set(0.5 + t, 1, 0.3 + t * 0.5);
      });
    }
  });
  return (
    <group ref={root}>
      <group ref={wake}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, i % 2 ? -0.23 : 0.23]}>
            <planeGeometry args={[0.11, 2]} />
            <meshBasicMaterial
              color="#d4f4e9"
              transparent
              opacity={0.44 - i * 0.025}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <mesh geometry={hull} position={[0, 0.03, 0]}>
        <meshStandardMaterial color={color} roughness={0.32} />
      </mesh>
      <Box p={[0, 0.22, 0]} s={[0.61, 0.08, 5.6]} c="#243f43" />
      {[-1, 1].map((side) => (
        <Box
          key={side}
          p={[side * 0.34, 0.25, 0]}
          s={[0.055, 0.08, 6.3]}
          c="#f5e7c7"
        />
      ))}
      <Box p={[0, 0.23, -3.8]} s={[0.11, 0.025, 1.25]} c="#f9e7b7" />
      <group ref={crew}>
        {SEATS.map((z, i) => (
          <group key={z} position={[0, 0.35, z]} userData={{ seat: i }}>
            <Box p={[0, 0.02, 0]} s={[0.4, 0.13, 0.35]} c="#263e46" />
            <Box p={[0, 0.27, 0]} s={[0.46, 0.42, 0.3]} c={color} />
            <Ball p={[0, 0.65, 0]} s={[0.2, 0.23, 0.2]} c={SKIN[i]} />
            <Ball
              p={[0, 0.78, 0]}
              s={[0.205, 0.12, 0.21]}
              c={player ? "#f4e9ce" : "#29434c"}
            />
            <Box
              p={[0, 0.79, 0.19]}
              s={[0.32, 0.045, 0.23]}
              c={player ? "#f4e9ce" : "#29434c"}
            />
            {[-1, 1].map((side) => (
              <group key={side}>
                <Box
                  p={[side * 0.23, 0.3, 0.23]}
                  s={[0.11, 0.13, 0.48]}
                  c={SKIN[i]}
                />
                <Box
                  p={[side * 0.13, 0.03, 0.3]}
                  s={[0.13, 0.13, 0.51]}
                  c="#29434c"
                />
              </group>
            ))}
          </group>
        ))}
      </group>
      <group ref={oars}>
        {SEATS.flatMap((z) =>
          [-1, 1].map((side) => (
            <group key={`${z}:${side}`} position={[side * 0.5, 0.4, z]}>
              <Box
                p={[side * 0.98, 0, 0]}
                s={[2.35, 0.055, 0.065]}
                c="#d7b77c"
              />
              <group position={[side * 2.05, -0.035, 0]}>
                <Box p={[0, 0, 0]} s={[0.65, 0.1, 0.33]} c={color} />
                <Box
                  p={[side * 0.2, 0.01, 0]}
                  s={[0.17, 0.105, 0.34]}
                  c="#f5e8c9"
                />
              </group>
            </group>
          )),
        )}
      </group>
      {player && (
        <group position={[0, 0.25, -4.4]}>
          <Cylinder p={[0, 0.12, 0]} s={[0.025, 0.24, 0.025]} c="#f4e9ce" />
          <Box p={[0, 0.27, 0]} s={[0.28, 0.17, 0.035]} c="#f7c85b" />
        </group>
      )}
    </group>
  );
}
