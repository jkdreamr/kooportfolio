import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import { GableRoof } from "./ArchitectureDetail";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

type Pane = { p: [number, number, number]; s: [number, number, number] };
const box = new THREE.BoxGeometry();
const glass = new THREE.MeshStandardMaterial({
  color: "#9dbbb5",
  emissive: "#ffb85d",
  emissiveIntensity: 0.04,
  roughness: 0.28,
  metalness: 0.15,
});
const dayGlass = new THREE.Color("#9dbbb5"),
  nightGlass = new THREE.Color("#e8ba77");

/** Mounted once in Home; consumes the real regional clock, never sets it. */
export function HomeWindowLighting() {
  useFrame(() => {
    const night = sampleDaylight(daylightClock.hour).night;
    glass.color.copy(dayGlass).lerp(nightGlass, night);
    glass.emissiveIntensity = 0.04 + night * 1.6;
  });
  return null;
}

function Glazing({ panes }: { panes: Pane[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = new THREE.Object3D(),
      mesh = ref.current!;
    panes.forEach(({ p, s }, i) => {
      object.position.set(...p);
      object.scale.set(...s);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [panes]);
  return (
    <instancedMesh ref={ref} args={[box, glass, panes.length]} dispose={null} />
  );
}

function windowPanes(x: number, y: number, z: number, width: number): Pane[] {
  const panes: Pane[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      panes.push({
        p: [x + (sx * width) / 4, y + sy * 0.25, z + 0.171],
        s: [width / 2 - 0.06, 0.44, 0.028],
      });
  return panes;
}

const glazing: Record<string, Pane[]> = {
  kitchen: [-1.5, 1.5].flatMap((x) => windowPanes(x, 1.8, 1.9, 0.8)),
  writing: [-2.2, 2.2].flatMap((x) => windowPanes(x, 2.7, 2.59, 1.3)),
  office: [-1.75, 1.75].flatMap((x) => windowPanes(x, 1.85, 2.1, 0.8)),
  go: [-2.15, 2.15].map((x) => ({
    p: [x, 2.2, 2.528],
    s: [1.24, 1.64, 0.025],
  })),
};
const parts: Record<string, SceneryPart[]> = {};
const add = (
  id: string,
  p: SceneryPart["p"],
  s: SceneryPart["s"],
  c: string,
  r?: SceneryPart["r"],
) => (parts[id] ??= []).push({ p, s, c, r, shape: "stone" });

// Thick gutters, brackets and ridge iron distinguish rooflines without changing
// the shared building shells, their sizes or any doorway/approach geometry.
for (const [id, width, depth, y] of [
  ["kitchen", 5.2, 4.5, 3.15],
  ["writing", 7.8, 5.7, 4.65],
  ["music", 6.9, 5, 3.8],
  ["go", 7.2, 5.4, 3.75],
] as const) {
  for (const side of [-1, 1]) {
    add(
      id,
      [side * (width / 2 - 0.1), y - 0.12, 0],
      [0.17, 0.18, depth + 0.12],
      "#424f4b",
    );
    for (let i = 0; i < 4; i++)
      add(
        id,
        [side * (width / 2 - 0.26), y - 0.29, ((i - 1.5) * depth) / 4],
        [0.42, 0.34, 0.17],
        "#8a704d",
        [0, 0, side * 0.32],
      );
  }
}

// A fluted copper monitor on the studio, kept clear of its musical-note emblem.
add("music", [-1.45, 5.44, -0.25], [1.52, 0.72, 1.6], "#4b635d");
add("music", [-1.45, 5.88, -0.25], [1.86, 0.18, 1.94], "#8b987d");
for (let i = 0; i < 5; i++)
  add("music", [-1.45, 5.25 + i * 0.1, 0.59], [1.26, 0.055, 0.12], "#c0ad7f");

// The Go hall keeps its low jade hip; lifted timber finials define the ends.
for (const side of [-1, 1]) {
  add("go", [0, 5.63, side * 1.34], [0.23, 0.2, 0.64], "#b59d64", [
    side * -0.27,
    0,
    0,
  ]);
  add("go", [0, 5.83, side * 1.61], [0.2, 0.42, 0.22], "#7b8d73", [
    side * -0.2,
    0,
    0,
  ]);
}

// The picture house is an Art Deco stepped volume, not another hip roof.
for (const side of [-1, 1]) {
  add("theater", [side * 4.35, 5.5, 1.7], [0.18, 0.28, 3.8], "#c6ae85");
  add("theater", [side * 3.53, 6.14, -0.6], [0.17, 0.2, 5.5], "#d2b17c");
  for (let i = 0; i < 3; i++)
    add(
      "theater",
      [side * (3.77 + i * 0.2), 4.7, 4.15],
      [0.09, 0.7 + i * 0.22, 0.15],
      "#a78c57",
    );
}
add("theater", [0, 6.59, -0.6], [5.85, 0.14, 4.85], "#c99563");

// Slim copper chimney hoods and battens give the existing Study tower weight.
add("office", [1.8, 6.03, -0.9], [0.98, 0.19, 0.99], "#53716a");
for (const side of [-1, 1])
  add("office", [-1.4 + side * 0.86, 5.8, 0.25], [0.12, 1.65, 0.12], "#897957");

function Dormer({ p, color }: { p: [number, number, number]; color: string }) {
  const frame: SceneryPart[] = [
    { p: [0, 0, 0], s: [1.55, 1.1, 1.12], c: "#d4bd94", shape: "stone" },
    { p: [0, 0.02, 0.59], s: [1.02, 0.74, 0.12], c: "#4c4f45", shape: "stone" },
    { p: [0, 0.02, 0.7], s: [0.07, 0.62, 0.08], c: "#93734d", shape: "block" },
    { p: [0, -0.36, 0.67], s: [1.24, 0.13, 0.3], c: "#e0c99e", shape: "stone" },
  ];
  const panes: Pane[] = [-1, 1].map((side) => ({
    p: [side * 0.24, 0.02, 0.67],
    s: [0.41, 0.57, 0.025],
  }));
  return (
    <group position={p}>
      <WorldSceneryParts parts={frame} />
      <Glazing panes={panes} />
      <GableRoof width={1.9} depth={1.45} y={0.58} rise={0.58} color={color} />
    </group>
  );
}

/** Mounted inside the landmark's existing placement/scale group, Home only. */
export function HomeBuildingArt({ id }: { id: string }) {
  return (
    <group name={`home-${id}-crafted-detail`}>
      {parts[id] && <WorldSceneryParts parts={parts[id]} />}
      {glazing[id] && <Glazing panes={glazing[id]} />}
      {id === "kitchen" && <Dormer p={[0, 4.06, 1.3]} color="#a35538" />}
      {id === "writing" &&
        [-2.25, 2.25].map((x) => (
          <Dormer key={x} p={[x, 5.05, 1.8]} color="#416c5b" />
        ))}
    </group>
  );
}
