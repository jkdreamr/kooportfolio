import { useMemo } from "react";
import { Character } from "../world/character/CharacterRig";
import * as THREE from "three";
import { chamferBoxSizedShared } from "../world/chamferBox";
import { Ball, Cylinder, Ring } from "../world/Models";

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
  // 44-triangle chamfer box (was a 2-segment rounded box, 300 tris).
  const shape = chamferBoxSizedShared(s, Math.min(...s) * 0.28);
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
      geometry={shape}
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
  // The shared rounded rig, idling (breath, weight shift, look-around).
  const palette = useMemo(
    () => ({
      hair: index % 2 ? "#70492b" : "#42352b",
      pants: "#46382e",
      shoe: "#3d3027",
      skin: index % 3 === 2 ? "#c9906a" : "#e2b187",
      hat: "#b9823a",
    }),
    [index],
  );
  return (
    <group position={p} rotation={[0, Math.PI, 0]}>
      <Character
        color={color}
        hat={index === 1}
        scale={0.9}
        seed={index * 13 + 5}
        palette={palette}
      />
    </group>
  );
}
