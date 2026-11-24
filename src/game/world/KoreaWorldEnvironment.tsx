import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import { HanRiverBridge } from "./HanRiverBridge";
import { SeoulSkyline } from "./SeoulSkyline";
import { NaturalTrees, type TreePlacement } from "./TreeArt";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
import { GroundGrass } from "./Scenery";
import type { GroundFootprint } from "../core/scenery";
import { KOREA_RIVER_FOOTPRINT } from "./KoreaRiverGround";
import {
  KoreaRiversideLife,
  KOREA_ACTIVITY_OBSTACLES,
} from "./CommunityScenery";

const paving: SceneryPart[] = [],
  park: SceneryPart[] = [];
const trees: TreePlacement[] = [];
export const KOREA_PARK_TREES: readonly TreePlacement[] = trees;
function slab(x: number, z: number, sx: number, sz: number, c = "#aaa99e") {
  paving.push({ p: [x, 0.188, z], s: [sx, 0.04, sz], c, shape: "block" });
}
// No paths over water: connect the office/booth to continuous bank promenades.
slab(0, 0, 13, 15, "#a8aaa2");
slab(0, -23, 4, 45);
slab(9, 1, 18, 3.4);
slab(18, -10, 14, 12, "#b0afa5");
slab(18, -3, 3.5, 10);
slab(11.5, 10, 27, 3.4);
slab(-6, -3, 3.3, 5);
slab(-10, -30, 24, 3.5);
slab(-19, -34, 38, 3);
slab(0, 12, 145, 3.3);
slab(25, 18.7, 79, 3.2);
slab(25, 15.8, 79, 1.9, "#a27d72");
slab(14, 47, 60, 3.2);
slab(14, 50, 60, 1.9, "#a27d72");
slab(-15, 33, 3, 30);
slab(65, 30, 3, 25);
// A narrow bank lane fits between the airport and the island's curved edge.
// Its outermost corner [70, 62] remains inside the ellipse; x74 did not.
slab(67.5, 34, 7, 2.4);
slab(69, 47.5, 2, 27);
slab(63.5, 61, 13, 2);
for (let x = -13; x < 63; x += 2) {
  paving.push({
    p: [x, 0.216, 15.8],
    s: [0.8, 0.012, 0.06],
    c: "#d9ceac",
    shape: "block",
  });
  if (x < 43)
    paving.push({
      p: [x, 0.216, 50],
      s: [0.8, 0.012, 0.06],
      c: "#d9ceac",
      shape: "block",
    });
}
for (let x = -6; x < 7; x += 1.6)
  for (let z = -7; z < 8; z += 1.6)
    paving.push({
      p: [x, 0.212, z],
      s: [1.55, 0.012, 1.55],
      c: Math.round(x * 10 + z * 10) % 3 ? "#b9b9ad" : "#aeb1a7",
      shape: "block",
    });
for (const z of [21.55, 44.45]) slab(25, z, 74.8, 0.55, "#cbc7b7");
const pavedFootprints = [
  KOREA_RIVER_FOOTPRINT,
  ...paving.map<GroundFootprint>(({ p, s }) => [p[0], p[2], s[0], s[2]]),
];

const benchFootprints: readonly (readonly [number, number, number, number])[] =
  [
    [-5, 53.5, 1.7, 0.55],
    [13, 53.5, 1.7, 0.55],
    [31, 53.5, 1.7, 0.55],
  ];
export const KOREA_PARK_OBSTACLES = [
  ...benchFootprints,
  ...KOREA_ACTIVITY_OBSTACLES,
] as const;
for (const [x, z] of benchFootprints) {
  for (const dx of [-1.2, 1.2])
    park.push({
      p: [x + dx, 0.55, z],
      s: [0.14, 0.85, 0.7],
      c: "#627870",
      shape: "block",
    });
  for (let j = 0; j < 4; j++)
    park.push({
      p: [x, 0.92, z - 0.3 + j * 0.2],
      s: [3.2, 0.12, 0.15],
      c: "#a68c64",
      shape: "block",
    });
  for (let j = 0; j < 3; j++)
    park.push({
      p: [x, 1.2 + j * 0.18, z + 0.43],
      s: [3.2, 0.13, 0.12],
      c: "#a68c64",
      shape: "block",
    });
}
for (let i = 0; i < 16; i++) {
  const x = -8 + i * 3.1;
  const z = 57 + Math.sin(i * 2.8) * 2.1;
  trees.push({ p: [x, 0, z], size: 0.85 + (i % 3) * 0.08, variant: 2 });
  for (let j = 0; j < 6; j++) {
    const a = j * 2.4 + i;
    park.push({
      p: [x + Math.cos(a), 0.48, z + Math.sin(a)],
      s: [0.055, 0.7, 0.11],
      r: [0.3 * Math.cos(a), a, 0.3 * Math.sin(a)],
      c: "#8a9965",
      shape: "block",
    });
    park.push({
      p: [x + Math.cos(a), 0.8, z + Math.sin(a)],
      s: [0.09, 0.25, 0.09],
      c: "#b8aa7e",
      shape: "column",
    });
  }
}

function HangangWater() {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const shader = material.current?.userData.riverShader as
      | { uniforms: { uFlow: { value: number }; uNight: { value: number } } }
      | undefined;
    if (shader) {
      shader.uniforms.uFlow.value = clock.elapsedTime;
      shader.uniforms.uNight.value = sampleDaylight(daylightClock.hour).night;
    }
  });
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[25, -2.3, 33]}
      receiveShadow
    >
      <planeGeometry args={[74, 22]} />
      <meshStandardMaterial
        ref={material}
        color="#3f7279"
        roughness={0.3}
        metalness={0.16}
        onBeforeCompile={(shader) => {
          shader.uniforms.uFlow = { value: 0 };
          shader.uniforms.uNight = { value: 0 };
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
              "#include <common>\nvarying vec2 vRiverUv; uniform float uFlow; uniform float uNight;",
            )
            .replace(
              "#include <color_fragment>",
              `#include <color_fragment>
        float ripple = sin(vRiverUv.y * 180.0 + sin(vRiverUv.x * 29.0 + uFlow * .18) * 2.0 + uFlow * .65);
        float bank = pow(abs(vRiverUv.y - .5) * 2.0, 5.0);
        diffuseColor.rgb *= 1.0 + ripple * .045 + bank * .12;`,
            )
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
        float reflection = exp(-pow((vRiverUv.y - .14) * 22.0, 2.0)) * (.6 + .4 * sin(vRiverUv.y * 340.0 + vRiverUv.x * 25.0 - uFlow));
        vec3 rainbow = .5 + .5 * cos(6.28318 * (vRiverUv.x * .78 + vec3(0.0,.33,.67)));
        totalEmissiveRadiance += rainbow * reflection * uNight * .25;`,
            );
        }}
      />
    </mesh>
  );
}

/** Additive district. Mount KoreaRiverGround in place of the shared terrain. */
export function KoreaWorldEnvironment() {
  return (
    <group name="korea-environment">
      <WorldSceneryParts parts={paving} />
      <GroundGrass avoid={pavedFootprints} />
      <WorldSceneryParts parts={park} />
      <NaturalTrees trees={trees} />
      <SeoulSkyline />
      <HangangWater />
      <HanRiverBridge />
      <KoreaRiversideLife />
    </group>
  );
}
