import * as THREE from "three";

/**
 * Height + distance atmosphere through the shared fog hook.
 *
 * Every built-in and patched material already includes Three's fog chunks, so
 * replacing those chunks once, at import, gives the whole world (every
 * workstream's materials, no per-material work) the same atmospheric
 * perspective with no extra uniforms, programs or passes:
 *
 *  - distance haze: the scene fog's near/far, measured in view depth. In the
 *    hub, `driveAtmosphere` re-centres near/far on the camera's focus every
 *    frame, so the telephoto island always sits in clear air with only its far
 *    side (and the next layers of trees) softening toward the horizon colour.
 *  - height haze: below the island's lip the air thickens toward the cloud
 *    deck, so the hanging undersides recede instead of ending on a hard edge.
 *
 * Fog colour stays the time-of-day horizon (TimeOfDayLighting owns it).
 * Interiors keep their own near/far, so they behave exactly as before; their
 * floors never reach the height band. The chunk keeps Three's FOG_EXP2 path.
 */
const VERSION = "env-atmosphere-v1";
type Chunks = Record<string, string>;
const chunks = THREE.ShaderChunk as unknown as Chunks;

/** Where the height haze begins and where it is thickest (world y). */
export const HEIGHT_HAZE = { top: -2.5, bottom: -30, strength: 0.72 } as const;

export function patchAtmosphereChunks() {
  if (chunks.fog_pars_vertex.includes(VERSION)) return;
  chunks.fog_pars_vertex = `// ${VERSION}
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogHeight;
#endif
`;
  // World height from the view-space position (the view matrix is rigid):
  // works for every material, instanced or skinned, with no extra attribute.
  chunks.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogHeight = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif
`;
  chunks.fog_pars_fragment = `// ${VERSION}
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogHeight;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
  chunks.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float fogLow = smoothstep( ${HEIGHT_HAZE.top.toFixed(2)}, ${HEIGHT_HAZE.bottom.toFixed(2)}, vFogHeight ) * ${HEIGHT_HAZE.strength.toFixed(2)};
  fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - fogLow );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}
patchAtmosphereChunks();

/** Art-direction knobs for the hub's distance haze (world units of depth
 * beyond the focus point). Continuous, so a tier may scale them freely. */
export const atmosphere = {
  /** Clear air this far in front of the focus point. */
  clear: 18,
  /** Depth over which haze builds to full beyond the clear zone. */
  span: 260,
};

const forward = new THREE.Vector3();
let focusSmoothed = 0;
/**
 * Hub only: centre the fog's near/far on the camera's focus (where its view
 * ray meets the ground). Called every frame by the environment driver.
 */
export function driveAtmosphere(scene: THREE.Scene, camera: THREE.Camera) {
  const fog = scene.fog;
  if (!(fog instanceof THREE.Fog)) return;
  camera.getWorldDirection(forward);
  const height = camera.position.y;
  // Distance along the view ray to the y = 0 plane (fallback: 150).
  const focus = forward.y < -0.05 ? height / -forward.y : 150;
  focusSmoothed = focusSmoothed
    ? THREE.MathUtils.lerp(focusSmoothed, focus, 0.2)
    : focus;
  fog.near = Math.max(1, focusSmoothed - atmosphere.clear);
  fog.far = fog.near + atmosphere.span;
}
