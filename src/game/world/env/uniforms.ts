import * as THREE from "three";

/**
 * Uniform objects shared by every environment material (leaves, grass, rocks,
 * shore detail, ripples). One driver (`EnvironmentDriver`) writes them once a
 * frame; materials hold references, so nothing is uploaded per material.
 */
export const envUniforms = {
  /** Seconds, wrapped; frozen under reduced motion / pause. */
  uEnvTime: { value: 0 },
  /** Direction from the ground toward the sun (world, normalised). */
  uEnvSunDir: { value: new THREE.Vector3(-0.38, 0.77, 0.38).normalize() },
  /** Sun colour × intensity (linear), for translucency and glints. */
  uEnvSunColor: { value: new THREE.Color(1, 0.94, 0.8) },
  /** Sky (hemisphere) colour × intensity, for rims and water reflections. */
  uEnvSky: { value: new THREE.Color("#bcd8ee") },
  /** 0 day … 1 night. */
  uEnvNight: { value: 0 },
  /** Player feet (x, y, z) and bend radius in w. */
  uEnvPlayer: { value: new THREE.Vector4(0, 0, 0, 1.1) },
  /** Wind strength 0..1 (weather + gentle base breeze). */
  uEnvWind: { value: 0.35 },
  /** 0..1: foliage near the camera dithers out (the explore view blend). */
  uEnvCamFade: { value: 0 },
};
export type EnvUniforms = typeof envUniforms;

/** Attach every shared uniform to a shader in onBeforeCompile. */
export function bindEnvUniforms(shader: { uniforms: Record<string, unknown> }) {
  Object.assign(shader.uniforms, envUniforms);
}
export const ENV_UNIFORMS_GLSL = `
uniform float uEnvTime;
uniform vec3 uEnvSunDir;
uniform vec3 uEnvSunColor;
uniform vec3 uEnvSky;
uniform float uEnvNight;
uniform vec4 uEnvPlayer;
uniform float uEnvWind;
uniform float uEnvCamFade;`;
