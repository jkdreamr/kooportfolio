import { Ball, Box, Cylinder, Flowers, Ring } from "../world/Models";
import type { PlaceId } from "../core/world";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { sculptedMaterial } from "../world/Surface";

function Bookcase({ x }: { x: number }) {
  return (
    <group position={[x, 0, -11.4]}>
      <Box p={[0, 1.8, -0.5]} s={[4.2, 3.6, 0.25]} c="#674b32" />
      {[-2, 2].map((side) => (
        <Box key={side} p={[side, 1.8, 0]} s={[0.25, 3.6, 1.15]} c="#805f3b" />
      ))}
      {[0.25, 1.35, 2.45, 3.55].map((y) => (
        <Box key={y} p={[0, y, 0]} s={[4.3, 0.2, 1.2]} c="#a57e49" />
      ))}
      {Array.from({ length: 36 }, (_, i) => (
        <Box
          key={i}
          p={[-1.68 + (i % 12) * 0.3, 0.75 + Math.floor(i / 12) * 1.1, 0]}
          s={[0.22, 0.65 + (i % 3) * 0.08, 0.75]}
          c={["#496b61", "#a54f38", "#b5a16e", "#435668"][i % 4]}
        />
      ))}
      <Flowers p={[0.8, 3.65, 0]} />
    </group>
  );
}

export function RoomDressing({ scene }: { scene: PlaceId }) {
  if (scene === "boathouse")
    return (
      <>
        <RoomDetails scene={scene} />
        {[-7.5, 7.5].map((x, side) => (
          <group key={x}>
            {[-10, -4].map((z) => (
              <group key={z}>
                <Box p={[x, 2.1, z]} s={[0.22, 4.2, 0.3]} c="#785337" />
                <Box p={[x, 0.25, z]} s={[2.8, 0.25, 0.8]} c="#a58d64" />
                {[1.3, 2.5, 3.7].map((y) => (
                  <Box key={y} p={[x, y, z]} s={[2, 0.18, 0.25]} c="#a58d64" />
                ))}
              </group>
            ))}
            {[1.45, 2.65, 3.85].map((y, i) => (
              <group key={y} position={[x, y, -7]}>
                <Ball
                  s={[0.45, 0.23, 4.5]}
                  c={["#b94e30", "#e7bc5c", "#335b54"][(i + side) % 3]}
                />
                <Box p={[0, 0.17, 0]} s={[0.5, 0.09, 6.5]} c="#5b3e29" />
                {[-2, -0.65, 0.65, 2].map((z) => (
                  <Box
                    key={z}
                    p={[0, 0.22, z]}
                    s={[0.42, 0.08, 0.25]}
                    c="#c4a578"
                  />
                ))}
              </group>
            ))}
          </group>
        ))}
        <Box p={[0, 0.09, -8.5]} s={[5, 0.1, 6]} c="#456d65" />
      </>
    );
  if (scene === "office" || scene === "cognition")
    return (
      <>
        <RoomDetails scene={scene} />
        <Bookcase x={7.5} />
        <Bookcase x={-7.5} />
        <group position={[7, 0, 0]}>
          <Cylinder p={[0, 1.1, 0]} s={[1.8, 0.2, 1.8]} c="#a57c4b" />
          <Cylinder p={[0, 0.55, 0]} s={[0.25, 1.1, 0.25]} c="#47514a" />
          <Cylinder p={[0, 0.1, 0]} s={[0.9, 0.15, 0.9]} c="#47514a" />
          {[-1, 1].map((side) => (
            <Box
              key={side}
              p={[0, 0.6, side * 2.3]}
              s={[2.4, 0.35, 0.8]}
              c="#52776a"
            />
          ))}
          <Flowers p={[0, 1.2, 0]} />
        </group>
      </>
    );
  if (scene === "gym")
    return (
      <>
        <RoomDetails scene={scene} />
        {[-7, 7].map((x) => (
          <group key={x} position={[x, 0, -8.5]}>
            <Box p={[0, 0.12, 0]} s={[3, 0.16, 5.5]} c="#3c554e" />
            <Cylinder p={[0, 0.3, 0]} s={[0.9, 0.25, 0.9]} c="#7c8372" />
            <Cylinder p={[0, 2.2, 0]} s={[0.18, 4, 0.18]} c="#c3c7b6" />
            <Cylinder p={[0, 2.1, 0]} s={[0.62, 2.4, 0.62]} c="#a44b35" />
            {[1.05, 3.15].map((y) => (
              <Ring
                key={y}
                p={[0, y, 0]}
                radius={0.63}
                tube={0.055}
                c="#d0b06b"
              />
            ))}
          </group>
        ))}
      </>
    );
  return null;
}

type V3 = [number, number, number];
type Detail = {
  p: V3;
  s: V3;
  c: string;
  shape: "box" | "cylinder" | "ring";
  r?: V3;
};
const detailGeometry = {
  box: new RoundedBoxGeometry(1, 1, 1, 1, 0.055),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  ring: new THREE.TorusGeometry(1, 0.12, 5, 16),
};
const detailMaterial = sculptedMaterial({ roughness: 0.79 });

function roomDetails(scene: PlaceId) {
  const out: Detail[] = [];
  const box = (p: V3, s: V3, c: string, r?: V3) =>
    out.push({ p, s, c, shape: "box", r });
  const cylinder = (p: V3, s: V3, c: string, r?: V3) =>
    out.push({ p, s, c, shape: "cylinder", r });
  const ring = (p: V3, radius: number, c: string, r?: V3) =>
    out.push({ p, s: [radius, radius, radius], c, shape: "ring", r });
  const wood = "#8b6540",
    darkWood = "#624a36",
    steel = "#46535a",
    brass = "#b19a65";
  const cabinet = (x: number, z: number, count = 4) => {
    box([x, 1.4, z], [count * 0.92 + 0.2, 2.8, 1.12], darkWood);
    box([x, 2.85, z], [count * 0.92 + 0.35, 0.14, 1.28], wood);
    for (let i = 0; i < count; i++) {
      const cx = x + (i - (count - 1) / 2) * 0.92;
      box(
        [cx, 1.45, z + 0.6],
        [0.85, 2.52, 0.12],
        i % 2 ? "#617064" : "#727c6a",
      );
      box([cx + 0.25, 1.5, z + 0.69], [0.06, 0.3, 0.08], brass);
      for (let y = 2.18; y < 2.5; y += 0.1)
        box([cx, y, z + 0.67], [0.48, 0.025, 0.025], darkWood);
    }
  };
  const bench = (x: number, z: number, length: number) => {
    box([x, 0.68, z], [length, 0.2, 0.85], wood);
    for (const side of [-1, 1]) {
      box([x + side * (length / 2 - 0.28), 0.32, z], [0.15, 0.64, 0.7], steel);
      box([x, 0.78, z + side * 0.25], [length - 0.15, 0.035, 0.025], darkWood);
    }
  };
  const desk = (x: number, z: number) => {
    box([x, 1.15, z], [3.5, 0.19, 1.6], wood);
    for (const side of [-1, 1]) {
      box([x + side * 1.45, 0.56, z], [0.14, 1.12, 1.35], steel);
      box([x + side * 1.05, 0.48, z - 0.55], [0.09, 0.12, 0.09], brass);
    }
    box([x, 1.42, z - 0.25], [0.14, 0.5, 0.15], steel);
    box([x, 1.22, z - 0.2], [0.85, 0.06, 0.5], steel);
    box([x, 1.87, z - 0.38], [1.7, 1, 0.12], "#263c43");
    box([x, 1.87, z - 0.3], [1.5, 0.8, 0.035], "#91aaa1");
    box([x, 1.28, z + 0.4], [1.2, 0.05, 0.38], "#d5d5c3");
    cylinder([x + 1.16, 1.4, z + 0.3], [0.13, 0.28, 0.13], "#cbbd97");
    ring([x + 1.3, 1.41, z + 0.3], 0.09, "#cbbd97", [0, Math.PI / 2, 0]);
    box([x, 0.75, z + 1.65], [1.35, 0.24, 1.12], "#496159");
    box([x, 1.15, z + 2.12], [1.35, 0.9, 0.2], "#496159");
    cylinder([x, 0.35, z + 1.65], [0.11, 0.7, 0.11], steel);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      box(
        [x + Math.cos(a) * 0.25, 0.12, z + 1.65 + Math.sin(a) * 0.25],
        [0.7, 0.08, 0.09],
        steel,
        [0, -a, 0],
      );
    }
  };

  if (scene === "boathouse") {
    cabinet(-7.8, 1.2);
    bench(-7.5, 3.2, 4.4);
    // A repair bench, toolboard and clamped hull hardware, not a generic trophy wall.
    box([7.2, 1.2, 1.5], [4.3, 0.24, 1.7], wood);
    box([7.2, 0.58, 1.3], [3.9, 0.95, 1.3], "#4a655d");
    for (let i = 0; i < 4; i++) {
      box([5.75 + i * 0.96, 0.76, 2], [0.87, 0.35, 0.09], "#6e8171");
      box([5.75 + i * 0.96, 0.76, 2.07], [0.3, 0.05, 0.1], brass);
    }
    box([7.2, 2.35, 0.7], [4.3, 1.8, 0.15], darkWood);
    for (let i = 0; i < 6; i++) {
      const x = 5.6 + i * 0.6;
      cylinder([x, 2.35, 0.85], [0.045, 0.65 + (i % 3) * 0.12, 0.045], brass);
      box([x, 2, 0.86], [0.1, 0.22, 0.09], "#ab583c");
    }
    box([8.3, 1.47, 1.8], [0.45, 0.35, 0.45], steel);
    box([8.3, 1.65, 1.8], [0.65, 0.12, 0.2], "#99a69b");
    cylinder([6, 1.56, 1.6], [0.18, 0.5, 0.18], "#d0be80");
    cylinder([6, 1.84, 1.6], [0.11, 0.06, 0.11], steel);
    // Useful back-wall storage beneath the windows.
    box([0, 2.25, -12.1], [8.6, 0.15, 0.24], wood);
    for (let i = 0; i < 5; i++) {
      const x = -3.4 + i * 1.7;
      box([x, 1.55, -11.95], [0.8, 0.95, 0.2], i % 2 ? "#c88743" : "#af553b");
      box([x, 1.55, -11.82], [0.1, 0.82, 0.05], darkWood);
      box([x, 1.3, -11.8], [0.8, 0.08, 0.07], "#d4ba8e");
    }
    for (let i = 0; i < 4; i++)
      ring([-8.7, 0.18 + i * 0.09, 5.4], 0.48, "#b8a073", [-Math.PI / 2, 0, 0]);
    for (const x of [6.5, 7.6, 8.7]) {
      box([x, 0.45, 5.5], [0.95, 0.7, 1.15], "#677b6d");
      box([x, 0.84, 5.5], [1.03, 0.12, 1.2], darkWood);
      box([x, 0.48, 6.11], [0.28, 0.1, 0.07], brass);
    }
  }
  if (scene === "office" || scene === "cognition") {
    desk(-7, -4.5);
    desk(7, 4.3);
    cabinet(-7.5, 5.5, 3);
    // A quiet reading corner; the central desk/walking lane stays clear.
    box([-6.7, 0.75, 1], [3.5, 0.5, 1.6], "#5d7565");
    box([-6.7, 1.25, 0.3], [3.5, 0.9, 0.28], "#4e685c");
    for (const side of [-1, 1])
      box([-6.7 + side * 1.7, 1.05, 1], [0.3, 0.6, 1.7], "#4e685c");
    box([-6.7, 0.55, 3.2], [2.6, 0.15, 1.2], wood);
    for (const side of [-1, 1])
      box([-6.7 + side, 0.25, 3.2], [0.1, 0.5, 0.9], steel);
    for (let i = 0; i < 3; i++)
      box(
        [-6.5 + i * 0.1, 0.69 + i * 0.1, 3.2],
        [0.7, 0.08, 0.5],
        ["#a35e46", "#b3a375", "#5f766e"][i],
      );
  }
  if (scene === "gym") {
    box([7.3, 0.08, 1.8], [4.3, 0.1, 5], "#405c55");
    for (const z of [0.2, 3.5]) box([7.3, 0.7, z], [3.8, 0.14, 0.25], steel);
    for (const x of [5.6, 9]) box([x, 0.58, 1.8], [0.16, 1.16, 3.6], steel);
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 4; i++) {
        const x = 6 + i * 0.84,
          z = 0.25 + row * 3.2;
        cylinder([x, 0.94, z], [0.055, 0.65, 0.055], "#bbc0ae", [
          0,
          0,
          Math.PI / 2,
        ]);
        for (const side of [-1, 1])
          cylinder([x + side * 0.27, 0.94, z], [0.22, 0.14, 0.22], "#34494a", [
            0,
            0,
            Math.PI / 2,
          ]);
      }
    cabinet(-7.5, 2, 3);
    bench(-7.5, 4.2, 3.6);
    for (let i = 0; i < 4; i++)
      cylinder(
        [-8.6 + i * 0.7, 2.97, 2],
        [0.21, 0.58, 0.21],
        i % 2 ? "#c8cbbb" : "#a6b6a4",
        [0, 0, Math.PI / 2],
      );
    box([-7.5, 0.13, 6.2], [3.8, 0.14, 1.7], "#567469");
  }
  return out;
}

function DetailBatch({
  parts,
  geometry,
}: {
  parts: Detail[];
  geometry: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!,
      object = new THREE.Object3D(),
      color = new THREE.Color();
    parts.forEach((part, i) => {
      object.position.set(...part.p);
      object.scale.set(...part.s);
      object.rotation.set(...(part.r ?? [0, 0, 0]));
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(part.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return () => mesh.dispose();
  }, [parts]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, detailMaterial, parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

function RoomDetails({ scene }: { scene: PlaceId }) {
  const batches = useMemo(() => {
    const parts = roomDetails(scene);
    return (Object.keys(detailGeometry) as (keyof typeof detailGeometry)[]).map(
      (shape) => ({
        shape,
        parts: parts.filter((part) => part.shape === shape),
      }),
    );
  }, [scene]);
  return (
    <>
      {batches.map(
        ({ shape, parts }) =>
          parts.length > 0 && (
            <DetailBatch
              key={shape}
              parts={parts}
              geometry={detailGeometry[shape]}
            />
          ),
      )}
    </>
  );
}
