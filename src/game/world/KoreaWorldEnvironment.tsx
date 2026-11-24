import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import { HanRiverBridge } from "./HanRiverBridge";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

const paving: SceneryPart[] = [];
function slab(x: number, z: number, sx: number, sz: number, c = "#aaa99e") {
  paving.push({ p: [x, 0.188, z], s: [sx, 0.04, sz], c, shape: "block" });
}
// Side streets join existing door approaches; no alternative room shells here.
slab(0, 0, 13, 15, "#a8aaa2");
slab(0, -23, 4, 45);
slab(9, 1, 18, 3.4);
slab(18, -10, 14, 12, "#b0afa5");
slab(18, -3, 3.5, 10);
slab(11.5, 10, 27, 3.4);
slab(23, 23, 3.5, 24);
slab(24, 34, 5, 7.4);
slab(-6, -3, 3.3, 5);
slab(-10, -30, 24, 3.5);
slab(-38, -34, 3.5, 10);
slab(-19, -34, 38, 3);
slab(64, 45, 4.6, 26);
slab(61, 61, 10, 3.4);
slab(0, 12, 145, 3.3);

// Jointed limestone around the office/plaza, rather than a flat checkerboard.
for (let x = -6; x < 7; x += 1.6) {
  for (let z = -7; z < 8; z += 1.6) {
    paving.push({
      p: [x, 0.212, z],
      s: [1.55, 0.012, 1.55],
      c: Math.round(x * 10 + z * 10) % 3 ? "#b9b9ad" : "#aeb1a7",
      shape: "block",
    });
  }
}
// The river occupies x32..58 / z22..44. Banks stay flush with walking physics.
for (const x of [30.7, 59.3]) {
  slab(x, 33, 2.6, 25, "#bcb9aa");
  slab(x + (x < 45 ? -1.8 : 1.8), 33, 0.85, 25, "#8b6660");
  for (let z = 22; z <= 44; z += 1.4) {
    paving.push({
      p: [x < 45 ? 31.8 : 58.2, 0.215, z],
      s: [0.32, 0.06, 1.35],
      c: "#d0cec0",
    });
    // Fine dashed cycle-lane markings remain below the bridge surface.
    paving.push({
      p: [x + (x < 45 ? -1.8 : 1.8), 0.216, z],
      s: [0.055, 0.01, 0.6],
      c: "#d9ceac",
      shape: "block",
    });
  }
}
for (const z of [21.7, 44.3]) slab(45, z, 26.5, 0.6, "#cbc7b7");

const skyline: SceneryPart[] = [];
for (let i = 0; i < 27; i++) {
  const x = -88 + i * 6.8;
  const z = -85 - (i % 4) * 4;
  const height = 7 + ((i * 17) % 23);
  const width = 3.8 + (i % 3) * 0.7;
  skyline.push({
    p: [x, height / 2 - 1, z],
    s: [width, height, 4 + (i % 4)],
    c: ["#647674", "#7b8782", "#89918a", "#6b7b7c"][i % 4],
  });
  skyline.push({
    p: [x, height - 0.8, z],
    s: [width + 0.25, 0.3, 4.5 + (i % 4)],
    c: "#a2aaa0",
  });
  // Narrow mullions keep scale legible without hundreds of unique meshes.
  for (let y = 1; y < height - 1; y += 2) {
    skyline.push({
      p: [x, y, z + 2.04 + (i % 4) / 2],
      s: [width * 0.84, 0.65, 0.025],
      c: y % 3 ? "#a2b5ad" : "#bbbaa1",
      shape: "block",
    });
  }
}
// Distant rounded granite ridges and a slender hilltop observation mast.
for (let i = 0; i < 9; i++) {
  skyline.push({
    p: [-95 + i * 23, -1.5, -115 - (i % 2) * 8],
    s: [20 + (i % 3) * 4, 16 + ((i * 7) % 15), 11],
    c: i % 2 ? "#667b72" : "#788b7c",
    shape: "rock",
  });
}
skyline.push({
  p: [-33, 15, -103],
  s: [0.65, 24, 0.65],
  c: "#babdb0",
  shape: "column",
});
skyline.push({ p: [-33, 25.5, -103], s: [2.6, 1.8, 2.6], c: "#8a9993" });
skyline.push({
  p: [-33, 30.2, -103],
  s: [0.2, 8, 0.2],
  c: "#d0ccc0",
  shape: "column",
});

function HangangWater() {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const shader = material.current?.userData.riverShader as
      | { uniforms: { uFlow: { value: number } } }
      | undefined;
    if (shader) shader.uniforms.uFlow.value = clock.elapsedTime;
  });
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[45, 0.218, 33]}
      receiveShadow
    >
      <planeGeometry args={[26, 22]} />
      <meshStandardMaterial
        ref={material}
        color="#3f7279"
        roughness={0.3}
        metalness={0.16}
        onBeforeCompile={(shader) => {
          shader.uniforms.uFlow = { value: 0 };
          material.current!.userData.riverShader = shader;
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec2 vRiverUv;",
            )
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nvRiverUv = uv;",
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec2 vRiverUv; uniform float uFlow;",
            )
            .replace(
              "#include <color_fragment>",
              `#include <color_fragment>
        float ripple = sin(vRiverUv.y * 180.0 + sin(vRiverUv.x * 29.0 + uFlow * .18) * 2.0 + uFlow * .65);
        float bank = pow(abs(vRiverUv.x - .5) * 2.0, 5.0);
        diffuseColor.rgb *= 1.0 + ripple * .045 + bank * .12;`,
            );
        }}
      />
    </mesh>
  );
}

function BridgeLights() {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const secondMaterial = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const intensity = sampleDaylight(daylightClock.hour).night * 1.8;
    if (material.current) material.current.emissiveIntensity = intensity;
    if (secondMaterial.current)
      secondMaterial.current.emissiveIntensity = intensity;
  });
  return (
    <group>
      {[30.38, 37.62].map((z) => (
        <mesh key={z} position={[45, 1.12, z]}>
          <boxGeometry args={[37.8, 0.045, 0.05]} />
          <meshStandardMaterial
            ref={z === 30.38 ? material : secondMaterial}
            color="#bfad82"
            emissive="#e3b967"
            emissiveIntensity={0}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Additive Hangang district; shared ground, rooms and interactions are world-owned. */
export function KoreaWorldEnvironment() {
  return (
    <group name="korea-environment">
      <WorldSceneryParts parts={paving} />
      <WorldSceneryParts parts={skyline} />
      <HangangWater />
      <HanRiverBridge />
      <BridgeLights />
    </group>
  );
}
