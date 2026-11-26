import * as THREE from "three";
import { ENV_UNIFORMS_GLSL, bindEnvUniforms } from "./uniforms";

/**
 * Leaf-cluster shell over the closed tree crowns.
 *
 * Every NaturalTrees batch registers its crowns here; one <LeafShell> (mounted
 * by the environment) turns all of them into alpha-tested leaf-cluster cards
 * in a single instanced draw (+ its shadow pass). The closed crowns stay as
 * the darker inner mass, so gaps between cards read as depth, not holes.
 *
 * Cards are lit with "spherised" normals (pointing out from the crown centre)
 * so a crown shades like one soft volume while its silhouette breaks into
 * leaves; wind sways card tips; light from behind glows through the leaves.
 */

export type CrownKind = "broad" | "pine" | "palm";
export type Crown = {
  /** Crown centre, scale and Euler rotation (as the closed crown mesh). */
  p: readonly [number, number, number];
  s: readonly [number, number, number];
  r: readonly [number, number, number];
  color: string;
  kind: CrownKind;
  /** Scenic grove crown (unwalkable land): thinned first on medium. */
  scenic?: boolean;
};

/* --------------------------------------------------------------- registry */

const groups = new Map<number, readonly Crown[]>();
let serial = 0;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  for (const listener of [...listeners]) listener();
};
/** Register a batch of crowns; returns the unregister function. */
export function registerCrowns(crowns: readonly Crown[]) {
  const id = ++serial;
  groups.set(id, crowns);
  notify();
  return () => {
    if (groups.delete(id)) notify();
  };
}
export const crownVersion = () => version;
export function subscribeCrowns(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export const allCrowns = () => [...groups.values()].flat();

/* ------------------------------------------------------------ card layout */

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Atlas cells: 0 broadleaf, 1 small round leaves, 2 needle spray, 3 frond. */
export type Card = {
  /** Card centre (world), crown centre (world). */
  p: THREE.Vector3;
  centre: THREE.Vector3;
  q: THREE.Quaternion;
  size: number;
  color: THREE.Color;
  cell: number;
  phase: number;
  /** Round-robin rank: low ranks are kept when a tier thins the shell. */
  rank: number;
};

const euler = new THREE.Euler(),
  crownQ = new THREE.Quaternion(),
  look = new THREE.Matrix4(),
  up = new THREE.Vector3(0, 1, 0),
  roll = new THREE.Quaternion(),
  axis = new THREE.Vector3(0, 0, 1);

/** Card count for one crown, by its footprint. */
const cardsFor = (crown: Crown) => {
  const area = Math.abs(crown.s[0] * crown.s[2]);
  if (crown.kind === "pine") return Math.max(3, Math.min(7, Math.round(3 + area * 3)));
  if (crown.kind === "palm") return 0;
  return Math.max(9, Math.min(22, Math.round(8 + area * 10)));
};

/**
 * Leaf cards for a set of crowns. `density` scales each crown's card count
 * and `salt` reseeds the layout: the explore view's extra cards are a second
 * layout (density 0.5, another salt) over the same crowns.
 */
export function layoutCards(
  crowns: readonly Crown[],
  small = false,
  density = 1,
  salt = 0,
  scenicDensity = 1,
): Card[] {
  const cards: Card[] = [];
  const tint = new THREE.Color();
  for (const crown of crowns) {
    const count = Math.round(cardsFor(crown) * density * (crown.scenic ? scenicDensity : 1));
    if (!count) continue;
    const rand = random(
      Math.round(crown.p[0] * 131 + crown.p[1] * 71 + crown.p[2] * 977) + salt,
    );
    euler.set(crown.r[0], crown.r[1], crown.r[2]);
    crownQ.setFromEuler(euler);
    const centre = new THREE.Vector3(...crown.p);
    const pine = crown.kind === "pine";
    // Ellipsoid radii of the closed crown geometry (see TreeArt).
    const rx = Math.abs(crown.s[0]) * (pine ? 0.9 : 0.92),
      ry = Math.abs(crown.s[1]) * (pine ? 0.42 : 0.66),
      rz = Math.abs(crown.s[2]) * (pine ? 0.62 : 0.84);
    const radius = (rx + rz) / 2;
    for (let i = 0; i < count; i++) {
      // Fibonacci points over the upper ~85% of the ellipsoid.
      const t = (i + 0.5 + rand() * 0.4) / count;
      const y = pine ? 0.15 + 0.7 * (rand() - 0.3) : 1 - t * 1.62;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = i * 2.39996 + rand() * 0.6;
      const local = new THREE.Vector3(
        Math.cos(angle) * ring * rx,
        y * ry,
        Math.sin(angle) * ring * rz,
      );
      const outward = new THREE.Vector3(
        local.x / (rx * rx),
        local.y / (ry * ry),
        local.z / (rz * rz),
      )
        .normalize()
        .applyQuaternion(crownQ);
      local.multiplyScalar((pine ? 0.95 : 1.0) + rand() * 0.2).applyQuaternion(crownQ);
      const p = centre.clone().add(local);
      // Face outward, tilted up a little so tops catch the sun; random roll.
      const facing = outward.clone().lerp(up, pine ? 0.55 : 0.25).normalize();
      look.lookAt(new THREE.Vector3(), facing, up);
      const q = new THREE.Quaternion().setFromRotationMatrix(look);
      roll.setFromAxisAngle(axis, (rand() - 0.5) * Math.PI * 1.2);
      q.multiply(roll);
      tint.set(crown.color);
      const hsl = { h: 0, s: 0, l: 0 };
      tint.getHSL(hsl);
      tint.setHSL(
        hsl.h + (rand() - 0.5) * 0.025,
        Math.min(1, hsl.s * (0.92 + rand() * 0.18)),
        hsl.l * (0.9 + rand() * 0.22 + (y > 0.3 ? 0.06 : 0)),
      );
      cards.push({
        p,
        centre,
        q,
        size:
          (pine ? radius * 1.3 : radius * 1.4) *
          (0.8 + rand() * 0.4) *
          (small ? 0.85 : 1),
        color: tint.clone(),
        cell: pine
          ? Math.abs(crown.s[1]) > 0.8
            ? 3
            : 2
          : rand() < 0.35
            ? 1
            : 0,
        phase: rand(),
        rank: i,
      });
    }
  }
  // Round-robin order: the first N cards cover every crown evenly.
  cards.sort((a, b) => a.rank - b.rank);
  return cards;
}

/* ------------------------------------------------------------------ atlas */

let atlas: THREE.Texture | null = null;
/** 512² canvas, 2×2 cells of grey-valued leaf clusters with alpha. */
export function leafAtlas() {
  if (atlas) return atlas;
  const size = 512,
    cell = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const rand = random(1234);
  const shade = (v: number) => {
    const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
    return `rgb(${c},${c},${c})`;
  };
  const leaf = (
    x: number,
    y: number,
    length: number,
    width: number,
    angle: number,
    value: number,
  ) => {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    const grad = g.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, shade(value * 0.78));
    grad.addColorStop(0.6, shade(value));
    grad.addColorStop(1, shade(value * 1.06));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(length * 0.35, -width, length, 0);
    g.quadraticCurveTo(length * 0.35, width, 0, 0);
    g.fill();
    // Midrib.
    g.strokeStyle = shade(value * 0.7);
    g.lineWidth = Math.max(1, width * 0.12);
    g.beginPath();
    g.moveTo(length * 0.08, 0);
    g.lineTo(length * 0.85, 0);
    g.stroke();
    g.restore();
  };
  // Cell 0: broadleaf cluster — big ovate leaves radiating from twigs.
  {
    const ox = 0,
      oy = 0,
      cx = ox + cell / 2,
      cy = oy + cell / 2;
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 18 + rand() * 62;
      const x = cx + Math.cos(a) * r * 0.75,
        y = cy + Math.sin(a) * r * 0.75;
      leaf(x, y, 34 + rand() * 20, 13 + rand() * 6, a + (rand() - 0.5) * 1.2, 0.72 + rand() * 0.28);
    }
  }
  // Cell 1: small round leaves (birch, autumn canopies).
  {
    const cx = cell * 1.5,
      cy = cell / 2;
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 92;
      leaf(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 18 + rand() * 10, 9 + rand() * 4, rand() * Math.PI * 2, 0.7 + rand() * 0.3);
    }
  }
  // Cell 2: needle spray — fans of fine strokes along drooping twigs.
  {
    const cx = cell / 2,
      cy = cell * 1.5;
    g.lineCap = "round";
    for (let t = 0; t < 7; t++) {
      const a = -Math.PI / 2 + (t - 3) * 0.42 + (rand() - 0.5) * 0.2;
      const len = 70 + rand() * 30;
      for (let s = 0; s < 22; s++) {
        const k = s / 22;
        const x = cx + Math.cos(a) * len * k,
          y = cy + 40 + Math.sin(a) * len * k;
        for (const side of [-1, 1]) {
          g.strokeStyle = shade(0.68 + rand() * 0.32);
          g.lineWidth = 2.2;
          g.beginPath();
          g.moveTo(x, y);
          const na = a + side * (0.9 + rand() * 0.3);
          const nl = 14 + rand() * 8 * (1 - k * 0.5);
          g.lineTo(x + Math.cos(na) * nl, y + Math.sin(na) * nl);
          g.stroke();
        }
      }
    }
  }
  // Cell 3: feathery redwood/pine frond — flat layered sprays.
  {
    const cx = cell * 1.5,
      cy = cell * 1.5;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
      const len = 60 + rand() * 40;
      for (let s = 0; s < 14; s++) {
        const k = s / 14;
        const x = cx + Math.cos(a) * len * k,
          y = cy + Math.sin(a) * len * k * 0.8;
        leaf(x, y, 16 * (1 - k * 0.5), 6, a + 1.3, 0.66 + rand() * 0.3);
        leaf(x, y, 16 * (1 - k * 0.5), 6, a - 1.3, 0.66 + rand() * 0.3);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 2;
  texture.name = "env-leaf-atlas";
  atlas = texture;
  return texture;
}

/* --------------------------------------------------------------- material */

export const leafUniforms = {
  uLeafAtlas: { value: null as THREE.Texture | null },
};

const VERTEX_HEAD = `
attribute vec4 aLeaf; // crown centre xyz, phase
attribute float aCell;
varying vec2 vLeafUv;
varying vec3 vLeafNormal;
varying vec3 vLeafWorld;
varying float vLeafEdge;
${ENV_UNIFORMS_GLSL}`;
const VERTEX_BEGIN = `
vec3 transformed = vec3(position);
float leafTip = uv.y;
float leafSway = sin(uEnvTime * 1.6 + aLeaf.w * 6.2831 + position.x * 2.0) * (0.05 + 0.12 * uEnvWind)
  + sin(uEnvTime * 3.7 + aLeaf.w * 17.0) * 0.025 * (0.4 + uEnvWind);
transformed.z += leafSway * leafTip;
transformed.x += leafSway * 0.5 * leafTip;
vec2 leafCell = vec2(mod(aCell, 2.0), floor(aCell / 2.0));
vLeafUv = (uv * 0.96 + 0.02 + leafCell) * 0.5;
vLeafEdge = length(uv - 0.5) * 2.0;`;
const VERTEX_WORLD = `
vec4 leafWorld = instanceMatrix * vec4(transformed, 1.0);
leafWorld = modelMatrix * leafWorld;
vLeafWorld = leafWorld.xyz;
vec3 leafOut = normalize(leafWorld.xyz - aLeaf.xyz + vec3(0.0, 0.25, 0.0));
vLeafNormal = normalize((viewMatrix * vec4(leafOut, 0.0)).xyz);`;

export function leafMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });
  material.onBeforeCompile = (shader) => {
    bindEnvUniforms(shader);
    shader.uniforms.uLeafAtlas = leafUniforms.uLeafAtlas;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace("#include <begin_vertex>", VERTEX_BEGIN)
      .replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_WORLD}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uLeafAtlas;
        varying vec2 vLeafUv;
        varying vec3 vLeafNormal;
        varying vec3 vLeafWorld;
        varying float vLeafEdge;
        ${ENV_UNIFORMS_GLSL}`,
      )
      .replace(
        "#include <alphatest_fragment>",
        `vec4 leafTexel = texture2D(uLeafAtlas, vLeafUv);
        if (leafTexel.a < 0.5) discard;
        // Explore camera: dither leaves out within 2.5 units of the lens, so
        // a canopy or bush never blanks the low camera.
        float leafCam = distance(cameraPosition, vLeafWorld);
        if (uEnvCamFade > 0.0 && leafCam < 2.5) {
          float leafDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (leafDither > mix(1.0, smoothstep(0.7, 2.5, leafCam), uEnvCamFade)) discard;
        }
        diffuseColor.rgb *= leafTexel.rgb * 1.08;`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        normal = normalize(mix(normal, vLeafNormal, 0.82));`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec3 leafView = normalize(cameraPosition - vLeafWorld);
        float leafBack = pow(saturate(dot(-leafView, uEnvSunDir)), 3.0);
        float leafWrap = saturate(dot(normalize((vec4(normal, 0.0) * viewMatrix).xyz), -uEnvSunDir) * 0.5 + 0.5);
        totalEmissiveRadiance += diffuseColor.rgb * uEnvSunColor * (leafBack * 0.55 + leafWrap * 0.06) * (1.0 - uEnvNight);
        float leafRim = pow(1.0 - saturate(abs(dot(normal, vec3(0.0, 0.0, 1.0)))), 3.0);
        totalEmissiveRadiance += uEnvSky * diffuseColor.rgb * leafRim * 0.22;`,
      );
  };
  material.customProgramCacheKey = () => "env-leaf-v2";
  return material;
}

/** Shadow caster with the same alpha cut-out and wind as the cards. */
export function leafDepthMaterial() {
  const material = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    bindEnvUniforms(shader);
    shader.uniforms.uLeafAtlas = leafUniforms.uLeafAtlas;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 aLeaf;
        attribute float aCell;
        varying vec2 vLeafUv;
        ${ENV_UNIFORMS_GLSL}`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        float leafSway = sin(uEnvTime * 1.6 + aLeaf.w * 6.2831 + position.x * 2.0) * (0.05 + 0.12 * uEnvWind);
        transformed.z += leafSway * uv.y;
        vec2 leafCell = vec2(mod(aCell, 2.0), floor(aCell / 2.0));
        vLeafUv = (uv * 0.96 + 0.02 + leafCell) * 0.5;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uLeafAtlas;
        varying vec2 vLeafUv;`,
      )
      .replace(
        "#include <alphatest_fragment>",
        `if (texture2D(uLeafAtlas, vLeafUv).a < 0.5) discard;`,
      );
  };
  material.customProgramCacheKey = () => "env-leaf-depth-v1";
  return material;
}
