import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RaceState } from "../core/rowing";
import { Box, Cylinder } from "../world/Models";
import { makeRower } from "./RowingCrew";

const SEATS = [-1.8, -0.6, 0.6, 1.8];
const SKIN = ["#e6b28b", "#ae7354", "#f2c8a2", "#ca916e"];

/** Original geometric S; no downloaded university artwork. */
function DeckBadge() {
  const geometry = useMemo(() => {
    const points = [
      [-0.5, 0.75],
      [0.5, 0.75],
      [0.5, 0.27],
      [0.18, 0.27],
      [0.18, 0.44],
      [-0.18, 0.44],
      [-0.18, 0.15],
      [0.5, 0.15],
      [0.5, -0.75],
      [-0.5, -0.75],
      [-0.5, -0.27],
      [-0.18, -0.27],
      [-0.18, -0.44],
      [0.18, -0.44],
      [0.18, -0.15],
      [-0.5, -0.15],
    ];
    const shape = new THREE.Shape(
      points.map(([x, y]) => new THREE.Vector2(x * 0.34, y * 0.6)),
    );
    const result = new THREE.ExtrudeGeometry(shape, {
      depth: 0.012,
      bevelEnabled: false,
    });
    result.rotateX(-Math.PI / 2);
    return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[0, 0.32, -3.4]} receiveShadow>
      <meshStandardMaterial color="#ffffff" roughness={0.55} />
    </mesh>
  );
}

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
  const rowers = useMemo(
    () =>
      SKIN.map((skin) =>
        makeRower(color, skin, player ? "#f4e9ce" : "#29434c"),
      ),
    [color, player],
  );
  useEffect(
    () => () => rowers.forEach((geometry) => geometry.dispose()),
    [rowers],
  );
  const hull = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -4.8);
    shape.bezierCurveTo(0.45, -3.7, 0.48, -1.8, 0.44, 0);
    shape.bezierCurveTo(0.48, 2.8, 0.35, 4, 0, 4.8);
    shape.bezierCurveTo(-0.35, 4, -0.48, 2.8, -0.44, 0);
    shape.bezierCurveTo(-0.48, -1.8, -0.45, -3.7, 0, -4.8);
    const cockpit = new THREE.Path();
    cockpit.moveTo(-0.28, -2.5);
    cockpit.lineTo(-0.28, 2.5);
    cockpit.quadraticCurveTo(-0.28, 2.95, 0, 2.95);
    cockpit.quadraticCurveTo(0.28, 2.95, 0.28, 2.5);
    cockpit.lineTo(0.28, -2.5);
    cockpit.quadraticCurveTo(0.28, -2.95, 0, -2.95);
    cockpit.quadraticCurveTo(-0.28, -2.95, -0.28, -2.5);
    shape.holes.push(cockpit);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.06,
      bevelSegments: 4,
      curveSegments: 16,
    });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  useEffect(() => () => hull.dispose(), [hull]);
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
          5 + t * 9,
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
      <mesh
        geometry={hull}
        position={[0, -0.12, 0]}
        scale={[0.98, 1.25, 1.02]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.14} />
      </mesh>
      <mesh
        geometry={hull}
        position={[0, 0.13, 0]}
        scale={[0.97, 0.3, 1.02]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#ead8ac"
          roughness={0.42}
          metalness={0.08}
        />
      </mesh>
      <Box p={[0, 0.22, 0]} s={[0.64, 0.13, 5.7]} c="#17333a" />
      {SEATS.map((z, i) => (
        <group key={z}>
          <Box p={[0, 0.3, z]} s={[0.46, 0.07, 0.37]} c="#b27b43" />
          {[-1, 1].map((side) => (
            <group key={side}>
              <Box
                p={[side * 0.17, 0.31, z + 0.12]}
                s={[0.035, 0.035, 0.75]}
                c="#c5cbc1"
              />
              {side === (i % 2 ? 1 : -1) && (
                <>
                  <group
                    position={[side * 0.59, 0.34, z]}
                    rotation={[0, side * 0.42, 0]}
                  >
                    <Box p={[0, 0, 0]} s={[0.6, 0.045, 0.055]} c="#a4b7b5" />
                  </group>
                  <Cylinder
                    p={[side * 0.75, 0.42, z]}
                    s={[0.065, 0.13, 0.065]}
                    c="#273e44"
                  />
                </>
              )}
            </group>
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <Box
          key={side}
          p={[side * 0.37, 0.29, 0]}
          s={[0.065, 0.09, 5.8]}
          c="#be8a47"
        />
      ))}
      <Box
        p={[0, 0.31, -4.1]}
        s={[0.12, 0.04, 0.45]}
        c={player ? "#ffffff" : color}
      />
      <Box
        p={[0, 0.31, 3.8]}
        s={[0.12, 0.04, 0.8]}
        c={player ? "#ffffff" : color}
      />
      <group ref={crew}>
        {SEATS.map((z, i) => (
          <group key={z} position={[0, 0.35, z]} userData={{ seat: i }}>
            <mesh geometry={rowers[i % SKIN.length]} castShadow receiveShadow>
              <meshStandardMaterial vertexColors roughness={0.8} />
            </mesh>
          </group>
        ))}
      </group>
      {player && <DeckBadge />}
      <group ref={oars}>
        {SEATS.map((z, i) => {
          const side = i % 2 ? 1 : -1;
          return (
            <group key={`${z}:${side}`} position={[side * 0.75, 0.4, z]}>
              <group
                position={[side * 0.65, 0, 0]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <Cylinder p={[0, 0, 0]} s={[0.035, 3.2, 0.035]} c="#c89b58" />
                <Cylinder
                  p={[0, side * 1.35, 0]}
                  s={[0.045, 0.25, 0.045]}
                  c="#263d43"
                />
              </group>
              <group position={[side * 2.05, -0.035, 0]}>
                <Box p={[0, 0, 0]} s={[0.65, 0.1, 0.33]} c={color} />
                <Box
                  p={[side * 0.2, 0.01, 0]}
                  s={[0.17, 0.105, 0.34]}
                  c="#f5e8c9"
                />
              </group>
            </group>
          );
        })}
      </group>
      {player && (
        <group position={[0, 0.3, -4.45]}>
          <Cylinder p={[0, 0.12, 0]} s={[0.025, 0.24, 0.025]} c="#f4e9ce" />
          <Box p={[0, 0.27, 0]} s={[0.28, 0.17, 0.035]} c="#f7c85b" />
        </group>
      )}
    </group>
  );
}
