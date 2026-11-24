import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { riverCenter, type RaceState } from "../core/rowing";

/** Small procedural ripples, soft shoals and a readable fast-water channel. */
export function RowingWater({
  length,
  seed,
  state,
}: {
  length: number;
  seed: number;
  state: () => RaceState;
}) {
  const uniforms = useMemo(
    () => ({
      uRaceTime: { value: 0 },
      uRiverSeed: { value: seed },
      uDeep: { value: new THREE.Color("#075268") },
      uShallow: { value: new THREE.Color("#146577") },
      uCurrent: { value: new THREE.Color("#69b9b0") },
    }),
    [seed],
  );
  const geometry = useMemo(() => {
    const vertices: number[] = [],
      indices: number[] = [];
    for (let s = -30; s <= length + 80; s += 4) {
      const c = riverCenter(Math.max(0, s), seed);
      vertices.push(c - 12, -0.1, -s, c + 12, -0.1, -s);
    }
    for (let i = 0; i < vertices.length / 3 - 2; i += 2)
      indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }, [length, seed]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    uniforms.uRaceTime.value = Math.max(0, state().time);
  });
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color="#ffffff"
        roughness={0.33}
        metalness={0.05}
        side={THREE.DoubleSide}
        onBeforeCompile={(shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              `
          #include <common>
          varying vec3 vRiverWorld;
        `,
            )
            .replace(
              "#include <worldpos_vertex>",
              `
          #include <worldpos_vertex>
          vRiverWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              `
          #include <common>
          varying vec3 vRiverWorld;
          uniform float uRaceTime;
          uniform float uRiverSeed;
          uniform vec3 uDeep;
          uniform vec3 uShallow;
          uniform vec3 uCurrent;
        `,
            )
            .replace(
              "#include <color_fragment>",
              `
          #include <color_fragment>
          float s = max(0.0, -vRiverWorld.z);
          float center = sin(s / 75.0) * 7.0 + (sin(s / 32.0 + uRiverSeed) - sin(uRiverSeed)) * 3.0;
          float shoal = smoothstep(6.5, 12.0, abs(vRiverWorld.x - center));
          float channelX = center + sin(s / 48.0 + uRiverSeed * 0.7) * 3.4;
          float channel = 1.0 - smoothstep(0.5, 3.8, abs(vRiverWorld.x - channelX));
          float ripples = sin(vRiverWorld.x * 2.4 + s * 0.73 + uRaceTime * 2.2) *
            sin(s * 1.8 - vRiverWorld.x * 0.9 + uRaceTime * 1.3);
          diffuseColor.rgb = mix(uDeep, uShallow, shoal * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, uCurrent, channel * 0.82);
          diffuseColor.rgb *= 0.96 + ripples * 0.045;
        `,
            )
            .replace(
              "#include <normal_fragment_begin>",
              `
          #include <normal_fragment_begin>
          normal = normalize(normal + vec3(
            sin(vRiverWorld.x * 1.7 + vRiverWorld.z * 0.8 + uRaceTime * 1.8) * 0.10,
            cos(vRiverWorld.z * 1.9 - uRaceTime * 2.0) * 0.055, 0.0));
        `,
            );
        }}
      />
    </mesh>
  );
}
