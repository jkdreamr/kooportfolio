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

/** A flower clump: four thin stalks (3 tris) each topped by a small
 * crossed bloom (6 tris). The grass shader colours root → instance colour
 * (the bloom's) → a pale tip, so the stalks stay green low and the heads
 * take the flower colour. LOD tag 0: never faded by the near/far band. */
function flowerGeometry() {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    wide: number[] = [],
    index: number[] = [];
  const stems = 4;
  for (let b = 0; b < stems; b++) {
    const angle = (b / stems) * Math.PI * 2 + 0.4;
    const reach = 0.05 + (b % 2) * 0.07;
    const height = 0.34 + ((b * 29) % 5) * 0.045;
    const ox = Math.cos(angle) * reach,
      oz = Math.sin(angle) * reach;
    const lean = 0.06 + (b % 3) * 0.03;
    const tx = ox + Math.cos(angle) * lean,
      tz = oz + Math.sin(angle) * lean;
    const w = 0.014;
    let base = positions.length / 3;
    // Stalk: a thin two-row blade (uv 0 → 0.62).
    positions.push(ox - w, 0, oz, ox + w, 0, oz, tx - w * 0.6, height * 0.6, tz, tx + w * 0.6, height * 0.6, tz, tx, height, tz);
    uvs.push(0, 0, 1, 0, 0, 0.34, 1, 0.34, 0.5, 0.58);
    for (let k = 0; k < 5; k++) normals.push(0, 1, 0);
    wide.push(-w, 0, w, 0, -w * 0.6, 0, w * 0.6, 0, 0, 0);
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
    // Bloom: three crossed quads round the stalk top, at uv 0.58-0.6 (full
    // instance colour, before the pale tip blend starts).
    const r = 0.075 + (b % 2) * 0.025;
    for (let q = 0; q < 3; q++) {
      const a = angle + q * (Math.PI / 3);
      const cx = Math.cos(a) * r,
        cz = Math.sin(a) * r;
      base = positions.length / 3;
      positions.push(tx - cx, height - 0.02, tz - cz, tx + cx, height - 0.02, tz + cz, tx - cx * 0.7, height + r, tz - cz * 0.7, tx + cx * 0.7, height + r, tz + cz * 0.7);
      uvs.push(0, 0.58, 1, 0.58, 0, 0.6, 1, 0.6);
      for (let k = 0; k < 4; k++) normals.push(0, 1, 0);
      wide.push(0, 0, 0, 0, 0, 0, 0, 0);
      index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aWide", new THREE.Float32BufferAttribute(wide, 2));
  geometry.setAttribute("aLod", new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3), 1));
  geometry.setIndex(index);
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
        attribute vec2 aWide;
        attribute float aLod;
        varying float vGrassT;
        varying vec3 vGrassWorld;`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        transformed.xz += aWide * 0.4 * uGrassLod.w;
        vGrassT = uv.y;
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
        varying float vGrassT;
        varying vec3 vGrassWorld;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 grassBody = mix(uGrassRoot, diffuseColor.rgb, smoothstep(0.0, 0.55, vGrassT));
        diffuseColor.rgb = mix(grassBody, uGrassTip, smoothstep(0.62, 1.0, vGrassT) * mix(0.55, 0.35, uGrassLod.w));
        // Explore: a lighter, sunnier carpet (the low camera sees blades
        // against the lawn, where the diorama's dark roots read as sockets).
        diffuseColor.rgb *= 1.0 + 0.14 * uGrassLod.w * smoothstep(0.2, 0.9, vGrassT);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec3 grassView = normalize(cameraPosition - vGrassWorld);
        float grassBack = pow(saturate(dot(-grassView, uEnvSunDir)), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * uEnvSunColor * (grassBack * 0.45 + 0.05) * vGrassT * (1.0 - uEnvNight);
        // Sky fill on the shaded side of blades (explore only, via the blend).
        totalEmissiveRadiance += diffuseColor.rgb * uEnvSky * 0.16 * uGrassLod.w * (0.4 + 0.6 * vGrassT);`,
      );
  };
  material.customProgramCacheKey = () => "env-grass-v2";
  return material;
}

const geometry = tuftGeometry();
/** Far LOD: three wide blades (9 tris). */
const farGeometry = tuftGeometry(3, 2, 1.7);
/** Medium's only tuft: the far shape, tagged near (so it never fades out
 * inside the near radius). */
const mediumGeometry = tuftGeometry(3, 1, 1.7);
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
    // Softer explore look, eased with the blend (uniforms only).
    rootColor.set(PALETTES[world].root).lerp(lawnRoot.set(LAWN_ROOT[world]), blend);
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
        key={`far-${exploreCap}`}
        ref={(mesh) => {
          farRef.current = mesh;
          attach(exploreCap)(mesh);
        }}
        name="env-grass-far"
        args={[farGeometry, material, exploreCap]}
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
