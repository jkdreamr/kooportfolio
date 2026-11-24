import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import {
  KOREA_GARDEN_WALKS,
  KOREA_LANDMARKS,
  KOREA_MAIN_STREET,
} from "../core/koreaLandmarks";
import { HanRiverBridge } from "./HanRiverBridge";
import { KoreaHistoricLandmarks } from "./KoreaHistoricLandmarks";
import { NamsanTower } from "./NamsanTower";
import { NaturalTrees, type TreePlacement } from "./TreeArt";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
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
const cityBlocks = [
  [-39.5, -14.4, 18, 10.4, "#bfb196"],
  [-16, -18.5, 27, 13.2, "#c9bfac"],
  [9, -18.5, 18, 13.2, "#c3bfb1"],
  [32, -18.5, 33.5, 12.8, "#c6b599"],
  [-13.5, -6, 17, 10.8, "#969982"],
  [-15, 5.5, 14, 11.1, "#a3a489"],
  [13, -6.2, 15, 11.5, "#a8a78e"],
  [34, -6.8, 25, 6, "#b5aa93"],
  [55.5, 4.2, 10.5, 13.2, "#92987d"],
  [-40, 23, 28, 17, "#93967d"],
  [-38, 40.5, 23, 8.4, "#a7a688"],
  [18.5, 54.5, 62, 7, "#909981"],
] as const;
for (const [x, z, width, depth, color] of cityBlocks) {
  paving.push({
    p: [x, 0.169, z],
    s: [width, 0.035, depth],
    c: color,
    shape: "block",
  });
}
// No paths over water: connect the office/booth to continuous bank promenades.
slab(0, 0, 13, 15, "#a8aaa2");
slab(0, -10.95, 4, 6.9, "#b3ab97");
slab(9, 1, 18, 3.4);
slab(11.5, 10, 27, 3.4);
const [towerX, towerZ] = KOREA_LANDMARKS.namsan.origin;
slab(towerX, towerZ, 5.2, 5.2, "#b8b5a8");
for (const walk of KOREA_GARDEN_WALKS) {
  const [x, z, width, depth] = walk;
  slab(x, z, width, depth, walk === KOREA_MAIN_STREET ? "#c8bba4" : "#b3ab97");
}
for (let x = -32; x <= 48; x += 1.6) {
  paving.push({
    p: [x, 0.213, KOREA_MAIN_STREET[1]],
    s: [1.56, 0.01, 2.5],
    c: Math.round(x * 10) % 3 ? "#c7bba6" : "#c0b39e",
    shape: "block",
  });
}
slab(5, 12, 119, 3.3);
slab(25, 18.7, 79, 3.2);
slab(25, 15.8, 79, 1.9, "#a27d72");
slab(28, 47, 88, 3.2);
slab(22, 50, 76, 1.9, "#a27d72");
slab(-15, 33, 3, 30);
slab(65, 30, 3, 25);
// The bank lane skirts the terminal to connect the bridge and departures.
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
for (let i = 0; i < 8; i++) {
  const x = -5 + i * 5.7;
  const z = 55.8;
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
export function KoreaWorldEnvironment({
  onVisitLandmark,
}: {
  onVisitLandmark: (x: number, z: number) => void;
}) {
  return (
    <group name="korea-environment">
      <WorldSceneryParts parts={paving} />
      <WorldSceneryParts parts={park} />
      <NaturalTrees trees={trees} />
      <NamsanTower onVisit={onVisitLandmark} />
      <KoreaHistoricLandmarks onVisit={onVisitLandmark} />
      <HangangWater />
      <HanRiverBridge />
      <KoreaRiversideLife />
    </group>
  );
}
