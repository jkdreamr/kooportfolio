import * as THREE from "three";
import { viewRuntime } from "../../core/worldView";

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

/** Explore haze knobs (F4): near push (world units), how far the colour moves
 * toward the cool tint, and the tint's linear RGB relative to the luminance. */
export const exploreHaze = { push: 10, mix: 0.55, cool: [0.84, 0.98, 1.2] as const };
const cool = new THREE.Color();

const forward = new THREE.Vector3();
let focusSmoothed = 0;
/**
 * Hub only: centre the fog's near/far on the camera's focus (where its view
 * ray meets the ground). Called every frame by the environment driver.
 */
export function driveAtmosphere(
  scene: THREE.Scene,
  camera: THREE.Camera,
  delta = 1 / 60,
  /** The F4 explore grade (blend on high, else 0): haze push and cool tint. */
  look = 0,
) {
  const fog = scene.fog;
  if (!(fog instanceof THREE.Fog)) return;
  camera.getWorldDirection(forward);
  const height = camera.position.y;
  // Distance along the view ray to the y = 0 plane (fallback: 150).
  const focus = forward.y < -0.05 ? height / -forward.y : 150;
  // Frame-rate independent damping (time constant ~1/12 s), so a view
  // switch settles in the same wall time on a 20 or a 144 fps display and
  // the overview never lingers in the explore view's near fog.
  const k = 1 - Math.exp(-12 * Math.min(Math.max(delta, 0), 0.25));
  focusSmoothed = focusSmoothed ? THREE.MathUtils.lerp(focusSmoothed, focus, k) : focus;
  const blend = viewRuntime.blend;
  // Explore: the haze starts a little further out, so the midground keeps
  // its contrast (F4: +10 near, span 260 → 165 rather than 140).
  fog.near = Math.max(1, focusSmoothed - atmosphere.clear) + look * exploreHaze.push;
  // The explore view sees to the horizon: thicker depth haze (260 → 140;
  // → 165 with the F4 grade).
  fog.far = fog.near + atmosphere.span * (1 - blend * (120 / 260) + look * (25 / 260));
  // Explore: cool the horizon haze from TimeOfDayLighting's warm horizon
  // toward a blue-grey of the same brightness (aerial perspective). The
  // colour is re-copied by TimeOfDayLighting every frame (priority -1,
  // before this driver), so nothing accumulates; interiors never get here.
  if (look > 0) {
    const c = fog.color;
    const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    cool.setRGB(l * exploreHaze.cool[0], l * exploreHaze.cool[1], l * exploreHaze.cool[2]);
    c.lerp(cool, exploreHaze.mix * look);
  }
}

