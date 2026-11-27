/**
 * Runtime for the baked sculpted characters: decodes `cast-v1.bin`, owns the
 * stylised character material (wrap diffuse, warm subsurface on skin, rim
 * light, baked AO, per-vertex gloss, procedural eyes) and draws whole crowds
 * as one BatchedMesh per LOD: every body piece is an instance posed by the
 * shared skeleton, so a crowd costs one draw (+ one shadow draw) per LOD.
 */
import * as THREE from "three";
import type { Pose } from "../locomotion";
import { solveJoints, makeJoints, restPose, JOINTS, type JointMatrices } from "../skeleton";
import type { Hold } from "../outfit";
import { EYE_Y, PIECE_JOINT, type PieceId } from "./figure";

export const PIECES: PieceId[] = [
  "pelvis", "chest", "head", "eyes", "upperL", "upperR", "foreL", "foreR",
  "thighL", "thighR", "shinL", "shinR", "footL", "footR", "skirt", "pointR",
  "mouth0", "mouth1", "mouth2", "mouth3",
];
/** PIECES index of the first mouth shape (one of four is shown at a time). */
const MOUTH0 = PIECES.indexOf("mouth0");
/** The right forearm and its pointing variant (one is shown at a time). */
const FORE_R = PIECES.indexOf("foreR"), POINT_R = PIECES.indexOf("pointR");
export type SculptLod = "hero" | "mid";
type ShapeMeta = { n: number; i: number; v0: number; i0: number; bb: number[] };
export type CastManifest = {
  v: number;
  q?: number;
  nv: number;
  ni: number;
  shapes: ShapeMeta[];
  chars: Record<string, { p: Partial<Record<PieceId, [number, number]>>; skirtTop: number }>;
};

export class Cast {
  manifest: CastManifest;
  private pools: { pos: Uint8Array; idx: Uint8Array; nrm: Int8Array; a: Uint8Array; b: Uint8Array };
  private geos = new Map<number, THREE.BufferGeometry>();
  constructor(buf: ArrayBuffer) {
    const view = new DataView(buf);
    if (view.getUint32(0, true) !== 0x31524843) throw new Error("bad cast file");
    const jl = view.getUint32(4, true);
    this.manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)));
    const { nv, ni } = this.manifest;
    const align = (x: number) => (x + 3) & ~3;
    let o = align(8 + jl);
    const pos = new Uint8Array(buf, o, nv * 6); o = align(o + nv * 6);
    const idx = new Uint8Array(buf, o, ni * 2); o = align(o + ni * 2);
    const nrm = new Int8Array(buf, o, nv * 2); o = align(o + nv * 2);
    const a = new Uint8Array(buf, o, nv * 4); o = align(o + nv * 4);
    const b = new Uint8Array(buf, o, nv * 4);
    this.pools = { pos, idx, nrm, a, b };
  }
  has(id: string) {
    return !!this.manifest.chars[id];
  }
  /** Geometry of one baked shape (decoded once, shared, never disposed). */
  geometry(shape: number) {
    let g = this.geos.get(shape);
    if (g) return g;
    const s = this.manifest.shapes[shape];
    const { pos, idx, nrm, a, b } = this.pools;
    const { nv, ni, q: Q = 4095 } = this.manifest;
    // 12-bit zigzag deltas in split byte planes.
    const p = new Float32Array(s.n * 3);
    const acc = [0, 0, 0];
    for (let i = 0; i < s.n * 3; i++) {
      const k = s.v0 * 3 + i;
      const z = pos[k] | (pos[nv * 3 + k] << 8);
      const d = z & 1 ? -((z + 1) >> 1) : z >> 1;
      const c = i % 3;
      acc[c] = i < 3 ? d : acc[c] + d;
      p[i] = s.bb[c] + (acc[c] / Q) * (s.bb[c + 3] - s.bb[c]);
    }
    const index = new Uint16Array(s.i);
    let hw = 0;
    for (let i = 0; i < s.i; i++) {
      const k = s.i0 + i;
      const v = hw - (idx[k] | (idx[ni + k] << 8));
      index[i] = v;
      if (v === hw) hw++;
    }
    // Octahedral normals → int8 xyz.
    const n3 = new Int8Array(s.n * 3);
    for (let i = 0; i < s.n; i++) {
      let x = nrm[(s.v0 + i) * 2] / 127, y = nrm[(s.v0 + i) * 2 + 1] / 127;
      const z = 1 - Math.abs(x) - Math.abs(y);
      if (z < 0) {
        const px = x;
        x = (1 - Math.abs(y)) * (px >= 0 ? 1 : -1);
        y = (1 - Math.abs(px)) * (y >= 0 ? 1 : -1);
      }
      const l = Math.hypot(x, y, z) || 1;
      n3[i * 3] = Math.round((x / l) * 127); n3[i * 3 + 1] = Math.round((y / l) * 127); n3[i * 3 + 2] = Math.round((z / l) * 127);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(n3, 3, true));
    g.setAttribute("rigA", new THREE.BufferAttribute(a.slice(s.v0 * 4, (s.v0 + s.n) * 4), 4, true));
    g.setAttribute("rigB", new THREE.BufferAttribute(b.slice(s.v0 * 4, (s.v0 + s.n) * 4), 4, true));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    this.geos.set(shape, g);
    return g;
  }
  triangles(id: string, lod: SculptLod) {
    const c = this.manifest.chars[id];
    let n = 0;
    // Only one mouth shape and one right hand are drawn at a time: count the
    // resting ones.
    for (const [pid, v] of Object.entries(c.p)) if (v && pid !== "pointR" && (pid === "mouth0" || !pid.startsWith("mouth"))) n += this.manifest.shapes[v[lod === "hero" ? 0 : 1]].i / 3;
    return n;
  }
}

let castPromise: Promise<Cast | null> | null = null;
let castLoaded: Cast | null = null;
const CAST_URL = `${import.meta.env?.BASE_URL ?? "/"}characters/cast-v1.bin`;
async function fetchBuffer(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.arrayBuffer();
}
/** The cast ships gzip-compressed (~1.5 MB instead of ~5 MB, written at build
 * time by scripts/gzip-cast.mjs) and is inflated here, so the transfer stays
 * small whatever the host's compression does. If the host already decoded it
 * (Content-Encoding), the bytes arrive inflated and are used as they are.
 * Browsers without DecompressionStream fetch the raw file instead. */
async function fetchCast(url: string) {
  if (typeof DecompressionStream === "function") {
    try {
      const packed = await fetchBuffer(`${url}.gz`);
      const head = new Uint8Array(packed, 0, Math.min(2, packed.byteLength));
      if (head[0] !== 0x1f || head[1] !== 0x8b) return packed;
      const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).arrayBuffer();
    } catch {
      /* fall through to the raw file */
    }
  }
  return fetchBuffer(url);
}
/** Starts (once) and returns the cast download. Null when unavailable. */
export function loadCast(url = CAST_URL) {
  return (castPromise ??= fetchCast(url)
    .then((buf) => (castLoaded = new Cast(buf)))
    .catch(() => null));
}
export const castNow = () => castLoaded;

// --- Material -------------------------------------------------------------------
export const PALETTE_WIDTH = 32;
/** Shared lighting knobs (uniform objects shared by every sculpt material). */
export const sculptUniforms = {
  rigRim: { value: new THREE.Color(0.5, 0.56, 0.68) },
  rigWarm: { value: new THREE.Color(1.0, 0.55, 0.42) },
};
const VERT_PARS = /* glsl */ `
attribute vec4 rigA;
attribute vec4 rigB;
uniform highp sampler2D rigPalette;
uniform highp sampler2D rigBones;
varying vec3 vRigColor;
varying vec3 vRigHi;
varying vec2 vRigSurf;
varying vec3 vRigEye;
varying float vRigSkin;
varying float vRigKind;
varying vec3 vRigLocal;
varying vec3 vRigNLocal;
varying vec3 vRigTan;
vec3 rigSlot(float s, int row) { return texelFetch(rigPalette, ivec2(int(s * 255.0 + 0.5), row), 0).rgb; }
vec3 rigOct(vec2 e) {
  vec3 v = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  if (v.z < 0.0) v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
  return normalize(v);
}
`;
const SKIN = /* glsl */ `
#ifdef USE_BATCHING
  {
    // Joint blending: a second bone (rigB.z) weighted by rigB.w.
    int rigI = int(getIndirectIndex(gl_DrawID));
    float rigBone = floor(rigB.z * 255.0 + 0.5);
    float rigSa = floor(rigA.x * 255.0 + 0.5);
    if (rigBone < 20.0 && rigSa != 3.0 && rigSa != 6.0 && rigB.w > 0.0) {
      int rigChar = int(texelFetch(rigPalette, ivec2(0, rigI), 0).a + 0.5);
      int bx = int(rigBone) * 4;
      mat4 rigQ = mat4(texelFetch(rigBones, ivec2(bx, rigChar), 0), texelFetch(rigBones, ivec2(bx + 1, rigChar), 0),
        texelFetch(rigBones, ivec2(bx + 2, rigChar), 0), texelFetch(rigBones, ivec2(bx + 3, rigChar), 0));
      batchingMatrix = batchingMatrix * (1.0 - rigB.w) + rigQ * rigB.w;
    }
  }
#endif
`;
const VERT_MAIN = /* glsl */ `
#ifdef USE_BATCHING
  int rigRow = int(getIndirectIndex(gl_DrawID));
#else
  int rigRow = 0;
#endif
  vec3 rigCa = rigSlot(rigA.x, rigRow);
  vec3 rigCb = rigSlot(rigA.y, rigRow);
  vRigColor = mix(rigCa, rigCb, rigA.z) * (rigA.w * 1.12);
  vRigSurf = rigB.xy;
  float rigSlotA = floor(rigA.x * 255.0 + 0.5);
  float rigSlotB = floor(rigA.y * 255.0 + 0.5);
  vRigEye = vec3(rigB.zw * 2.0 - 1.0, rigSlotA == 6.0 ? 1.0 : 0.0);
  vRigSkin = (rigSlotA == 0.0 ? 1.0 - rigA.z : 0.0) + (rigSlotB == 0.0 ? rigA.z : 0.0)
    + (rigSlotA == 1.0 || rigSlotA == 2.0 ? 1.0 : 0.0);
  if (rigSlotA == 6.0) vRigColor = rigCa;
  // Surface kind for the detail layer: 1 cloth, 2 leather/shoe, 3 hair, 0 none.
  bool rigCloth = (rigSlotA >= 7.0 && rigSlotA <= 12.0) || rigSlotA == 17.0 || rigSlotA == 18.0 || rigSlotA == 19.0 || (rigSlotA >= 24.0 && rigB.x > 0.6);
  vRigKind = rigSlotA == 3.0 ? 3.0 : rigCloth ? 1.0 : (rigSlotA == 13.0 || rigSlotA == 15.0 || rigSlotA == 14.0) ? 2.0 : 0.0;
  vRigHi = rigSlot(4.0 / 255.0, rigRow);
  vRigLocal = position;
  vRigNLocal = normal;
  vRigTan = vec3(0.0);
  if (rigSlotA == 3.0) {
    vec3 rigT = rigOct(rigB.zw * 2.0 - 1.0);
#ifdef USE_BATCHING
    rigT = mat3(batchingMatrix) * rigT;
#endif
    vRigTan = normalize(mat3(modelViewMatrix) * rigT);
    vRigEye.xy = vec2(0.0);
  }
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vRigColor;
varying vec3 vRigHi;
varying vec2 vRigSurf;
varying vec3 vRigEye;
varying float vRigSkin;
varying float vRigKind;
varying vec3 vRigLocal;
varying vec3 vRigNLocal;
varying vec3 vRigTan;
uniform vec3 rigRim;
uniform vec3 rigWarm;
uniform sampler2D rigDetail;
float rigSkinF;
float rigGlow;
float rigRoughMod;
vec4 rigTri(vec3 p, vec3 n, float k) {
  vec3 w = abs(n); w = w * w; w /= (w.x + w.y + w.z + 1e-4);
  return texture2D(rigDetail, p.yz * k) * w.x + texture2D(rigDetail, p.xz * k) * w.y + texture2D(rigDetail, p.xy * k) * w.z;
}
`;
const FRAG_COLOR = /* glsl */ `
  rigSkinF = vRigSkin;
  rigGlow = 0.0;
  rigRoughMod = 0.0;
  vec3 rigCol = vRigColor;
  if (vRigEye.z > 0.5) {
    // Procedural eye: sclera, iris (dark limbal ring, radial fibres, light
    // lower half), pupil, two catchlights. Crisp at any mesh density.
    vec2 e = vRigEye.xy;
    float r = length(e);
    vec3 sclera = vec3(0.97, 0.96, 0.94) * (0.72 + 0.28 * smoothstep(0.98, 0.4, e.y));
    float fib = 0.9 + 0.1 * sin(atan(e.y, e.x) * 23.0) * smoothstep(0.32, 0.5, r);
    vec3 iris = vRigColor * (0.42 + 0.95 * smoothstep(0.74, 0.12, r)) * (0.7 + 0.75 * smoothstep(0.3, -0.6, e.y)) * fib;
    iris = mix(iris, vRigColor * 0.25, smoothstep(0.6, 0.73, r));
    rigCol = mix(iris, sclera, smoothstep(0.715, 0.765, r));
    rigCol = mix(vec3(0.025, 0.018, 0.022), rigCol, smoothstep(0.29, 0.34, r));
    rigGlow = smoothstep(0.2, 0.15, length(e - vec2(-0.24, 0.27))) + 0.85 * smoothstep(0.085, 0.055, length(e - vec2(0.23, -0.25)));
    rigSkinF = 0.0;
  } else if (vRigKind > 0.5) {
    vec3 rp = vRigLocal;
    vec3 rn = normalize(vRigNLocal);
    if (vRigKind < 1.5) {
      // Cloth: woven texture and soft painted mottling.
      vec4 d = rigTri(rp, rn, 7.0);
      vec4 m = rigTri(rp, rn, 1.3);
      rigCol *= 0.94 + 0.13 * d.r + 0.14 * (m.a - 0.5);
      rigRoughMod = 0.08 * (d.r - 0.5);
    } else if (vRigKind < 2.5) {
      vec4 d = rigTri(rp, rn, 11.0);
      rigCol *= 0.96 + 0.08 * d.g;
      rigRoughMod = 0.16 * (d.g - 0.5);
    } else {
      // Hair: a whisper of strand texture (low contrast, low frequency).
      float strand = rigTri(rp * vec3(1.0, 0.25, 1.0), rn, 3.0).b;
      rigCol *= 0.975 + 0.05 * strand;
    }
  }
  diffuseColor.rgb *= rigCol;
`;
const RIM = /* glsl */ `
  {
    vec3 rigV = normalize(vViewPosition);
    float rigF = pow(1.0 - saturate(dot(normal, rigV)), 3.0);
    outgoingLight += rigRim * rigF * (diffuseColor.rgb * 0.7 + 0.12);
#if NUM_DIR_LIGHTS > 0
    if (vRigKind > 2.5) {
      // Painted anisotropic highlight band along the strands (two lobes).
      vec3 rigL = directionalLights[0].direction;
      vec3 rigH = normalize(rigL + rigV);
      vec3 rigT = normalize(vRigTan - normal * dot(vRigTan, normal) + 1e-4);
      // A gentle jitter keeps the band organic without breaking it up.
      float jit = rigTri(vRigLocal * vec3(1.0, 0.25, 1.0), normalize(vRigNLocal), 3.0).b - 0.5;
      vec3 t1 = normalize(rigT + normal * (0.16 + jit * 0.1));
      vec3 t2 = normalize(rigT - normal * (0.1 - jit * 0.06));
      float th1 = dot(t1, rigH), th2 = dot(t2, rigH);
      float s1 = pow(sqrt(max(0.0, 1.0 - th1 * th1)), 110.0);
      float s2 = pow(sqrt(max(0.0, 1.0 - th2 * th2)), 28.0);
      float lit = saturate(dot(normal, rigL) * 0.6 + 0.4);
      outgoingLight += directionalLights[0].color * lit * (s1 * 0.16 * mix(vec3(1.0), vRigHi, 0.5) + s2 * 0.08 * vRigHi);
    }
#endif
    outgoingLight = mix(outgoingLight, vec3(1.7), saturate(rigGlow));
  }
`;
/** Shared tileable detail texture, generated in code: R woven cloth, G fine
 * grain, B strand streaks, A soft mottling. Mipmapped, wraps. */
let detailTex: THREE.DataTexture | null = null;
export function detailTexture() {
  if (detailTex) return detailTex;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  const h = (x: number, y: number, s: number) => {
    const v = Math.sin(((x % N) + N) % N * 127.1 + (((y % N) + N) % N) * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const vnoise = (x: number, y: number, cell: number, s: number) => {
    const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const m = N / cell;
    const c = (a: number, b: number) => h(((a % m) + m) % m * cell, ((b % m) + m) % m * cell, s);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (c(ix, iy) * (1 - sx) + c(ix + 1, iy) * sx) * (1 - sy) + (c(ix, iy + 1) * (1 - sx) + c(ix + 1, iy + 1) * sx) * sy;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      // Plain weave: alternating over/under threads.
      const u = (x / N) * 16 * Math.PI * 2, v = (y / N) * 16 * Math.PI * 2;
      const over = Math.sin(u / 2) * Math.sin(v / 2) > 0;
      const weave = 0.5 + 0.5 * (over ? Math.abs(Math.sin(v)) * 0.8 + 0.2 * Math.sin(u) : Math.abs(Math.sin(u)) * 0.8 + 0.2 * Math.sin(v));
      const grain = 0.6 * vnoise(x, y, 4, 1) + 0.4 * vnoise(x, y, 2, 2);
      const strand = 0.6 * vnoise(x, y * 0.25, 4, 3) + 0.4 * vnoise(x, y * 0.25, 2, 4);
      const mottle = 0.6 * vnoise(x, y, 16, 5) + 0.4 * vnoise(x, y, 8, 6);
      data[o] = Math.round((0.75 * weave + 0.25 * grain) * 255);
      data[o + 1] = Math.round(grain * 255);
      data[o + 2] = Math.round(strand * 255);
      data[o + 3] = Math.round(mottle * 255);
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return (detailTex = t);
}
function lightsChunk() {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const from = "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\n\tvec3 irradiance = dotNL * directLight.color;";
  if (!src.includes(from)) return src;
  return src
    .replace(
      from,
      `float rigNL = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( rigNL );
	vec3 irradiance = dotNL * directLight.color;
	// Wrap (half-Lambert-ish) diffuse; the terminator warms on skin.
	float rigWrap = saturate( ( rigNL + 0.5 ) / 1.5 );
	vec3 rigDiffuseIrr = rigWrap * directLight.color * mix( vec3( 1.0 ), rigWarm, rigSkinF * smoothstep( 0.55, -0.1, rigNL ) * smoothstep( -0.5, 0.05, rigNL ) );`,
    )
    .replace(
      "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}",
      "reflectedLight.directDiffuse += rigDiffuseIrr * BRDF_Lambert( material.diffuseColor );\n}",
    );
}

/** The sculpt material (one per palette texture; all share one program). */
export function sculptMaterial(palette: THREE.DataTexture, bones: THREE.DataTexture = boneTexture(1)) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rigPalette = { value: palette };
    shader.uniforms.rigBones = { value: bones };
    shader.uniforms.rigRim = sculptUniforms.rigRim;
    shader.uniforms.rigWarm = sculptUniforms.rigWarm;
    shader.uniforms.rigDetail = { value: detailTexture() };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace("#include <batching_vertex>", `#include <batching_vertex>\n${SKIN}\n${VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <lights_physical_pars_fragment>", lightsChunk())
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = clamp(vRigSurf.x + rigRoughMod, 0.06, 1.0);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n metalnessFactor = vRigSurf.y;")
      .replace("#include <opaque_fragment>", `${RIM}\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "rig-sculpt-v2";
  m.userData.noBake = true;
  return m;
}
/** The matching shadow-depth material (same joint blending). */
export function sculptDepthMaterial(palette: THREE.DataTexture, bones: THREE.DataTexture) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rigPalette = { value: palette };
    shader.uniforms.rigBones = { value: bones };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 rigA;\nattribute vec4 rigB;\nuniform highp sampler2D rigPalette;\nuniform highp sampler2D rigBones;")
      .replace("#include <batching_vertex>", `#include <batching_vertex>\n${SKIN}`);
  };
  m.customProgramCacheKey = () => "rig-sculpt-depth-v1";
  m.userData.noBake = true;
  return m;
}
/** Per character: every joint's pose delta (posed × inverse rest), 4 texels each. */
export const BONES = JOINTS.length;
export function boneTexture(rows: number) {
  const t = new THREE.DataTexture(new Float32Array(BONES * 4 * Math.max(1, rows) * 4), BONES * 4, Math.max(1, rows), THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}
export function paletteTexture(rows: number) {
  const t = new THREE.DataTexture(new Float32Array(PALETTE_WIDTH * rows * 4), PALETTE_WIDTH, rows, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}
const col = new THREE.Color();
/** Write an sRGB hex palette into texture row `row` (linear floats). */
export function writePalette(t: THREE.DataTexture, row: number, hexes: string[], glow: number[] = [], char = 0) {
  const data = t.image.data as Float32Array;
  for (let i = 0; i < PALETTE_WIDTH; i++) {
    col.set(hexes[i] ?? "#ff00ff");
    const g = glow[i] ?? 1;
    const o = (row * PALETTE_WIDTH + i) * 4;
    data[o] = col.r * g; data[o + 1] = col.g * g; data[o + 2] = col.b * g; data[o + 3] = i === 0 ? char : 1;
  }
  t.needsUpdate = true;
}

// --- Crowd batch -------------------------------------------------------------------
export type SculptChar = { id: string; palette: string[]; glow?: number[]; holds: { holdL?: Hold; holdR?: Hold }; scale: number };
const scratchPose = {} as Pose;
const pm = new THREE.Matrix4(), tmpM = new THREE.Matrix4(), sizedBase = new THREE.Matrix4();
/** Inverse rest-pose joint matrices: baked shapes live in rest space. */
const invRest = (() => {
  const r = solveJoints(restPose(), new THREE.Matrix4(), makeJoints());
  return Object.fromEntries(JOINTS.map((j) => [j, r[j].clone().invert()])) as JointMatrices;
})();
const delta = makeJoints();
const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();

/** One BatchedMesh holding every piece of every character it may draw. */
export class SculptBatch {
  mesh: THREE.BatchedMesh;
  palette: THREE.DataTexture;
  bones: THREE.DataTexture;
  material: THREE.MeshStandardMaterial;
  /** Instance ids per character, in PIECES order (−1: piece absent). */
  instances: Int32Array[];
  owner: Int32Array;
  private joints: JointMatrices = makeJoints();
  private shown: Uint8Array;
  private mouth: Int8Array;
  private pointing: Int8Array;
  constructor(public cast: Cast, public chars: SculptChar[], public lod: SculptLod) {
    const L = lod === "hero" ? 0 : 1;
    const shapes = new Map<number, number>();
    let verts = 0, idx = 0, inst = 0;
    for (const c of chars) {
      const entry = cast.manifest.chars[c.id];
      for (const pid of PIECES) {
        const sh = entry?.p[pid]?.[L];
        if (sh === undefined) continue;
        inst++;
        if (!shapes.has(sh)) {
          shapes.set(sh, -1);
          verts += cast.manifest.shapes[sh].n;
          idx += cast.manifest.shapes[sh].i;
        }
      }
    }
    this.palette = paletteTexture(Math.max(1, inst));
    this.bones = boneTexture(chars.length);
    this.material = sculptMaterial(this.palette, this.bones);
    this.mesh = new THREE.BatchedMesh(Math.max(1, inst), Math.max(3, verts), Math.max(3, idx), this.material);
    this.mesh.customDepthMaterial = sculptDepthMaterial(this.palette, this.bones);
    this.mesh.frustumCulled = false;
    this.mesh.perObjectFrustumCulled = true;
    this.mesh.sortObjects = false;
    this.mesh.userData.noBake = true;
    for (const sh of shapes.keys()) shapes.set(sh, this.mesh.addGeometry(cast.geometry(sh)));
    this.owner = new Int32Array(Math.max(1, inst)).fill(-1);
    this.instances = chars.map((c, ci) => {
      const entry = cast.manifest.chars[c.id];
      return Int32Array.from(PIECES, (pid) => {
        const sh = entry?.p[pid]?.[L];
        if (sh === undefined) return -1;
        const id = this.mesh.addInstance(shapes.get(sh)!);
        this.mesh.setVisibleAt(id, false);
        this.owner[id] = ci;
        writePalette(this.palette, id, c.palette, c.glow, ci);
        return id;
      });
    });
    this.shown = new Uint8Array(chars.length);
    this.mouth = new Int8Array(chars.length);
    this.pointing = new Int8Array(chars.length);
    this.mesh.visible = false;
  }
  setPalette(ci: number, hexes: string[], glow?: number[]) {
    for (const id of this.instances[ci]) if (id >= 0) writePalette(this.palette, id, hexes, glow, ci);
  }
  private visibleCount = 0;
  hide(ci: number) {
    if (!this.shown[ci]) return;
    this.shown[ci] = 0;
    // An empty batch issues no draw at all.
    if (--this.visibleCount === 0) this.mesh.visible = false;
    for (const id of this.instances[ci]) if (id >= 0) this.mesh.setVisibleAt(id, false);
  }
  /** Pose character `ci` under `base` (root transform) and show it. */
  write(ci: number, pose: Pose, base: THREE.Matrix4) {
    const c = this.chars[ci];
    const posed = applyHold(pose, c.holds);
    if (c.scale !== 1) sizedBase.makeScale(c.scale, c.scale, c.scale).premultiply(base);
    else sizedBase.copy(base);
    const J = solveJoints(posed, sizedBase, this.joints);
    // Pose deltas (posed × inverse rest) for every joint, into the bone row.
    const bd = this.bones.image.data as Float32Array;
    for (let j = 0; j < JOINTS.length; j++) {
      const name = JOINTS[j];
      delta[name].multiplyMatrices(J[name], invRest[name]);
      delta[name].toArray(bd, (ci * BONES + j) * 16);
    }
    this.bones.needsUpdate = true;
    const ids = this.instances[ci];
    const top = this.cast.manifest.chars[c.id]?.skirtTop ?? 0.12;
    const stride = Math.min(1.2, Math.abs(posed.hipL - posed.hipR));
    // Mouth shape: the resting expression, or one of three talking shapes.
    const talk = posed.talk ?? 0;
    const mouth = talk < 0.08 ? 0 : talk < 0.32 ? 1 : (Math.floor(talk * 23) % 3 === 0 ? 3 : 2);
    const prevMouth = this.mouth[ci];
    // Talking point: the pointing forearm replaces the right forearm.
    const point = ids[POINT_R] >= 0 && (posed.point ?? 0) > 0.5 ? 1 : 0;
    const prevPoint = this.pointing[ci];
    for (let k = 0; k < PIECES.length; k++) {
      const id = ids[k];
      if (id < 0) continue;
      const pid = PIECES[k];
      const jn = PIECE_JOINT[pid];
      const jm = delta[jn];
      if (k >= MOUTH0) {
        const want = k - MOUTH0 === mouth;
        if (want) this.mesh.setMatrixAt(id, jm);
        if (!this.shown[ci] || prevMouth !== mouth) this.mesh.setVisibleAt(id, want);
        continue;
      }
      if (k === FORE_R || k === POINT_R) {
        const want = (k === POINT_R) === (point === 1);
        if (want) this.mesh.setMatrixAt(id, jm);
        if (!this.shown[ci] || prevPoint !== point) this.mesh.setVisibleAt(id, want);
        continue;
      }
      if (pid === "chest" && posed.breath !== 1) {
        // Breathing: the ribcage swells a touch.
        const b = posed.breath - 1;
        pm.makeScale(1 + b * 0.5, 1 + b * 0.25, 1 + b * 0.9).premultiply(J[jn]).multiply(invRest[jn]);
        this.mesh.setMatrixAt(id, pm);
        if (!this.shown[ci]) this.mesh.setVisibleAt(id, true);
        continue;
      }
      if (pid === "eyes") {
        // Blink: squash the eyes (and lash line) about the eye line.
        pm.makeTranslation(0, EYE_Y, 0)
          .multiply(tmpM.makeScale(1, Math.max(0.1, posed.eyes), 1))
          .multiply(tmpM.makeTranslation(0, -EYE_Y, 0))
          .premultiply(J[jn])
          .multiply(invRest[jn]);
      } else if (pid === "skirt") {
        // Cloth flare with the stride; the hem trails with the walk.
        const fx = 1 + stride * 0.3 + posed.walk * 0.04;
        const fz = 1 + stride * 0.45 + posed.walk * 0.06;
        let rx = posed.walk * 0.08 - posed.lean * 0.4;
        let sy = 1;
        if (posed.seat > 0) { rx -= posed.seat * 0.8; sy = 1 - posed.seat * 0.3; }
        e.set(rx, 0, 0);
        q.setFromEuler(e);
        pm.compose(v.set(0, top, 0), q, s.set(fx, sy, fz))
          .multiply(tmpM.makeTranslation(0, -top, 0))
          .premultiply(J[jn])
          .multiply(invRest[jn]);
      } else pm.copy(jm);
      this.mesh.setMatrixAt(id, pm);
      if (!this.shown[ci]) this.mesh.setVisibleAt(id, true);
    }
    this.mouth[ci] = mouth;
    this.pointing[ci] = point;
    if (!this.shown[ci]) {
      this.shown[ci] = 1;
      this.visibleCount++;
      this.mesh.visible = true;
    }
  }
  characterAt(instanceId: number) {
    return this.owner[instanceId] ?? -1;
  }
  dispose() {
    this.mesh.dispose();
    this.palette.dispose();
    this.bones.dispose();
    (this.mesh.customDepthMaterial as THREE.Material | undefined)?.dispose();
    this.material.dispose();
  }
}

function applyHold(pose: Pose, h: { holdL?: Hold; holdR?: Hold }): Pose {
  if (!h.holdL && !h.holdR) return pose;
  Object.assign(scratchPose, pose);
  const k = 1 - pose.seat * 0.5;
  if (h.holdL) {
    scratchPose.armL = pose.armL * 0.25 + h.holdL.arm * k;
    scratchPose.elbowL = h.holdL.elbow;
    if (h.holdL.spread !== undefined) scratchPose.spreadL = h.holdL.spread;
  }
  if (h.holdR) {
    scratchPose.armR = pose.armR * 0.25 + h.holdR.arm * k;
    scratchPose.elbowR = h.holdR.elbow;
    if (h.holdR.spread !== undefined) scratchPose.spreadR = h.holdR.spread;
  }
  return scratchPose;
}
