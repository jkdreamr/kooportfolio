import * as THREE from "three";
import "./env/atmosphere";
import { noiseUniform } from "./env/noise";
import { detailUniform } from "./env/detail";

/** Sky colour of the rim sheen, already scaled (≤0.12). Game's Sun drives it
 * from the live hemisphere light, so it follows the time-of-day rig. */
export const surfaceSky = { value: new THREE.Color(0, 0, 0) };
/** 0..1 strength of the painted detail (a continuous tier knob; 0 on low). */
export const surfaceDetail = { value: 1 };
/** 0..1 explore grade (F4): the view blend on the high tier, else 0 (the
 * environment driver writes it). Lawns ("ground", up-facing, green) take a
 * richer, warmer green and every sculpted surface a slightly warmer sun and
 * cooler, lower shade — sun/shade contrast without a post pass. */
export const surfaceExplore = { value: 0 };
const LAWN_TINT = [0.92, 1.12, 0.74] as const;
/** The lawn grade as the shader applies it (exported so grass roots match). */
export function lawnGrade(color: THREE.Color, amount: number) {
  const green = THREE.MathUtils.smoothstep(color.g - Math.max(color.r, color.b), 0, 0.04) * amount;
  if (green <= 0) return color;
  const l = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const r = l + (color.r - l) * 1.45,
    g = l + (color.g - l) * 1.45,
    b = l + (color.b - l) * 1.45;
  return color.setRGB(
    THREE.MathUtils.lerp(color.r, r * LAWN_TINT[0], green),
    THREE.MathUtils.lerp(color.g, g * LAWN_TINT[1], green),
    THREE.MathUtils.lerp(color.b, b * LAWN_TINT[2], green),
  );
}


/* ------------------------------------------------------------ surface kind */

/**
 * What a sculpted surface is made of. Each kind is one layer of the shared
 * detail array (`env/detail.ts`): R albedo, G height (bump), B roughness.
 * "plain" is the original painted grain, so untagged materials look as before.
 */
export type SurfaceKind =
  | "plain"
  | "wood"
  | "stone"
  | "shingle"
  | "plaster"
  | "ground"
  | "bark"
  | "metal";
export const SURFACE_KINDS: readonly SurfaceKind[] = [
  "plain",
  "wood",
  "stone",
  "shingle",
  "plaster",
  "ground",
  "bark",
  "metal",
];
/** Layer index of each kind in the detail array (also the bake's kind byte). */
export const SURFACE_KIND_INDEX: Readonly<Record<SurfaceKind, number>> = {
  plain: 0,
  wood: 1,
  stone: 2,
  shingle: 3,
  plaster: 4,
  ground: 5,
  bark: 6,
  metal: 7,
};

function hexRgb(color: string | number): [number, number, number] | null {
  if (typeof color === "number")
    return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A conservative guess at a surface kind from an sRGB colour (pure; no
 * colour management). Used where a part only has a colour (Models' Box and
 * Cylinder). Only clear cases are tagged; everything else stays "plain":
 *  - warm browns, mid to dark  → wood
 *  - near-neutral greys        → plain (stone is tagged by the part)
 *  - pale, low-saturation tints → plaster
 * Metal is never inferred from colour; shingle and bark are tagged by the
 * part that knows it is a roof or a trunk.
 */
export function surfaceKindForColor(color: string | number): SurfaceKind {
  const rgb = hexRgb(color);
  if (!rgb) return "plain";
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  if (h >= 14 && h <= 46 && s >= 0.22 && l >= 0.12 && l <= 0.56) return "wood";
  // Neutral greys stay plain (R4): grey boxes are tarmac, posts, frames and
  // machinery far more often than masonry; real stone is tagged by its part.
  if (s < 0.1 && l >= 0.28 && l <= 0.78) return "plain";
  if (l > 0.78 && s < 0.45) return "plaster";
  return "plain";
}

/* ------------------------------------------------------------------- GLSL */

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

/** GLSL: triplanar sample of the shared 2D noise at world position `p` with
 * world normal `n`. Returns all four channels blended by facing. */
export const SURFACE_NOISE_FN = `
  vec4 sculptNoise(vec3 p, vec3 n) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= max(1e-4, w.x + w.y + w.z);
    return texture2D(uSurfaceNoise, p.zy) * w.x
      + texture2D(uSurfaceNoise, p.xz) * w.y
      + texture2D(uSurfaceNoise, p.xy) * w.z;
  }`;

/** GLSL: the same triplanar blend, from layer `kind` of the detail array. */
export const SURFACE_LAYER_FN = `
  vec4 sculptLayer(vec3 p, vec3 n, float kind) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= max(1e-4, w.x + w.y + w.z);
    return texture(uSurfaceLayers, vec3(p.zy, kind)) * w.x
      + texture(uSurfaceLayers, vec3(p.xz, kind)) * w.y
      + texture(uSurfaceLayers, vec3(p.xy, kind)) * w.z;
  }`;

/**
 * GLSL declarations of `sculptKind`, the detail layer as a float. By default
 * it is the material's `uSurfaceKind` uniform. A material that carries the
 * kind per vertex (the static bake) adds `SCULPT_KIND_VARYING` to its
 * `defines` and writes `vSculptKind` (the layer index, 0–7, as a float) in
 * its vertex shader; Surface declares the varying on both sides.
 */
const KIND_VERTEX = `
#ifdef SCULPT_KIND_VARYING
  varying float vSculptKind;
#endif`;
/** GLSL for a vertex shader that carries the kind per vertex: assigns
 * `vSculptKind` from `expr` (a float layer index) when the material has
 * `SCULPT_KIND_VARYING`, and is a no-op otherwise. */
export const SCULPT_KIND_VERTEX = (expr: string) => `
#ifdef SCULPT_KIND_VARYING
  vSculptKind = ${expr};
#endif`;
const KIND_FRAGMENT = `
#ifdef SCULPT_KIND_VARYING
  varying float vSculptKind;
  #define sculptKind floor(vSculptKind + 0.5)
#else
  uniform float uSurfaceKind;
  #define sculptKind uSurfaceKind
#endif`;

/**
 * Painted light-to-shade variation plus a restrained stylised-PBR break-up.
 * One shared detail array (8 procedural layers, `env/detail.ts`), sampled
 * triplanar in world space at the material's kind, nudges albedo and
 * roughness and adds a derivative bump from the layer's height; one fetch of
 * the shared 2D noise lays large, soft warm/cool patches across big surfaces.
 * "plain" keeps the original amplitudes (±7% albedo, ±0.08 roughness, no
 * bump); tagged kinds get ±12%, ±0.14 and the bump.
 * Standard lighting, cast shadows and the time-of-day rig still do the work.
 * A faint sky-tinted rim on faces turning away from the camera gives rounded
 * edges a glazed, ceramic read.
 *
 * Kind is a uniform (or a varying in the bake), never a define: every kind
 * shares one program per side / flat-shading variant.
 */
export function sculptedMaterial(
  options: THREE.MeshStandardMaterialParameters = {},
  kind: SurfaceKind = "plain",
) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.76,
    metalness: 0,
    ...options,
  });
  const kindUniform = { value: SURFACE_KIND_INDEX[kind] ?? 0 };
  material.userData.surfaceKind = kind;
  /** Per-material uniform object (writing `.value` retags the material). */
  material.userData.surfaceKindUniform = kindUniform;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfaceSky = surfaceSky;
    shader.uniforms.uSurfaceNoise = noiseUniform;
    shader.uniforms.uSurfaceLayers = detailUniform;
    shader.uniforms.uSurfaceDetail = surfaceDetail;
    shader.uniforms.uSurfaceKind = kindUniform;
    shader.uniforms.uSurfaceExplore = surfaceExplore;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vSculptNormal;\nvarying vec3 vSculptWorld;${KIND_VERTEX}`,
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
        uniform sampler2DArray uSurfaceLayers;
        uniform float uSurfaceDetail;
        uniform float uSurfaceExplore;
        ${KIND_FRAGMENT}
        float sculptGrain;
        float sculptRough;
        float sculptHeight;
        float sculptTagged;
        ${SURFACE_LAYER_FN}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 sculptN = normalize(vSculptNormal);
        float sculptLight = smoothstep(-0.65, 0.85, sculptN.y);
        diffuseColor.rgb *= mix(vec3(0.78, 0.83, 0.88), vec3(1.04, 1.02, 0.98), sculptLight);
        vec4 sculptFine = sculptLayer(vSculptWorld * 0.42, sculptN, sculptKind);
        float sculptBroad = texture2D(uSurfaceNoise, vSculptWorld.xz * 0.021 + 0.37).b;
        // Large flat, up-facing surfaces (paving, flagstones, decks, flat
        // roofs) take a calmer layer; lawns ("ground", 5) keep it.
        sculptTagged = step(0.5, sculptKind)
          * (1.0 - 0.55 * smoothstep(0.75, 0.97, sculptN.y) * step(0.5, abs(sculptKind - 5.0)));
        sculptGrain = sculptFine.r;
        sculptRough = sculptFine.b;
        sculptHeight = sculptFine.g;
        diffuseColor.rgb *= 1.0 + (sculptGrain - 0.5) * mix(0.14, 0.2, sculptTagged) * uSurfaceDetail;
        diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.965, 0.985, 1.02), vec3(1.035, 1.01, 0.965), sculptBroad), uSurfaceDetail);
        if (uSurfaceExplore > 0.0) {
          // Explore lawn grade (mirrors lawnGrade()): green, up-facing ground.
          vec3 sculptC = diffuseColor.rgb;
          float sculptGreen = smoothstep(0.0, 0.04, sculptC.g - max(sculptC.r, sculptC.b))
            * (1.0 - step(0.5, abs(sculptKind - 5.0))) * smoothstep(0.55, 0.85, sculptN.y) * uSurfaceExplore;
          float sculptL = dot(sculptC, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(sculptC, (sculptL + (sculptC - sculptL) * 1.45) * vec3(${LAWN_TINT.join(", ")}), sculptGreen);
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (sculptRough - 0.5) * mix(0.16, 0.26, sculptTagged) * uSurfaceDetail, 0.04, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          // Derivative bump from the layer height (tagged kinds only).
          float sculptBump = 0.35 * uSurfaceDetail * sculptTagged * step(0.5, sculptKind);
          vec2 sculptDH = vec2(dFdx(sculptHeight), dFdy(sculptHeight)) * sculptBump;
          vec3 sculptSX = dFdx(-vViewPosition);
          vec3 sculptSY = dFdy(-vViewPosition);
          vec3 sculptR1 = cross(sculptSY, normal);
          vec3 sculptR2 = cross(normal, sculptSX);
          float sculptDet = dot(sculptSX, sculptR1) * faceDirection;
          vec3 sculptGrad = sign(sculptDet) * (sculptDH.x * sculptR1 + sculptDH.y * sculptR2);
          vec3 sculptBumped = normalize(abs(sculptDet) * normal - sculptGrad);
          normal = sculptBump > 0.0 && abs(sculptDet) > 1e-12 ? sculptBumped : normal;
        }`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        // Explore: warmer sun, cooler and lower shade (sun/shade contrast).
        reflectedLight.directDiffuse *= mix(vec3(1.0), vec3(1.08, 1.02, 0.93), uSurfaceExplore);
        reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.82, 0.87, 0.97), uSurfaceExplore);
        float sculptRim = 1.0 - saturate(dot(geometryNormal, geometryViewDir));
        sculptRim = sculptRim * sculptRim * sculptRim * (0.35 + 0.65 * sculptLight);
        reflectedLight.indirectSpecular += uSurfaceSky * sculptRim;`,
      );
  };
  material.customProgramCacheKey = () => "sculpted-surface-v5";
  return material;
}

/** Retag a sculpted material after creation (no program change). */
export function setSurfaceKind(material: THREE.Material, kind: SurfaceKind) {
  const uniform = material.userData.surfaceKindUniform as { value: number } | undefined;
  if (!uniform) return;
  uniform.value = SURFACE_KIND_INDEX[kind];
  material.userData.surfaceKind = kind;
}
