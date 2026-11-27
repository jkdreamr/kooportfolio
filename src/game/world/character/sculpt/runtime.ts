/**
 * Runtime for the baked sculpted characters: decodes `cast-v1.bin`, owns the
 * stylised character material (wrap diffuse, warm subsurface on skin, rim
 * light, baked AO, per-vertex gloss, procedural eyes) and draws whole crowds
 * as one BatchedMesh per LOD: every body piece is an instance posed by the
 * shared skeleton, so a crowd costs one draw (+ one shadow draw) per LOD.
 */
import * as THREE from "three";
import type { Pose } from "../locomotion";
import { solveJoints, makeJoints, type JointMatrices } from "../skeleton";
import type { Hold } from "../outfit";
import { EYE_Y, PIECE_JOINT, type PieceId } from "./figure";

export const PIECES: PieceId[] = [
  "pelvis", "chest", "head", "eyes", "upperL", "upperR", "foreL", "foreR",
  "thighL", "thighR", "shinL", "shinR", "footL", "footR", "skirt",
];
export type SculptLod = "hero" | "mid";
type ShapeMeta = { n: number; i: number; v0: number; i0: number; bb: number[] };
export type CastManifest = {
  v: number;
  nv: number;
  ni: number;
  shapes: ShapeMeta[];
  chars: Record<string, { p: Partial<Record<PieceId, [number, number]>>; skirtTop: number }>;
};

export class Cast {
  manifest: CastManifest;
  private pools: { pos: Int16Array; idx: Uint16Array; nrm: Int8Array; a: Uint8Array; b: Uint8Array };
  private geos = new Map<number, THREE.BufferGeometry>();
  constructor(buf: ArrayBuffer) {
    const view = new DataView(buf);
    if (view.getUint32(0, true) !== 0x31524843) throw new Error("bad cast file");
    const jl = view.getUint32(4, true);
    this.manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)));
    const { nv, ni } = this.manifest;
    const align = (x: number) => (x + 3) & ~3;
    let o = align(8 + jl);
    const pos = new Int16Array(buf, o, nv * 3); o = align(o + nv * 6);
    const idx = new Uint16Array(buf, o, ni); o = align(o + ni * 2);
    const nrm = new Int8Array(buf, o, nv * 3); o = align(o + nv * 3);
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
    const p = new Float32Array(s.n * 3);
    const q = new Int16Array(3);
    for (let i = 0; i < s.n * 3; i++) {
      const c = i % 3;
      q[c] = i < 3 ? pos[s.v0 * 3 + i] : q[c] + pos[s.v0 * 3 + i]; // undo delta (wraps in int16)
      p[i] = s.bb[c] + ((q[c] + 32767) / 65534) * (s.bb[c + 3] - s.bb[c]);
    }
    const index = new Uint16Array(s.i);
    let hw = 0;
    for (let i = 0; i < s.i; i++) {
      const v = hw - idx[s.i0 + i];
      index[i] = v;
      if (v === hw) hw++;
    }
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nrm.slice(s.v0 * 3, (s.v0 + s.n) * 3), 3, true));
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
    for (const v of Object.values(c.p)) if (v) n += this.manifest.shapes[v[lod === "hero" ? 0 : 1]].i / 3;
    return n;
  }
}

let castPromise: Promise<Cast | null> | null = null;
let castLoaded: Cast | null = null;
/** Starts (once) and returns the cast download. Null when unavailable. */
export function loadCast(url = `${import.meta.env?.BASE_URL ?? "/"}characters/cast-v1.bin`) {
  return (castPromise ??= fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
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
varying vec3 vRigColor;
varying vec2 vRigSurf;
varying vec3 vRigEye;
varying float vRigSkin;
vec3 rigSlot(float s, int row) { return texelFetch(rigPalette, ivec2(int(s * 255.0 + 0.5), row), 0).rgb; }
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
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vRigColor;
varying vec2 vRigSurf;
varying vec3 vRigEye;
varying float vRigSkin;
uniform vec3 rigRim;
uniform vec3 rigWarm;
float rigSkinF;
float rigGlow;
`;
const FRAG_COLOR = /* glsl */ `
  rigSkinF = vRigSkin;
  rigGlow = 0.0;
  vec3 rigCol = vRigColor;
  if (vRigEye.z > 0.5) {
    // Procedural eye: sclera, iris with a darker rim and lighter lower half,
    // pupil, two specular dots. Crisp at any mesh density.
    vec2 e = vRigEye.xy;
    float r = length(e);
    vec3 sclera = vec3(0.93, 0.91, 0.89) * (0.82 + 0.18 * smoothstep(0.9, 0.2, length(e + vec2(0.0, -0.25))));
    vec3 iris = vRigColor * (0.55 + 0.75 * smoothstep(0.62, 0.05, r)) * (1.0 + 0.55 * smoothstep(0.0, -0.5, e.y));
    rigCol = mix(iris, sclera, smoothstep(0.6, 0.66, r));
    rigCol = mix(vec3(0.02, 0.018, 0.02), rigCol, smoothstep(0.27, 0.32, r));
    rigGlow = smoothstep(0.17, 0.12, length(e - vec2(0.24, 0.28))) + 0.8 * smoothstep(0.085, 0.05, length(e - vec2(-0.2, -0.22)));
    rigSkinF = 0.0;
  }
  diffuseColor.rgb *= rigCol;
`;
const RIM = /* glsl */ `
  {
    vec3 rigV = normalize(vViewPosition);
    float rigF = pow(1.0 - saturate(dot(normal, rigV)), 3.0);
    outgoingLight += rigRim * rigF * (diffuseColor.rgb * 0.7 + 0.12);
    outgoingLight = mix(outgoingLight, vec3(1.7), saturate(rigGlow));
  }
`;
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
export function sculptMaterial(palette: THREE.DataTexture) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rigPalette = { value: palette };
    shader.uniforms.rigRim = sculptUniforms.rigRim;
    shader.uniforms.rigWarm = sculptUniforms.rigWarm;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace("#include <batching_vertex>", `#include <batching_vertex>\n${VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <lights_physical_pars_fragment>", lightsChunk())
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = max(0.06, vRigSurf.x);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n metalnessFactor = vRigSurf.y;")
      .replace("#include <opaque_fragment>", `${RIM}\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "rig-sculpt-v1";
  m.userData.noBake = true;
  return m;
}
export function paletteTexture(rows: number) {
  const t = new THREE.DataTexture(new Float32Array(PALETTE_WIDTH * rows * 4), PALETTE_WIDTH, rows, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}
const col = new THREE.Color();
/** Write an sRGB hex palette into texture row `row` (linear floats). */
export function writePalette(t: THREE.DataTexture, row: number, hexes: string[], glow: number[] = []) {
  const data = t.image.data as Float32Array;
  for (let i = 0; i < PALETTE_WIDTH; i++) {
    col.set(hexes[i] ?? "#ff00ff");
    const g = glow[i] ?? 1;
    const o = (row * PALETTE_WIDTH + i) * 4;
    data[o] = col.r * g; data[o + 1] = col.g * g; data[o + 2] = col.b * g; data[o + 3] = 1;
  }
  t.needsUpdate = true;
}

// --- Crowd batch -------------------------------------------------------------------
export type SculptChar = { id: string; palette: string[]; glow?: number[]; holds: { holdL?: Hold; holdR?: Hold }; scale: number };
const scratchPose = {} as Pose;
const pm = new THREE.Matrix4(), tmpM = new THREE.Matrix4(), sizedBase = new THREE.Matrix4();
const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();

/** One BatchedMesh holding every piece of every character it may draw. */
export class SculptBatch {
  mesh: THREE.BatchedMesh;
  palette: THREE.DataTexture;
  material: THREE.MeshStandardMaterial;
  /** Instance ids per character, in PIECES order (−1: piece absent). */
  instances: Int32Array[];
  owner: Int32Array;
  private joints: JointMatrices = makeJoints();
  private shown: Uint8Array;
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
    this.material = sculptMaterial(this.palette);
    this.mesh = new THREE.BatchedMesh(Math.max(1, inst), Math.max(3, verts), Math.max(3, idx), this.material);
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
        writePalette(this.palette, id, c.palette, c.glow);
        return id;
      });
    });
    this.shown = new Uint8Array(chars.length);
  }
  setPalette(ci: number, hexes: string[], glow?: number[]) {
    for (const id of this.instances[ci]) if (id >= 0) writePalette(this.palette, id, hexes, glow);
  }
  hide(ci: number) {
    if (!this.shown[ci]) return;
    this.shown[ci] = 0;
    for (const id of this.instances[ci]) if (id >= 0) this.mesh.setVisibleAt(id, false);
  }
  /** Pose character `ci` under `base` (root transform) and show it. */
  write(ci: number, pose: Pose, base: THREE.Matrix4) {
    const c = this.chars[ci];
    const posed = applyHold(pose, c.holds);
    if (c.scale !== 1) sizedBase.makeScale(c.scale, c.scale, c.scale).premultiply(base);
    else sizedBase.copy(base);
    const J = solveJoints(posed, sizedBase, this.joints);
    const ids = this.instances[ci];
    const top = this.cast.manifest.chars[c.id]?.skirtTop ?? 0.12;
    const stride = Math.min(1.2, Math.abs(posed.hipL - posed.hipR));
    for (let k = 0; k < PIECES.length; k++) {
      const id = ids[k];
      if (id < 0) continue;
      const pid = PIECES[k];
      const jm = J[PIECE_JOINT[pid]];
      if (pid === "eyes") {
        // Blink: squash the eyes (and lash line) about the eye line.
        pm.makeTranslation(0, EYE_Y, 0)
          .multiply(tmpM.makeScale(1, Math.max(0.1, posed.eyes), 1))
          .multiply(tmpM.makeTranslation(0, -EYE_Y, 0))
          .premultiply(jm);
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
          .premultiply(jm);
      } else pm.copy(jm);
      this.mesh.setMatrixAt(id, pm);
      if (!this.shown[ci]) this.mesh.setVisibleAt(id, true);
    }
    this.shown[ci] = 1;
  }
  characterAt(instanceId: number) {
    return this.owner[instanceId] ?? -1;
  }
  dispose() {
    this.mesh.dispose();
    this.palette.dispose();
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
