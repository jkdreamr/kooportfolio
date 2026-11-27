import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldId } from "../../core/worlds";
import { useWorldView, viewRuntime } from "../../core/worldView";
import { runtime } from "../../core/store";
import { useWorldActive } from "../../engine/active";
import { registerWarmup } from "../../../stage/contract";
import { ENV_UNIFORMS_GLSL, bindEnvUniforms } from "./uniforms";
import { grassField, grassFieldAsync, type GrassTuft } from "./placement";
import { envBudget, useEnvTier } from "./tier";
import { nextSlice } from "./slice";
import { lawnGrade } from "../Surface";

/**
 * Instanced grass tufts: tapered blades with a root→tip gradient, wind, a
 * bend away from the player's feet and backlit tips. All tufts for an island
 * are placed once (tier maximum from the contract budget), bucketed into 8 m
 * chunks; each time the camera's focus moves to another chunk, the chunks in
 * range are copied to the front of the instance buffer and `mesh.count` is
 * set — one draw, no material or define changes at run time.
 *
 * Explore view (PLAN2 §1.3): two tuft LODs share the material — near (7
 * blades, 21 tris) within 12 units of the player, far (3 wide blades, 9 tris)
 * out to 30 units, thinned 1 → 0.25 with distance; the two cross-fade over a
 * 3-unit band in the vertex shader. Blades widen ×1.4, roots take the lawn's
 * colour and the tip highlight softens, all driven by the view blend (a
 * uniform). The diorama keeps today's single mesh, caps and look.
 */

const BLADES = 7;
const CHUNK = 8;
/** Explore LOD radii (world units from the LOD centre). */
const NEAR_RADIUS = 12;
const FAR_RADIUS = 30;

/** Tapered blades (3 triangles each), fanning from one root. `lod` is the
 * per-vertex LOD tag (1 near, 2 far; reeds carry none = 0, never faded). */
function tuftGeometry(blades = BLADES, lod = 1, widthScale = 1) {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    wide: number[] = [],
    index: number[] = [];
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2 + b * 0.7;
    const lean = 0.16 + (b % 3) * 0.09;
    const height = 0.28 + ((b * 37) % 7) * 0.04;
    const width = (0.06 + (b % 2) * 0.016) * widthScale;
    const reach = 0.04 + (b % 4) * 0.035;
    const ox = Math.cos(angle) * reach,
      oz = Math.sin(angle) * reach;
    const dx = Math.cos(angle),
      dz = Math.sin(angle);
    // Blade plane faces sideways to its lean.
    const sx = -dz * width,
      sz = dx * width;
    const base = positions.length / 3;
    const rows = [0, 0.55, 1];
    rows.forEach((t, r) => {
      const w = 1 - t * 0.82;
      const bend = lean * t * t * height * 2.2;
      const cx = ox + dx * bend,
        cz = oz + dz * bend,
        y = height * t;
      if (r < 2) {
        positions.push(cx - sx * w, y, cz - sz * w, cx + sx * w, y, cz + sz * w);
        uvs.push(0, t, 1, t);
        normals.push(dx * 0.35, 1, dz * 0.35, dx * 0.35, 1, dz * 0.35);
        wide.push(-sx * w, -sz * w, sx * w, sz * w);
      } else {
        positions.push(cx, y, cz);
        uvs.push(0.5, 1);
        normals.push(dx * 0.35, 1, dz * 0.35);
        wide.push(0, 0);
      }
    });
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aWide", new THREE.Float32BufferAttribute(wide, 2));
  geometry.setAttribute(
    "aLod",
    new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3).fill(lod), 1),
  );
  geometry.setIndex(index);
  geometry.normalizeNormals();
  return geometry;
}

/** Explore tuft (high tier): many short, wide, softly curved blades in a
 * low clump — each blade is 2 triangles (root pair, one shoulder vertex and a
 * leaning tip), so a 12-blade tuft costs 24 tris yet reads as a soft mound,
 * not a fan of spikes. The shader gives it a rounded clump normal. */
function softTuftGeometry(blades: number, lod: number, spread = 1) {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    wide: number[] = [],
    index: number[] = [];
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2 + ((b * 53) % 11) * 0.21;
    // Inner blades stand taller, outer ones splay low: a dome silhouette.
    const ring = (b % 3) / 2;
    const reach = (0.012 + ring * 0.05) * spread;
    const height = 0.21 - ring * 0.055 + ((b * 37) % 5) * 0.01;
    const lean = (0.03 + ring * 0.065) * spread;
    const width = (0.058 + (b % 2) * 0.014) * spread;
    const dx = Math.cos(angle),
      dz = Math.sin(angle);
    const ox = dx * reach,
      oz = dz * reach;
    const sx = -dz * width,
      sz = dx * width;
    const base = positions.length / 3;
    // Root pair, a shoulder on one side at 55% (the curve) and the tip.
    const mx = ox + dx * lean * 0.35 - sx * 0.55,
      mz = oz + dz * lean * 0.35 - sz * 0.55;
    const tx = ox + dx * lean,
      tz = oz + dz * lean;
    positions.push(ox - sx, 0, oz - sz, ox + sx, 0, oz + sz, mx, height * 0.55, mz, tx, height, tz);
    uvs.push(0, 0, 1, 0, 0, 0.55, 0.5, 1);
    for (let k = 0; k < 4; k++) normals.push(dx * 0.35, 1, dz * 0.35);
    wide.push(0, 0, 0, 0, 0, 0, 0, 0);
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aWide", new THREE.Float32BufferAttribute(wide, 2));
  geometry.setAttribute(
    "aLod",
    new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3).fill(lod), 1),
  );
  geometry.setIndex(index);
  geometry.normalizeNormals();
  return geometry;
}

/** A flower clump (explore, high): three thin one-triangle stalks, each
 * topped by a small cupped five-petal star (10 tris) whose raised centre
 * vertex carries the "centre" flag (uv.x = 2) — the shader paints it a
 * bright cream-yellow that fades out into the petal colour (the instance
 * colour). LOD tag 0: never faded by the near/far band. */
function flowerGeometry() {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    wide: number[] = [],
    index: number[] = [];
  const stems = 3;
  const PETALS = 5;
  for (let b = 0; b < stems; b++) {
    const angle = (b / stems) * Math.PI * 2 + 0.4;
    const reach = 0.035 + (b % 2) * 0.05;
    const height = 0.17 + ((b * 29) % 5) * 0.022;
    const ox = Math.cos(angle) * reach,
      oz = Math.sin(angle) * reach;
    const lean = 0.03 + (b % 3) * 0.015;
    const tx = ox + Math.cos(angle) * lean,
      tz = oz + Math.sin(angle) * lean;
    const w = 0.012;
    let base = positions.length / 3;
    // Stalk: one thin triangle (uv 0 → 0.34, green).
    positions.push(ox - w, 0, oz, ox + w, 0, oz, tx, height, tz);
    uvs.push(0, 0, 1, 0, 0.5, 0.16);
    for (let k = 0; k < 3; k++) normals.push(0, 1, 0);
    wide.push(0, 0, 0, 0, 0, 0);
    index.push(base, base + 1, base + 2);
    // Bloom: a centre and five petals, each a kite (centre, side, tip, side).
    const r = 0.05 + (b % 2) * 0.012;
    const tilt = 0.55; // cupped: petal tips rise, so the low camera sees the face
    const spin = angle * 1.7;
    base = positions.length / 3;
    positions.push(tx, height + r * 0.22, tz);
    uvs.push(2, 0.42);
    normals.push(0, 1, 0);
    wide.push(0, 0);
    for (let k = 0; k < PETALS; k++) {
      const a = spin + (k / PETALS) * Math.PI * 2;
      const h = (Math.PI / PETALS) * 0.95;
      // Side points (shared shape, not shared vertices: crisp petal gaps).
      positions.push(
        tx + Math.cos(a - h) * r * 0.42,
        height + r * tilt * 0.3,
        tz + Math.sin(a - h) * r * 0.42,
        tx + Math.cos(a) * r,
        height + r * tilt,
        tz + Math.sin(a) * r,
        tx + Math.cos(a + h) * r * 0.42,
        height + r * tilt * 0.3,
        tz + Math.sin(a + h) * r * 0.42,
      );
      uvs.push(0.5, 0.42, 0.5, 0.42, 0.5, 0.42);
      for (let q = 0; q < 3; q++) normals.push(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3);
      wide.push(0, 0, 0, 0, 0, 0);
      const p = base + 1 + k * 3;
      index.push(base, p, p + 1, base, p + 1, p + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aWide", new THREE.Float32BufferAttribute(wide, 2));
  geometry.setAttribute("aLod", new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3), 1));
  geometry.setIndex(index);
  geometry.normalizeNormals();
  return geometry;
}

/** Bloom colours per world (instance colours of the flower mesh). */
const FLOWERS: Record<WorldId, readonly string[]> = {
  home: ["#e8607f", "#f2c531", "#8f8ce8", "#a86fd6", "#ec7a3c"],
  korea: ["#ec6f95", "#f2cd3c", "#b27ae0", "#e05a5a"],
  stanford: ["#f0b42e", "#8f8ce8", "#d9619f", "#ea7a34"],
};

/** World-specific grass character: root, mid and tip colours. */
const PALETTES: Record<WorldId, { root: string; lush: string; dry: string; tip: string }> = {
  home: { root: "#3b5626", lush: "#78a443", dry: "#a5b752", tip: "#dfe58f" },
  korea: { root: "#3d5530", lush: "#68904a", dry: "#8fa25a", tip: "#c9d48c" },
  stanford: { root: "#5a5a2e", lush: "#8e9a44", dry: "#c4ad5a", tip: "#ecd892" },
};

/** Explore-view root colour: the lawn's own ground tone, so tufts grow out
 * of the turf instead of from dark sockets. */
const LAWN_ROOT: Record<WorldId, string> = {
  home: "#5a7440",
  korea: "#66705a",
  stanford: "#6b7a3c",
};

export const grassUniforms = {
  uGrassRoot: { value: new THREE.Color() },
  uGrassTip: { value: new THREE.Color() },
  /** Camera focus (x, z) and the fade radius (z = radius). */
  uGrassFocus: { value: new THREE.Vector3(0, 0, 60) },
  /** LOD centre (x, y = z), near radius (z; huge = no LOD) and the explore
   * softness (w, the view blend: wider blades, softer tips). */
  uGrassLod: { value: new THREE.Vector4(0, 0, 1e5, 0) },
  /** The soft explore look (F4): the view blend on the high tier, 0 on
   * medium/low and in the diorama — so those keep today's shading exactly.
   * Short, size-compressed tufts, a rounded clump normal (no dark backface
   * tips), lawn roots → light tips, and the flowers' bright centres. */
  uGrassStyle: { value: 0 },
};

function grassMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    bindEnvUniforms(shader);
    Object.assign(shader.uniforms, grassUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        ${ENV_UNIFORMS_GLSL}
        uniform vec3 uGrassFocus;
        uniform vec4 uGrassLod;
        uniform float uGrassStyle;
        attribute vec2 aWide;
        attribute float aLod;
        varying float vGrassT;
        varying float vGrassU;
        varying vec3 vGrassWorld;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        // Explore: one rounded normal per clump (a soft mound of light).
        objectNormal = mix(objectNormal, normalize(vec3(position.x * 4.0, 1.0, position.z * 4.0)), uGrassStyle);`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        transformed.xz += aWide * 0.4 * uGrassLod.w;
        vGrassT = uv.y;
        vGrassU = uv.x;
        // Explore: tall instances shrink toward a common, under-knee height
        // (size ~ scale^0.45 instead of scale).
        transformed *= mix(1.0, pow(max(length(instanceMatrix[1].xyz), 0.2), -0.55), uGrassStyle);
        vec4 grassRoot = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float grassFade = 1.0 - smoothstep(uGrassFocus.z * 0.78, uGrassFocus.z, distance(grassRoot.xz, uGrassFocus.xy));
        float grassBand = smoothstep(uGrassLod.z - 1.5, uGrassLod.z + 1.5, distance(grassRoot.xz, uGrassLod.xy));
        grassFade *= aLod < 0.5 ? 1.0 : aLod < 1.5 ? 1.0 - grassBand : grassBand;
        transformed *= grassFade;`,
      )
      .replace(
        "#include <project_vertex>",
        `vec4 grassWorld = instanceMatrix * vec4(transformed, 1.0);
        float grassBendT = vGrassT * vGrassT;
        float grassGust = sin(uEnvTime * 1.9 + grassWorld.x * 0.55 + grassWorld.z * 0.35)
          + 0.5 * sin(uEnvTime * 3.3 + grassWorld.x * 1.7 - grassWorld.z * 1.1);
        grassWorld.xz += vec2(0.7, 0.45) * grassGust * grassBendT * (0.04 + 0.11 * uEnvWind);
        vec2 grassAway = grassWorld.xz - uEnvPlayer.xz;
        float grassNear = 1.0 - smoothstep(0.0, uEnvPlayer.w, length(grassAway));
        grassWorld.xz += normalize(grassAway + 1e-4) * grassNear * grassBendT * 0.32;
        grassWorld.y -= grassNear * grassBendT * 0.16;
        vGrassWorld = grassWorld.xyz;
        vec4 mvPosition = viewMatrix * modelMatrix * grassWorld;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        ${ENV_UNIFORMS_GLSL}
        uniform vec3 uGrassRoot;
        uniform vec3 uGrassTip;
        uniform vec4 uGrassLod;
        uniform float uGrassStyle;
        varying float vGrassT;
        varying float vGrassU;
        varying vec3 vGrassWorld;`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        // Explore: the clump normal on both faces (a flipped back face reads
        // as a dark tip).
        if (uGrassStyle > 0.5) normal = normalize(vNormal);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 grassInst = diffuseColor.rgb;
        vec3 grassBody = mix(uGrassRoot, grassInst, smoothstep(0.0, 0.55, vGrassT));
        grassBody = mix(grassBody, uGrassTip, smoothstep(0.62, 1.0, vGrassT) * mix(0.55, 0.35, uGrassLod.w));
        // Explore: lawn root → body → a long, light tip; flower centres
        // (uv.x = 2) cream-yellow.
        vec3 grassSoft = mix(uGrassRoot, grassInst, smoothstep(0.0, 0.4, vGrassT));
        grassSoft = mix(grassSoft, uGrassTip, smoothstep(0.3, 1.0, vGrassT) * 0.38);
        grassSoft = mix(grassSoft, vec3(1.0, 0.86, 0.36), smoothstep(1.5, 1.9, vGrassU));
        diffuseColor.rgb = mix(grassBody, grassSoft, uGrassStyle);
        // Explore: a lighter, sunnier carpet (the low camera sees blades
        // against the lawn, where the diorama's dark roots read as sockets).
        diffuseColor.rgb *= 1.0 + 0.14 * uGrassLod.w * smoothstep(0.2, 0.9, vGrassT);`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        // Explore: the same sun/shade grade as sculpted surfaces (Surface.ts).
        reflectedLight.directDiffuse *= mix(vec3(1.0), vec3(1.08, 1.02, 0.93), uGrassStyle);
        reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.82, 0.87, 0.97), uGrassStyle);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec3 grassView = normalize(cameraPosition - vGrassWorld);
        float grassBack = pow(saturate(dot(-grassView, uEnvSunDir)), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * uEnvSunColor * (grassBack * 0.45 + 0.05) * vGrassT * (1.0 - uEnvNight);
        // Sky fill on the shaded side of blades (explore only, via the blend).
        totalEmissiveRadiance += diffuseColor.rgb * uEnvSky * 0.16 * uGrassLod.w * (0.4 + 0.6 * vGrassT);
        // Explore: sunlit tips glow a little warmer.
        totalEmissiveRadiance += diffuseColor.rgb * uEnvSunColor * 0.07 * uGrassStyle * smoothstep(0.5, 1.0, vGrassT) * (1.0 - uEnvNight);`,
      );
  };
  material.customProgramCacheKey = () => "env-grass-v3";
  return material;
}

const geometry = tuftGeometry();
/** Far LOD: three wide blades (9 tris). */
const farGeometry = tuftGeometry(3, 2, 1.7);
/** Medium's only tuft: the far shape, tagged near (so it never fades out
 * inside the near radius). */
const mediumGeometry = tuftGeometry(3, 1, 1.7);
/** Explore, high tier: the soft near tuft (12 blades, 24 tris) and the
 * soft far tuft (6 blades, 12 tris). Swapped in on the same meshes when the
 * view turns to explore (geometry only: same material and program). */
const softNear = softTuftGeometry(12, 1);
const softFar = softTuftGeometry(6, 2, 1.35);
/** Explore-only flower clumps (high tier). */
const flowerTuft = flowerGeometry();
/** Visible flower clump cap (explore, high). */
const FLOWER_CAP = 700;
/** Flowers are drawn within this distance of the LOD centre. */
const FLOWER_RADIUS = 20;
/** Shared with the reed beds (same program, its own geometry). */
export const grassMaterialShared = grassMaterial();
const material = grassMaterialShared;
const noRaycast = () => undefined;

type Chunk = {
  cx: number;
  cz: number;
  matrices: Float32Array;
  colors: Float32Array;
  count: number;
  /** Leading base tufts (the diorama's and medium's field); the rest are
   * the explore-only carpet. */
  base: number;
};
type Field = {
  /** Packed per-chunk instance data. */
  chunks: Chunk[];
  /** Explore-only flower clumps, chunked the same way. */
  flowers: Chunk[];
  total: number;
};
const fields = new Map<string, Field>();

function packField(world: WorldId, tufts: GrassTuft[]): Field {
  const palette = PALETTES[world];
  const lush = new THREE.Color(palette.lush),
    dry = new THREE.Color(palette.dry),
    tip = new THREE.Color(palette.tip),
    color = new THREE.Color();
  const blooms = FLOWERS[world].map((hex) => new THREE.Color(hex));
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    p = new THREE.Vector3(),
    s = new THREE.Vector3();
  const bucket = (list: readonly GrassTuft[], flowers: boolean): Chunk[] => {
    const buckets = new Map<string, GrassTuft[]>();
    for (const tuft of list) {
      const key = `${Math.floor(tuft.x / CHUNK)},${Math.floor(tuft.z / CHUNK)}`;
      const entry = buckets.get(key);
      if (entry) entry.push(tuft);
      else buckets.set(key, [tuft]);
    }
    const chunks: Chunk[] = [];
    for (const [key, entry] of buckets) {
      const [i, j] = key.split(",").map(Number);
      const matrices = new Float32Array(entry.length * 16),
        colors = new Float32Array(entry.length * 3);
      let base = 0;
      entry.forEach((tuft, n) => {
        if (!tuft.extra) base = n + 1;
        q.setFromAxisAngle(up, tuft.angle);
        p.set(tuft.x, tuft.y, tuft.z);
        if (flowers) {
          s.setScalar(0.8 + tuft.shade * 0.5);
          color.copy(blooms[Math.floor(tuft.shade * 977) % blooms.length]);
        } else {
          s.set(tuft.scale, tuft.scale * (0.85 + tuft.shade * 0.4), tuft.scale);
          color.copy(lush).lerp(dry, tuft.shade);
          // The explore carpet carries a lighter, wider tint range.
          if (tuft.extra) color.lerp(tip, 0.18 * ((tuft.shade * 7.3) % 1));
        }
        matrix.compose(p, q, s).toArray(matrices, n * 16);
        color.toArray(colors, n * 3);
      });
      chunks.push({ cx: (i + 0.5) * CHUNK, cz: (j + 0.5) * CHUNK, matrices, colors, count: entry.length, base });
    }
    return chunks;
  };
  // Rank order puts every base tuft before the explore extras, so each
  // chunk's base tufts lead it.
  return {
    chunks: bucket(tufts.filter((tuft) => !tuft.flower), false),
    flowers: bucket(tufts.filter((tuft) => tuft.flower), true),
    total: tufts.length,
  };
}

function fieldFor(world: WorldId, max: number) {
  const key = `${world}:${max}`;
  let field = fields.get(key);
  if (!field) fields.set(key, (field = packField(world, grassField(world, max))));
  return field;
}
/** Packed field, placing in time slices first if needed (never one long task). */
const pending = new Map<string, Promise<Field>>();
function fieldAsync(world: WorldId, max: number) {
  const key = `${world}:${max}`;
  const ready = fields.get(key);
  if (ready) return Promise.resolve(ready);
  let job = pending.get(key);
  if (!job) {
    job = grassFieldAsync(world, max, nextSlice).then(async () => {
      await nextSlice();
      return fieldFor(world, max);
    });
    pending.set(key, job);
  }
  return job;
}
// Placement walks the walkable map: do it during the hidden warmup, in
// slices, not on a visible frame. Each island is cached for every later visit.
for (const world of ["home", "korea", "stanford"] as const)
  registerWarmup({
    id: `env-grass-${world}`,
    priority: world === "home" ? 20 : 45,
    run: async ({ tier }) => {
      await fieldAsync(world, envBudget(tier).grassInstances);
    },
  });

const focus = new THREE.Vector3(),
  forward = new THREE.Vector3(),
  rootColor = new THREE.Color(),
  lawnRoot = new THREE.Color();

type Mesh = THREE.InstancedMesh | null;
/** Copy chunk prefixes into the front of a mesh's instance buffers. */
function fill(mesh: THREE.InstancedMesh, picks: readonly (readonly [Chunk, number])[], cap: number, baseOnly = false) {
  const matrices = mesh.instanceMatrix.array as Float32Array;
  const colors = mesh.instanceColor!.array as Float32Array;
  let n = 0;
  for (const [chunk, keep] of picks) {
    const count = baseOnly ? chunk.base : chunk.count;
    const take = Math.min(count, Math.ceil(count * keep), cap - n);
    if (take <= 0) continue;
    matrices.set(chunk.matrices.subarray(0, take * 16), n * 16);
    colors.set(chunk.colors.subarray(0, take * 3), n * 3);
    n += take;
    if (n >= cap) break;
  }
  // Empty = 0 instances (no draw), never `visible = false`: the program
  // stays compiled from warmup.
  mesh.count = n;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, n * 16);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor!.clearUpdateRanges();
  mesh.instanceColor!.addUpdateRange(0, n * 3);
  mesh.instanceColor!.needsUpdate = true;
  return n;
}
const attach = (count: number) => (mesh: THREE.InstancedMesh | null) => {
  if (mesh && !mesh.instanceColor)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
};

export function Grass({ world }: { world: WorldId }) {
  const tier = useEnvTier();
  const budget = envBudget(tier);
  const max = budget.grassInstances;
  const exploreCap = Math.min(max, budget.grassVisible);
  const active = useWorldActive();
  const ref = useRef<Mesh>(null);
  const farRef = useRef<Mesh>(null);
  const flowerRef = useRef<Mesh>(null);
  // Never place synchronously in render: until the sliced placement lands
  // (normally already done by the warm task) the mesh simply draws nothing.
  const key = `${world}:${max}`;
  const [, setPlaced] = useState(0);
  const field = fields.get(key) ?? null;
  useEffect(() => {
    if (field) return;
    let live = true;
    void fieldAsync(world, max).then(() => live && setPlaced((n) => n + 1));
    return () => void (live = false);
  }, [field, world, max]);
  // Visible-instance ceiling: what the tier can afford at once (overview
  // thins evenly; close views get the full density of nearby chunks).
  const visibleCap = Math.min(max, tier === "high" ? 11000 : tier === "medium" ? 5000 : 1500);
  const last = useRef({ key: "" });
  useLayoutEffect(() => {
    const palette = PALETTES[world];
    grassUniforms.uGrassRoot.value.set(palette.root);
    grassUniforms.uGrassTip.value.set(palette.tip);
    last.current.key = "";
    for (const mesh of [ref.current, farRef.current, flowerRef.current]) if (mesh) mesh.count = 0;
  }, [world, field]);
  useEffect(() => () => void (last.current.key = ""), []);
  useFrame(({ camera }) => {
    const mesh = ref.current,
      far = farRef.current,
      flowers = flowerRef.current;
    if (!mesh || !far || !active || !field) return;
    const blend = viewRuntime.blend;
    const explore = blend > 0.5;
    const soft = tier === "high";
    grassUniforms.uGrassStyle.value = soft ? blend : 0;
    // High: the soft tufts while the view is (mostly) explore; the
    // diorama's own tuft otherwise (its look is unchanged).
    if (soft) {
      const nearGeometry = explore ? softNear : geometry;
      if (mesh.geometry !== nearGeometry) mesh.geometry = nearGeometry;
    }
    // Softer explore look, eased with the blend (uniforms only).
    rootColor.set(PALETTES[world].root).lerp(lawnRoot.set(LAWN_ROOT[world]), blend);
    // High: roots follow the explore lawn grade, so tufts grow out of the turf.
    if (soft) lawnGrade(rootColor, blend);
    grassUniforms.uGrassRoot.value.copy(rootColor);
    camera.getWorldDirection(forward);
    const zoom = useWorldView.getState().zoom;
    let radius: number;
    if (explore) {
      // Centred just ahead of the player: the low camera sees from ~5 m
      // behind the player to the horizon.
      const fx = forward.x,
        fz = forward.z,
        fl = Math.hypot(fx, fz) || 1;
      focus.set(runtime.x + (fx / fl) * 2, 0, runtime.z + (fz / fl) * 2);
      radius = FAR_RADIUS;
      grassUniforms.uGrassLod.value.set(focus.x, focus.z, NEAR_RADIUS, blend);
    } else {
      const t = forward.y < -0.05 ? camera.position.y / -forward.y : 100;
      focus.copy(camera.position).addScaledVector(forward, t);
      radius = THREE.MathUtils.clamp(78 / Math.max(0.8, zoom), 16, 80);
      grassUniforms.uGrassLod.value.set(focus.x, focus.z, 1e5, blend);
    }
    grassUniforms.uGrassFocus.value.set(focus.x, focus.z, radius);
    const key = explore
      ? `e:${Math.floor(focus.x / 4)},${Math.floor(focus.z / 4)},${Math.round(Math.atan2(forward.x, forward.z) * 4)}`
      : `${Math.floor(focus.x / CHUNK)},${Math.floor(focus.z / CHUNK)},${Math.round(radius / 4)},${Math.round(zoom * 4)}`;
    if (key === last.current.key) return;
    last.current.key = key;
    if (!explore) {
      const near = field.chunks
        .map((chunk) => ({ chunk, d: Math.hypot(chunk.cx - focus.x, chunk.cz - focus.z) }))
        .filter(({ d }) => d < radius + CHUNK * 0.75)
        .sort((a, b) => a.d - b.d);
      const inRange = near.reduce((sum, { chunk }) => sum + chunk.base, 0);
      // Overview: thinner, so lawns read as soft texture rather than speckle.
      const cap = Math.round(visibleCap * THREE.MathUtils.clamp(zoom / 3, 0.3, 1));
      const keep = Math.min(1, cap / Math.max(1, inRange));
      // The diorama draws the base field only (as before the carpet).
      fill(mesh, near.map(({ chunk }) => [chunk, keep] as const), cap, true);
      far.count = 0;
      if (flowers) flowers.count = 0;
      return;
    }
    // The explore carpet and the flowers are high-tier only (budget §2).
    const carpet = tier === "high";
    // Explore: chunks in front of the camera only, near then far.
    const cx = camera.position.x,
      cz = camera.position.z;
    const ranked = field.chunks
      .map((chunk) => ({ chunk, d: Math.hypot(chunk.cx - focus.x, chunk.cz - focus.z) }))
      .filter(
        ({ chunk, d }) =>
          d < FAR_RADIUS + CHUNK * 0.75 &&
          (chunk.cx - cx) * forward.x + (chunk.cz - cz) * forward.z > -CHUNK,
      )
      .sort((a, b) => a.d - b.d);
    const reach = CHUNK * 0.75;
    const nearPicks = ranked.filter(({ d }) => d < NEAR_RADIUS + reach).map(({ chunk }) => [chunk, 1] as const);
    const placed = fill(mesh, nearPicks, exploreCap, !carpet);
    const farPicks = ranked
      .filter(({ d }) => d > NEAR_RADIUS - reach)
      .map(({ chunk, d }) => {
        const k = THREE.MathUtils.clamp((d - NEAR_RADIUS) / (FAR_RADIUS - NEAR_RADIUS), 0, 1);
        return [chunk, THREE.MathUtils.lerp(1, carpet ? 0.35 : 0.25, k)] as const;
      });
    fill(far, farPicks, Math.max(0, exploreCap - placed), !carpet);
    if (flowers) {
      if (!carpet) flowers.count = 0;
      else
        fill(
          flowers,
          field.flowers
            .map((chunk) => ({ chunk, d: Math.hypot(chunk.cx - focus.x, chunk.cz - focus.z) }))
            .filter(
              ({ chunk, d }) =>
                d < FLOWER_RADIUS + reach &&
                (chunk.cx - cx) * forward.x + (chunk.cz - cz) * forward.z > -CHUNK,
            )
            .sort((a, b) => a.d - b.d)
            .map(({ chunk }) => [chunk, 1] as const),
          FLOWER_CAP,
        );
    }
  });
  return (
    <group name="env-grass-lods">
      <instancedMesh
        key={`${max}:${tier}`}
        ref={(mesh) => {
          ref.current = mesh;
          attach(max)(mesh);
        }}
        name="env-grass"
        // Medium draws the 9-tri tuft everywhere (budget §2).
        args={[tier === "medium" ? mediumGeometry : geometry, material, max]}
        receiveShadow
        frustumCulled={false}
        raycast={noRaycast}
        dispose={null}
      />
      <instancedMesh
        key={`far-${exploreCap}:${tier}`}
        ref={(mesh) => {
          farRef.current = mesh;
          attach(exploreCap)(mesh);
        }}
        name="env-grass-far"
        args={[tier === "high" ? softFar : farGeometry, material, exploreCap]}
        receiveShadow
        frustumCulled={false}
        raycast={noRaycast}
        dispose={null}
      />
      <instancedMesh
        ref={(mesh) => {
          flowerRef.current = mesh;
          attach(FLOWER_CAP)(mesh);
        }}
        name="env-grass-flowers"
        args={[flowerTuft, material, FLOWER_CAP]}
        receiveShadow
        frustumCulled={false}
        raycast={noRaycast}
        dispose={null}
      />
    </group>
  );
}
