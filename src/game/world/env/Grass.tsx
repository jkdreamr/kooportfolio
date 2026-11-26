import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldId } from "../../core/worlds";
import { useWorldView } from "../../core/worldView";
import { useWorldActive } from "../../engine/active";
import { registerWarmup } from "../../../stage/contract";
import { ENV_UNIFORMS_GLSL, bindEnvUniforms } from "./uniforms";
import { grassField, type GrassTuft } from "./placement";
import { envBudget, useEnvTier } from "./tier";

/**
 * Instanced grass tufts: tapered blades with a root→tip gradient, wind, a
 * bend away from the player's feet and backlit tips. All tufts for an island
 * are placed once (tier maximum from the contract budget), bucketed into 8 m
 * chunks; each time the camera's focus moves to another chunk, the chunks in
 * range are copied to the front of the instance buffer and `mesh.count` is
 * set — one draw, no material or define changes at run time.
 */

const BLADES = 7;
const CHUNK = 8;

/** Five tapered blades (3 triangles each), fanning from one root. */
function tuftGeometry() {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    index: number[] = [];
  for (let b = 0; b < BLADES; b++) {
    const angle = (b / BLADES) * Math.PI * 2 + b * 0.7;
    const lean = 0.16 + (b % 3) * 0.09;
    const height = 0.28 + ((b * 37) % 7) * 0.04;
    const width = 0.06 + (b % 2) * 0.016;
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
      } else {
        positions.push(cx, y, cz);
        uvs.push(0.5, 1);
        normals.push(dx * 0.35, 1, dz * 0.35);
      }
    });
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.normalizeNormals();
  return geometry;
}

/** World-specific grass character: root, mid and tip colours. */
const PALETTES: Record<WorldId, { root: string; lush: string; dry: string; tip: string }> = {
  home: { root: "#3b5626", lush: "#78a443", dry: "#a5b752", tip: "#dfe58f" },
  korea: { root: "#3d5530", lush: "#68904a", dry: "#8fa25a", tip: "#c9d48c" },
  stanford: { root: "#5a5a2e", lush: "#8e9a44", dry: "#c4ad5a", tip: "#ecd892" },
};

export const grassUniforms = {
  uGrassRoot: { value: new THREE.Color() },
  uGrassTip: { value: new THREE.Color() },
  /** Camera focus (x, z) and the fade radius (z = radius). */
  uGrassFocus: { value: new THREE.Vector3(0, 0, 60) },
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
        varying float vGrassT;
        varying vec3 vGrassWorld;`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        vGrassT = uv.y;
        vec4 grassRoot = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float grassFade = 1.0 - smoothstep(uGrassFocus.z * 0.78, uGrassFocus.z, distance(grassRoot.xz, uGrassFocus.xy));
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
        varying float vGrassT;
        varying vec3 vGrassWorld;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 grassBody = mix(uGrassRoot, diffuseColor.rgb, smoothstep(0.0, 0.55, vGrassT));
        diffuseColor.rgb = mix(grassBody, uGrassTip, smoothstep(0.62, 1.0, vGrassT) * 0.55);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec3 grassView = normalize(cameraPosition - vGrassWorld);
        float grassBack = pow(saturate(dot(-grassView, uEnvSunDir)), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * uEnvSunColor * (grassBack * 0.45 + 0.05) * vGrassT * (1.0 - uEnvNight);`,
      );
  };
  material.customProgramCacheKey = () => "env-grass-v1";
  return material;
}

const geometry = tuftGeometry();
/** Shared with the reed beds (same program, its own geometry). */
export const grassMaterialShared = grassMaterial();
const material = grassMaterialShared;
const noRaycast = () => undefined;

type Field = {
  /** Packed per-chunk instance data. */
  chunks: { cx: number; cz: number; matrices: Float32Array; colors: Float32Array; count: number }[];
  total: number;
};
const fields = new Map<string, Field>();

function packField(world: WorldId, tufts: GrassTuft[]): Field {
  const palette = PALETTES[world];
  const lush = new THREE.Color(palette.lush),
    dry = new THREE.Color(palette.dry),
    color = new THREE.Color();
  const buckets = new Map<string, GrassTuft[]>();
  for (const tuft of tufts) {
    const key = `${Math.floor(tuft.x / CHUNK)},${Math.floor(tuft.z / CHUNK)}`;
    const list = buckets.get(key);
    if (list) list.push(tuft);
    else buckets.set(key, [tuft]);
  }
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    p = new THREE.Vector3(),
    s = new THREE.Vector3();
  const chunks: Field["chunks"] = [];
  for (const [key, list] of buckets) {
    const [i, j] = key.split(",").map(Number);
    const matrices = new Float32Array(list.length * 16),
      colors = new Float32Array(list.length * 3);
    list.forEach((tuft, n) => {
      q.setFromAxisAngle(up, tuft.angle);
      p.set(tuft.x, tuft.y, tuft.z);
      s.set(tuft.scale, tuft.scale * (0.85 + tuft.shade * 0.4), tuft.scale);
      matrix.compose(p, q, s).toArray(matrices, n * 16);
      color.copy(lush).lerp(dry, tuft.shade).toArray(colors, n * 3);
    });
    chunks.push({ cx: (i + 0.5) * CHUNK, cz: (j + 0.5) * CHUNK, matrices, colors, count: list.length });
  }
  return { chunks, total: tufts.length };
}

function fieldFor(world: WorldId, max: number) {
  const key = `${world}:${max}`;
  let field = fields.get(key);
  if (!field) fields.set(key, (field = packField(world, grassField(world, max))));
  return field;
}

// Placement walks the walkable map: do it during the hidden warmup, not on a
// visible frame. Each island is cached for every later visit.
for (const world of ["home", "korea", "stanford"] as const)
  registerWarmup({
    id: `env-grass-${world}`,
    priority: world === "home" ? 20 : 45,
    run: async ({ tier, yieldToFrame }) => {
      await yieldToFrame();
      fieldFor(world, envBudget(tier).grassInstances);
    },
  });

const focus = new THREE.Vector3(),
  forward = new THREE.Vector3();

export function Grass({ world }: { world: WorldId }) {
  const tier = useEnvTier();
  const max = envBudget(tier).grassInstances;
  const active = useWorldActive();
  const ref = useRef<THREE.InstancedMesh>(null);
  const field = useMemo(() => fieldFor(world, max), [world, max]);
  // Visible-instance ceiling: what the tier can afford at once (overview
  // thins evenly; close views get the full density of nearby chunks).
  const visibleCap = Math.min(max, tier === "high" ? 11000 : tier === "medium" ? 5000 : 1500);
  const last = useRef({ key: "" });
  useLayoutEffect(() => {
    const palette = PALETTES[world];
    grassUniforms.uGrassRoot.value.set(palette.root);
    grassUniforms.uGrassTip.value.set(palette.tip);
    last.current.key = "";
    const mesh = ref.current;
    if (mesh) mesh.count = 0;
  }, [world, field]);
  useEffect(() => () => void (last.current.key = ""), []);
  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh || !active) return;
    camera.getWorldDirection(forward);
    const t = forward.y < -0.05 ? camera.position.y / -forward.y : 100;
    focus.copy(camera.position).addScaledVector(forward, t);
    const zoom = useWorldView.getState().zoom;
    const radius = THREE.MathUtils.clamp(78 / Math.max(0.8, zoom), 16, 80);
    grassUniforms.uGrassFocus.value.set(focus.x, focus.z, radius);
    const key = `${Math.floor(focus.x / CHUNK)},${Math.floor(focus.z / CHUNK)},${Math.round(radius / 4)},${Math.round(zoom * 4)}`;
    if (key === last.current.key) return;
    last.current.key = key;
    const near = field.chunks
      .map((chunk) => ({ chunk, d: Math.hypot(chunk.cx - focus.x, chunk.cz - focus.z) }))
      .filter(({ d }) => d < radius + CHUNK * 0.75)
      .sort((a, b) => a.d - b.d);
    const inRange = near.reduce((sum, { chunk }) => sum + chunk.count, 0);
    // Overview: thinner, so lawns read as soft texture rather than speckle.
    const cap = Math.round(visibleCap * THREE.MathUtils.clamp(zoom / 3, 0.3, 1));
    const keep = Math.min(1, cap / Math.max(1, inRange));
    const matrices = mesh.instanceMatrix.array as Float32Array;
    const colors = mesh.instanceColor!.array as Float32Array;
    let n = 0;
    for (const { chunk } of near) {
      const take = Math.min(chunk.count, Math.ceil(chunk.count * keep), cap - n);
      if (take <= 0) break;
      matrices.set(chunk.matrices.subarray(0, take * 16), n * 16);
      colors.set(chunk.colors.subarray(0, take * 3), n * 3);
      n += take;
    }
    mesh.count = n;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, n * 16);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.clearUpdateRanges();
    mesh.instanceColor!.addUpdateRange(0, n * 3);
    mesh.instanceColor!.needsUpdate = true;
  });
  return (
    <instancedMesh
      key={max}
      ref={(mesh) => {
        ref.current = mesh;
        if (mesh && !mesh.instanceColor)
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      }}
      name="env-grass"
      args={[geometry, material, max]}
      receiveShadow
      frustumCulled={false}
      raycast={noRaycast}
      dispose={null}
    />
  );
}
