import { StaticBatch } from "./StaticBatch";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { campus } from "../core/campus";
import { Ball, Box, Cylinder, Ring, Sign } from "./Models";
import { GableRoof } from "./ArchitectureDetail";
import { TreeArt } from "./TreeArt";

type Part = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
};
const stone = new RoundedBoxGeometry(1, 1, 1, 2, 0.07);
const matte = new THREE.MeshStandardMaterial({ roughness: 0.88 });
const arch = new THREE.TorusGeometry(0.9, 0.18, 7, 16, Math.PI);
const archMaterial = new THREE.MeshStandardMaterial({
  color: "#d6b980",
  roughness: 0.86,
});
const parts: Part[] = [];
let emblem: THREE.CanvasTexture | undefined;
function CampusEmblem() {
  const texture = useMemo(() => {
    if (emblem) return emblem;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d")!;
    // Locally drawn campus identifier requested by Joshua; no downloaded art.
    const polygon = (points: number[][]) => {
      context.beginPath();
      points.forEach(([x, y], i) =>
        i ? context.lineTo(x, y) : context.moveTo(x, y),
      );
      context.closePath();
    };
    polygon([
      [150, 55],
      [340, 55],
      [385, 100],
      [385, 180],
      [300, 180],
      [300, 135],
      [215, 135],
      [215, 215],
      [340, 215],
      [385, 260],
      [385, 390],
      [340, 435],
      [150, 435],
      [105, 390],
      [105, 310],
      [190, 310],
      [190, 355],
      [275, 355],
      [275, 280],
      [150, 280],
      [105, 235],
      [105, 100],
    ]);
    context.fillStyle = "#8c1515";
    context.fill();
    polygon([
      [260, 55],
      [283, 121],
      [271, 121],
      [313, 179],
      [293, 179],
      [337, 238],
      [313, 238],
      [358, 300],
      [296, 300],
      [354, 363],
      [282, 363],
      [282, 443],
      [240, 443],
      [240, 363],
      [165, 363],
      [219, 300],
      [169, 300],
      [210, 238],
      [189, 238],
      [227, 179],
      [209, 179],
      [244, 121],
      [232, 121],
    ]);
    context.strokeStyle = "#fff";
    context.lineWidth = 17;
    context.lineJoin = "round";
    context.stroke();
    context.fillStyle = "#006b54";
    context.fill();
    emblem = new THREE.CanvasTexture(canvas);
    emblem.colorSpace = THREE.SRGBColorSpace;
    return emblem;
  }, []);
  return (
    <mesh position={[6.9, 5.2, -4.35]} dispose={null}>
      <planeGeometry args={[2.1, 2.1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
for (const side of [-1, 1])
  for (let i = 0; i < 5; i++) {
    const x = side * 7.1,
      z = -5.4 + i * 2.7;
    parts.push({ p: [x, 0.25, z], s: [0.7, 0.5, 0.7], c: "#b1986b" });
    parts.push({
      p: [x, 1.5, z],
      s: [0.4, 2.5, 0.4],
      c: i % 2 ? "#d3b782" : "#c7a66f",
    });
    parts.push({ p: [x, 2.7, z], s: [0.65, 0.3, 0.65], c: "#e3c790" });
  }
for (let i = 0; i < 9; i++) {
  const x = -6.8 + i * 1.7;
  parts.push({
    p: [x, 0.28, -6.4],
    s: [1.65, 0.5, 0.8],
    c: i % 2 ? "#baa075" : "#ccb181",
  });
}

function Masonry() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = new THREE.Object3D(),
      color = new THREE.Color();
    parts.forEach(({ p, s, c }, i) => {
      object.position.set(...p);
      object.scale.set(...s);
      object.updateMatrix();
      mesh.current!.setMatrixAt(i, object.matrix);
      mesh.current!.setColorAt(i, color.set(c));
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    if (mesh.current!.instanceColor)
      mesh.current!.instanceColor.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh
      ref={mesh}
      args={[stone, matte, parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
function Palm({ x, z }: { x: number; z: number }) {
  return <TreeArt p={[x, 0, z]} size={0.9} species="palm" />;
}

// An original miniature inspired by Stanford's sandstone quad, not a floor plan.
export function Campus() {
  return (
    <StaticBatch id="Campus">
      <group position={[campus.x, 0, campus.z]}>
        <CampusEmblem />
        <Box p={[0, 0.12, 0]} s={[19.8, 0.25, 17.8]} c="#b4a47a" />
        <Box p={[0, 0.26, 0.4]} s={[13.4, 0.12, 13.5]} c="#b4ac77" />
        <Box p={[0, 0.34, 0.4]} s={[3.3, 0.12, 15.4]} c="#d9c390" />
        <Box p={[0, 0.34, 0.4]} s={[14.2, 0.12, 2.9]} c="#d9c390" />
        <Masonry />
        {[-1, 1].map((side) => (
          <group key={side}>
            <Box
              p={[side * 8.5, 1.75, -0.5]}
              s={[2.4, 3.5, 13.6]}
              c="#c3a572"
            />
            <Box
              p={[side * 7.1, 3.1, -0.5]}
              s={[0.55, 0.55, 14.1]}
              c="#d6b980"
            />
            <group position={[side * 8, 0, -0.5]}>
              <GableRoof
                width={4.4}
                depth={14.7}
                y={3.4}
                rise={0.9}
                color="#a6492e"
              />
            </group>
            {Array.from({ length: 4 }, (_, i) => (
              <mesh
                key={i}
                position={[side * 7.1, 1.65, -4.05 + i * 2.7]}
                rotation={[0, Math.PI / 2, 0]}
                geometry={arch}
                material={archMaterial}
                castShadow
                receiveShadow
                dispose={null}
              />
            ))}
          </group>
        ))}
        <Box p={[0, 1.5, -7]} s={[15.6, 3, 2]} c="#c5a875" />
        <group position={[0, 0, -6.8]} rotation={[0, Math.PI / 2, 0]}>
          <GableRoof
            width={3.5}
            depth={17}
            y={3.1}
            rise={0.85}
            color="#a6492e"
          />
        </group>
        <Box p={[0, 2.5, -6]} s={[6.8, 5, 2.8]} c="#d1b687" />
        <Box p={[0, 0.4, -4.3]} s={[7.6, 0.45, 1]} c="#b49a6f" />
        <group position={[0, 0, -6]}>
          <GableRoof
            width={7.5}
            depth={3.8}
            y={4.8}
            rise={1.8}
            color="#a54d31"
          />
        </group>
        <Cylinder
          p={[0, 1.1, -4.5]}
          s={[0.7, 0.12, 0.7]}
          r={[Math.PI / 2, 0, 0]}
          c="#6e5038"
        />
        <Ring
          p={[0, 3.5, -4.52]}
          radius={0.83}
          tube={0.16}
          r={[Math.PI / 2, 0, 0]}
          c="#ae8250"
        />
        <Cylinder
          p={[0, 3.5, -4.52]}
          s={[0.67, 0.08, 0.67]}
          r={[Math.PI / 2, 0, 0]}
          c="#61847b"
        />
        {Array.from({ length: 8 }, (_, i) => (
          <Ball
            key={i}
            p={[
              Math.cos((i * Math.PI) / 4) * 0.45,
              3.5 + Math.sin((i * Math.PI) / 4) * 0.45,
              -4.58,
            ]}
            s={[0.15, 0.15, 0.06]}
            c={i % 2 ? "#dec27b" : "#995c4b"}
          />
        ))}
        <group position={[6.9, 0, -5.4]}>
          <Box p={[0, 4.3, 0]} s={[2, 8.6, 2]} c="#c8ad7e" />
          <Box p={[0, 7.9, 0]} s={[2.4, 0.45, 2.4]} c="#dcc390" />
          {[-0.55, 0.55].map((x) => (
            <Box key={x} p={[x, 7.05, 1.02]} s={[0.4, 1.1, 0.08]} c="#614f3a" />
          ))}
          <group>
            <GableRoof
              width={2.7}
              depth={2.7}
              y={8.3}
              rise={0.65}
              color="#a74c30"
            />
          </group>
          <Box p={[0, 2.5, 1.03]} s={[0.4, 2.1, 0.06]} c="#9e8158" />
        </group>
        <Cylinder p={[0, 0.6, 0.3]} s={[1.65, 0.55, 1.65]} c="#a58e66" />
        <Cylinder p={[0, 0.89, 0.3]} s={[1.4, 0.08, 1.4]} c="#64a4a1" />
        <Ring p={[0, 0.98, 0.3]} radius={1.55} tube={0.15} c="#d6bf8d" />
        <Cylinder p={[0, 1.2, 0.3]} s={[0.22, 0.7, 0.22]} c="#c9b181" />
        <Ball p={[0, 1.65, 0.3]} s={[0.48, 0.18, 0.48]} c="#90bbb1" />
        <Palm x={-5} z={3} />
        <Palm x={5} z={3} />
        {[-7.5, 7.5].map((x) => (
          <group key={x}>
            <Box p={[x, 1.4, 7]} s={[0.9, 2.8, 0.9]} c="#c5a875" />
            <Box p={[x, 2.9, 7]} s={[1.2, 0.25, 1.2]} c="#dfc695" />
          </group>
        ))}
        <Sign text="STANFORD" p={[0, 0.45, 7.8]} size={[4.4, 0.7]} />
      </group>
    </StaticBatch>
  );
}
