/**
 * Offline bake: every villager's outfit (plus the player's two base looks)
 * → sculpted figure → per-piece meshes at two LODs (hero ≈7.5k, mid ≈1.5k
 * triangles per character) with baked attributes, deduplicated by shape and
 * packed into one binary (`public/characters/cast-v1.bin`).
 * Run with `node scripts/bake-characters.mjs`.
 */
import * as THREE from "three";
import { villagers } from "../../../core/npcs";
import { outfitFor } from "../cast";
import { outfitFromPalette, type Outfit } from "../outfit";
import { restPose, solveJoints, makeJoints } from "../skeleton";
import { buildFigure, PIECE_JOINT, type Figure, type PieceId } from "./figure";
import { evalOps, pieceBounds, pad, SLOT, type Hit, type V3 } from "./sdf";
import { decimate, project, surfaceNets, type RawMesh } from "./mesher";

const DEFAULT = { shirt: "#6f8670", pants: "#3a4547", skin: "#efc5a0", hair: "#3e3632", shoe: "#efe2c8", hat: "#e0b86d", band: "#b0573a" };
export const PLAYER_IDS = { hat: "player:hat", bare: "player:bare" } as const;

const TARGET: Record<string, [number, number]> = {
  head: [2800, 560], eyes: [300, 160], chest: [1200, 260], pelvis: [420, 90], skirt: [620, 120],
  upper: [250, 50], fore: [520, 100], thigh: [220, 45], shin: [200, 40], foot: [220, 45],
};
const CELL: Record<string, number> = {
  head: 0.006, eyes: 0.0032, chest: 0.0062, pelvis: 0.008, skirt: 0.007, upper: 0.0065, fore: 0.0055, thigh: 0.009, shin: 0.009, foot: 0.006,
};
const base = (id: PieceId) => id.replace(/[LR]$/, "");

type Shape = { pos: Int16Array; nrm: Int8Array; a: Uint8Array; b: Uint8Array; idx: Uint16Array; bb: number[] };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function bake(log: (s: string) => void = console.log, only?: string[]) {
  let chars: { id: string; outfit: Outfit }[] = [
    { id: PLAYER_IDS.hat, outfit: outfitFromPalette({ ...DEFAULT, hasHat: true }) },
    { id: PLAYER_IDS.bare, outfit: outfitFromPalette({ ...DEFAULT, hasHat: false }) },
    ...villagers.map((v) => ({ id: v.id, outfit: outfitFor(v) })),
  ];
  if (only?.length) chars = chars.filter((c) => only.includes(c.id));
  const rest = solveJoints(restPose(), new THREE.Matrix4(), makeJoints());
  const inv = Object.fromEntries(Object.entries(rest).map(([k, m]) => [k, m.clone().invert()])) as Record<string, THREE.Matrix4>;
  const shapes: Shape[] = [];
  const cache = new Map<string, [number, number]>();
  const manifest: Record<string, { p: Partial<Record<PieceId, [number, number]>>; skirtTop: number }> = {};
  const v3 = new THREE.Vector3();
  let t0 = Date.now();
  for (const { id, outfit } of chars) {
    const fig = buildFigure(outfit);
    const entries = Object.entries(fig.pieces) as [PieceId, NonNullable<Figure["pieces"][PieceId]>][];
    // Whole-figure field in character space (for AO).
    const global = (p: V3) => {
      let d = 1e9;
      for (const [pid, piece] of entries) {
        v3.set(p[0], p[1], p[2]).applyMatrix4(inv[PIECE_JOINT[pid]]);
        d = Math.min(d, evalOps(piece.ops, [v3.x, v3.y, v3.z], null));
      }
      return d;
    };
    manifest[id] = { p: {}, skirtTop: fig.skirtTop };
    for (const [pid, piece] of entries) {
      const key = pid + JSON.stringify(piece.ops) + JSON.stringify(fig.eyes) ;
      let ids = cache.get(key);
      if (!ids) {
        ids = meshPiece(pid, piece.ops, fig, rest[PIECE_JOINT[pid]], global, shapes);
        cache.set(key, ids);
      }
      manifest[id].p[pid] = ids;
    }
    log(`${id}: ${entries.length} pieces, ${shapes.length} shapes so far (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    t0 = Date.now();
  }
  return pack(shapes, manifest);
}

function meshPiece(
  pid: PieceId,
  ops: Parameters<typeof evalOps>[0],
  fig: Figure,
  restM: THREE.Matrix4,
  global: (p: V3) => number,
  shapes: Shape[],
): [number, number] {
  const kind = base(pid);
  const h = CELL[kind];
  const bb = pad(pieceBounds({ ops }), h * 3);
  const f = (x: number, y: number, z: number) => evalOps(ops, [x, y, z], null);
  const raw = surfaceNets(f, bb.min, bb.max, h);
  project(f, raw.pos, h * 0.5, 1);
  const [ht, mt] = TARGET[kind];
  // Faces and hands keep more detail.
  const HC = fig.eyes[0].c[1] + 0.065;
  const weight = (x: number, y: number, z: number) => {
    if (kind === "head" && z > 0.1 && y > HC - 0.32 && y < HC + 0.16 && Math.abs(x) < 0.33) return 16;
    if (kind === "eyes") return 6;
    if (kind === "fore" && y < -0.2) return 4;
    return 1;
  };
  // Material per raw vertex (colour borders survive decimation).
  const hit: Hit = { d: 0, m: null };
  const slots = new Int32Array(raw.pos.length / 3);
  for (let i = 0; i < slots.length; i++) {
    evalOps(ops, [raw.pos[i * 3], raw.pos[i * 3 + 1], raw.pos[i * 3 + 2]], hit);
    slots[i] = hit.m!.slot === SLOT.iris ? SLOT.iris : hit.m!.slot;
  }
  const meshes = raw.tri.length / 3 > ht ? decimate(raw, [ht, mt], weight, slots) : [raw, ...decimate(raw, [mt], weight, slots)];
  if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BAKE_DEBUG) console.log(`  ${pid}: raw ${raw.tri.length / 3} → ${meshes.map((m) => m.tri.length / 3).join(" / ")}`);
  return meshes.map((m, lod) => {
    shapes.push(attributes(pid, m, ops, fig, restM, global, h, lod));
    return shapes.length - 1;
  }) as [number, number];
}

function attributes(
  pid: PieceId,
  m: RawMesh,
  ops: Parameters<typeof evalOps>[0],
  fig: Figure,
  restM: THREE.Matrix4,
  global: (p: V3) => number,
  h: number,
  lod = 0,
): Shape {
  const f = (x: number, y: number, z: number) => evalOps(ops, [x, y, z], null);
  project(f, m.pos, h * 0.4, 2);
  const n = m.pos.length / 3;
  const nrm = new Int8Array(n * 3), a = new Uint8Array(n * 4), b = new Uint8Array(n * 4);
  const hit: Hit = { d: 0, m: null };
  const e = h * 0.5;
  const pc = new THREE.Vector3(), nc = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(restM);
  const HCy = fig.eyes[0].c[1] + 0.065;
  for (let i = 0; i < n; i++) {
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    nrm[i * 3] = Math.round(gx * 127); nrm[i * 3 + 1] = Math.round(gy * 127); nrm[i * 3 + 2] = Math.round(gz * 127);
    evalOps(ops, [x, y, z], hit);
    const mat = hit.m!;
    const slotA = mat.slot;
    let slotB = mat.slot, mixW = 0;
    // Baked AO from the whole figure (chin, armpits, hair underside, hems).
    pc.set(x, y, z).applyMatrix4(restM);
    nc.set(gx, gy, gz).applyMatrix3(nm).normalize();
    let occ = 0;
    const H = [0.012, 0.028, 0.05, 0.08, 0.12], W = [1, 0.8, 0.6, 0.45, 0.3];
    // The mid mesh's big triangles would smear small creases: broad AO only.
    for (let s = lod ? 2 : 0; s < H.length; s++) {
      const g = global([pc.x + nc.x * H[s], pc.y + nc.y * H[s], pc.z + nc.z * H[s]]);
      occ += (W[s] * Math.max(0, H[s] - g)) / H[s];
    }
    let shade = Math.max(0.3, 1 - (lod ? 0.5 : 0.36) * occ);
    // Gentle top-to-bottom gradient over the figure.
    shade *= 0.8 + 0.2 * smooth(0.05, 1.7, pc.y);
    let eu = 128, ev = 128;
    if (mat.paint === "face" || (pid === "head" && mat.slot === SLOT.skin)) {
      let bl = 0;
      for (const c of fig.cheeks) bl = Math.max(bl, smooth(0.095, 0.0, Math.hypot(x - c[0], (y - c[1]) * 1.25, z - c[2])));
      if (bl > 0.01) { slotB = SLOT.blush; mixW = bl; }
      const m = fig.mouth;
      const lip = smooth(0.045, 0.012, Math.hypot((x - m[0]) * 0.75, (y - m[1]) * 1.6, z - m[2]));
      if (lip > bl) { slotB = SLOT.lip; mixW = lip * 0.75; }
    }
    if (mat.paint === "hair") {
      const band = smooth(0.3, 0.55, gy) * (1 - smooth(0.72, 0.92, gy));
      slotB = SLOT.hairLight; mixW = band * 0.7;
      shade *= 0.82 + 0.18 * smooth(HCy - 0.35, HCy + 0.3, y);
    }
    if (mat.paint === "eye") {
      const eye = fig.eyes[x > 0 ? 0 : 1];
      // Eye-local coordinates (undo the eye's turn about y).
      const dx = x - eye.c[0], dz = z - eye.c[2];
      const lx = dx * Math.cos(eye.rot) - dz * Math.sin(eye.rot);
      const u = lx / eye.r[0] - eye.iris[0];
      const v = (y - eye.c[1]) / eye.r[1] - eye.iris[1];
      eu = Math.round(Math.max(0, Math.min(255, (u * 0.5 + 0.5) * 255)));
      ev = Math.round(Math.max(0, Math.min(255, (v * 0.5 + 0.5) * 255)));
      shade = Math.max(shade, 0.85);
    }
    a[i * 4] = slotA; a[i * 4 + 1] = slotB; a[i * 4 + 2] = Math.round(mixW * 255); a[i * 4 + 3] = Math.round(Math.min(1, shade) * 255);
    b[i * 4] = Math.round(mat.rough * 255); b[i * 4 + 1] = Math.round((mat.metal ?? 0) * 255); b[i * 4 + 2] = eu; b[i * 4 + 3] = ev;
  }
  // Quantise positions to the shape's bounds.
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n * 3; i++) { mn[i % 3] = Math.min(mn[i % 3], m.pos[i]); mx[i % 3] = Math.max(mx[i % 3], m.pos[i]); }
  const pos = new Int16Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    const c = i % 3, span = mx[c] - mn[c] || 1;
    pos[i] = Math.round(((m.pos[i] - mn[c]) / span) * 65534 - 32767);
  }
  // Delta-code positions (vertices are in first-use order, so neighbours
  // are close) and indices as "high-watermark − index": both gzip far better.
  for (let i = n * 3 - 1; i >= 3; i--) pos[i] = (pos[i] - pos[i - 3]) | 0;
  const idx = new Uint16Array(m.tri.length);
  let hw = 0;
  for (let i = 0; i < m.tri.length; i++) {
    const v = m.tri[i];
    idx[i] = hw - v;
    if (v === hw) hw++;
  }
  return { pos, nrm, a, b, idx, bb: [...mn, ...mx] };
}

function pack(shapes: Shape[], chars: Record<string, unknown>) {
  let nv = 0, ni = 0;
  for (const s of shapes) { nv += s.pos.length / 3; ni += s.idx.length; }
  const pos = new Int16Array(nv * 3), idx = new Uint16Array(ni), nrm = new Int8Array(nv * 3), a = new Uint8Array(nv * 4), b = new Uint8Array(nv * 4);
  const meta: { n: number; i: number; v0: number; i0: number; bb: number[] }[] = [];
  let v0 = 0, i0 = 0;
  for (const s of shapes) {
    const n = s.pos.length / 3;
    pos.set(s.pos, v0 * 3); nrm.set(s.nrm, v0 * 3); a.set(s.a, v0 * 4); b.set(s.b, v0 * 4); idx.set(s.idx, i0);
    meta.push({ n, i: s.idx.length, v0, i0, bb: s.bb.map((x) => +x.toFixed(5)) });
    v0 += n; i0 += s.idx.length;
  }
  const json = new TextEncoder().encode(JSON.stringify({ v: 2, nv, ni, shapes: meta, chars }));
  const align = (x: number) => (x + 3) & ~3;
  const head = 8, jsonEnd = align(head + json.length);
  const offs = [jsonEnd];
  const parts = [pos, idx, nrm, a, b];
  for (const p of parts) offs.push(align(offs[offs.length - 1] + p.byteLength));
  const out = new Uint8Array(offs[offs.length - 1]);
  out.set([67, 72, 82, 49]); // "CHR1"
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, head);
  parts.forEach((p, k) => out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), offs[k]));
  const tris = ni / 3;
  return { bytes: out, shapes: shapes.length, vertices: nv, triangles: tris };
}
