import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Box, Ball, Cylinder, Ring } from "../world/Models";

const shapes = new Map<string, RoundedBoxGeometry>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function CraftedBox({
  p = [0, 0, 0],
  s,
  c,
  r = [0, 0, 0],
  metal = false,
}: {
  p?: [number, number, number];
  s: [number, number, number];
  c: string;
  r?: [number, number, number];
  metal?: boolean;
}) {
  const shapeKey = s.join(",");
  if (!shapes.has(shapeKey))
    shapes.set(
      shapeKey,
      new RoundedBoxGeometry(...s, 3, Math.min(...s) * 0.28),
    );
  const key = `${c}/${metal}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: metal ? 0.32 : 0.62,
        metalness: metal ? 0.55 : 0,
      }),
    );
  return (
    <mesh
      position={p}
      rotation={r}
      geometry={shapes.get(shapeKey)}
      material={materials.get(key)}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
export function BrassStud({
  p,
  radius = 0.055,
}: {
  p: [number, number, number];
  radius?: number;
}) {
  return <Ball p={p} s={[radius, radius, radius * 0.55]} c="#d4ac51" />;
}
export function WallSconce({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <CraftedBox p={[0, 0, -0.06]} s={[0.45, 0.85, 0.16]} c="#543d29" />
      <CraftedBox
        p={[0, -0.2, 0.18]}
        s={[0.14, 0.14, 0.55]}
        c="#b98b3d"
        metal
      />
      <Cylinder p={[0, 0.22, 0.35]} s={[0.22, 0.7, 0.22]} c="#e4b65a" />
      <mesh position={[0, 0.25, 0.35]}>
        <cylinderGeometry args={[0.16, 0.16, 0.54, 8]} />
        <meshStandardMaterial
          color="#ffe6a0"
          emissive="#f5b34a"
          emissiveIntensity={0.55}
        />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <CraftedBox
          key={i}
          p={[
            Math.sin((i * Math.PI) / 2) * 0.19,
            0.22,
            0.35 + Math.cos((i * Math.PI) / 2) * 0.19,
          ]}
          s={[0.04, 0.72, 0.04]}
          c="#6b502b"
          metal
        />
      ))}
      <Cylinder p={[0, -0.16, 0.35]} s={[0.25, 0.12, 0.25]} c="#6b502b" />
      <Cylinder p={[0, 0.62, 0.35]} s={[0.26, 0.13, 0.26]} c="#85652e" />
      <Ring
        p={[0, 0.82, 0.35]}
        radius={0.12}
        tube={0.03}
        c="#b59145"
        r={[0, 0, 0]}
      />
    </group>
  );
}
export function Customer({
  p,
  color,
  index = 0,
}: {
  p: [number, number, number];
  color: string;
  index?: number;
}) {
  return (
    <group position={p} rotation={[0, Math.PI, 0]}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <CraftedBox
            p={[side * 0.16, 0.18, 0]}
            s={[0.24, 0.35, 0.28]}
            c="#46382e"
          />
          <CraftedBox
            p={[side * 0.16, 0.06, 0.08]}
            s={[0.28, 0.18, 0.43]}
            c="#3d3027"
          />
        </group>
      ))}
      <CraftedBox p={[0, 0.72, 0]} s={[0.74, 0.85, 0.45]} c={color} />
      <Box p={[0, 0.65, 0.24]} s={[0.63, 0.1, 0.035]} c="#d6b572" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <CraftedBox
            p={[side * 0.45, 0.79, 0]}
            s={[0.24, 0.58, 0.32]}
            c={color}
            r={[0, 0, side * 0.12]}
          />
          <Ball
            p={[side * 0.48, 0.49, 0.03]}
            s={[0.15, 0.17, 0.14]}
            c="#dba77c"
          />
        </group>
      ))}
      <Ball p={[0, 1.43, 0]} s={[0.35, 0.39, 0.32]} c="#e2b187" />
      <Ball
        p={[0, 1.66, -0.07]}
        s={[0.36, 0.22, 0.31]}
        c={index % 2 ? "#70492b" : "#42352b"}
      />
      <Ball p={[0, 1.4, 0.31]} s={[0.09, 0.1, 0.1]} c="#cd946a" />
      {[-0.13, 0.13].map((x) => (
        <Ball
          key={x}
          p={[x, 1.48, 0.29]}
          s={[0.035, 0.045, 0.025]}
          c="#3b342a"
        />
      ))}
      {index === 1 && (
        <>
          <Cylinder p={[0, 1.89, -0.02]} s={[0.42, 0.16, 0.42]} c="#b9823a" />
          <Cylinder p={[0, 2, -0.02]} s={[0.28, 0.2, 0.28]} c="#987031" />
        </>
      )}
    </group>
  );
}
