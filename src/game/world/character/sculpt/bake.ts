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
import { restPose, solveJoints, makeJoints, SK, JOINTS } from "../skeleton";
import { buildFigure, PIECE_JOINT, type Figure, type PieceId } from "./figure";
import { evalOps, pieceBounds, pad, SLOT, type Hit, type Mat, type V3 } from "./sdf";
import { cutByLabel, decimate, decimateLabeled, dropIslands, project, surfaceNets, type LabMesh, type RawMesh } from "./mesher";
import { appendMesh, brows, ears, emptyMesh, eyes, glasses, headSkin, mouth, vertexNormals, type AttrMesh, type MouthKind } from "./head";
import { hairMesh, type HairSeg } from "./hair";

const DEFAULT = { shirt: "#6f8670", pants: "#3a4547", skin: "#efc5a0", hair: "#3e3632", shoe: "#efe2c8", hat: "#e0b86d", band: "#b0573a" };
export const PLAYER_IDS = { hat: "player:hat", bare: "player:bare" } as const;

const TARGET: Record<string, [number, number]> = {
  head: [1000, 260], eyes: [0, 0], chest: [1050, 240], pelvis: [300, 80], skirt: [480, 120],
  upper: [190, 40], fore: [300, 64], thigh: [170, 38], shin: [160, 34], foot: [170, 36], mouth: [0, 0],
};
const CELL: Record<string, number> = {
  head: 0.005, eyes: 0.0032, chest: 0.0056, pelvis: 0.007, skirt: 0.007, upper: 0.006, fore: 0.005, thigh: 0.008, shin: 0.008, foot: 0.0055, mouth: 0.003,
};
const base = (id: PieceId) => (id.startsWith("mouth") ? "mouth" : id === "pointR" ? "fore" : id.replace(/[LR]$/, ""));
/** Pieces drawn instead of another (talking mouths, the pointing hand). */
const alternate = (id: PieceId) => (id.startsWith("mouth") && id !== "mouth0") || id === "pointR";
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
/** BAKE_FAST=1: coarser grid for quick previews (not for shipping). */
const FAST = env.BAKE_FAST ? 1.5 : 1;

export type Shape = { pos: Uint16Array; nrm: Int8Array; a: Uint8Array; b: Uint8Array; idx: Uint16Array; bb: number[] };
export type CharManifest = { p: Partial<Record<PieceId, [number, number]>>; skirtTop: number };
export type BakePart = { keys: string[]; shapes: [Shape, Shape][]; chars: Record<string, { p: Partial<Record<PieceId, number>>; skirtTop: number }> };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Every character the bake covers (player looks first, then villagers). */
export function castList(only?: string[]) {
  let chars: { id: string; outfit: Outfit }[] = [
    { id: PLAYER_IDS.hat, outfit: outfitFromPalette({ ...DEFAULT, hasHat: true }) },
    { id: PLAYER_IDS.bare, outfit: outfitFromPalette({ ...DEFAULT, hasHat: false }) },
    ...villagers.map((v) => ({ id: v.id, outfit: outfitFor(v) })),
  ];
  if (only?.length) chars = chars.filter((c) => only.includes(c.id));
  return chars;
}

/** Bake a subset of the cast into deduplicated shapes (keyed by content). */
export function bakePart(ids: string[], log: (s: string) => void = console.log): BakePart {
  const chars = castList(ids);
  const rest = solveJoints(restPose(), new THREE.Matrix4(), makeJoints());
  const inv = Object.fromEntries(Object.entries(rest).map(([k, m]) => [k, m.clone().invert()])) as Record<string, THREE.Matrix4>;
  const part: BakePart = { keys: [], shapes: [], chars: {} };
  const cache = new Map<string, number>();
  const v3 = new THREE.Vector3();
  const only = env.BAKE_PIECES?.split(",");
  let t0 = Date.now();
  for (const { id, outfit } of chars) {
    const fig = buildFigure(outfit);
    const entries = Object.entries(fig.pieces) as [PieceId, NonNullable<Figure["pieces"][PieceId]>][];
    // Whole-figure field in character space (for AO).
    const global = (p: V3) => {
      let d = 1e9;
      for (const [pid, piece] of entries) {
        if (!piece.ops.length) continue;
        const j = PIECE_JOINT[pid];
        v3.set(p[0], p[1], p[2]).applyMatrix4(inv[j]);
        d = Math.min(d, evalOps(piece.ops, [v3.x, v3.y, v3.z], null) * (j === "head" ? SK.headScale : 1));
      }
      v3.set(p[0], p[1], p[2]).applyMatrix4(inv.head);
      d = Math.min(d, evalOps(fig.headSkin, [v3.x, v3.y, v3.z], null) * SK.headScale);
      if (fig.hairAO.length) d = Math.min(d, evalOps(fig.hairAO, [v3.x, v3.y, v3.z], null) * SK.headScale);
      return d;
    };
    part.chars[id] = { p: {}, skirtTop: fig.skirtTop };
    const plan = budgetPlan(fig, entries);
    const meshAll = (adjOnly: boolean) => {
      for (const [pid, piece] of entries) {
        if (only && !only.includes(base(pid)) && !only.includes(pid)) continue;
        const adj = ADJUSTABLE.has(base(pid));
        if (adjOnly && !adj) continue;
        const sc: [number, number] = adj ? plan.scale : [1, 1];
        const lv: [number, number] = pid === "head" ? plan.hair : [0, 0];
        const key = pieceKey(pid, piece.ops, fig) + (adj ? `@${sc[0].toFixed(3)},${sc[1].toFixed(3)},${plan.midCell.toFixed(2)}` : "") + (pid === "head" ? `#${lv.join(",")}` : "");
        let idx = cache.get(key);
        if (idx === undefined) {
          const lods = meshPiece(pid, piece.ops, fig, rest[PIECE_JOINT[pid]], global, sc, lv, adj ? plan.midCell : 1.9);
          for (const m of lods) toRest(pid, m, rest);
          idx = part.shapes.length;
          part.shapes.push(lods.map(finalize) as [Shape, Shape]);
          part.keys.push(key);
          cache.set(key, idx);
        }
        part.chars[id].p[pid] = idx;
      }
    };
    meshAll(false);
    // Enforce the budget exactly: shrink the unique pieces until it fits.
    for (let attempt = 0; attempt < 5 && !only; attempt++) {
      let over = false;
      for (const lod of [0, 1]) {
        let total = 0, adjT = 0;
        for (const [pid, i] of Object.entries(part.chars[id].p) as [PieceId, number][]) {
          if (alternate(pid)) continue;
          const t = part.shapes[i][lod].idx.length / 3;
          total += t;
          if (ADJUSTABLE.has(base(pid))) adjT += t;
        }
        if (total > (lod ? 2500 : 9000)) {
          over = true;
          plan.scale[lod] *= Math.max(0.1, (BUDGET[lod] - (total - adjT)) / Math.max(1, adjT)) * 0.95;
          // Coarser grid for the mid unique pieces when decimation stalls.
          if (lod && attempt > 0) plan.midCell *= 1.3;
        }
      }
      if (!over) break;
      meshAll(true);
    }
    log(`${id}: ${entries.length} pieces, ${part.shapes.length} shapes so far (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    t0 = Date.now();
  }
  return part;
}

/** Per-character budgets: hero ≤ 9k and mid ≤ 2.5k triangles. Analytic
 * parts (face, hair) and shared limbs are fixed; the unique pieces (chest,
 * pelvis, skirt, hat/ears) scale down to fit what is left. */
const BUDGET = [8900, 2450];
const ADJUSTABLE = new Set(["chest", "pelvis", "skirt", "head"]);
function budgetPlan(fig: Figure, entries: [PieceId, { ops: unknown[] }][]): { scale: [number, number]; hair: [number, number]; midCell: number } {
  const scale: [number, number] = [1, 1], hair: [number, number] = [0, 0];
  for (const lod of [0, 1]) {
    const hi = lod === 0;
    let fixed = 0, adj = 0;
    const tris = (m: AttrMesh) => m.tri.length / 3;
    fixed += tris(headSkin(fig.HC, hi ? 22 : 10, hi ? 30 : 14, () => ({ slotB: 0, mix: 0 })));
    fixed += tris(brows(fig.HC, 0, 0, hi)) + tris(eyes(fig.HC, fig.face.eye, fig.face.flick, hi, fig.face.lashes, fig.face.lid)) + tris(mouth(fig.HC, fig.face.expr, hi));
    if (fig.glasses) fixed += tris(glasses(fig.HC, fig.face.eye, fig.glasses.slot, fig.glasses.sun, hi));
    if (fig.ears) fixed += tris(ears(fig.HC, hi));
    for (const [pid, piece] of entries) {
      if (!piece.ops.length || pid.startsWith("mouth") || pid === "eyes" || pid === "pointR") continue;
      const t = TARGET[base(pid)][lod];
      if (ADJUSTABLE.has(base(pid))) adj += t;
      else fixed += t;
    }
    // The finest hair that leaves the unique pieces at least ~55%.
    let hairT = 0;
    if (fig.hairPlan)
      for (let lv = 0; lv < 3; lv++) {
        hair[lod] = lv;
        hairT = tris(hairMesh(fig.hairPlan, hi, fig.hatDist, lv).mesh);
        if (fixed + hairT + adj * 0.55 <= BUDGET[lod]) break;
      }
    scale[lod] = Math.max(0.3, Math.min(1, (BUDGET[lod] - fixed - hairT) / Math.max(1, adj)));
  }
  return { scale, hair, midCell: 1.9 };
}

function pieceKey(pid: PieceId, ops: unknown, fig: Figure) {
  if (pid.startsWith("mouth")) return pid + mouthKind(pid, fig);
  if (pid === "eyes") return pid + JSON.stringify([fig.face.eye, fig.face.flick, fig.face.lashes, fig.face.lid]);
  return pid + JSON.stringify(ops) + (pid === "head" ? JSON.stringify(fig.face) + JSON.stringify(fig.glasses ?? null) + JSON.stringify(fig.hairPlan ? [fig.hairPlan.clumps, fig.hairPlan.cap, fig.hairPlan.flow, fig.hairPlan.hood, fig.hairPlan.coils] : null) + (fig.ears ? "E" : "") : "");
}
const mouthKind = (pid: PieceId, fig: Figure): MouthKind => (pid === "mouth0" ? fig.face.expr : (["talk1", "talk2", "talk3"] as const)[+pid.slice(5) - 1]);

/** Merge baked parts (from workers) and pack the binary. */
export function packParts(parts: BakePart[]) {
  const shapes: Shape[] = [];
  const at = new Map<string, [number, number]>();
  const manifest: Record<string, CharManifest> = {};
  for (const part of parts) {
    // Shapes left behind by budget retries are not shipped.
    const used = new Set<number>();
    for (const c of Object.values(part.chars)) for (const i of Object.values(c.p)) used.add(i as number);
    const local = part.keys.map((k, i) => {
      if (!used.has(i)) return [-1, -1] as [number, number];
      let ids = at.get(k);
      if (!ids) {
        shapes.push(part.shapes[i][0], part.shapes[i][1]);
        ids = [shapes.length - 2, shapes.length - 1];
        at.set(k, ids);
      }
      return ids;
    });
    for (const [id, c] of Object.entries(part.chars)) {
      manifest[id] = { p: {}, skirtTop: c.skirtTop };
      for (const [pid, i] of Object.entries(c.p)) manifest[id].p[pid as PieceId] = local[i as number];
    }
  }
  // Keep the cast order stable (player first).
  const order = castList().map((c) => c.id).filter((id) => manifest[id]);
  return pack(shapes, Object.fromEntries(order.map((id) => [id, manifest[id]])));
}

export function bake(log: (s: string) => void = console.log, only?: string[]) {
  return packParts([bakePart(castList(only).map((c) => c.id), log)]);
}

function meshPiece(pid: PieceId, ops: Parameters<typeof evalOps>[0], fig: Figure, restM: THREE.Matrix4, global: (p: V3) => number, scale: [number, number] = [1, 1], hairLv: [number, number] = [0, 0], midCell = 1.9): [AttrMesh, AttrMesh] {
  const kind = base(pid);
  const ctx = { pid, fig, restM, global };
  const lods: [AttrMesh, AttrMesh] = [emptyMesh(), emptyMesh()];
  if (ops.length) {
    const h = CELL[kind] * FAST;
    const bb = pad(pieceBounds({ ops }), h * 4);
    const f = (x: number, y: number, z: number) => evalOps(ops, [x, y, z], null);
    const [ht, mt] = TARGET[kind];
    const isCloth = (s: number) => s >= SLOT.top && s <= SLOT.outerTrim;
    // Error weights: keep hands, hair locks and the face front; spend less
    // on broad cloth.
    const weight = (x: number, y: number, z: number) => {
      if (kind === "fore" && y < -SK.foreArm + 0.01) return 4;
      if (kind === "head") return z > 0.05 && y < fig.HC[1] + 0.25 ? 3 : 1.6;
      return 1;
    };
    // Materials by value: every surface node maps to a label.
    const mats: Mat[] = [];
    const matIds = new Map<string, number>();
    const hit: Hit = { d: 0, m: null };
    const labelAt = (x: number, y: number, z: number) => {
      evalOps(ops, [x, y, z], hit);
      const m = hit.m!;
      const k = `${m.slot}|${m.rough}|${m.metal ?? 0}|${m.paint ?? ""}`;
      let id = matIds.get(k);
      if (id === undefined) { id = mats.length; mats.push(m); matIds.set(k, id); }
      return id;
    };
    // Each LOD is meshed on its own grid (the mid one coarser). The dense
    // mesh is cut along its colour borders, then decimated with the borders
    // as feature lines, so every face keeps one flat colour and the borders
    // stay clean lines at any budget.
    const meshes = ([[h, Math.round(ht * scale[0])], [h * midCell, Math.round(mt * scale[1])]] as const).map(([cell, target], lod) => {
      const raw = surfaceNets(f, bb.min, bb.max, cell);
      project(f, raw.pos, cell * 0.5, 1);
      // Mid LOD budgets are too small for border lines (regions would shrink
      // onto them): plain geometric decimation, then one flat material per
      // face, sampled at its centre (borders follow triangle edges).
      if (lod) return midLabeled(raw, target, (x, y, z) => weight(x, y, z), labelAt);
      const vlab = new Int32Array(raw.pos.length / 3);
      for (let i = 0; i < vlab.length; i++) vlab[i] = labelAt(raw.pos[i * 3], raw.pos[i * 3 + 1], raw.pos[i * 3 + 2]);
      const cut = cutByLabel(raw, vlab, labelAt);
      // Specks smaller than a few triangles cannot be drawn cleanly.
      dropIslands(cut, 2.5e-5);
      const cloth = new Uint8Array(cut.pos.length / 3);
      for (let t = 0; t < cut.lab.length; t++) if (isCloth(mats[cut.lab[t]].slot)) for (let c = 0; c < 3; c++) cloth[cut.tri[t * 3 + c]] = 1;
      const w2 = (x: number, y: number, z: number, i: number) => weight(x, y, z) * (cloth[i] ? 0.6 : 1);
      const out = cut.tri.length / 3 > target ? decimateLabeled(cut, target, w2) : cut;
      if (env.BAKE_DEBUG) console.log(`  ${pid}: raw ${raw.tri.length / 3} → ${out.tri.length / 3}`);
      return out;
    });
    meshes.forEach((m, lod) => appendMesh(lods[lod], sdfAttributes(ctx, m, mats, ops, lod ? h * midCell : h, lod)));
  }
  const HC = fig.HC;
  for (const lod of [0, 1]) {
    const hi = lod === 0;
    const parts: AttrMesh[] = [];
    let ao = true;
    if (pid === "head") {
      const paint = (p: V3) => {
        let bl = 0;
        for (const c of fig.cheeks) bl = Math.max(bl, smooth(0.1, 0.0, Math.hypot(p[0] - c[0], (p[1] - c[1]) * 1.3, p[2] - c[2])));
        const m = fig.mouth;
        const lip = smooth(0.05, 0.015, Math.hypot((p[0] - m[0]) * 0.75, (p[1] - m[1]) * 1.6, p[2] - m[2]));
        // Painted light: nose tip, cheekbones, forehead and chin catch light.
        const rel: V3 = [p[0] - HC[0], p[1] - HC[1], p[2] - HC[2]];
        const nose = Math.exp(-(((rel[0]) / 0.03) ** 2 + ((rel[1] + 0.135) / 0.03) ** 2)) * smooth(0.3, 0.36, rel[2]);
        const cheek = Math.exp(-(((Math.abs(rel[0]) - 0.17) / 0.06) ** 2 + ((rel[1] + 0.1) / 0.04) ** 2)) * smooth(0.2, 0.3, rel[2]);
        const brow = Math.exp(-(((rel[0]) / 0.1) ** 2 + ((rel[1] - 0.18) / 0.06) ** 2)) * smooth(0.25, 0.32, rel[2]);
        const light = Math.min(1, nose * 1.0 + cheek * 0.7 + brow * 0.5);
        return lip * 0.3 > bl ? { slotB: SLOT.lip, mix: lip * 0.3, light } : { slotB: SLOT.blush, mix: bl * 0.8, light };
      };
      parts.push(headSkin(HC, hi ? 22 : 10, hi ? 30 : 14, paint));
      parts.push(brows(HC, fig.face.browLift, fig.face.browRight, hi));
      if (fig.hairPlan) parts.push(hairMesh(fig.hairPlan, hi, fig.hatDist, hairLv[lod]).mesh);
      if (fig.glasses) parts.push(glasses(HC, fig.face.eye, fig.glasses.slot, fig.glasses.sun, hi));
      if (fig.ears) parts.push(ears(HC, hi));
    } else if (pid === "eyes") {
      parts.push(eyes(HC, fig.face.eye, fig.face.flick, hi, fig.face.lashes, fig.face.lid));
      ao = false;
    } else if (pid.startsWith("mouth")) {
      parts.push(mouth(HC, mouthKind(pid, fig), hi));
      ao = false;
    }
    for (const m of parts) {
      if (ao) bakeShade(ctx, m, lod);
      appendMesh(lods[lod], m);
    }
  }
  return lods;
}

/**
 * Move a piece from its bone frame into the character's rest space and add
 * joint blending: vertices near a joint take a second bone (rigB.z = joint
 * index, rigB.w = weight) so limbs bend smoothly instead of hinging like a
 * doll. At the joint plane both sides take the average transform.
 */
type Blend = { bone: number; at: V3; axis: V3; r: number };
function toRest(pid: PieceId, m: AttrMesh, rest: Record<string, THREE.Matrix4>) {
  const restM = rest[PIECE_JOINT[pid]];
  const nm = new THREE.Matrix3().getNormalMatrix(restM);
  const P = (j: string) => new THREE.Vector3().setFromMatrixPosition(rest[j]);
  const blends: Blend[] = [];
  const jb = (bone: string, at: THREE.Vector3, toward: THREE.Vector3, r: number) => {
    const ax = toward.clone().sub(at).normalize();
    blends.push({ bone: JOINTS.indexOf(bone as never), at: [at.x, at.y, at.z], axis: [ax.x, ax.y, ax.z], r });
  };
  const side = pid.endsWith("L") ? "L" : "R";
  const kind = pid === "pointR" ? "fore" : pid.replace(/[LR]$/, "");
  switch (kind) {
    case "upper": jb("chest", P(`shoulder${side}`), P(`elbow${side}`), 0.05); jb(`elbow${side}`, P(`elbow${side}`), P(`shoulder${side}`), 0.055); break;
    case "fore": jb(`shoulder${side}`, P(`elbow${side}`), P(`hand${side}`), 0.055); break;
    case "thigh": jb("pelvis", P(`hip${side}`).add(new THREE.Vector3(0, 0.03, 0)), P(`knee${side}`), 0.07); jb(`knee${side}`, P(`knee${side}`), P(`hip${side}`), 0.065); break;
    case "shin": jb(`hip${side}`, P(`knee${side}`), P(`ankle${side}`), 0.065); jb(`ankle${side}`, P(`ankle${side}`), P(`knee${side}`), 0.05); break;
    case "foot": jb(`knee${side}`, P(`ankle${side}`), P(`ankle${side}`).add(new THREE.Vector3(0, -1, 0)), 0.04); break;
    case "chest": {
      const waist = P("chest").add(new THREE.Vector3(0, -0.06, 0));
      jb("pelvis", waist, P("neck"), 0.08);
      jb("head", P("head").add(new THREE.Vector3(0, -0.03, 0)), P("chest"), 0.06);
      break;
    }
    case "pelvis": {
      const waist = P("chest").add(new THREE.Vector3(0, -0.06, 0));
      jb("chest", waist, P("pelvis").add(new THREE.Vector3(0, -1, 0)), 0.08);
      break;
    }
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < m.pos.length / 3; i++) {
    v.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]).applyMatrix4(restM);
    m.pos[i * 3] = v.x; m.pos[i * 3 + 1] = v.y; m.pos[i * 3 + 2] = v.z;
    let best = 0, bone = -1;
    for (const b of blends) {
      // Signed distance into this piece's own side of the joint.
      const sd = (v.x - b.at[0]) * b.axis[0] + (v.y - b.at[1]) * b.axis[1] + (v.z - b.at[2]) * b.axis[2];
      const w = Math.max(0, Math.min(1, 0.5 - sd / (2 * b.r)));
      const ws = w * w * (3 - 2 * w);
      if (ws > best) { best = ws; bone = b.bone; }
    }
    v.set(m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]).applyMatrix3(nm).normalize();
    m.nrm[i * 3] = v.x; m.nrm[i * 3 + 1] = v.y; m.nrm[i * 3 + 2] = v.z;
    const slot = m.a[i * 4];
    if (blends.length && slot !== SLOT.hair && slot !== SLOT.iris && !env.BAKE_NOSKIN) {
      m.b[i * 4 + 2] = bone >= 0 && best > 0.004 ? bone : 255;
      m.b[i * 4 + 3] = Math.round(best * 255);
    }
  }
}

type Ctx = { pid: PieceId; fig: Figure; restM: THREE.Matrix4; global: (p: V3) => number };
const pc = new THREE.Vector3(), nc = new THREE.Vector3();
/** Baked AO (whole figure) × top-down light gradient, into rigA.w. */
function shadeAt(ctx: Ctx, p: V3, n: V3, lod: number) {
  const nm = new THREE.Matrix3().getNormalMatrix(ctx.restM);
  pc.set(p[0], p[1], p[2]).applyMatrix4(ctx.restM);
  nc.set(n[0], n[1], n[2]).applyMatrix3(nm).normalize();
  let occ = 0;
  const H = [0.01, 0.024, 0.045, 0.075, 0.12], W = [1, 0.85, 0.65, 0.45, 0.3];
  // The mid mesh's big triangles would smear small creases: broad AO only.
  for (let s = lod ? 2 : 0; s < H.length; s++) {
    const g = ctx.global([pc.x + nc.x * H[s], pc.y + nc.y * H[s], pc.z + nc.z * H[s]]);
    occ += (W[s] * Math.max(0, H[s] - g)) / H[s];
  }
  // Painted look: lighter at the head and shoulders, darker toward the feet.
  return Math.max(0.3, 1 - (lod ? 0.5 : 0.36) * occ) * (0.74 + 0.26 * smooth(0.0, 1.75, pc.y));
}
function bakeShade(ctx: Ctx, m: AttrMesh, lod: number) {
  for (let i = 0; i < m.pos.length / 3; i++) {
    const p: V3 = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
    const n: V3 = [m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]];
    // Skin AO is softened (vinyl-smooth faces); decals keep their own shade.
    const slot = m.a[i * 4];
    const sh = slot === SLOT.skin ? 0.35 + 0.65 * Math.max(0.55, shadeAt(ctx, p, n, lod)) : slot === SLOT.hair ? shadeAt(ctx, p, n, lod) : Math.max(0.85, shadeAt(ctx, p, n, lod));
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

/** Mid LOD: geometric decimation, then a flat material per face. */
function midLabeled(raw: RawMesh, target: number, weight: (x: number, y: number, z: number) => number, labelAt: (x: number, y: number, z: number) => number): LabMesh {
  const m = raw.tri.length / 3 > target ? decimate(raw, [target], weight)[0] : raw;
  const lab = new Int32Array(m.tri.length / 3);
  const votes = new Map<number, number>();
  for (let t = 0; t < lab.length; t++) {
    // Majority of the centre and the three corners pulled toward it.
    votes.clear();
    const c = [0, 0, 0];
    for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) c[d] += m.pos[m.tri[t * 3 + k] * 3 + d] / 3;
    const pts = [c, ...[0, 1, 2].map((k) => [0, 1, 2].map((d) => c[d] * 0.5 + m.pos[m.tri[t * 3 + k] * 3 + d] * 0.5))];
    let best = -1, bn = 0;
    pts.forEach((p, i) => {
      const l = labelAt(p[0], p[1], p[2]);
      const n = (votes.get(l) ?? 0) + (i === 0 ? 1.5 : 1);
      votes.set(l, n);
      if (n > bn) { bn = n; best = l; }
    });
    lab[t] = best;
  }
  return { pos: m.pos, tri: m.tri, lab };
}

/** Nearest hair lock segment: root→tip parameter and strand direction. */
function hairAt(segs: HairSeg[], p: V3): { t: number; dir: V3 } {
  let best = Infinity, t = 0, dir: V3 = [0, -1, 0];
  for (const s of segs) {
    const bx = s.b[0] - s.a[0], by = s.b[1] - s.a[1], bz = s.b[2] - s.a[2];
    const l2 = bx * bx + by * by + bz * bz || 1e-9;
    const u = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * bx + (p[1] - s.a[1]) * by + (p[2] - s.a[2]) * bz) / l2));
    const d = Math.hypot(p[0] - s.a[0] - bx * u, p[1] - s.a[1] - by * u, p[2] - s.a[2] - bz * u) - (s.ra + (s.rb - s.ra) * u);
    if (d < best) {
      best = d;
      t = s.t0 + (s.t1 - s.t0) * u;
      const l = Math.sqrt(l2);
      dir = [bx / l, by / l, bz / l];
    }
  }
  // Far from any lock (the scalp cap): roots, combed downward.
  if (best > 0.03) t = 0;
  return { t, dir };
}

function sdfAttributes(ctx: Ctx, m: LabMesh, mats: Mat[], ops: Parameters<typeof evalOps>[0], h: number, lod: number): AttrMesh {
  const f = (x: number, y: number, z: number) => evalOps(ops, [x, y, z], null);
  project(f, m.pos, h * 0.4, 2);
  // Taubin smoothing removes decimation facets on bodies; the hollow hair
  // shell is too thin for it (it would sink into the skin), so not there.
  if (ctx.pid !== "head") taubin(m.pos, m.tri, lod ? 1 : 2);
  const geo: AttrMesh = { pos: Array.from(m.pos), nrm: new Array(m.pos.length).fill(0), a: [], b: [], tri: Array.from(m.tri) };
  vertexNormals(geo);
  const n = m.pos.length / 3;
  // Normals and cavity are sampled wide enough that fine relief cannot
  // alias into blotches between sparse vertices.
  const e = Math.max(h * 0.5, lod ? 0.01 : 0.006);
  const ce = lod ? 0.02 : 0.012;
  // Per welded vertex: normal (field + mesh), shade (AO, cavity) and, for
  // hair, the root→tip parameter and strand direction.
  const nrm = new Float64Array(n * 3), shadeV = new Float64Array(n);
  const hairT = new Float64Array(n), hairE = new Uint8Array(n * 2).fill(128);
  const hairV = new Uint8Array(n);
  for (let t = 0; t < m.lab.length; t++) if (mats[m.lab[t]].paint === "hair") for (let c = 0; c < 3; c++) hairV[m.tri[t * 3 + c]] = 1;
  for (let i = 0; i < n; i++) {
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    // Blend the field normal with the smoothed mesh normal (no facets,
    // no shading that disagrees with the silhouette).
    gx = (gx / gl) * 2.5 + geo.nrm[i * 3]; gy = (gy / gl) * 2.5 + geo.nrm[i * 3 + 1]; gz = (gz / gl) * 2.5 + geo.nrm[i * 3 + 2];
    const nl = Math.hypot(gx, gy, gz) || 1;
    gx /= nl; gy /= nl; gz /= nl;
    nrm[i * 3] = gx; nrm[i * 3 + 1] = gy; nrm[i * 3 + 2] = gz;
    let shade = shadeAt(ctx, [x, y, z], [gx, gy, gz], lod);
    // Cavity (darker creases, seams) and a hint of lighter convex edges.
    const lap = (f(x + ce, y, z) + f(x - ce, y, z) + f(x, y + ce, z) + f(x, y - ce, z) + f(x, y, z + ce) + f(x, y, z - ce)) / (6 * ce);
    shade *= 1 + Math.max(-0.22, Math.min(0.07, lap * 1.4));
    if (hairV[i]) {
      const hs = hairAt(ctx.fig.hair, [x, y, z]);
      hairT[i] = hs.t;
      const o = octEncode(hs.dir[0], hs.dir[1], hs.dir[2]);
      hairE[i * 2] = o[0] + 128; hairE[i * 2 + 1] = o[1] + 128;
      shade *= 0.8 + 0.2 * smooth(0, 0.5, hs.t);
    }
    shadeV[i] = shade;
  }
  // Split the vertices per material: every face is one flat colour.
  const out: AttrMesh = { pos: [], nrm: [], a: [], b: [], tri: [] };
  const ids = new Map<number, number>();
  const K = mats.length + 1;
  for (let t = 0; t < m.lab.length; t++) {
    const l = m.lab[t];
    const mat = mats[l];
    for (let c = 0; c < 3; c++) {
      const v = m.tri[t * 3 + c];
      const key = v * K + l;
      let id = ids.get(key);
      if (id === undefined) {
        id = out.pos.length / 3;
        ids.set(key, id);
        out.pos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
        out.nrm.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
        let slotB = mat.slot, mixW = 0, eu = 128, ev = 128;
        if (mat.paint === "hair") {
          // Root → tip: darker roots, lighter tips; strand direction for the
          // shader's anisotropic highlight (head frame, octahedral bytes).
          slotB = SLOT.hairLight;
          mixW = 0.08 + 0.55 * Math.pow(hairT[v], 1.3);
          eu = hairE[v * 2]; ev = hairE[v * 2 + 1];
        }
        out.a.push(mat.slot, slotB, Math.round(mixW * 255), Math.round(Math.min(1, shadeV[v]) * 255));
        out.b.push(Math.round(mat.rough * 255), Math.round((mat.metal ?? 0) * 255), eu, ev);
      }
      out.tri.push(id);
    }
  }
  return out;
}

export const QMAX = 4095;
function octEncode(x: number, y: number, z: number): [number, number] {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let u = x / l, v = y / l;
  if (z < 0) {
    const pu = u, pv = v;
    u = (1 - Math.abs(pv)) * (pu >= 0 ? 1 : -1);
    v = (1 - Math.abs(pu)) * (pv >= 0 ? 1 : -1);
  }
  return [Math.round(u * 127), Math.round(v * 127)];
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
  // 12-bit positions in the shape's box, delta-coded in first-use order and
  // zigzagged; octahedral normals (2 bytes). Byte planes are split in pack.
  const pos = new Uint16Array(n * 3), nrm = new Int8Array(n * 2), a = new Uint8Array(n * 4), b = new Uint8Array(n * 4);
  const q = new Int32Array(n * 3);
  order.forEach((v, i) => {
    for (let c = 0; c < 3; c++) {
      const span = mx[c] - mn[c] || 1;
      q[i * 3 + c] = Math.round(((m.pos[v * 3 + c] - mn[c]) / span) * QMAX);
    }
    const oct = octEncode(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]);
    nrm[i * 2] = oct[0]; nrm[i * 2 + 1] = oct[1];
    for (let c = 0; c < 4; c++) { a[i * 4 + c] = m.a[v * 4 + c]; b[i * 4 + c] = m.b[v * 4 + c]; }
  });
  for (let i = 0; i < n * 3; i++) {
    const d = i < 3 ? q[i] : q[i] - q[i - 3];
    pos[i] = d >= 0 ? d * 2 : -d * 2 - 1;
  }
  const idx = new Uint16Array(tri.length);
  let hw = 0;
  for (let i = 0; i < tri.length; i++) {
    const v = tri[i];
    idx[i] = hw - v;
    if (v === hw) hw++;
  }
  return { pos, nrm, a, b, idx, bb: [...mn, ...mx] };
}

const planes = (src: Uint16Array) => {
  const out = new Uint8Array(src.length * 2);
  for (let i = 0; i < src.length; i++) { out[i] = src[i] & 255; out[src.length + i] = src[i] >> 8; }
  return out;
};
export function pack(shapes: Shape[], chars: Record<string, unknown>) {
  let nv = 0, ni = 0;
  for (const s of shapes) { nv += s.pos.length / 3; ni += s.idx.length; }
  const pos = new Uint16Array(nv * 3), idx = new Uint16Array(ni), nrm = new Int8Array(nv * 2), a = new Uint8Array(nv * 4), b = new Uint8Array(nv * 4);
  const meta: { n: number; i: number; v0: number; i0: number; bb: number[] }[] = [];
  let v0 = 0, i0 = 0;
  for (const s of shapes) {
    const n = s.pos.length / 3;
    pos.set(s.pos, v0 * 3); nrm.set(s.nrm, v0 * 2); a.set(s.a, v0 * 4); b.set(s.b, v0 * 4); idx.set(s.idx, i0);
    meta.push({ n, i: s.idx.length, v0, i0, bb: s.bb.map((x) => +x.toFixed(5)) });
    v0 += n; i0 += s.idx.length;
  }
  const json = new TextEncoder().encode(JSON.stringify({ v: 3, q: QMAX, nv, ni, shapes: meta, chars }));
  const align = (x: number) => (x + 3) & ~3;
  const head = 8, jsonEnd = align(head + json.length);
  const offs = [jsonEnd];
  const parts = [planes(pos), planes(idx), nrm, a, b];
  for (const p of parts) offs.push(align(offs[offs.length - 1] + p.byteLength));
  const out = new Uint8Array(offs[offs.length - 1]);
  out.set([67, 72, 82, 49]); // "CHR1"
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, head);
  parts.forEach((p, k) => out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), offs[k]));
  return { bytes: out, shapes: shapes.length, vertices: nv, triangles: ni / 3 };
}
/** Re-encode an already decoded mesh (used to transcode older bakes). */
export const finalizeMesh = (m: AttrMesh) => finalize(m);
