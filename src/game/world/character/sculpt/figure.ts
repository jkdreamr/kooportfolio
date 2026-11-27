/**
 * Outfit → sculpted figure: one SDF piece per bone, modelled in that bone's
 * local frame (skeleton.ts rest pose), so baked meshes pose rigidly with the
 * existing gait. The body is anatomical but stylised (neck, sloped
 * shoulders, ribcage, tapered waist, hips, muscled tapered limbs, hands with
 * a thumb and grouped fingers, chunky shoes); garments are offset shells
 * with construction (collars, plackets, buttons, pockets, cuffs, hems,
 * seams, waist and elbow wrinkles, belts, layered pieces, flared skirts and
 * coat tails). Hair is sculpted lock by lock (hair.ts). Colours are palette
 * slots.
 */
import { SK, type Joint } from "../skeleton";
import type { Expression, Outfit } from "../outfit";
import type { EyeSpec } from "./head";
import { buildHair, hairAO, hairMesh, type HairBuild, type HairSeg } from "./hair";
import { dist, evalOps, SLOT, type Mat, type Node, type Op, type Piece, type V3 } from "./sdf";

export type PieceId =
  | "pelvis" | "chest" | "head" | "eyes"
  | "upperL" | "upperR" | "foreL" | "foreR"
  | "thighL" | "thighR" | "shinL" | "shinR" | "footL" | "footR"
  | "skirt"
  | "mouth0" | "mouth1" | "mouth2" | "mouth3";
export const MOUTHS = ["mouth0", "mouth1", "mouth2", "mouth3"] as const;
export const PIECE_JOINT: Record<PieceId, Joint> = {
  pelvis: "pelvis", chest: "chest", head: "head", eyes: "head",
  upperL: "shoulderL", upperR: "shoulderR", foreL: "elbowL", foreR: "elbowR",
  thighL: "hipL", thighR: "hipR", shinL: "kneeL", shinR: "kneeR",
  footL: "ankleL", footR: "ankleR", skirt: "pelvis",
  mouth0: "head", mouth1: "head", mouth2: "head", mouth3: "head",
};
/** Head-frame eye line (the eyes piece scales about it to blink). */
export const EYE_Y = SK.headCenter - 0.065;
export type Figure = {
  pieces: Partial<Record<PieceId, Piece>>;
  /** Pelvis-frame origin of the skirt piece (flare pivot). */
  skirtTop: number;
  /** Head centre (head frame) and the AO stand-in for the analytic skin. */
  HC: V3;
  headSkin: Op[];
  glasses?: { slot: number; sun: boolean };
  face: { expr: Expression; flick: boolean; browLift: number; browRight: number; eye: EyeSpec; lashes: number };
  /** Blush centres (head frame). */
  cheeks: V3[];
  /** Lip tint centre (head frame). */
  mouth: V3;
  /** Hair lock segments (head frame) for the root→tip paint and strand direction. */
  hair: HairSeg[];
  /** Explicit hair geometry plan, headwear distance (culls covered hair),
   * and the hair's SDF stand-in for AO (head frame). */
  hairPlan?: HairBuild;
  hatDist: (p: V3) => number;
  hairAO: Op[];
};

// --- node helpers ----------------------------------------------------------------
const M = {
  skin: { slot: SLOT.skin, rough: 0.5 } as Mat,
  fab: (slot: number, rough = 0.86): Mat => ({ slot, rough }),
  leather: (slot: number): Mat => ({ slot, rough: 0.36, metal: 0.02 }),
  metal: (slot: number = SLOT.metal): Mat => ({ slot, rough: 0.22, metal: 0.9 }),
  gloss: (slot: number, rough = 0.3): Mat => ({ slot, rough }),
};
const sph = (c: V3, r: number, m?: Mat): Node => ({ t: "sph", c, r, m });
const ell = (c: V3, r: V3, m?: Mat, rot?: V3): Node => ({ t: "ell", c, r, m, rot });
/** Details are never thinner than the mesh grid can resolve (no slivers). */
const MINR = 0.0068;
const cap = (a: V3, b: V3, r: number, m?: Mat): Node => ({ t: "cap", a, b, r: Math.max(MINR, r), m });
const cone = (a: V3, b: V3, ra: number, rb: number, m?: Mat): Node => ({ t: "cone", a, b, ra, rb, m });
const box = (c: V3, h: V3, r: number, m?: Mat, rot?: V3): Node => {
  const hh: V3 = [Math.max(MINR, h[0]), Math.max(MINR, h[1]), Math.max(MINR, h[2])];
  return { t: "box", c, h: hh, r: Math.min(r, Math.min(...hh) * 0.9), m, rot };
};
const tor = (c: V3, R: number, r: number, m?: Mat, rot?: V3, sx?: number, sz?: number): Node => ({ t: "tor", c, R, r, m, rot, sx, sz });
const cyl = (c: V3, h: number, r: number, rr: number, m?: Mat, rot?: V3): Node => ({ t: "cyl", c, h, r, rr, m, rot });
const plane = (n: V3, o: number): Node => ({ t: "plane", n, o });
const not = (n: Node): Node => ({ t: "not", n });
const grp = (ops: Op[], m?: Mat): Node => ({ t: "grp", ops, m });
const add = (n: Node, k = 0): Op => ({ op: "add", k, n });
const sub = (n: Node, k = 0): Op => ({ op: "sub", k, n });
const shell = (of: Node, d: number, m: Mat, clip: Node[] = [], disp?: Node["disp"]): Node => ({ t: "shell", of, d, clip, m, disp });
/** Keep y above / below a height (clip regions). */
const above = (y: number) => plane([0, -1, 0], -y);
const below = (y: number) => plane([0, 1, 0], y);
const chain = (pts: V3[], r: number, m: Mat): Op[] => pts.slice(1).map((p, i) => add(cap(pts[i], p, r, m), 0.004));
const r3 = (v: V3): V3 => [+v[0].toFixed(4), +v[1].toFixed(4), +v[2].toFixed(4)];
/** Point on a node's surface at (x, y), marching along z from the front
 * (side = 1) or the back (side = −1), lifted off it by `lift`. */
function surf(n: Node, x: number, y: number, side = 1, lift = 0): V3 {
  let lo = 0, hi = 0.6 * side;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (dist(n, [x, y, mid]) > lift) hi = mid;
    else lo = mid;
  }
  return r3([x, y, (lo + hi) / 2]);
}
function extraColorSlot(o: Outfit, kind: string, second = false) {
  const i = (o.extras ?? []).findIndex((e) => e.kind === kind);
  return SLOT.accent + Math.max(0, Math.min(3, i)) * 2 + (second ? 1 : 0);
}
const has = (o: Outfit, kind: string) => (o.extras ?? []).some((e) => e.kind === kind);
const folds = (amp: number, c: V3 = [0, 0, 0], freq = 7): Node["disp"] => ({ kind: "folds", amp, freq, c });
const band = (amp: number, y0: number, y1: number, freq = 70, c: V3 = [0, 0, 0]): Node["disp"] => ({ kind: "band", amp, freq, y0, y1, c });

export function buildFigure(o: Outfit): Figure {
  const w = o.build?.width ?? 1;
  const aw = 0.6 + w * 0.4;
  const pieces: Figure["pieces"] = {};
  const top = o.top, bottom = o.bottom, outer = o.outer;
  const outerSleeves = !!outer && ["jacket", "blazer", "labcoat", "durumagi", "cardigan"].includes(outer.kind);
  const torsoOuter = !!outer && ["jacket", "blazer", "labcoat", "durumagi", "cardigan", "vest"].includes(outer.kind);
  const sleeves = outer
    ? outer.kind === "vest" || outer.kind === "apron" || outer.kind === "overalls"
      ? (top.sleeves ?? (top.kind === "tank" || top.kind === "jersey" ? "none" : top.kind === "tee" || top.kind === "polo" ? "short" : "long"))
      : "long"
    : (top.sleeves ?? (top.kind === "tank" || top.kind === "jersey" ? "none" : top.kind === "tee" || top.kind === "polo" ? "short" : "long"));
  const sleeveSlot = outerSleeves ? SLOT.outer : SLOT.top;
  const cuffSlot = outerSleeves ? SLOT.outerTrim : SLOT.topTrim;
  const longHem = bottom.kind === "chima" || bottom.kind === "long-skirt";
  const skirtish = bottom.kind === "skirt" || longHem;
  const longCoat = outer?.kind === "durumagi";
  const handMat: Mat = o.gloves ? M.fab(SLOT.glove, 0.7) : M.skin;
  const belted = !!o.belt;

  // ---------------------------------------------------------------- chest
  // Chest frame: waist at y≈0, ribcage, chest, sloped shoulders, neck.
  const torso = grp([
    add(ell([0, 0.0, 0.0], [0.128 * w, 0.1, 0.098 * w], M.skin)),
    add(ell([0, 0.19, 0.004], [0.156 * w, 0.16, 0.116 * w], M.skin), 0.07),
    add(ell([0, 0.288, 0.012], [0.168 * w, 0.082, 0.108 * w], M.skin), 0.06),
    add(ell([0, -0.085, 0.004], [0.137 * w, 0.075, 0.102 * w], M.skin), 0.06),
    add(sph([0.183, 0.328, -0.01], 0.058, M.skin), 0.06),
    add(sph([-0.183, 0.328, -0.01], 0.058, M.skin), 0.06),
    add(cap([0.045, 0.392, -0.018], [0.165, 0.345, -0.012], 0.04, M.skin), 0.05),
    add(cap([-0.045, 0.392, -0.018], [-0.165, 0.345, -0.012], 0.04, M.skin), 0.05),
  ], M.skin);
  const neck = cap([0, 0.33, -0.012], [0, 0.53, 0.012], 0.05, M.skin);
  const chest: Op[] = [add(torso), add(neck, 0.05), add(sph([0, 0.375, -0.012], 0.062, M.skin), 0.04)];
  const front = (x: number, y: number, lift = 0) => surf(torso, x, y, 1, lift);
  const backAt = (x: number, y: number, lift = 0) => surf(torso, x, y, -1, lift);
  // Top garment: shell over the torso with a neckline, armholes and hem.
  const hemY = belted && !outer ? -0.07 : -0.15;
  const neckHole: Node[] = [];
  if (top.kind === "tank" || top.kind === "jersey") neckHole.push(not(ell([0, 0.43, 0.1], [0.075, 0.13, 0.11])));
  else if (top.kind === "turtleneck") neckHole.push(above(0.6));
  else neckHole.push(not(cap([0, 0.3, -0.01], [0, 0.6, 0.015], 0.064)), not(ell([0, 0.41, 0.07], [0.058, 0.04, 0.06])));
  if (sleeves === "none") for (const s of [1, -1]) neckHole.push(not(ell([s * 0.2, 0.3, -0.008], [0.06, 0.085, 0.075])));
  const topClip = [...neckHole, above(hemY)];
  if (top.kind === "jeogori") topClip.push(above(0.15));
  const topD = top.kind === "jeogori" ? 0.022 : top.kind === "sweater" ? 0.02 : 0.014;
  const knit = top.kind === "sweater" ? { kind: "rib" as const, amp: 0.0018, freq: 60, c: [0, 0, 0] as V3 } : undefined;
  chest.push(add(shell(torso, topD, M.fab(SLOT.top, top.kind === "jersey" || top.kind === "polo" ? 0.7 : 0.86), topClip, knit ?? band(0.0024, hemY + 0.005, hemY + 0.12, 60)), 0.003));
  const hemRing = (slot: number, y: number, r = 0.012, extra = 0) => {
    const rx = 0.132 * w + topD + extra + (y < -0.1 ? 0.005 : 0);
    chest.push(add(tor([0, y, 0.004], rx, r, M.fab(slot), undefined, 1, 0.102 / 0.134), 0.004));
  };
  const collarBand = (slot: number, r = 0.013) => chest.push(add(tor([0, 0.405, 0.0], 0.06, r, M.fab(slot), [-0.32, 0, 0]), 0.004));
  const collarPoints = (slot: number) => {
    for (const s of [1, -1]) chest.push(add(box([s * 0.042, 0.385, 0.075], [0.034, 0.006, 0.028], 0.005, M.fab(slot), [1.05, 0, s * 0.62]), 0.003));
  };
  const placket = (slot: number, y0: number, y1: number, buttons: number[]) => {
    const a = front(0, y0, topD + 0.002), b = front(0, y1, topD + 0.002);
    chest.push(add(cap(a, b, 0.009, M.fab(slot)), 0.003));
    for (const y of buttons) chest.push(add(sph(front(0, y, topD + 0.006), 0.0085, M.gloss(SLOT.white, 0.25)), 0.001));
  };
  const pocket = (x: number, y: number, slot: number, lift: number, flap = true) => {
    const p = front(x, y, lift + 0.004);
    chest.push(add(box(p, [0.032, 0.034, 0.005], 0.004, M.fab(slot)), 0.002));
    if (flap) chest.push(add(box([p[0], p[1] + 0.03, p[2] + 0.003], [0.035, 0.011, 0.005], 0.004, M.fab(slot === SLOT.top ? SLOT.topTrim : slot)), 0.001));
  };
  switch (top.kind) {
    case "tee":
    case "tank":
      chest.push(add(tor([0, 0.405, 0.012], 0.066, 0.009, M.fab(SLOT.topTrim), [-0.38, 0, 0]), 0.004));
      if (!outer) hemRing(SLOT.top, hemY + 0.004, 0.009);
      break;
    case "jersey":
      chest.push(add(tor([0, 0.39, 0.075], 0.062, 0.01, M.fab(SLOT.topTrim), [-1.0, 0, 0], 1, 1.45), 0.004));
      for (const s of [1, -1]) chest.push(add(tor([s * 0.198, 0.3, -0.008], 0.07, 0.009, M.fab(SLOT.topTrim), [0, 0, s * 1.4], 1, 1.2), 0.003));
      hemRing(SLOT.topTrim, hemY + 0.004, 0.01);
      break;
    case "turtleneck":
      chest.push(add({ ...cyl([0, 0.43, 0.004], 0.062, 0.066, 0.022, M.fab(SLOT.top)), disp: { kind: "rib", amp: 0.0025, freq: 22, c: [0, 0, 0.004] } }, 0.008));
      chest.push(add({ ...tor([0, 0.47, 0.006], 0.06, 0.016, M.fab(SLOT.top)), disp: { kind: "rib", amp: 0.002, freq: 22, c: [0, 0, 0.004] } }, 0.006));
      break;
    case "sweater":
      chest.push(add({ ...tor([0, 0.405, 0.01], 0.066, 0.013, M.fab(SLOT.topTrim), [-0.36, 0, 0]), disp: { kind: "rib", amp: 0.002, freq: 26, c: [0, 0.4, 0] } }, 0.004));
      chest.push(add({ ...tor([0, hemY + 0.02, 0.004], 0.134 * w + 0.022, 0.017, M.fab(SLOT.topTrim), undefined, 1, 0.102 / 0.134), disp: { kind: "rib", amp: 0.002, freq: 44, c: [0, 0, 0] } }, 0.004));
      break;
    case "hoodie": {
      // Hood folded on the back, kangaroo pocket, drawstrings, ribbed hem.
      chest.push(add(ell([0, 0.405, -0.11], [0.13, 0.085, 0.085], M.fab(SLOT.top)), 0.04));
      chest.push(add(tor([0, 0.41, -0.005], 0.078, 0.017, M.fab(SLOT.top), [-0.45, 0, 0]), 0.012));
      const kp = front(0, 0.0, topD + 0.006);
      chest.push(add(box(kp, [0.095 * w, 0.055, 0.008], 0.012, M.fab(SLOT.top)), 0.004));
      chest.push(add(box([kp[0], kp[1] + 0.05, kp[2] + 0.003], [0.08 * w, 0.006, 0.007], 0.004, M.fab(SLOT.topTrim)), 0.002));
      for (const s of [1, -1]) {
        const a = front(s * 0.03, 0.37, topD + 0.006), b = front(s * 0.034, 0.25, topD + 0.007);
        chest.push(add(cap(a, b, 0.005, M.fab(SLOT.white)), 0.002));
        chest.push(add(sph(b, 0.008, M.gloss(SLOT.white)), 0.001));
      }
      chest.push(add({ ...tor([0, hemY + 0.018, 0.004], 0.134 * w + 0.02, 0.017, M.fab(SLOT.topTrim), undefined, 1, 0.102 / 0.134), disp: { kind: "rib", amp: 0.0018, freq: 44, c: [0, 0, 0] } }, 0.004));
      break;
    }
    case "shirt":
    case "polo":
    case "chef": {
      const covered = torsoOuter;
      if (!covered || outer?.kind === "vest") {
        collarBand(SLOT.top);
        collarPoints(top.kind === "chef" ? SLOT.white : SLOT.top);
      }
      if (top.kind === "chef") {
        // Double-breasted with two button rows.
        for (const y of [0.3, 0.2, 0.1, 0.0]) for (const s of [1, -1]) chest.push(add(sph(front(s * 0.058, y, topD + 0.005), 0.011, M.gloss(SLOT.white, 0.25)), 0.001));
        chest.push(add(cap(front(0.07, 0.37, topD + 0.002), front(0.075, hemY + 0.03, topD + 0.002), 0.007, M.fab(SLOT.top)), 0.003));
        hemRing(SLOT.top, hemY + 0.004, 0.01);
      } else if (!covered) {
        placket(SLOT.top, 0.38, top.kind === "polo" ? 0.27 : hemY + 0.02, top.kind === "polo" ? [0.355, 0.3] : [0.33, 0.235, 0.14, 0.045, -0.045].filter((y) => y > hemY + 0.03));
        if (top.kind === "shirt") pocket(0.075 * w, 0.235, SLOT.top, topD);
        hemRing(SLOT.top, hemY + 0.004, 0.009);
      }
      break;
    }
    case "jeogori":
      chest.push(add(tor([0, 0.165, 0.004], 0.162 * w + 0.022, 0.016, M.fab(SLOT.top), undefined, 1, 0.75), 0.006));
      // Dongjeong: white collar strip crossing left over right.
      chest.push(add(cap(front(0.06, 0.4, 0.03), front(-0.06, 0.24, topD + 0.012), 0.014, M.fab(SLOT.white)), 0.004));
      chest.push(add(cap(front(0.07, 0.395, 0.03), front(-0.02, 0.3, topD + 0.016), 0.008, M.fab(SLOT.topTrim)), 0.003));
      break;
  }
  // Outer layer.
  if (outer) {
    const vWedge = not(grp([
      add(plane([1, -0.3, 0], 0.03)),
      { op: "int", k: 0, n: plane([-1, -0.3, 0], 0.03) },
      { op: "int", k: 0, n: plane([0, 0, -1], -0.04) },
    ]));
    const armholes = [1, -1].map((s) => not(ell([s * 0.2, 0.3, -0.008], [0.065, 0.09, 0.08])));
    const O = M.fab(SLOT.outer, outer.kind === "blazer" ? 0.78 : 0.86);
    const neckOpen = not(cap([0, 0.3, -0.01], [0, 0.6, 0.015], 0.07));
    const oHem = -0.17;
    switch (outer.kind) {
      case "jacket":
      case "blazer":
      case "labcoat":
      case "cardigan": {
        const d = outer.kind === "cardigan" ? 0.024 : 0.03;
        const knitC = outer.kind === "cardigan" ? { kind: "rib" as const, amp: 0.0016, freq: 56, c: [0, 0, 0] as V3 } : band(0.003, oHem, oHem + 0.13, 55);
        chest.push(add(shell(torso, d, O, [vWedge, above(oHem), neckOpen], knitC), 0.003));
        // Lapels / front edges.
        for (const s of [1, -1]) {
          const lapel = outer.kind === "blazer" || outer.kind === "labcoat" || outer.kind === "jacket";
          const a = front(s * 0.03, oHem + 0.03, d + 0.004), b = front(s * 0.085, 0.37, d + 0.004);
          chest.push(add(cap(a, b, lapel ? 0.011 : 0.008, M.fab(outer.kind === "jacket" ? SLOT.outerTrim : SLOT.outer)), 0.004));
          if (lapel && outer.kind !== "jacket") chest.push(add(box(front(s * 0.075, 0.31, d + 0.008), [0.03, 0.05, 0.005], 0.006, O, [0.15, s * 0.3, s * 0.45]), 0.004));
        }
        if (outer.kind === "jacket") {
          // Zip, ribbed collar and hem.
          chest.push(add(cap(front(0.012, oHem + 0.02, d + 0.006), front(0.03, 0.36, d + 0.006), 0.005, M.metal(SLOT.white)), 0.002));
          chest.push(add(tor([0, 0.405, -0.002], 0.07, 0.017, M.fab(SLOT.outerTrim), [-0.3, 0, 0]), 0.006));
          hemRing(SLOT.outerTrim, oHem + 0.012, 0.014, d - topD + 0.004);
          for (const s of [1, -1]) chest.push(add(box(front(s * 0.085 * w, 0.02, d + 0.004), [0.004, 0.04, 0.004], 0.003, M.fab(SLOT.outerTrim), [0, 0, s * 0.25]), 0.002));
        } else {
          hemRing(SLOT.outer, oHem + 0.01, 0.01, d - topD);
        }
        if (outer.kind === "cardigan") for (const y of [0.22, 0.12, 0.02, -0.08]) chest.push(add(sph(front(0.035, y, d + 0.007), 0.0095, M.gloss(SLOT.outerTrim, 0.3)), 0.001));
        if (outer.kind === "blazer") for (const y of [0.06, -0.04]) chest.push(add(sph(front(0.034, y, d + 0.006), 0.009, M.gloss(SLOT.outerTrim, 0.3)), 0.001));
        if (outer.kind === "blazer" || outer.kind === "labcoat") {
          // Breast pocket and hip pocket flaps.
          chest.push(add(box(front(0.085 * w, 0.25, d + 0.004), [0.03, 0.006, 0.006], 0.004, O), 0.002));
          for (const s of [1, -1]) chest.push(add(box(front(s * 0.085 * w, -0.08, d + 0.004), [0.04, 0.014, 0.006], 0.005, O), 0.002));
        }
        if (outer.kind === "labcoat") chest.push(add(cap(front(0.09 * w, 0.24, d + 0.008), front(0.093 * w, 0.29, d + 0.012), 0.006, M.gloss(SLOT.accent + 7)), 0.001));
        break;
      }
      case "vest":
        chest.push(add(shell(torso, 0.024, O, [vWedge, ...armholes, above(oHem + 0.02), neckOpen], folds(0.0015)), 0.003));
        for (const s of [1, -1]) {
          chest.push(add(cap(front(s * 0.03, oHem + 0.04, 0.03), front(s * 0.08, 0.37, 0.03), 0.008, M.fab(SLOT.outerTrim)), 0.003));
          chest.push(add(box(front(s * 0.085 * w, 0.08, 0.032), [0.036, 0.034, 0.006], 0.008, O), 0.003));
          chest.push(add(box(front(s * 0.085 * w, 0.112, 0.036), [0.038, 0.012, 0.006], 0.005, M.fab(SLOT.outerTrim)), 0.002));
          chest.push(add(box(front(s * 0.085 * w, 0.24, 0.032), [0.03, 0.026, 0.006], 0.007, O), 0.003));
        }
        hemRing(SLOT.outerTrim, oHem + 0.03, 0.011, 0.012);
        break;
      case "durumagi":
        chest.push(add(shell(torso, 0.028, O, [above(oHem), neckOpen], folds(0.002)), 0.003));
        chest.push(add(cap(front(0.06, 0.405, 0.034), front(-0.07, 0.2, 0.034), 0.015, M.fab(SLOT.white)), 0.004));
        break;
      case "apron": {
        // Bib apron: bib, neck strap, waist ties.
        chest.push(add(shell(torso, 0.022, O, [plane([0, 0, -1], -0.025), plane([1, 0, 0], 0.11 * w), plane([-1, 0, 0], 0.11 * w), below(0.27), above(-0.1)]), 0.003));
        for (const s of [1, -1]) chest.push(add(cap(front(s * 0.09, 0.26, 0.022), [s * 0.05, 0.43, 0.015], 0.008, O), 0.003));
        chest.push(add(box(front(0, 0.12, 0.026), [0.05, 0.035, 0.005], 0.006, M.fab(SLOT.outerTrim)), 0.002));
        break;
      }
      case "overalls": {
        chest.push(add(shell(torso, 0.02, O, [plane([0, 0, -1], -0.03), plane([1, 0, 0], 0.1 * w), plane([-1, 0, 0], 0.1 * w), below(0.24), above(-0.2)], folds(0.0015)), 0.003));
        for (const s of [1, -1]) {
          const bibTop = front(s * 0.08, 0.235, 0.022);
          chest.push(add(cap(bibTop, [s * 0.1, 0.4, 0.0], 0.012, O), 0.003));
          chest.push(add(cap([s * 0.1, 0.4, 0.0], backAt(s * 0.07, 0.15, 0.016), 0.012, O), 0.003));
          chest.push(add(cyl(front(s * 0.08, 0.225, 0.03), 0.004, 0.013, 0.003, M.metal(), [Math.PI / 2, 0, 0]), 0.001));
        }
        const bp = front(0, 0.13, 0.024);
        chest.push(add(box(bp, [0.05, 0.04, 0.005], 0.006, O), 0.002));
        chest.push(add(box([bp[0], bp[1] + 0.035, bp[2] + 0.002], [0.052, 0.006, 0.005], 0.003, M.fab(SLOT.outerTrim)), 0.001));
        break;
      }
    }
  }
  if (top.kind === "jeogori" || outer?.kind === "durumagi" || has(o, "goreum")) {
    const slot = has(o, "goreum") ? extraColorSlot(o, "goreum") : SLOT.topTrim;
    const bow = front(-0.05, 0.25, 0.04);
    chest.push(add(ell(bow, [0.028, 0.02, 0.016], M.gloss(slot, 0.4)), 0.006));
    chest.push(add(cap(bow, [bow[0] + 0.02, bow[1] - 0.22, bow[2] + 0.02], 0.012, M.gloss(slot, 0.4)), 0.004));
    chest.push(add(cap(bow, [bow[0] - 0.035, bow[1] - 0.18, bow[2] + 0.015], 0.011, M.gloss(slot, 0.4)), 0.004));
  }
  // Chest-mounted extras.
  const strapFront = (x: number, y: number) => front(x, y, 0.035);
  for (const e of o.extras ?? []) {
    const A = M.fab(extraColorSlot(o, e.kind)), B = M.fab(extraColorSlot(o, e.kind, true));
    switch (e.kind) {
      case "backpack": {
        const c = backAt(0, 0.19, 0.075);
        chest.push(add(box(c, [0.12 * w, 0.15, 0.06], 0.045, A), 0.008));
        chest.push(add(box([c[0], c[1] - 0.06, c[2] - 0.06], [0.085 * w, 0.06, 0.03], 0.022, A), 0.008));
        chest.push(add(box([c[0], c[1] + 0.1, c[2] - 0.035], [0.1 * w, 0.03, 0.04], 0.02, B), 0.006));
        chest.push(add(cap([c[0] - 0.06, c[1] - 0.05, c[2] - 0.091], [c[0] + 0.06, c[1] - 0.05, c[2] - 0.091], 0.004, M.metal(SLOT.white)), 0.001));
        for (const s of [1, -1]) chest.push(...chain([strapFront(s * 0.1, 0.02), strapFront(s * 0.11, 0.25), [s * 0.11, 0.39, -0.005], backAt(s * 0.1, 0.3, 0.035)], 0.013, B));
        break;
      }
      case "satchel":
      case "tote":
        chest.push(...chain([[0.12, 0.39, 0.0], strapFront(0.0, 0.2), strapFront(-0.12 * w, -0.02), [-0.16 * w, -0.1, 0.04]], 0.011, M.leather(extraColorSlot(o, e.kind, true))));
        break;
      case "lanyard":
      case "whistle": {
        const tag = front(0, 0.2, 0.03);
        for (const s of [1, -1]) chest.push(add(cap([s * 0.05, 0.4, 0.02], tag, 0.005, A), 0.002));
        if (e.kind === "lanyard") chest.push(add(box([tag[0], tag[1] - 0.035, tag[2] + 0.004], [0.028, 0.036, 0.004], 0.004, M.gloss(extraColorSlot(o, e.kind, true))), 0.002));
        else chest.push(add(cap([tag[0] - 0.012, tag[1] - 0.01, tag[2] + 0.006], [tag[0] + 0.02, tag[1] - 0.012, tag[2] + 0.014], 0.011, M.metal(SLOT.white)), 0.002));
        break;
      }
      case "number": {
        const p = front(0, 0.17, topD + 0.003), q = backAt(0, 0.19, topD + 0.003);
        chest.push(add(box(p, [0.055, 0.06, 0.004], 0.006, A), 0.002));
        chest.push(add(box([p[0], p[1], p[2] + 0.004], [0.011, 0.042, 0.003], 0.003, B), 0.001));
        chest.push(add(box(q, [0.065, 0.075, 0.004], 0.006, A), 0.002));
        break;
      }
      case "camera": {
        const c = front(0, 0.12, 0.05);
        for (const s of [1, -1]) chest.push(add(cap([s * 0.05, 0.4, 0.02], [c[0] + s * 0.05, c[1] + 0.02, c[2] - 0.01], 0.005, M.fab(SLOT.dark)), 0.002));
        chest.push(add(box(c, [0.06, 0.04, 0.027], 0.012, M.gloss(SLOT.dark, 0.35)), 0.003));
        chest.push(add(cyl([c[0] + 0.012, c[1], c[2] + 0.04], 0.022, 0.028, 0.006, M.metal(SLOT.dark), [Math.PI / 2, 0, 0]), 0.003));
        chest.push(add(cyl([c[0] + 0.012, c[1], c[2] + 0.062], 0.003, 0.02, 0.002, M.gloss(SLOT.accent + 7, 0.05), [Math.PI / 2, 0, 0]), 0.0));
        chest.push(add(box([c[0] - 0.035, c[1] + 0.045, c[2]], [0.012, 0.008, 0.01], 0.003, M.metal(SLOT.white)), 0.001));
        break;
      }
      case "scarf":
        chest.push(add({ ...tor([0, 0.41, 0.0], 0.072, 0.026, A, [-0.2, 0, 0]), disp: folds(0.003, [0, 0.41, 0], 9) }, 0.008));
        chest.push(add({ ...box(front(0.05, 0.27, topD + 0.03), [0.03, 0.1, 0.01], 0.01, A, [-0.08, 0, 0.12]), disp: band(0.002, 0.18, 0.36, 60) }, 0.008));
        chest.push(add(box(front(0.05, 0.16, topD + 0.03), [0.032, 0.012, 0.012], 0.006, B, [-0.08, 0, 0.12]), 0.003));
        break;
      case "towel":
        chest.push(add(box([0.13, 0.385, -0.01], [0.04, 0.016, 0.15], 0.014, A, [0, 0, -0.45]), 0.015));
        chest.push(add({ ...box(front(0.12 * w, 0.22, 0.03), [0.036, 0.11, 0.01], 0.01, A, [-0.1, 0, -0.15]), disp: band(0.002, 0.1, 0.34, 55) }, 0.008));
        break;
      case "rope":
        chest.push(add({ ...tor([-0.02, 0.22, 0.0], 0.17, 0.02, A, [0.1, 0, 0.85], 1, 0.75), disp: { kind: "rib", amp: 0.003, freq: 34, c: [-0.02, 0.22, 0] } }, 0.008));
        break;
      case "guitar": {
        const c = backAt(0.02, 0.08, 0.06);
        chest.push(add(grp([add(ell([c[0], c[1], c[2]], [0.13, 0.115, 0.04])), add(ell([c[0] - 0.04, c[1] + 0.14, c[2]], [0.095, 0.085, 0.04]), 0.04)], A), 0.0));
        chest.push(add(cyl([c[0] - 0.02, c[1] + 0.02, c[2] - 0.042], 0.003, 0.035, 0.002, M.gloss(SLOT.dark)), 0.0));
        chest.push(add(box([c[0] - 0.14, c[1] + 0.36, c[2]], [0.02, 0.17, 0.012], 0.006, B, [0, 0, 0.45]), 0.0));
        chest.push(...chain([[0.13, 0.39, 0.0], strapFront(0, 0.22), strapFront(-0.13 * w, 0.0)], 0.01, M.fab(SLOT.dark)));
        break;
      }
      case "roll":
        chest.push(add(cyl(backAt(-0.05, 0.25, 0.05), 0.27, 0.035, 0.008, A, [0, 0, -0.5]), 0.0));
        break;
    }
  }
  pieces.chest = { ops: chest };

  // ---------------------------------------------------------------- pelvis
  // Pelvis frame: origin 0.1 below the chest joint; hip joints at ±0.092, −0.04.
  const hips = grp([
    add(ell([0, -0.01, 0], [0.15 * w, 0.105, 0.112 * w], M.skin)),
    add(ell([0, 0.065, 0.004], [0.136 * w, 0.07, 0.1 * w], M.skin), 0.05),
    add(ell([0, -0.035, -0.035], [0.13 * w, 0.08, 0.09 * w], M.skin), 0.05),
    add(sph([0.092, -0.05, 0], 0.076, M.skin), 0.05),
    add(sph([-0.092, -0.05, 0], 0.076, M.skin), 0.05),
  ], M.skin);
  const pelvisSlot = outer?.kind === "overalls" ? SLOT.outer : SLOT.bottom;
  const pd = bottom.kind === "baji" ? 0.022 : 0.012;
  const pelvis: Op[] = [add(hips), add(shell(hips, pd, M.fab(pelvisSlot, bottom.color === "#3d5373" ? 0.8 : 0.86), [below(0.085)], folds(0.0015)), 0.003)];
  const pfront = (x: number, y: number, lift: number) => surf(hips, x, y, 1, lift);
  const pback = (x: number, y: number, lift: number) => surf(hips, x, y, -1, lift);
  const trousered = bottom.kind === "trousers" || bottom.kind === "shorts" || bottom.kind === "baji" || outer?.kind === "overalls";
  if (trousered && !longCoat) {
    // Waistband, fly seam, back pockets.
    pelvis.push(add(tor([0, 0.07, 0.004], 0.14 * w + pd, 0.011, M.fab(pelvisSlot), undefined, 1, 0.104 / 0.14), 0.003));
    if (bottom.kind !== "baji") {
      pelvis.push(add(cap(pfront(0.012, 0.05, pd + 0.002), pfront(0.016, -0.06, pd + 0.002), 0.005, M.fab(pelvisSlot)), 0.002));
      for (const s of [1, -1]) {
        const bp = pback(s * 0.065 * w, -0.0, pd + 0.004);
        pelvis.push(add(box(bp, [0.036, 0.04, 0.005], 0.008, M.fab(pelvisSlot)), 0.002));
        pelvis.push(add(cap(pfront(s * 0.07 * w, 0.06, pd + 0.002), pfront(s * 0.11 * w, -0.01, pd + 0.002), 0.004, M.fab(bottom.trim ? SLOT.bottomTrim : pelvisSlot)), 0.002));
      }
    }
  }
  if (o.belt) {
    const R = 0.142 * w + pd + 0.006;
    pelvis.push(add(tor([0, 0.062, 0.004], R, 0.016, M.leather(SLOT.leather), undefined, 1, 0.105 / 0.142), 0.004));
    const bk = pfront(0, 0.062, pd + 0.022);
    pelvis.push(add(box(bk, [0.03, 0.024, 0.008], 0.007, M.metal()), 0.003));
    pelvis.push(sub(box([bk[0], bk[1], bk[2] + 0.006], [0.016, 0.011, 0.008], 0.003), 0.002));
    pelvis.push(add(cap([bk[0] - 0.01, bk[1], bk[2] + 0.004], [bk[0] + 0.012, bk[1], bk[2] + 0.004], 0.003, M.metal()), 0.001));
    for (const s of [1, -1]) pelvis.push(add(box(pfront(s * 0.08 * w, 0.062, pd + 0.02), [0.006, 0.022, 0.004], 0.003, M.leather(SLOT.leather)), 0.001));
    if (o.belt.pouch) {
      const pp = surf(hips, 0.13 * w, 0.0, 1, 0.0);
      const c: V3 = [0.15 * w, 0.0, Math.max(0.04, pp[2] - 0.04)];
      pelvis.push(add(box(c, [0.034, 0.048, 0.03], 0.012, M.leather(SLOT.accent + 6), [0, 0.6, 0]), 0.004));
      pelvis.push(add(box([c[0] + 0.003, c[1] + 0.036, c[2] + 0.005], [0.037, 0.018, 0.033], 0.008, M.leather(SLOT.accent + 6), [0.18, 0.6, 0]), 0.002));
      pelvis.push(add(sph([c[0] + 0.022, c[1] + 0.028, c[2] + 0.028], 0.006, M.metal()), 0.001));
    }
  }
  if (outer?.kind === "apron") pelvis.push(add(tor([0, 0.07, 0.004], 0.142 * w + pd + 0.008, 0.011, M.fab(SLOT.outerTrim), undefined, 1, 0.75), 0.004));
  if (outer?.kind === "apron") pelvis.push(add(box(pback(0, 0.065, pd + 0.02), [0.03, 0.02, 0.012], 0.008, M.fab(SLOT.outerTrim)), 0.003));
  for (const e of o.extras ?? [])
    if (e.kind === "satchel" || e.kind === "tote") {
      const bag = M.leather(extraColorSlot(o, e.kind));
      const tote = e.kind === "tote";
      const c: V3 = [-0.195 * w, -0.06, 0.03];
      pelvis.push(add(box(c, tote ? [0.035, 0.11, 0.1] : [0.04, 0.08, 0.11], 0.024, bag, [0, 0, 0.08]), 0.0));
      if (!tote) {
        pelvis.push(add(box([c[0] - 0.035, c[1] + 0.035, c[2]], [0.012, 0.05, 0.114], 0.01, bag, [0, 0, 0.08]), 0.0));
        pelvis.push(add(box([c[0] - 0.046, c[1] + 0.0, c[2]], [0.005, 0.014, 0.012], 0.003, M.metal()), 0.0));
      } else pelvis.push(add(box([c[0] + 0.0, c[1] + 0.1, c[2]], [0.03, 0.015, 0.09], 0.01, M.fab(extraColorSlot(o, e.kind, true))), 0.0));
    }
  pieces.pelvis = { ops: pelvis };

  // ---------------------------------------------------------------- skirt
  let skirtTop = 0.07;
  const skirtOps: Op[] = [];
  const S = (len: number, rTop: number, rHem: number, slot: number, extra: Partial<Extract<Node, { t: "skirt" }>> = {}): Node => ({
    t: "skirt", c: [0, skirtTop, 0], len, rTop, rHem, zs: 0.82, thick: 0.016, wave: 0.014, waves: 9,
    m: M.fab(slot), disp: { kind: "folds", amp: 0.004, freq: 14, c: [0, skirtTop, 0] }, ...extra,
  });
  if (bottom.kind === "skirt") {
    skirtOps.push(add(S(0.34, 0.15 * w, 0.27 * w, SLOT.bottom, { waves: 12, wave: 0.016, disp: { kind: "folds", amp: 0.005, freq: 16, c: [0, skirtTop, 0] } })));
    skirtOps.push(add(tor([0, skirtTop - 0.012, 0], 0.15 * w + 0.004, 0.012, M.fab(SLOT.bottom), undefined, 1, 0.82), 0.004));
  }
  if (bottom.kind === "long-skirt") skirtOps.push(add(S(0.6, 0.15 * w, 0.32 * w, SLOT.bottom, { wave: 0.02 })));
  if (bottom.kind === "chima") {
    skirtTop = SK.chestUp + 0.25;
    skirtOps.push(add(S(skirtTop + SK.hip - 0.03, 0.163 * w, 0.42 * w, SLOT.bottom, { wave: 0.024, waves: 11, c: [0, skirtTop, 0], disp: { kind: "folds", amp: 0.006, freq: 15, c: [0, skirtTop, 0] } })));
    skirtOps.push(add(tor([0, skirtTop - 0.012, 0], 0.165 * w, 0.017, M.fab(SLOT.bottomTrim), undefined, 1, 0.8), 0.006));
  }
  if (outer?.kind === "durumagi") skirtOps.push(add(S(0.72, 0.162 * w, 0.31 * w, SLOT.outer, { wave: 0.012, gap: 0.12 })));
  if (outer?.kind === "labcoat") skirtOps.push(add(S(0.47, 0.165 * w, 0.25 * w, SLOT.outer, { gap: 0.32, wave: 0.006 })));
  if (outer?.kind === "apron") {
    skirtOps.push(add(S(0.44, 0.16 * w, 0.24 * w, SLOT.outer, { front: 0.95, wave: 0.008 })));
    skirtOps.push(add(box([0, skirtTop - 0.14, 0.17 * w], [0.06, 0.04, 0.008], 0.008, M.fab(SLOT.outerTrim)), 0.004));
  }
  if (bottom.trim && skirtish && bottom.kind !== "chima") {
    const len = bottom.kind === "skirt" ? 0.34 : 0.6;
    const rHem = bottom.kind === "skirt" ? 0.27 : 0.32;
    skirtOps.push(add(S(0.035, rHem * w * 0.97, rHem * w * 1.012, SLOT.bottomTrim, { wave: bottom.kind === "skirt" ? 0.016 : 0.02, waves: bottom.kind === "skirt" ? 12 : 9, c: [0, skirtTop - len + 0.03, 0] }), 0.004));
  }
  if (skirtOps.length) pieces.skirt = { ops: skirtOps };

  // ---------------------------------------------------------------- arms
  const UA = SK.upperArm, FA = SK.foreArm;
  for (const [side, s] of [["L", 1], ["R", -1]] as const) {
    const upperBody = grp([
      add(sph([s * 0.006, -0.008, -0.002], 0.064 * aw, M.skin)),
      add(cone([0, -0.02, 0], [0, -UA + 0.01, 0], 0.06 * aw, 0.048 * aw, M.skin), 0.03),
      add(ell([0, -0.12, 0.008], [0.056 * aw, 0.085, 0.057 * aw], M.skin), 0.04),
    ], M.skin);
    const upper: Op[] = [add(upperBody)];
    const wide = top.kind === "jeogori";
    const sm = M.fab(sleeveSlot);
    if (sleeves === "long") upper.push(add(shell(upperBody, wide ? 0.03 : outerSleeves ? 0.026 : 0.016, sm, [above(-UA - 0.01)], band(0.0028, -UA - 0.01, -UA + 0.08, 85)), 0.003));
    if (sleeves === "short") {
      upper.push(add(shell(upperBody, 0.016, sm, [above(-0.12)], band(0.002, -0.1, -0.02, 60)), 0.003));
      upper.push(add(tor([0, -0.115, 0.004], 0.053 * aw + 0.015, 0.01, M.fab(top.kind === "polo" || top.kind === "shirt" ? SLOT.top : SLOT.topTrim)), 0.003));
    }
    if (sleeves === "rolled") {
      upper.push(add(shell(upperBody, 0.015, sm, [above(-0.2)]), 0.003));
      upper.push(add({ ...tor([0, -0.19, 0.004], 0.048 * aw + 0.017, 0.019, sm, undefined, 1, 1.04), disp: folds(0.003, [0, -0.19, 0], 6) }, 0.005));
    }
    pieces[`upper${side}`] = { ops: upper };

    const foreBody = grp([
      add(sph([0, 0, 0], 0.048 * aw, M.skin)),
      add(cone([0, -0.01, 0], [0, -FA + 0.012, 0], 0.05 * aw, 0.033 * aw, M.skin), 0.025),
      add(ell([0, -0.065, 0.004], [0.054 * aw, 0.08, 0.05 * aw], M.skin), 0.04),
    ], M.skin);
    const fore: Op[] = [add(foreBody)];
    if (sleeves === "long") {
      const d = wide ? 0.03 : outerSleeves ? 0.022 : 0.013;
      fore.push(add(shell(foreBody, d, sm, [above(-FA + 0.03)], band(0.0028, -0.07, 0.03, 85)), 0.003));
      fore.push(add(tor([0, -FA + 0.035, 0.002], 0.032 * aw + d + 0.004, 0.011, M.fab(top.kind === "jeogori" ? SLOT.topTrim : cuffSlot)), 0.003));
      if (outerSleeves && outer?.kind !== "labcoat") for (const yb of [-FA + 0.05, -FA + 0.075]) fore.push(add(sph([-s * 0.006, yb, -(0.034 * aw + d + 0.004)], 0.005, M.gloss(SLOT.outerTrim)), 0.001));
    }
    // Hand: palm (facing the body), grouped fingers, a thumb; slightly curled.
    const hy = -FA;
    const hand: Op[] = [add(box([-s * 0.003, hy - 0.048, 0.004], [0.017, 0.042, 0.038], 0.016, handMat))];
    const fingers: [number, number, number][] = [[0.027, 0.04, 0.0115], [0.009, 0.044, 0.0118], [-0.009, 0.041, 0.0114], [-0.025, 0.033, 0.0104]];
    fingers.forEach(([z, lenF, r], i) => {
      const k0: V3 = [-s * 0.002, hy - 0.086, z];
      const k1: V3 = [-s * 0.012, hy - 0.086 - lenF * 0.95, z * 1.02];
      const k2: V3 = [-s * 0.03, hy - 0.086 - lenF * 1.55, z * 1.02];
      hand.push(add(cap(k0, k1, r, handMat), i === 0 ? 0.004 : 0.008));
      hand.push(add(cone(k1, k2, r * 0.95, r * 0.82, handMat), 0.004));
    });
    hand.push(add(cone([-s * 0.012, hy - 0.022, 0.03], [-s * 0.026, hy - 0.058, 0.052], 0.016, 0.013, handMat), 0.012));
    hand.push(add(cone([-s * 0.026, hy - 0.058, 0.052], [-s * 0.034, hy - 0.083, 0.05], 0.013, 0.011, handMat), 0.004));
    fore.push(add(grp(hand, handMat), 0.018));
    // Props held in this hand. With a hold pose the fore frame's −y points
    // forward and +z up, so props are modelled upright along +z.
    const H = (p: V3): V3 => [p[0], p[1] + hy, p[2]];
    const palm = -s;
    for (const e of o.extras ?? []) {
      const A = M.gloss(extraColorSlot(o, e.kind), 0.45);
      const L2 = M.leather(extraColorSlot(o, e.kind));
      const right = side === "R";
      if (!right && (e.kind === "book" || e.kind === "clipboard" || e.kind === "envelope")) {
        const c = H([palm * 0.03, -0.07, 0.03]);
        if (e.kind === "book") {
          fore.push(add(box(c, [0.022, 0.07, 0.095], 0.008, L2, [0.12, 0, 0]), 0.0));
          fore.push(add(box([c[0] + palm * 0.003, c[1] - 0.004, c[2]], [0.019, 0.066, 0.09], 0.003, M.fab(SLOT.white), [0.12, 0, 0]), 0.0));
        } else if (e.kind === "clipboard") {
          fore.push(add(box(c, [0.006, 0.085, 0.11], 0.005, L2, [0.12, 0, 0]), 0.0));
          fore.push(add(box([c[0] + palm * 0.004, c[1], c[2] - 0.005], [0.004, 0.075, 0.095], 0.002, M.fab(SLOT.white), [0.12, 0, 0]), 0.0));
          fore.push(add(box([c[0] + palm * 0.006, c[1], c[2] + 0.1], [0.008, 0.025, 0.012], 0.004, M.metal(), [0.12, 0, 0]), 0.0));
        } else {
          fore.push(add(box(c, [0.005, 0.085, 0.055], 0.003, M.fab(SLOT.white), [0.12, 0, 0]), 0.0));
          fore.push(add(sph([c[0] + palm * 0.006, c[1], c[2]], 0.012, M.gloss(SLOT.accent + 7)), 0.0));
        }
      }
      if (!right && e.kind === "map") {
        fore.push(add(box(H([palm * 0.22, -0.07, 0.05]), [0.22, 0.004, 0.13], 0.004, M.fab(extraColorSlot(o, "map")), [0.25, 0, 0]), 0.0));
        fore.push(add(box(H([palm * 0.18, -0.074, 0.07]), [0.06, 0.003, 0.05], 0.003, M.fab(extraColorSlot(o, "map", true)), [0.25, 0, 0]), 0.0));
      }
      if (!right && e.kind === "ball") fore.push(add({ ...sph(H([palm * 0.105, -0.05, 0.02]), 0.11, M.gloss(extraColorSlot(o, "ball"), 0.55)), disp: { kind: "rib", amp: 0.0018, freq: 2, c: H([palm * 0.105, -0.05, 0.02]) } }, 0.0));
      if (right && e.kind === "flag") {
        fore.push(add(cap(H([palm * 0.025, -0.06, -0.3]), H([palm * 0.025, -0.06, 0.8]), 0.011, M.gloss(SLOT.white)), 0.0));
        fore.push(add({ ...box(H([palm * 0.025 - palm * 0.14, -0.06, 0.66]), [0.13, 0.005, 0.085], 0.006, M.fab(extraColorSlot(o, "flag"))), disp: { kind: "folds", amp: 0.006, freq: 5, c: H([0, 0, 0.66]) } }, 0.0));
        fore.push(add(sph(H([palm * 0.025, -0.06, 0.81]), 0.02, M.metal()), 0.0));
      }
      if (right && e.kind === "lightstick") {
        fore.push(add(cap(H([palm * 0.025, -0.06, -0.08]), H([palm * 0.025, -0.06, 0.1]), 0.017, M.gloss(SLOT.white)), 0.0));
        fore.push(add(sph(H([palm * 0.025, -0.06, 0.17]), 0.055, { slot: extraColorSlot(o, "lightstick"), rough: 0.15 }), 0.01));
      }
      if (right && e.kind === "rod") {
        fore.push(add(cap(H([palm * 0.02, -0.06, -0.2]), H([palm * 0.02, -0.75, 1.0]), 0.009, M.gloss(SLOT.dark)), 0.0));
        fore.push(add(cyl(H([palm * 0.05, -0.0, -0.1]), 0.015, 0.03, 0.006, M.metal(SLOT.white), [0, 0, Math.PI / 2]), 0.0));
      }
      if (right && e.kind === "racket") {
        fore.push(add(cap(H([palm * 0.02, -0.04, 0]), H([palm * 0.02, -0.3, 0]), 0.011, M.gloss(SLOT.dark)), 0.0));
        fore.push(add(tor(H([palm * 0.02, -0.42, 0]), 0.095, 0.009, A, [0, 0, Math.PI / 2], 1, 1.3), 0.0));
      }
      if (right && e.kind === "cup") {
        fore.push(add(cyl(H([palm * 0.04, -0.07, 0.03]), 0.06, 0.036, 0.008, M.fab(SLOT.white), [Math.PI / 2, 0, 0]), 0.0));
        fore.push(add(tor(H([palm * 0.04, -0.07, 0.03]), 0.038, 0.008, M.fab(SLOT.accent + 7), [Math.PI / 2, 0, 0]), 0.0));
        fore.push(add(cap(H([palm * 0.04, -0.07, 0.09]), H([palm * 0.05, -0.07, 0.15]), 0.005, M.gloss(SLOT.accent + 7)), 0.0));
      }
      if (right && e.kind === "pole") {
        fore.push(add(cap(H([palm * 0.02, 0.08, 0.01]), H([palm * 0.02, -0.68, 0.02]), 0.011, M.metal(SLOT.dark)), 0.0));
        fore.push(add(cap(H([palm * 0.02, 0.03, 0.01]), H([palm * 0.02, -0.06, 0.01]), 0.017, M.fab(SLOT.accent + 1)), 0.0));
      }
      if (e.kind === "drumsticks") fore.push(add(cone(H([palm * 0.02, -0.04, -0.03]), H([palm * 0.02, -0.3, 0.16]), 0.011, 0.007, M.gloss(SLOT.accent + 7, 0.5)), 0.0));
      if (!right && e.kind === "watering-can") {
        fore.push(add(cyl(H([0, -0.18, 0.02]), 0.075, 0.07, 0.018, A), 0.0));
        fore.push(add(cone(H([0, -0.2, 0.08]), H([0, -0.1, 0.24]), 0.017, 0.009, A), 0.01));
        fore.push(add(cyl(H([0, -0.095, 0.25]), 0.012, 0.022, 0.004, A, [-0.9, 0, 0]), 0.004));
        fore.push(add(tor(H([0, -0.08, 0.02]), 0.055, 0.009, A, [0, 0, Math.PI / 2]), 0.004));
      }
      if (!right && e.kind === "basket") {
        const bc = H([0, -0.21, 0.02]);
        fore.push(add({ ...box(bc, [0.095, 0.065, 0.12], 0.028, M.fab(extraColorSlot(o, "basket"))), disp: { kind: "rib", amp: 0.003, freq: 40, c: bc } }, 0.0));
        fore.push(add(tor(H([0, -0.14, 0.02]), 0.1, 0.009, M.fab(extraColorSlot(o, "basket")), [Math.PI / 2, 0, 0]), 0.0));
        fore.push(add(box(H([0, -0.145, 0.02]), [0.085, 0.01, 0.11], 0.01, M.fab(extraColorSlot(o, "basket", true))), 0.0));
      }
    }
    pieces[`fore${side}`] = { ops: fore };

    // ---------------------------------------------------------------- legs
    const TH = SK.thigh, SH = SK.shin;
    const thighBody = grp([
      add(cone([0, 0.02, 0], [0, -TH + 0.01, 0], 0.082 * aw, 0.058 * aw, M.skin)),
      add(ell([s * 0.006, -0.12, 0.01], [0.078 * aw, 0.13, 0.078 * aw], M.skin), 0.05),
    ], M.skin);
    const shinBody = grp([
      add(sph([0, 0, 0.006], 0.06 * aw, M.skin)),
      add(cone([0, -0.01, 0], [0, -SH + 0.015, 0], 0.056 * aw, 0.038 * aw, M.skin), 0.03),
      add(ell([0, -0.1, -0.014], [0.058 * aw, 0.1, 0.06 * aw], M.skin), 0.045),
    ], M.skin);
    const trousers = bottom.kind === "trousers" || bottom.kind === "baji" || outer?.kind === "overalls";
    const legSlot = outer?.kind === "overalls" ? SLOT.outer : SLOT.bottom;
    const baji = bottom.kind === "baji";
    if (!longHem && !longCoat) {
      const thigh: Op[] = [add(thighBody)];
      if (trousers || bottom.kind === "shorts")
        thigh.push(add(shell(thighBody, baji ? 0.03 : 0.013, M.fab(legSlot), bottom.kind === "shorts" ? [above(-0.19)] : [], trousers ? band(0.0026, -TH - 0.01, -TH + 0.07, 75) : folds(0.002)), 0.003));
      if (bottom.kind === "shorts") thigh.push(add(tor([0, -0.185, 0.002], 0.068 * aw + 0.017, 0.011, M.fab(bottom.trim ? SLOT.bottomTrim : SLOT.bottom)), 0.003));
      if (trousers && !baji) thigh.push(add(cap([s * 0.075 * aw, 0.0, 0.0], [s * 0.062 * aw, -TH, 0.0], 0.004, M.fab(legSlot)), 0.002));
      pieces[`thigh${side}`] = { ops: thigh };
    }
    if (bottom.kind !== "chima") {
      const shin: Op[] = [add(shinBody)];
      if (trousers || longCoat) {
        const d = baji ? 0.032 : 0.014;
        shin.push(add(shell(shinBody, d, M.fab(legSlot), [above(-SH + 0.03)], band(0.0026, -0.06, 0.04, 75)), 0.003));
        // Hem: a slight break over the shoe (or a tied cuff on baji).
        if (baji) shin.push(add(tor([0, -SH + 0.05, 0.0], 0.04 * aw + 0.03, 0.014, M.fab(SLOT.bottomTrim)), 0.005));
        else shin.push(add({ ...cone([0, -SH + 0.1, -0.002], [0, -SH + 0.03, -0.004], 0.045 * aw + d, 0.052 * aw + d, M.fab(legSlot)), disp: band(0.002, -SH + 0.03, -SH + 0.1, 60) }, 0.012));
      }
      if (o.feet.kind === "sneakers" && !trousers) shin.push(add({ ...tor([0, -SH + 0.035, 0], 0.04 * aw + 0.004, 0.012, M.fab(SLOT.white)), disp: { kind: "rib", amp: 0.0016, freq: 14, c: [0, -SH, 0] } }, 0.004));
      if (o.feet.kind === "boots") {
        shin.push(add(shell(shinBody, trousers ? 0.03 : 0.02, M.leather(SLOT.shoe), [below(-0.17)]), 0.004));
        shin.push(add(tor([0, -0.17, 0], 0.05 * aw + 0.024, 0.013, M.leather(SLOT.shoe)), 0.003));
        for (const y of [-0.21, -0.25, -0.29]) shin.push(add(cap([-0.02, y, 0.06 * aw], [0.02, y - 0.012, 0.06 * aw], 0.0045, M.fab(SLOT.sole)), 0.002));
      }
      pieces[`shin${side}`] = { ops: shin };
    }
    // Chunky shoes (foot frame at the ankle; the sole sits on the ground).
    const shoeM = o.feet.kind === "sneakers" ? M.fab(SLOT.shoe, 0.62) : M.leather(SLOT.shoe);
    const flat = o.feet.kind === "flats";
    const solM = o.feet.kind === "sneakers" || o.feet.sole ? M.fab(SLOT.sole, 0.7) : M.leather(SLOT.sole);
    const foot: Op[] = [
      add(ell([0, -0.016, 0.03], [0.064, flat ? 0.036 : 0.048, 0.11], shoeM)),
      add(ell([0, -0.03, 0.11], [0.066, flat ? 0.028 : 0.036, 0.08], shoeM), 0.04),
      add(ell([0, -0.022, -0.045], [0.056, 0.04, 0.055], shoeM), 0.03),
      add(box([0, -0.052, 0.04], [0.072, flat ? 0.008 : 0.012, 0.15], 0.011, solM), 0.006),
    ];
    if (!flat) foot.push(add(tor([0, 0.016, -0.008], 0.046, 0.011, shoeM, [-0.25, 0, 0], 1, 1.12), 0.006));
    if (o.feet.kind === "sneakers") {
      for (let i = 0; i < 3; i++) foot.push(add(cap([-0.026, 0.012 - i * 0.012, 0.045 + i * 0.022], [0.026, 0.012 - i * 0.012, 0.045 + i * 0.022], 0.0065, M.fab(SLOT.white)), 0.002));
      foot.push(add(ell([0, -0.034, 0.15], [0.056, 0.026, 0.04], solM), 0.008));
      foot.push(add(cap([s * 0.064, -0.02, -0.02], [s * 0.062, -0.012, 0.09], 0.006, M.fab(SLOT.sole, 0.7)), 0.002));
    } else if (!flat) {
      foot.push(add(cap([-0.025, 0.004, 0.06], [0.025, 0.004, 0.06], 0.005, M.leather(SLOT.shoe)), 0.002));
      foot.push(add(ell([0, -0.034, 0.155], [0.05, 0.022, 0.03], shoeM), 0.01));
    }
    if (flat && o.feet.sole) foot.push(add(sph([0, -0.012, 0.15], 0.018, M.gloss(SLOT.sole)), 0.006));
    pieces[`foot${side}`] = { ops: foot };
  }

  // ---------------------------------------------------------------- head
  const HC: V3 = [0, SK.headCenter, 0.01];
  const at = (x: number, y: number, z: number): V3 => [HC[0] + x, HC[1] + y, HC[2] + z];
  const expr = o.face?.expr ?? "smile";
  const lashy = ["long", "bob", "ponytail", "bun", "braids", "layered"].includes(o.hair.style);
  const flick = o.face?.flick ?? lashy;
  // The skin, eyes, brows, nose and mouth are analytic (head.ts); the SDF
  // head piece carries only ears, hair, hats and glasses. `headSkin`
  // approximates the skin for baked AO and hair fitting.
  const headSkin: Op[] = [
    add(ell(at(0, 0.015, 0), [0.375, 0.362, 0.352], M.skin)),
    add(ell(at(0, -0.12, 0.06), [0.3, 0.22, 0.28], M.skin), 0.1),
  ];
  const head: Op[] = [];
  const hat = o.head?.kind;
  const style = hat === "gat" ? "topknot" : hat && ["beanie", "helmet", "chef", "hardhat"].includes(hat) && o.hair.style === "curly" ? "crop" : o.hair.style;
  const earsHidden = ["bob", "long", "layered"].includes(style) || hat === "headscarf";
  for (const s of [1, -1]) {
    if (earsHidden) break;
    head.push(add(ell(at(s * 0.352, -0.05, -0.012), [0.045, 0.078, 0.06], M.skin, [0, 0, -s * 0.15]), 0.03));
    head.push(sub(ell(at(s * 0.385, -0.05, 0.004), [0.018, 0.045, 0.03], { slot: SLOT.skinShade, rough: 0.6 }), 0.012));
  }
  const cheeks: V3[] = [at(0.195, -0.15, 0.27), at(-0.195, -0.15, 0.27)];
  const browLift = expr === "excited" ? 0.018 : expr === "proud" ? 0.008 : 0;

  // Headwear first: its volume clips the hair (no poking through, no gap).
  const hatOps: Op[] = [];
  const hatVol: Node[] = [];
  const crown = (n: Node, k = 0) => { hatOps.push(add(n, k)); hatVol.push(n); };
  const deco = (n: Node, k = 0) => hatOps.push(add(n, k));
  if (o.head) {
    const Hm = M.fab(SLOT.hat, 0.75), B = M.fab(SLOT.hatBand, 0.6);
    const tilt: V3 = [-0.1, 0, 0];
    switch (o.head.kind) {
      case "straw":
        crown({ ...cyl(at(0, 0.2, -0.01), 0.012, 0.58, 0.012, Hm, tilt), disp: { kind: "rib", amp: 0.002, freq: 60, c: HC } });
        crown({ ...cyl(at(0, 0.3, -0.02), 0.11, 0.31, 0.07, Hm, tilt), disp: { kind: "rib", amp: 0.002, freq: 60, c: HC } }, 0.02);
        deco(tor(at(0, 0.235, -0.015), 0.312, 0.024, B, tilt), 0.006);
        break;
      case "gat":
        crown(cyl(at(0, 0.21, -0.01), 0.006, 0.62, 0.006, M.gloss(SLOT.hat, 0.5), [-0.06, 0, 0]));
        crown(cyl(at(0, 0.38, -0.02), 0.16, 0.185, 0.04, M.gloss(SLOT.hat, 0.5), [-0.06, 0, 0]));
        deco(tor(at(0, 0.23, -0.015), 0.19, 0.015, B, [-0.06, 0, 0]), 0.004);
        for (const s of [1, -1]) {
          const pts: V3[] = [];
          for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(at(s * (0.3 - 0.2 * t), 0.18 - 0.42 * t, 0.06 + 0.18 * t)); }
          for (const p of pts) deco(sph(p, 0.014, M.gloss(SLOT.dark, 0.3)));
        }
        break;
      case "cap":
      case "cap-back": {
        const back = o.head.kind === "cap-back";
        crown({ t: "shell", of: ell(at(0, 0.06, -0.02), [0.428, 0.392, 0.422]), d: 0, m: Hm, clip: [above(HC[1] + 0.09)] });
        // Curved visor with a stitched rim, button on top.
        deco({ t: "skirt", c: at(0, 0.115, back ? -0.33 : 0.33), len: 0.012, rTop: 0.16, rHem: 0.2, zs: 0.7, thick: 0.009, wave: 0, waves: 1, m: B, front: 1.1 } as Node, 0.0);
        deco(box(at(0, 0.11, back ? -0.4 : 0.4), [0.165, 0.011, 0.105], 0.011, B, [back ? -0.2 : 0.2, 0, 0]), 0.012);
        deco(sph(at(0, 0.435, -0.02), 0.028, B), 0.006);
        break;
      }
      case "bucket":
        crown(cyl(at(0, 0.27, -0.01), 0.13, 0.37, 0.07, Hm), 0.02);
        crown({ t: "skirt", c: at(0, 0.17, -0.01), len: 0.11, rTop: 0.34, rHem: 0.5, zs: 1, thick: 0.013, wave: 0.01, waves: 6, m: Hm });
        deco(tor(at(0, 0.18, -0.01), 0.352, 0.016, B), 0.005);
        break;
      case "beanie":
        crown({ t: "shell", of: ell(at(0, 0.06, -0.02), [0.43, 0.41, 0.43]), d: 0, m: Hm, clip: [above(HC[1] + 0.03)], disp: { kind: "rib", amp: 0.005, freq: 24, c: HC } });
        crown({ ...tor(at(0, 0.09, -0.02), 0.395, 0.04, B, [-0.15, 0, 0], 1, 1), disp: { kind: "rib", amp: 0.004, freq: 30, c: HC } }, 0.01);
        deco(sph(at(0, 0.46, -0.04), 0.06, B), 0.02);
        break;
      case "hardhat":
        crown({ t: "shell", of: ell(at(0, 0.05, -0.01), [0.435, 0.42, 0.45]), d: 0, m: M.gloss(SLOT.hat, 0.35), clip: [above(HC[1] + 0.11)] });
        crown(cyl(at(0, 0.125, 0.01), 0.008, 0.48, 0.008, M.gloss(SLOT.hat, 0.35)), 0.01);
        deco(cap(at(0, 0.455, -0.3), at(0, 0.465, 0.3), 0.03, M.gloss(SLOT.hat, 0.35)), 0.02);
        break;
      case "chef":
        crown(cyl(at(0, 0.28, -0.03), 0.1, 0.36, 0.02, Hm, [-0.12, 0, 0]));
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; crown(sph(at(Math.sin(a) * 0.2, 0.48, Math.cos(a) * 0.2 - 0.05), 0.17, Hm), 0.08); }
        crown(sph(at(0, 0.53, -0.05), 0.18, Hm), 0.08);
        break;
      case "visor":
        deco(tor(at(0, 0.13, 0), 0.4, 0.028, Hm, [-0.12, 0, 0], 1, 0.98));
        deco(box(at(0, 0.11, 0.4), [0.17, 0.01, 0.1], 0.01, B, [0.22, 0, 0]), 0.01);
        break;
      case "headband":
        deco(tor(at(0, 0.15, 0), 0.41, 0.03, Hm, [-0.18, 0, 0]));
        break;
      case "helmet":
        crown({ t: "shell", of: ell(at(0, 0.06, -0.04), [0.44, 0.405, 0.485]), d: 0, m: M.gloss(SLOT.hat, 0.3), clip: [above(HC[1] + 0.08)] });
        for (const s of [1, -1]) deco(cap(at(s * 0.33, 0.08, 0.02), at(s * 0.12, -0.27, 0.2), 0.01, M.fab(SLOT.dark)), 0.004);
        break;
      case "beret":
        crown(ell(at(0.04, 0.28, -0.02), [0.42, 0.12, 0.42], Hm), 0.04);
        deco(sph(at(0.04, 0.41, -0.02), 0.025, Hm), 0.01);
        break;
      case "flatcap":
        crown(ell(at(0, 0.25, 0.02), [0.425, 0.16, 0.46], Hm), 0.05);
        deco(box(at(0, 0.15, 0.39), [0.17, 0.012, 0.08], 0.012, Hm, [0.3, 0, 0]), 0.02);
        break;
      case "ranger":
        crown(cyl(at(0, 0.2, -0.01), 0.012, 0.56, 0.012, Hm));
        crown(cyl(at(0, 0.32, -0.01), 0.13, 0.29, 0.06, Hm), 0.02);
        deco(tor(at(0, 0.23, -0.01), 0.292, 0.02, B), 0.005);
        break;
      case "headscarf":
        crown({ t: "shell", of: ell(at(0, 0.02, -0.02), [0.425, 0.415, 0.41]), d: 0, m: Hm, clip: [plane([0, -1, 0.55], -(HC[1] + 0.03 + 0.55 * HC[2]))], disp: { kind: "folds", amp: 0.004, freq: 9, c: HC } }, 0.01);
        deco(sph(at(0, 0.08, -0.39), 0.06, B), 0.02);
        for (const s of [1, -1]) deco(cone(at(0, 0.08, -0.41), at(s * 0.08, -0.12, -0.43), 0.04, 0.025, Hm), 0.01);
        break;
    }
    // Ranger hat crown dents.
    if (o.head.kind === "ranger") {
      for (const s of [1, -1]) hatOps.push(sub(sph(at(s * 0.14, 0.5, 0.05), 0.07), 0.03));
      hatOps.push(sub(cap(at(0, 0.5, 0.2), at(0, 0.5, -0.2), 0.05), 0.03));
    }
    if (o.head.kind === "helmet") for (const x of [-0.12, 0, 0.12]) hatOps.push(sub(cap(at(x, 0.42, 0.25), at(x * 1.2, 0.37, -0.35), 0.022, B), 0.01));
  }
  // Hair (none under a headscarf).
  const hatted = !!hat && hat !== "headband" && hat !== "visor";
  const HM: Mat = { slot: SLOT.hair, rough: 0.62, paint: "hair" };
  let hairSegs: HairSeg[] = [];
  let hairPlan: HairBuild | undefined;
  const hatDist = (p: V3) => (hatOps.length ? evalOps(hatOps, p, null) : 1);
  if (hat !== "headscarf") {
    const clip = hatVol.length ? [not({ t: "shell", of: grp(hatVol.map((n) => add(n, 0.004))), d: 0.006 })] : [];
    const hair = buildHair(style, HM, clip, hatted, M.gloss(has(o, "binyeo") ? extraColorSlot(o, "binyeo") : SLOT.topTrim, 0.5));
    head.push(...hair.ops);
    hairPlan = hair;
    hairSegs = [...hair.segs, ...hairMesh(hair, true, hatDist).segs];
    if (style === "bun" && has(o, "binyeo")) {
      head.push(add(cap(at(-0.2, 0.17, -0.37), at(0.22, 0.19, -0.37), 0.012, M.metal(extraColorSlot(o, "binyeo"))), 0.0));
      head.push(add(sph(at(0.235, 0.19, -0.37), 0.022, M.metal(extraColorSlot(o, "binyeo"))), 0.0));
    }
  }
  head.push(...hatOps);
  // Head-mounted extras.
  for (const e of o.extras ?? []) {
    // Glasses are analytic tubes (head.ts) so the thin rims stay round.
    if (e.kind === "headphones") {
      head.push(add({ t: "shell", of: tor(at(0, 0.0, -0.02), 0.425, 0.024, M.fab(extraColorSlot(o, e.kind)), [0, 0, Math.PI / 2]), d: 0, m: M.gloss(extraColorSlot(o, e.kind), 0.4), clip: [above(HC[1] - 0.02)] }, 0.0));
      for (const s of [1, -1]) head.push(add(cyl(at(s * 0.39, -0.03, -0.01), 0.035, 0.08, 0.025, M.gloss(extraColorSlot(o, e.kind, true), 0.4), [0, 0, Math.PI / 2]), 0.01));
    }
    if (e.kind === "pencil") head.push(add(cone(at(0.35, 0.06, 0.12), at(0.37, 0.05, -0.08), 0.012, 0.008, M.gloss(SLOT.accent + 7, 0.5)), 0.0));
  }
  // (No hollowing: solid hair and hats have no hidden inner surface, so
  // every triangle of the budget is spent on the visible one.)
  pieces.head = { ops: head };

  // ---------------------------------------------------------------- face layers
  pieces.eyes = { ops: [] };
  for (const m of MOUTHS) pieces[m] = { ops: [] };
  return {
    pieces, skirtTop, cheeks, headSkin, HC, hair: hairSegs, hairPlan, hatDist, hairAO: hairPlan ? hairAO(hairPlan) : [],
    mouth: at(0, -0.226, 0.31),
    glasses: (o.extras ?? []).some((e) => e.kind === "glasses" || e.kind === "sunglasses")
      ? { slot: extraColorSlot(o, (o.extras ?? []).some((e) => e.kind === "glasses") ? "glasses" : "sunglasses"), sun: (o.extras ?? []).some((e) => e.kind === "sunglasses") }
      : undefined,
    face: { expr, flick, lashes: lashy ? 1 : 0, browLift, browRight: expr === "thoughtful" ? 0.02 : 0, eye: { cx: 0.165, cy: -0.06, rx: 0.084, ry: 0.098, iris: [0.05, 0.03] } },
  };
}

/** Palette (sRGB hex per slot) for an outfit. Extras fill accent slots. */
export function outfitPalette(o: Outfit, mixFn: (a: string, b: string, t: number) => string, shadeFn: (h: string, a: number) => string): string[] {
  const pal: string[] = new Array(32).fill("#ff00ff");
  const hatColor = o.head?.color ?? "#e0b86d";
  pal[SLOT.skin] = o.skin;
  pal[SLOT.blush] = mixFn(o.skin, "#ff7470", 0.6);
  pal[SLOT.lip] = mixFn(o.skin, "#d0606c", 0.55);
  pal[SLOT.hair] = o.hair.color;
  pal[SLOT.hairLight] = mixFn(shadeFn(o.hair.color, 0.3), "#e8b070", 0.12);
  pal[SLOT.brow] = mixFn(o.hair.color, o.skin, 0.18);
  pal[SLOT.iris] = o.eyes ?? "#6e4527";
  pal[SLOT.top] = o.top.color;
  pal[SLOT.topTrim] = o.top.trim ?? shadeFn(o.top.color, -0.2);
  pal[SLOT.bottom] = o.bottom.color;
  pal[SLOT.bottomTrim] = o.bottom.trim ?? shadeFn(o.bottom.color, 0.25);
  pal[SLOT.outer] = o.outer?.color ?? o.top.color;
  pal[SLOT.outerTrim] = o.outer?.trim ?? shadeFn(o.outer?.color ?? o.top.color, -0.22);
  pal[SLOT.shoe] = o.feet.color;
  pal[SLOT.sole] = o.feet.sole ?? (o.feet.kind === "sneakers" ? "#f2efe8" : shadeFn(o.feet.color, -0.4));
  pal[SLOT.leather] = o.belt?.color ?? "#6a4a33";
  pal[SLOT.metal] = o.belt?.buckle ?? "#d4ae5a";
  pal[SLOT.hat] = hatColor;
  pal[SLOT.hatBand] = o.head?.band ?? shadeFn(hatColor, -0.25);
  pal[SLOT.glove] = o.gloves ?? o.skin;
  pal[SLOT.white] = "#f4f1ea";
  pal[SLOT.dark] = "#2b1d1a";
  pal[SLOT.mouth] = "#6a2a30";
  pal[SLOT.skinShade] = shadeFn(o.skin, -0.25);
  (o.extras ?? []).slice(0, 4).forEach((e, i) => {
    const c = e.color ?? DEFAULT_EXTRA[e.kind] ?? "#6a5038";
    pal[SLOT.accent + i * 2] = c;
    pal[SLOT.accent + i * 2 + 1] = e.color2 ?? shadeFn(c, -0.25);
  });
  pal[SLOT.accent + 6] = o.belt?.pouch ?? "#7a5136";
  // accent+7: small fixed details (pencils, lens, drumsticks, seals).
  if ((o.extras ?? []).length < 4) pal[SLOT.accent + 7] = has(o, "pencil") ? "#e8c34a" : has(o, "camera") ? "#7fa3c4" : has(o, "drumsticks") ? "#d8b98a" : "#b5463a";
  return pal;
}
const DEFAULT_EXTRA: Record<string, string> = {
  ball: "#d9752f", camera: "#2b2b2e", map: "#e8dcb8", envelope: "#f2ece0", binyeo: "#c9a24a", rope: "#c8b386", lightstick: "#ff9ed2", glasses: "#2b2b2b",
};
