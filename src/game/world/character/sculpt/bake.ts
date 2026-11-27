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
import { appendMesh, brows, emptyMesh, eyes, headSkin, mouth, vertexNormals, type AttrMesh } from "./head";

const DEFAULT = { shirt: "#6f8670", pants: "#3a4547", skin: "#efc5a0", hair: "#3e3632", shoe: "#efe2c8", hat: "#e0b86d", band: "#b0573a" };
export const PLAYER_IDS = { hat: "player:hat", bare: "player:bare" } as const;

const TARGET: Record<string, [number, number]> = {
  head: [1200, 300], eyes: [0, 0], chest: [950, 230], pelvis: [340, 80], skirt: [540, 120],
  upper: [210, 50], fore: [380, 95], thigh: [190, 45], shin: [170, 40], foot: [190, 45],
};
const CELL: Record<string, number> = {
  head: 0.005, eyes: 0.0032, chest: 0.0062, pelvis: 0.008, skirt: 0.007, upper: 0.0065, fore: 0.0055, thigh: 0.009, shin: 0.009, foot: 0.006,
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
        if (!piece.ops.length) continue;
        v3.set(p[0], p[1], p[2]).applyMatrix4(inv[PIECE_JOINT[pid]]);
        d = Math.min(d, evalOps(piece.ops, [v3.x, v3.y, v3.z], null));
      }
      v3.set(p[0], p[1], p[2]).applyMatrix4(inv.head);
      d = Math.min(d, evalOps(fig.headSkin, [v3.x, v3.y, v3.z], null));
      return d;
    };
    manifest[id] = { p: {}, skirtTop: fig.skirtTop };
    for (const [pid, piece] of entries) {
      const key = pid + JSON.stringify(piece.ops) + (pid === "head" || pid === "eyes" ? JSON.stringify(fig.face) : "");
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
  const ctx = { pid, fig, restM, global };
  const lods: AttrMesh[] = [emptyMesh(), emptyMesh()];
  if (ops.length) {
    const h = CELL[kind];
    const bb = pad(pieceBounds({ ops }), h * 3);
    const f = (x: number, y: number, z: number) => evalOps(ops, [x, y, z], null);
    const raw = surfaceNets(f, bb.min, bb.max, h);
    project(f, raw.pos, h * 0.5, 1);
    const [ht, mt] = TARGET[kind];
    const weight = (x: number, y: number, z: number) => {
      if (kind === "fore" && y < -0.2) return 4;
      if (kind === "head" && z > 0.0 && y < fig.HC[1] + 0.25) return 3;
      return 1;
    };
    // Material per raw vertex (colour borders survive decimation).
    const hit: Hit = { d: 0, m: null };
    const slots = new Int32Array(raw.pos.length / 3);
    for (let i = 0; i < slots.length; i++) {
      evalOps(ops, [raw.pos[i * 3], raw.pos[i * 3 + 1], raw.pos[i * 3 + 2]], hit);
      slots[i] = hit.m!.slot;
    }
    const meshes = raw.tri.length / 3 > ht ? decimate(raw, [ht, mt], weight, slots) : [raw, ...decimate(raw, [mt], weight, slots)];
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BAKE_DEBUG)
      console.log(`  ${pid}: raw ${raw.tri.length / 3} → ${meshes.map((m) => m.tri.length / 3).join(" / ")}`);
    meshes.forEach((m, lod) => appendMesh(lods[lod], sdfAttributes(ctx, m, ops, h, lod)));
  }
  if (pid === "head" || pid === "eyes") {
    const HC = fig.HC;
    for (const lod of [0, 1]) {
      const hi = lod === 0;
      const parts: AttrMesh[] = [];
      if (pid === "head") {
        const paint = (p: V3) => {
          let bl = 0;
          for (const c of fig.cheeks) bl = Math.max(bl, smooth(0.1, 0.0, Math.hypot(p[0] - c[0], (p[1] - c[1]) * 1.3, p[2] - c[2])));
          const m = fig.mouth;
          const lip = smooth(0.05, 0.015, Math.hypot((p[0] - m[0]) * 0.75, (p[1] - m[1]) * 1.6, p[2] - m[2]));
          return lip > bl ? { slotB: SLOT.lip, mix: lip * 0.55 } : { slotB: SLOT.blush, mix: bl * 0.85 };
        };
        parts.push(headSkin(HC, hi ? 30 : 13, hi ? 38 : 16, paint));
        parts.push(brows(HC, fig.face.browLift, fig.face.browRight, hi));
        parts.push(mouth(HC, fig.face.expr, hi));
      } else parts.push(eyes(HC, fig.face.eye, fig.face.flick, hi));
      for (const m of parts) {
        bakeShade(ctx, m, lod);
        appendMesh(lods[lod], m);
      }
    }
  }
  return lods.map((m) => {
    shapes.push(finalize(m));
    return shapes.length - 1;
  }) as [number, number];
}

type Ctx = { pid: PieceId; fig: Figure; restM: THREE.Matrix4; global: (p: V3) => number };
const pc = new THREE.Vector3(), nc = new THREE.Vector3();
/** Baked AO (whole figure) × height gradient, into rigA.w (keeps paint). */
function shadeAt(ctx: Ctx, p: V3, n: V3, lod: number) {
  const nm = new THREE.Matrix3().getNormalMatrix(ctx.restM);
  pc.set(p[0], p[1], p[2]).applyMatrix4(ctx.restM);
  nc.set(n[0], n[1], n[2]).applyMatrix3(nm).normalize();
  let occ = 0;
  const H = [0.012, 0.028, 0.05, 0.08, 0.12], W = [1, 0.8, 0.6, 0.45, 0.3];
  // The mid mesh's big triangles would smear small creases: broad AO only.
  for (let s = lod ? 2 : 0; s < H.length; s++) {
    const g = ctx.global([pc.x + nc.x * H[s], pc.y + nc.y * H[s], pc.z + nc.z * H[s]]);
    occ += (W[s] * Math.max(0, H[s] - g)) / H[s];
  }
  return Math.max(0.3, 1 - (lod ? 0.5 : 0.34) * occ) * (0.8 + 0.2 * smooth(0.05, 1.7, pc.y));
}
function bakeShade(ctx: Ctx, m: AttrMesh, lod: number) {
  for (let i = 0; i < m.pos.length / 3; i++) {
    const p: V3 = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
    const n: V3 = [m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]];
    // Skin AO is softened (vinyl-smooth faces); decals keep their own shade.
    const sh = m.a[i * 4] === SLOT.skin ? 0.35 + 0.65 * Math.max(0.55, shadeAt(ctx, p, n, lod)) : Math.max(0.85, shadeAt(ctx, p, n, lod));
    m.a[i * 4 + 3] = Math.round(Math.min(1, sh * (m.a[i * 4 + 3] / 255)) * 255);
  }
}

/** Taubin smoothing (no shrink): removes decimation facets. */
function taubin(pos: Float64Array, tri: Uint32Array, iters: number) {
  const n = pos.length / 3;
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < tri.length; t += 3)
    for (let c = 0; c < 3; c++) {
      nb[tri[t + c]].add(tri[t + ((c + 1) % 3)]);
      nb[tri[t + c]].add(tri[t + ((c + 2) % 3)]);
    }
  const tmp = new Float64Array(pos.length);
  for (let it = 0; it < iters * 2; it++) {
    const k = it % 2 ? -0.53 : 0.5;
    for (let v = 0; v < n; v++) {
      let x = 0, y = 0, z = 0;
      for (const u of nb[v]) { x += pos[u * 3]; y += pos[u * 3 + 1]; z += pos[u * 3 + 2]; }
      const c = nb[v].size || 1;
      tmp[v * 3] = pos[v * 3] + k * (x / c - pos[v * 3]);
      tmp[v * 3 + 1] = pos[v * 3 + 1] + k * (y / c - pos[v * 3 + 1]);
      tmp[v * 3 + 2] = pos[v * 3 + 2] + k * (z / c - pos[v * 3 + 2]);
    }
    pos.set(tmp);
  }
}

function sdfAttributes(ctx: Ctx, m: RawMesh, ops: Parameters<typeof evalOps>[0], h: number, lod: number): AttrMesh {
  const f = (x: number, y: number, z: number) => evalOps(ops, [x, y, z], null);
  project(f, m.pos, h * 0.4, 2);
  taubin(m.pos, m.tri, lod ? 1 : 2);
  const out: AttrMesh = { pos: Array.from(m.pos), nrm: new Array(m.pos.length).fill(0), a: [], b: [], tri: Array.from(m.tri) };
  vertexNormals(out);
  const n = m.pos.length / 3;
  const hit: Hit = { d: 0, m: null };
  const e = h * 0.5;
  const HCy = ctx.fig.HC[1];
  for (let i = 0; i < n; i++) {
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    // Blend the field normal with the smoothed mesh normal (no facets,
    // no shading that disagrees with the silhouette).
    gx = gx / gl + out.nrm[i * 3]; gy = gy / gl + out.nrm[i * 3 + 1]; gz = gz / gl + out.nrm[i * 3 + 2];
    const nl = Math.hypot(gx, gy, gz) || 1;
    gx /= nl; gy /= nl; gz /= nl;
    out.nrm[i * 3] = gx; out.nrm[i * 3 + 1] = gy; out.nrm[i * 3 + 2] = gz;
    evalOps(ops, [x, y, z], hit);
    const mat = hit.m!;
    let slotB = mat.slot, mixW = 0;
    let shade = shadeAt(ctx, [x, y, z], [gx, gy, gz], lod);
    if (mat.paint === "hair") {
      const band = smooth(0.3, 0.55, gy) * (1 - smooth(0.72, 0.92, gy));
      slotB = SLOT.hairLight; mixW = band * 0.7;
      shade *= 0.82 + 0.18 * smooth(HCy - 0.35, HCy + 0.3, y);
    }
    out.a.push(mat.slot, slotB, Math.round(mixW * 255), Math.round(Math.min(1, shade) * 255));
    out.b.push(Math.round(mat.rough * 255), Math.round((mat.metal ?? 0) * 255), 128, 128);
  }
  return out;
}

/** Quantise and delta-code a mesh for the binary. */
function finalize(m: AttrMesh): Shape {
  const n = m.pos.length / 3;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n * 3; i++) { mn[i % 3] = Math.min(mn[i % 3], m.pos[i]); mx[i % 3] = Math.max(mx[i % 3], m.pos[i]); }
  if (!n) { mn.fill(0); mx.fill(1); }
  // Reorder vertices by first use so deltas stay small.
  const order: number[] = [], remap = new Int32Array(n).fill(-1);
  const tri = m.tri.map((v) => {
    if (remap[v] < 0) { remap[v] = order.length; order.push(v); }
    return remap[v];
  });
  for (let v = 0; v < n; v++) if (remap[v] < 0) { remap[v] = order.length; order.push(v); }
  const pos = new Int16Array(n * 3), nrm = new Int8Array(n * 3), a = new Uint8Array(n * 4), b = new Uint8Array(n * 4);
  order.forEach((v, i) => {
    for (let c = 0; c < 3; c++) {
      const span = mx[c] - mn[c] || 1;
      pos[i * 3 + c] = Math.round(((m.pos[v * 3 + c] - mn[c]) / span) * 65534 - 32767);
      nrm[i * 3 + c] = Math.round(Math.max(-1, Math.min(1, m.nrm[v * 3 + c])) * 127);
    }
    for (let c = 0; c < 4; c++) { a[i * 4 + c] = m.a[v * 4 + c]; b[i * 4 + c] = m.b[v * 4 + c]; }
  });
  for (let i = n * 3 - 1; i >= 3; i--) pos[i] = (pos[i] - pos[i - 3]) | 0;
  const idx = new Uint16Array(tri.length);
  let hw = 0;
  for (let i = 0; i < tri.length; i++) {
    const v = tri[i];
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
