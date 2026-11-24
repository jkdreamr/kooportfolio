import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { Box, Cylinder, Sign } from "../world/Models";
import { SKATE, SKATE_RAILS, skateHeight } from "../core/skate";

function PouredConcrete() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      SKATE.halfWidth * 2,
      SKATE.halfDepth * 2,
      84,
      100,
    );
    g.rotateX(-Math.PI / 2);
    const points = g.attributes.position;
    const colors = new Float32Array(points.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i),
        z = points.getZ(i);
      points.setY(i, skateHeight(x, z));
      const variation =
        Math.sin(x * 14.2 + z * 29.3) * 0.012 +
        Math.cos(x * 1.9 - z * 1.3) * 0.015;
      color.set("#b6b7ac").offsetHSL(0, 0, variation);
      if (
        Math.abs(x) > 9.7 ||
        (Math.abs(z) > 11.75 && (z < 0 || Math.abs(x) > 3.5))
      )
        color.set("#ad6a4d");
      colors.set([color.r, color.g, color.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.94} />
    </mesh>
  );
}

function ExpansionJoints() {
  const lines = useMemo(() => {
    const rows: [number, number, number][][] = [];
    for (const x of [-7.5, -2, 2, 7.5]) {
      rows.push(
        Array.from({ length: 65 }, (_, i) => {
          const z = -12.4 + (i * 24.8) / 64;
          return [x, skateHeight(x, z) + 0.012, z];
        }),
      );
    }
    for (const z of [-9.5, -5, 0, 5, 9.5]) {
      rows.push(
        Array.from({ length: 65 }, (_, i) => {
          const x = -10.4 + (i * 20.8) / 64;
          return [x, skateHeight(x, z) + 0.012, z];
        }),
      );
    }
    return rows;
  }, []);
  return (
    <>
      {lines.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#777e77"
          lineWidth={0.65}
          transparent
          opacity={0.65}
        />
      ))}
    </>
  );
}

function GrindRails() {
  return (
    <>
      {SKATE_RAILS.map((rail, i) => (
        <group key={i}>
          <Cylinder
            p={[rail.x, rail.height, (rail.from + rail.to) / 2]}
            s={[0.075, rail.to - rail.from, 0.075]}
            r={[Math.PI / 2, 0, 0]}
            c="#41665d"
          />
          {[rail.from + 0.5, (rail.from + rail.to) / 2, rail.to - 0.5].map(
            (z) => (
              <group key={z}>
                <Cylinder
                  p={[rail.x, rail.height / 2, z]}
                  s={[0.055, rail.height, 0.055]}
                  c="#3b524d"
                />
                <Box p={[rail.x, 0.2, z]} s={[0.4, 0.07, 0.3]} c="#64716a" />
              </group>
            ),
          )}
          <Box
            p={[rail.x, rail.height + 0.01, (rail.from + rail.to) / 2]}
            s={[0.08, 0.035, rail.to - rail.from - 0.1]}
            c="#adbbb1"
          />
        </group>
      ))}
    </>
  );
}

export function SkateParkTerrain({ detailed = true }: { detailed?: boolean }) {
  return (
    <group>
      <Box p={[0, -0.25, 0]} s={[22, 0.8, 26]} c="#777c70" />
      <PouredConcrete />
      {detailed && <ExpansionJoints />}
      <GrindRails />
      {[-10.55, 10.55].map((x) => (
        <group key={x}>
          <Box p={[x, 1.15, 0]} s={[0.35, 2.5, 25.8]} c="#8e9688" />
          <Cylinder
            p={[x, 2.5, 0]}
            s={[0.07, 25.4, 0.07]}
            r={[Math.PI / 2, 0, 0]}
            c="#59675d"
          />
          {[-10, -5, 0, 5, 10].map((z) => (
            <group key={z}>
              <Box p={[x, 3, z]} s={[0.055, 1.1, 0.055]} c="#566b5b" />
            </group>
          ))}
          <Box p={[x, 3.45, 0]} s={[0.045, 0.045, 25]} c="#566b5b" />
        </group>
      ))}
      <Box p={[0, 1.2, -12.65]} s={[21.5, 2.55, 0.3]} c="#7e887b" />
      <Cylinder
        p={[0, 2.5, -12.55]}
        s={[0.07, 21, 0.07]}
        r={[0, 0, Math.PI / 2]}
        c="#59675d"
      />
      {[-7, 7].map((x) => (
        <group key={x}>
          <Box p={[x, 1.2, 12.65]} s={[7, 2.55, 0.3]} c="#8e9688" />
          <Cylinder
            p={[x, 2.5, 12.55]}
            s={[0.07, 6.9, 0.07]}
            r={[0, 0, Math.PI / 2]}
            c="#59675d"
          />
        </group>
      ))}
      <Box p={[0, 0.08, 12.3]} s={[3.5, 0.16, 1.1]} c="#ccba91" />
      {[-2, 2].map((x) => (
        <Cylinder key={x} p={[x, 1.6, 12.6]} s={[0.1, 3.2, 0.1]} c="#425e51" />
      ))}
      <Sign
        text="SKATE PARK"
        p={[0, 3.25, 12.6]}
        size={[4.6, 0.72]}
        color="#b86340"
        ink="#f5e5bf"
      />
      {detailed && (
        <>
          <Sign
            text="BOWL / STREET"
            p={[-5.8, 2.7, -12.42]}
            size={[3.2, 0.55]}
            color="#3e5d52"
            ink="#e2dbc3"
          />
          <Sign
            text="KEEP ROLLING"
            p={[5.7, 2.7, -12.42]}
            size={[3.4, 0.55]}
            color="#b86340"
            ink="#f5e5bf"
          />
          {[-9.4, 9.4].map((x) => (
            <group key={x}>
              <Cylinder p={[x, 4.4, -10.4]} s={[0.07, 5, 0.07]} c="#4f5d51" />
              <Box p={[x, 6.85, -10.4]} s={[0.75, 0.18, 0.4]} c="#3f5149" />
              <mesh position={[x, 6.75, -10.3]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.55, 0.25]} />
                <meshStandardMaterial
                  color="#fff2c9"
                  emissive="#ffe3a4"
                  emissiveIntensity={0.45}
                />
              </mesh>
            </group>
          ))}
          {/* Wheel marks are deliberately drawn on flat skating lanes, not decals from a network. */}
          {Array.from({ length: 16 }, (_, i) => {
            const x = Math.sin(i * 7.1) * 6.5,
              z = Math.cos(i * 4.7) * 7.8;
            if (skateHeight(x, z) > 0.2) return null;
            return (
              <Line
                key={i}
                points={[
                  [x, 0.194, z],
                  [x + 0.15, 0.194, z + 0.25],
                  [x + 0.2, 0.194, z + 0.65],
                ]}
                color="#666e66"
                transparent
                opacity={0.22}
                lineWidth={1.6}
              />
            );
          })}
        </>
      )}
    </group>
  );
}
