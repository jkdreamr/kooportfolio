import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

const parts: SceneryPart[] = [];
// Shared contract only; the world builder owns movement/collision implementation.
export const KOREA_WATER_OBSTACLES = [
  [25, 26, 37, 4],
  [25, 41, 37, 3],
] as const;
export const KOREA_BRIDGE_RAILS = [
  [25, 30.38, 43, 0.18],
  [25, 37.62, 43, 0.18],
] as const;
function part(
  p: [number, number, number],
  s: [number, number, number],
  c: string,
) {
  parts.push({ p, s, c });
}
// Long concrete girders with a regular pier rhythm, not a European arch bridge.
part([25, -0.09, 34], [86, 0.6, 7.4], "#a5aaa0");
part([25, 0.223, 34], [86, 0.025, 5.25], "#707b78");
for (const z of [30.8, 37.2]) part([25, 0.26, z], [86, 0.1, 0.8], "#c7c3af");
for (const z of [30.38, 37.62]) {
  part([25, 1.2, z], [86, 0.12, 0.12], "#718781");
  part([25, 0.75, z], [86, 0.065, 0.065], "#718781");
  for (let x = -17.5; x <= 68; x += 1.9)
    part([x, 0.73, z], [0.09, 1.02, 0.09], "#81938a");
}
for (let x = -9; x < 63; x += 10) {
  for (const z of [31.3, 36.7]) {
    part([x, -1.2, z], [1.05, 2.6, 1.05], "#939e93");
    part([x, -2.47, z], [1.8, 0.35, 1.75], "#7b8b81");
    part([x, -0.27, z], [1.6, 0.38, 1.5], "#b0b7a8");
  }
  part([x, -0.4, 34], [1.4, 0.5, 7.5], "#acb3a5");
  // Offset upper roadway leaves the riverside half of the lower path visible.
  part([x, 1.8, 30.38], [0.65, 4.8, 0.32], "#a3aea1");
  part([x, 4.12, 29.3], [1, 0.45, 5.4], "#c0c5b5");
}
part([25, 4.38, 29.3], [86, 0.48, 5.4], "#a2aa9d");
part([25, 4.64, 29.3], [86, 0.035, 4.55], "#606e6b");
for (const z of [26.65, 31.95]) {
  part([25, 4.9, z], [86, 0.7, 0.24], "#a3b0a3");
  part([25, 5.27, z], [86, 0.1, 0.3], "#d1d3bb");
}
for (let x = -17; x < 68; x += 4)
  part([x, 4.665, 29.3], [2.1, 0.012, 0.08], "#ded5ae");
for (let x = -16; x < 68; x += 8) {
  part([x, 6.3, 26.8], [0.095, 2.8, 0.095], "#6e817b");
  part([x, 7.67, 27.25], [0.09, 0.09, 0.95], "#7f938a");
  part([x, 7.6, 27.7], [0.22, 0.12, 0.45], "#c2c6ab");
}
for (const [x, z, c] of [
  [-3, 28, "#e4dcc8"],
  [22, 30.4, "#566b73"],
  [47, 28, "#9c6455"],
] as const) {
  part([x, 5.04, z], [2.7, 0.7, 1.2], c);
  part([x - 0.2, 5.5, z], [1.4, 0.5, 1.06], "#7c9693");
  for (const dx of [-0.8, 0.8])
    for (const dz of [-0.62, 0.62])
      part([x + dx, 4.89, z + dz], [0.4, 0.4, 0.16], "#3f4945");
}

function jetGeometry() {
  const vertices: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = 4.92 + 2.3 * t - 9.48 * t * t;
    const z = 31.98 + t * 8.5;
    const width = 0.027 + t * 0.085;
    vertices.push(-width, y, z, width, y, z);
    if (i < 16)
      indices.push(
        i * 2,
        i * 2 + 1,
        i * 2 + 2,
        i * 2 + 1,
        i * 2 + 3,
        i * 2 + 2,
      );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const jet = jetGeometry();

function RainbowFountains() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uNight: { value: 0 } }),
    [],
  );
  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < 112; i++) {
      object.position.set(-10 + i * 0.64, 0, 0);
      object.updateMatrix();
      ref.current!.setMatrixAt(i, object.matrix);
      ref.current!.setColorAt(
        i,
        color.setHSL(0.02 + (i / 112) * 0.78, 0.9, 0.43),
      );
    }
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor)
      ref.current!.instanceColor.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, []);
  useFrame(({ clock }) => {
    const shader = material.current?.userData.fountainShader as
      | { uniforms: typeof uniforms }
      | undefined;
    if (shader) {
      shader.uniforms.uTime.value = clock.elapsedTime;
      shader.uniforms.uNight.value = sampleDaylight(daylightClock.hour).night;
    }
  });
  return (
    <instancedMesh ref={ref} args={[jet, undefined, 112]} frustumCulled={false}>
      <meshStandardMaterial
        ref={material}
        color="#c4e5df"
        transparent
        opacity={0.72}
        depthWrite={false}
        roughness={0.3}
        metalness={0.05}
        side={THREE.DoubleSide}
        onBeforeCompile={(shader) => {
          Object.assign(shader.uniforms, uniforms);
          material.current!.userData.fountainShader = shader;
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float uTime; varying float vJetHeight;",
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
        float spread = (position.z - 31.98) / 8.5;
        transformed.z += sin(uTime * .8 + instanceMatrix[3].x * .11) * spread * .4;
        vJetHeight = spread;`,
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float uNight; uniform float uTime; varying float vJetHeight;",
            )
            .replace(
              "#include <color_fragment>",
              `#include <color_fragment>
        diffuseColor.rgb = mix(vec3(.64,.80,.79), diffuseColor.rgb, uNight);
        diffuseColor.a *= .68 + .28 * sin(vJetHeight * 68.0 - uTime * 6.0);`,
            )
            .replace(
              "#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uNight * 1.8;",
            );
        }}
      />
    </instancedMesh>
  );
}

/** Banpo-inspired crossing: x-18..68 / z30.3..37.7, lower walk deck y=.24. */
export function HanRiverBridge() {
  return (
    <group name="han-river-banpo-bridge">
      <WorldSceneryParts parts={parts} />
      <RainbowFountains />
    </group>
  );
}
