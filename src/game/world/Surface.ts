import * as THREE from "three";
import "./env/atmosphere";
import { noiseUniform } from "./env/noise";

/** Sky colour of the rim sheen, already scaled (≤0.12). Game's Sun drives it
 * from the live hemisphere light, so it follows the time-of-day rig. */
export const surfaceSky = { value: new THREE.Color(0, 0, 0) };
/** 0..1 strength of the painted noise variation (a continuous tier knob). */
export const surfaceDetail = { value: 1 };

/** GLSL: world position varying, instancing/batching aware. */
export const SURFACE_WORLD_VERTEX = `
  vec4 sculptWorld = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    sculptWorld = batchingMatrix * sculptWorld;
  #endif
  #ifdef USE_INSTANCING
    sculptWorld = instanceMatrix * sculptWorld;
  #endif
  vSculptWorld = (modelMatrix * sculptWorld).xyz;`;

/** GLSL: triplanar sample of the shared noise at world position `p` with
 * world normal `n`. Returns all four channels blended by facing. */
export const SURFACE_NOISE_FN = `
  vec4 sculptNoise(vec3 p, vec3 n) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= max(1e-4, w.x + w.y + w.z);
    return texture2D(uSurfaceNoise, p.zy) * w.x
      + texture2D(uSurfaceNoise, p.xz) * w.y
      + texture2D(uSurfaceNoise, p.xy) * w.z;
  }`;

/** Broad, painted light-to-shade variation plus a restrained stylised-PBR
 * break-up: one shared 128² noise texture, sampled triplanar in world space,
 * nudges albedo (±7%) and roughness (±0.08) and lays large, soft warm/cool
 * patches across big surfaces. Nothing reads as grain at gameplay distance.
 * The normal comes from Three's normal pipeline, including instancing.
 * Standard lighting, cast shadows and the time-of-day rig still do the work.
 * A faint sky-tinted rim on faces turning away from the camera gives rounded
 * edges a glazed, ceramic read.
 */
export function sculptedMaterial(
  options: THREE.MeshStandardMaterialParameters = {},
) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.76,
    metalness: 0,
    ...options,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfaceSky = surfaceSky;
    shader.uniforms.uSurfaceNoise = noiseUniform;
    shader.uniforms.uSurfaceDetail = surfaceDetail;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSculptNormal;\nvarying vec3 vSculptWorld;",
      )
      .replace(
        "#include <defaultnormal_vertex>",
        `#include <defaultnormal_vertex>
        vSculptNormal = inverseTransformDirection(transformedNormal, viewMatrix);`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>${SURFACE_WORLD_VERTEX}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vSculptNormal;
        varying vec3 vSculptWorld;
        uniform vec3 uSurfaceSky;
        uniform sampler2D uSurfaceNoise;
        uniform float uSurfaceDetail;
        float sculptGrain;
        ${SURFACE_NOISE_FN}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 sculptN = normalize(vSculptNormal);
        float sculptLight = smoothstep(-0.65, 0.85, sculptN.y);
        diffuseColor.rgb *= mix(vec3(0.78, 0.83, 0.88), vec3(1.04, 1.02, 0.98), sculptLight);
        vec4 sculptFine = sculptNoise(vSculptWorld * 0.42, sculptN);
        float sculptBroad = texture2D(uSurfaceNoise, vSculptWorld.xz * 0.021 + 0.37).b;
        sculptGrain = sculptFine.g * 0.65 + sculptFine.r * 0.35;
        diffuseColor.rgb *= 1.0 + (sculptGrain - 0.5) * 0.14 * uSurfaceDetail;
        diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.965, 0.985, 1.02), vec3(1.035, 1.01, 0.965), sculptBroad), uSurfaceDetail);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (sculptGrain - 0.5) * 0.16 * uSurfaceDetail, 0.04, 1.0);`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        float sculptRim = 1.0 - saturate(dot(geometryNormal, geometryViewDir));
        sculptRim = sculptRim * sculptRim * sculptRim * (0.35 + 0.65 * sculptLight);
        reflectedLight.indirectSpecular += uSurfaceSky * sculptRim;`,
      );
  };
  material.customProgramCacheKey = () => "sculpted-surface-v3";
  return material;
}
