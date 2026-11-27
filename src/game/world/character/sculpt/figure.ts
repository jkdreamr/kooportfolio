/**
 * Outfit → sculpted figure: one SDF piece per bone, modelled in that bone's
 * local frame (skeleton.ts rest pose), so baked meshes pose rigidly with the
 * existing gait. Smooth unions inside a piece and overlapping rounded joints
 * between pieces read as one clay-like figure. Colours are palette slots.
 */
import { SK, type Joint } from "../skeleton";
import type { Outfit } from "../outfit";
import { SLOT, type Mat, type Node, type Op, type Piece, type V3 } from "./sdf";

export type PieceId =
  | "pelvis" | "chest" | "head" | "eyes"
  | "upperL" | "upperR" | "foreL" | "foreR"
  | "thighL" | "thighR" | "shinL" | "shinR" | "footL" | "footR"
  | "skirt";
export const PIECE_JOINT: Record<PieceId, Joint> = {
  pelvis: "pelvis", chest: "chest", head: "head", eyes: "head",
  upperL: "shoulderL", upperR: "shoulderR", foreL: "elbowL", foreR: "elbowR",
  thighL: "hipL", thighR: "hipR", shinL: "kneeL", shinR: "kneeR",
  footL: "ankleL", footR: "ankleR", skirt: "pelvis",
};
/** Head-frame eye line (the eyes piece scales about it to blink). */
export const EYE_Y = SK.headCenter - 0.065;
export type Figure = {
  pieces: Partial<Record<PieceId, Piece>>;
  /** Pelvis-frame origin of the skirt piece (flare pivot). */
  skirtTop: number;
  /** Eye rect centres for the procedural iris (head frame). */
  eyes: { c: V3; r: V3; iris: [number, number]; rot: number }[];
  /** Blush centres (head frame). */
  cheeks: V3[];
  /** Lip tint centre (head frame). */
  mouth: V3;
};

// --- node helpers ----------------------------------------------------------------
const M = {
  skin: { slot: SLOT.skin, rough: 0.5 } as Mat,
  fab: (slot: number, rough = 0.86): Mat => ({ slot, rough }),
  leather: (slot: number): Mat => ({ slot, rough: 0.34, metal: 0.02 }),
  metal: (slot: number = SLOT.metal): Mat => ({ slot, rough: 0.22, metal: 0.9 }),
  gloss: (slot: number, rough = 0.3): Mat => ({ slot, rough }),
};
const sph = (c: V3, r: number, m?: Mat): Node => ({ t: "sph", c, r, m });
const ell = (c: V3, r: V3, m?: Mat): Node => ({ t: "ell", c, r, m });
const cap = (a: V3, b: V3, r: number, m?: Mat): Node => ({ t: "cap", a, b, r, m });
const cone = (a: V3, b: V3, ra: number, rb: number, m?: Mat): Node => ({ t: "cone", a, b, ra, rb, m });
const box = (c: V3, h: V3, r: number, m?: Mat, rot?: V3): Node => ({ t: "box", c, h, r, m, rot });
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
const chain = (pts: V3[], r: number, m: Mat): Op[] =>
  pts.slice(1).map((p, i) => add(cap(pts[i], p, r, m), 0.004));

function extraColorSlot(o: Outfit, kind: string, second = false) {
  const i = (o.extras ?? []).findIndex((e) => e.kind === kind);
  return SLOT.accent + Math.max(0, Math.min(3, i)) * 2 + (second ? 1 : 0);
}
const has = (o: Outfit, kind: string) => (o.extras ?? []).some((e) => e.kind === kind);

export function buildFigure(o: Outfit): Figure {
  const w = o.build?.width ?? 1;
  const aw = 0.55 + w * 0.45;
  const pieces: Figure["pieces"] = {};
  const top = o.top, bottom = o.bottom, outer = o.outer;
  const outerSleeves = !!outer && ["jacket", "blazer", "labcoat", "durumagi", "cardigan"].includes(outer.kind);
  const torsoOuter = !!outer && ["jacket", "blazer", "labcoat", "durumagi", "cardigan", "vest"].includes(outer.kind);
  const sleeves = outer
    ? outer.kind === "vest" || outer.kind === "apron" || outer.kind === "overalls"
      ? (top.sleeves ?? "short")
      : "long"
    : (top.sleeves ?? (top.kind === "tank" || top.kind === "jersey" ? "none" : top.kind === "tee" || top.kind === "polo" ? "short" : "long"));
  const sleeveSlot = outerSleeves ? SLOT.outer : SLOT.top;
  const cuffSlot = outerSleeves ? SLOT.outerTrim : SLOT.topTrim;
  const longHem = bottom.kind === "chima" || bottom.kind === "long-skirt";
  const skirtish = bottom.kind === "skirt" || longHem;
  const longCoat = outer?.kind === "durumagi";
  const handMat: Mat = o.gloves ? M.fab(SLOT.glove, 0.7) : M.skin;

  // ---------------------------------------------------------------- chest
  const body = grp(
    [
      add(ell([0, 0.26, 0], [0.235 * w, 0.165, 0.175 * w], M.skin)),
      add(ell([0, 0.1, 0.012], [0.215 * w, 0.155, 0.18 * w], M.skin), 0.08),
      add(ell([0, -0.04, 0], [0.19 * w, 0.12, 0.158 * w], M.skin), 0.08),
      add(sph([0.205 * w, 0.345, -0.01], 0.085), 0.07),
      add(sph([-0.205 * w, 0.345, -0.01], 0.085), 0.07),
    ],
    M.skin,
  );
  const chest: Op[] = [add(body), add(cap([0, 0.32, 0], [0, 0.54, 0.012], 0.07, M.skin), 0.05)];
  const folds = (amp: number, c: V3 = [0, 0, 0]): Node["disp"] => ({ kind: "folds", amp, freq: 7, c });
  // Top garment.
  const neck: Node[] = [];
  if (top.kind === "tank" || top.kind === "jersey") neck.push(not(ell([0, 0.45, 0.13], [0.085, 0.13, 0.12])));
  else if (top.kind !== "turtleneck") neck.push(not(ell([0, 0.46, 0.04], [0.098, 0.075, 0.105])));
  if (sleeves === "none")
    for (const s of [1, -1]) neck.push(not(sph([s * 0.26 * w, 0.33, -0.01], 0.085)));
  const topClip = [...neck, above(-0.125)];
  if (top.kind === "jeogori") topClip.push(above(0.16));
  chest.push(add(shell(body, top.kind === "jeogori" ? 0.024 : 0.018, M.fab(SLOT.top), topClip, folds(0.0025)), 0.004));
  if (top.kind === "jeogori") chest.push(add(tor([0, 0.17, 0.005], 0.232 * w, 0.028, M.fab(SLOT.top), undefined, 1, 0.84), 0.01));
  const hem = (slot: number, y = -0.122, r = 0.021) =>
    chest.push(add(tor([0, y, 0], 0.172 * w, r, M.fab(slot), undefined, 1, 0.85), 0.006));
  switch (top.kind) {
    case "tee":
    case "tank":
      chest.push(add(tor([0, 0.448, 0.03], 0.09, 0.014, M.fab(SLOT.topTrim), [-0.3, 0, 0]), 0.006));
      if (!outer) hem(SLOT.top);
      break;
    case "jersey":
      chest.push(add(tor([0, 0.43, 0.1], 0.08, 0.014, M.fab(SLOT.topTrim), [-0.9, 0, 0], 1, 1.4), 0.006));
      for (const s of [1, -1]) chest.push(add(tor([s * 0.255 * w, 0.33, -0.01], 0.08, 0.012, M.fab(SLOT.topTrim), [0, 0, s * 1.35]), 0.004));
      hem(SLOT.topTrim);
      break;
    case "turtleneck":
      chest.push(add({ ...cyl([0, 0.46, 0.008], 0.07, 0.088, 0.03, M.fab(SLOT.top)), disp: { kind: "rib", amp: 0.003, freq: 18, c: [0, 0, 0.008] } }, 0.01));
      break;
    case "sweater":
      chest.push(add(tor([0, 0.448, 0.03], 0.092, 0.017, M.fab(SLOT.topTrim), [-0.3, 0, 0]), 0.006));
      hem(SLOT.topTrim, -0.11, 0.02);
      break;
    case "hoodie":
      chest.push(add(ell([0, 0.43, -0.14], [0.17, 0.12, 0.12], M.fab(SLOT.top)), 0.05));
      chest.push(add(tor([0, 0.45, 0.0], 0.11, 0.02, M.fab(SLOT.top), [-0.45, 0, 0]), 0.02));
      chest.push(add(box([0, 0.06, 0.19 * w], [0.12, 0.06, 0.02], 0.018, M.fab(SLOT.top)), 0.01));
      for (const s of [1, -1]) chest.push(add(cap([s * 0.04, 0.42, 0.17], [s * 0.045, 0.3, 0.205], 0.007, M.fab(SLOT.white)), 0.003));
      hem(SLOT.top, -0.11, 0.022);
      break;
    case "shirt":
    case "polo":
    case "chef": {
      const covered = !!outer;
      if (!outer || !torsoOuter) {
        chest.push(add(tor([0, 0.452, 0.025], 0.088, 0.016, M.fab(SLOT.top), [-0.3, 0, 0]), 0.006));
        for (const s of [1, -1])
          chest.push(add(box([s * 0.055, 0.44, 0.13], [0.05, 0.01, 0.042], 0.008, M.fab(SLOT.top), [0.95, 0, s * 0.55]), 0.004));
      }
      if (top.kind === "chef") {
        for (const y of [0.36, 0.25, 0.14]) for (const s of [1, -1]) chest.push(add(sph([s * 0.07, y, 0.19 * w], 0.013, M.gloss(SLOT.white)), 0.003));
      } else if (!covered) {
        chest.push(add(cap([0, 0.42, 0.188 * w], [0, top.kind === "polo" ? 0.28 : 0.0, 0.198 * w], 0.011, M.fab(SLOT.top)), 0.004));
        for (const y of top.kind === "polo" ? [0.39, 0.32] : [0.38, 0.26, 0.14, 0.03])
          chest.push(add(sph([0, y, 0.207 * w], 0.011, M.gloss(SLOT.white)), 0.002));
      }
      break;
    }
    case "jeogori":
      chest.push(add(cap([0.07, 0.47, 0.14], [-0.07, 0.24, 0.2], 0.02, M.fab(SLOT.white)), 0.006));
      chest.push(add(cap([0.07, 0.47, 0.155], [-0.03, 0.31, 0.2], 0.012, M.fab(SLOT.topTrim)), 0.004));
      break;
  }
  // Outer layer.
  if (outer) {
    const vWedge = not(grp([
      add(plane([1, -0.28, 0], 0.03)),
      { op: "int", k: 0, n: plane([-1, -0.28, 0], 0.03) },
      { op: "int", k: 0, n: plane([0, 0, -1], -0.05) },
    ]));
    const armholes = [1, -1].map((s) => not(sph([s * 0.26 * w, 0.33, -0.01], 0.092)));
    const O = M.fab(SLOT.outer);
    switch (outer.kind) {
      case "jacket":
      case "blazer":
      case "labcoat":
      case "cardigan": {
        const d = outer.kind === "cardigan" ? 0.026 : 0.032;
        chest.push(add(shell(body, d, O, [vWedge, above(-0.14), not(ell([0, 0.47, 0.0], [0.09, 0.07, 0.1]))], folds(0.003)), 0.004));
        for (const s of [1, -1])
          chest.push(add(cap([s * 0.04, 0.06, 0.205 * w + 0.02], [s * 0.115, 0.42, 0.16], outer.kind === "cardigan" ? 0.012 : 0.02, M.fab(outer.kind === "blazer" || outer.kind === "labcoat" ? SLOT.outer : SLOT.outerTrim)), 0.006));
        chest.push(add(tor([0, -0.11, 0], 0.175 * w + 0.02, 0.017, M.fab(SLOT.outerTrim), undefined, 1, 0.85), 0.006));
        if (outer.kind === "cardigan")
          for (const y of [0.24, 0.13, 0.02]) chest.push(add(sph([0.045, y, 0.22 * w], 0.013, M.gloss(SLOT.outerTrim)), 0.002));
        if (outer.kind === "blazer" || outer.kind === "labcoat")
          chest.push(add(box([0.12 * w, 0.27, 0.19 * w], [0.05, 0.035, 0.012], 0.008, O, [0, 0.4, 0]), 0.004));
        if (outer.kind === "labcoat") chest.push(add(cap([0.13 * w, 0.27, 0.21 * w], [0.135 * w, 0.34, 0.205 * w], 0.007, M.gloss(SLOT.accent)), 0.002));
        break;
      }
      case "vest":
        chest.push(add(shell(body, 0.026, O, [vWedge, ...armholes, above(-0.14), not(ell([0, 0.47, 0.0], [0.1, 0.08, 0.11]))], folds(0.002)), 0.004));
        for (const s of [1, -1]) chest.push(add(box([s * 0.12 * w, 0.1, 0.19 * w], [0.05, 0.04, 0.015], 0.012, O, [0, s * 0.4, 0]), 0.005));
        chest.push(add(tor([0, -0.11, 0], 0.175 * w + 0.015, 0.015, M.fab(SLOT.outerTrim), undefined, 1, 0.85), 0.006));
        break;
      case "durumagi":
        chest.push(add(shell(body, 0.03, O, [above(-0.14), not(ell([0, 0.47, 0.03], [0.09, 0.07, 0.1]))], folds(0.003)), 0.004));
        chest.push(add(cap([0.08, 0.47, 0.13], [-0.08, 0.2, 0.22], 0.022, M.fab(SLOT.white)), 0.006));
        chest.push(add(ell([-0.07, 0.24, 0.225], [0.035, 0.022, 0.02], M.fab(SLOT.outerTrim)), 0.008));
        for (const s of [0, 1]) chest.push(add(cap([-0.07, 0.24, 0.225], [-0.05 - s * 0.05, 0.02, 0.23], 0.012, M.fab(SLOT.outerTrim)), 0.004));
        break;
      case "apron":
        chest.push(add(shell(body, 0.022, O, [plane([0, 0, -1], -0.03), plane([1, 0, 0], 0.16), plane([-1, 0, 0], 0.16), below(0.32)]), 0.004));
        for (const s of [1, -1]) chest.push(add(cap([s * 0.12, 0.31, 0.17], [s * 0.07, 0.47, 0.03], 0.012, O), 0.004));
        break;
      case "overalls":
        chest.push(add(shell(body, 0.022, O, [plane([0, 0, -1], -0.03), plane([1, 0, 0], 0.13), plane([-1, 0, 0], 0.13), below(0.28)]), 0.004));
        for (const s of [1, -1]) {
          chest.push(add(cap([s * 0.1, 0.27, 0.19], [s * 0.12, 0.44, 0.02], 0.016, O), 0.004));
          chest.push(add(cap([s * 0.12, 0.44, 0.02], [s * 0.1, 0.2, -0.19], 0.016, O), 0.004));
          chest.push(add(sph([s * 0.1, 0.26, 0.205], 0.015, M.metal()), 0.002));
        }
        chest.push(add(box([0, 0.17, 0.205], [0.06, 0.045, 0.012], 0.01, O), 0.005));
        break;
    }
  }
  if (top.kind === "jeogori" || outer?.kind === "durumagi" || has(o, "goreum")) {
    const slot = has(o, "goreum") ? extraColorSlot(o, "goreum") : SLOT.topTrim;
    chest.push(add(ell([-0.06, 0.29, 0.21], [0.035, 0.024, 0.022], M.gloss(slot, 0.4)), 0.008));
    chest.push(add(cap([-0.06, 0.29, 0.215], [-0.04, 0.02, 0.225], 0.014, M.gloss(slot, 0.4)), 0.004));
    chest.push(add(cap([-0.06, 0.29, 0.215], [-0.09, 0.05, 0.222], 0.013, M.gloss(slot, 0.4)), 0.004));
  }
  // Chest-mounted extras.
  for (const e of o.extras ?? []) {
    const A = M.fab(extraColorSlot(o, e.kind)), B = M.fab(extraColorSlot(o, e.kind, true));
    const L = M.leather(extraColorSlot(o, e.kind));
    switch (e.kind) {
      case "backpack":
        chest.push(add(box([0, 0.22, -0.27 * w], [0.17, 0.19, 0.09], 0.06, A), 0.01));
        chest.push(add(box([0, 0.12, -0.36 * w], [0.12, 0.08, 0.04], 0.03, A), 0.01));
        for (const s of [1, -1]) chest.push(...chain([[s * 0.13, 0.08, 0.19 * w], [s * 0.15, 0.36, 0.15], [s * 0.15, 0.44, -0.02], [s * 0.14, 0.38, -0.2]], 0.017, B));
        break;
      case "satchel":
      case "tote":
        chest.push(...chain([[0.2 * w, 0.42, 0.1], [0.05, 0.25, 0.2 * w + 0.015], [-0.2 * w, 0.0, 0.17 * w]], 0.015, M.leather(extraColorSlot(o, e.kind, true))));
        break;
      case "lanyard":
      case "whistle":
        for (const s of [1, -1]) chest.push(add(cap([s * 0.07, 0.45, 0.1], [0, 0.27, 0.205 * w], 0.006, A), 0.002));
        if (e.kind === "lanyard") chest.push(add(box([0, 0.22, 0.21 * w], [0.038, 0.05, 0.006], 0.006, M.gloss(extraColorSlot(o, e.kind, true))), 0.003));
        else chest.push(add(cap([-0.01, 0.25, 0.215 * w], [0.02, 0.25, 0.235 * w], 0.015, M.metal(SLOT.white)), 0.003));
        break;
      case "number":
        chest.push(add(box([0, 0.2, 0.19 * w], [0.075, 0.08, 0.008], 0.008, A), 0.004));
        chest.push(add(box([0, 0.2, 0.2 * w], [0.014, 0.055, 0.006], 0.004, B), 0.002));
        break;
      case "camera":
        for (const s of [1, -1]) chest.push(add(cap([s * 0.07, 0.45, 0.1], [s * 0.07, 0.15, 0.22 * w], 0.006, M.fab(SLOT.dark)), 0.002));
        chest.push(add(box([0, 0.13, 0.24 * w], [0.08, 0.05, 0.035], 0.014, M.gloss(SLOT.dark, 0.35)), 0.004));
        chest.push(add(cyl([0.015, 0.13, 0.29 * w], 0.025, 0.035, 0.008, M.metal(SLOT.dark), [Math.PI / 2, 0, 0]), 0.004));
        chest.push(add(cyl([0.015, 0.13, 0.316 * w], 0.003, 0.024, 0.002, M.gloss(SLOT.accent + 7, 0.05), [Math.PI / 2, 0, 0]), 0.0));
        break;
      case "scarf":
        chest.push(add({ ...tor([0, 0.46, 0.02], 0.1, 0.035, A, [-0.15, 0, 0]), disp: { kind: "folds", amp: 0.004, freq: 9, c: [0, 0.46, 0.02] } }, 0.01));
        chest.push(add(box([0.06, 0.3, 0.2], [0.035, 0.13, 0.014], 0.012, A, [-0.1, 0, 0.1]), 0.01));
        break;
      case "book":
      case "clipboard":
      case "envelope": {
        const c: V3 = [0.13, 0.12, 0.3];
        const rot: V3 = [-0.3, 0.3, 0];
        if (e.kind === "book") {
          chest.push(add(box(c, [0.075, 0.1, 0.024], 0.008, L, rot), 0.0));
          chest.push(add(box([c[0] - 0.006, c[1], c[2] + 0.003], [0.068, 0.092, 0.02], 0.004, M.fab(SLOT.white), rot), 0.0));
        } else if (e.kind === "clipboard") {
          chest.push(add(box(c, [0.09, 0.12, 0.007], 0.006, L, rot), 0.0));
          chest.push(add(box([c[0], c[1] - 0.005, c[2] + 0.004], [0.078, 0.1, 0.004], 0.002, M.fab(SLOT.white), rot), 0.0));
          chest.push(add(box([c[0], c[1] + 0.11, c[2] - 0.01], [0.025, 0.012, 0.01], 0.004, M.metal(), rot), 0.0));
        } else {
          chest.push(add(box(c, [0.09, 0.06, 0.006], 0.004, M.fab(SLOT.white), rot), 0.0));
          chest.push(add(sph([c[0], c[1] + 0.005, c[2] + 0.008], 0.014, M.gloss(SLOT.accent + 7)), 0.0));
        }
        break;
      }
      case "map":
        chest.push(add(box([0, 0.12, 0.33], [0.17, 0.11, 0.005], 0.004, M.fab(extraColorSlot(o, "map")), [-0.6, 0, 0]), 0.0));
        chest.push(add(box([0.04, 0.12, 0.336], [0.045, 0.06, 0.004], 0.003, M.fab(extraColorSlot(o, "map", true)), [-0.6, 0, 0.3]), 0.0));
        break;
      case "ball":
        chest.push(add({ ...sph([0.31 * w, 0.06, 0.11], 0.12, M.gloss(extraColorSlot(o, "ball"), 0.55)), disp: { kind: "rib", amp: 0.002, freq: 2, c: [0.31 * w, 0.06, 0.11] } }, 0.0));
        break;
      case "towel":
        chest.push(add(box([0.15 * w, 0.42, 0.0], [0.05, 0.02, 0.2], 0.018, A, [0, 0, -0.5]), 0.02));
        chest.push(add(box([0.19 * w, 0.24, 0.17], [0.045, 0.13, 0.014], 0.012, A, [-0.1, 0, -0.2]), 0.01));
        break;
      case "rope":
        chest.push(add({ ...tor([-0.1, 0.25, 0.02], 0.2, 0.026, A, [0.1, 0, 0.9]), disp: { kind: "rib", amp: 0.004, freq: 30, c: [-0.1, 0.25, 0.02] } }, 0.01));
        break;
      case "guitar":
        chest.push(add(grp([add(ell([0.02, 0.12, -0.27], [0.15, 0.13, 0.05])), add(ell([-0.03, 0.27, -0.27], [0.11, 0.1, 0.05]), 0.04)], A), 0.0));
        chest.push(add(box([-0.16, 0.48, -0.27], [0.025, 0.2, 0.015], 0.008, B, [0, 0, 0.5]), 0.0));
        chest.push(...chain([[0.2 * w, 0.42, 0.1], [0, 0.25, 0.21 * w], [-0.2 * w, 0.0, 0.16]], 0.012, M.fab(SLOT.dark)));
        break;
      case "roll":
        chest.push(add(cyl([-0.18, 0.5, -0.25], 0.32, 0.04, 0.01, A, [0, 0, -0.5]), 0.0));
        break;
    }
  }
  pieces.chest = { ops: chest };

  // ---------------------------------------------------------------- pelvis
  const hips = grp([
    add(ell([0, 0.035, 0], [0.2 * w, 0.14, 0.165 * w], M.skin)),
    add(sph([0.11, -0.03, 0], 0.1, M.skin), 0.06),
    add(sph([-0.11, -0.03, 0], 0.1, M.skin), 0.06),
  ], M.skin);
  const pelvisSlot = outer?.kind === "overalls" ? SLOT.outer : SLOT.bottom;
  const pelvis: Op[] = [add(hips), add(shell(hips, 0.014, M.fab(pelvisSlot), [below(0.14)], folds(0.002)), 0.004)];
  if (o.belt) {
    pelvis.push(add(tor([0, 0.11, 0], 0.198 * w, 0.022, M.leather(SLOT.leather), undefined, 1, 0.84), 0.006));
    pelvis.push(add(box([0, 0.11, 0.17 * w], [0.034, 0.027, 0.012], 0.008, M.metal()), 0.004));
    pelvis.push(sub(box([0, 0.11, 0.185 * w], [0.018, 0.012, 0.01], 0.004), 0.002));
    if (o.belt.pouch) {
      pelvis.push(add(box([0.19 * w, 0.02, 0.09], [0.04, 0.055, 0.035], 0.014, M.leather(SLOT.accent + 6), [0, 0.5, 0]), 0.005));
      pelvis.push(add(box([0.195 * w, 0.06, 0.1], [0.043, 0.022, 0.038], 0.01, M.leather(SLOT.accent + 6), [0.15, 0.5, 0]), 0.003));
    }
  }
  if (outer?.kind === "apron") pelvis.push(add(tor([0, 0.12, 0], 0.2 * w, 0.016, M.fab(SLOT.outerTrim), undefined, 1, 0.84), 0.006));
  for (const e of o.extras ?? [])
    if (e.kind === "satchel" || e.kind === "tote") {
      const bag = M.leather(extraColorSlot(o, e.kind));
      const tote = e.kind === "tote";
      pelvis.push(add(box([-0.25 * w, 0.03, 0.03], tote ? [0.045, 0.13, 0.12] : [0.05, 0.095, 0.13], 0.03, bag, [0, 0, 0.08]), 0.0));
      if (!tote) pelvis.push(add(box([-0.29 * w, 0.075, 0.03], [0.014, 0.06, 0.135], 0.012, bag, [0, 0, 0.08]), 0.0));
    }
  pieces.pelvis = { ops: pelvis };

  // ---------------------------------------------------------------- skirt
  let skirtTop = 0.12;
  const skirtOps: Op[] = [];
  const S = (len: number, rTop: number, rHem: number, slot: number, extra: Partial<Extract<Node, { t: "skirt" }>> = {}): Node => ({
    t: "skirt", c: [0, skirtTop, 0], len, rTop, rHem, zs: 0.86, thick: 0.02, wave: 0.014, waves: 8,
    m: M.fab(slot), disp: { kind: "folds", amp: 0.004, freq: 12, c: [0, skirtTop, 0] }, ...extra,
  });
  if (bottom.kind === "skirt") skirtOps.push(add(S(0.32, 0.215 * w, 0.31 * w, SLOT.bottom)));
  if (bottom.kind === "long-skirt") skirtOps.push(add(S(0.56, 0.215 * w, 0.36 * w, SLOT.bottom, { wave: 0.02 })));
  if (bottom.kind === "chima") {
    skirtTop = SK.chestUp + 0.27;
    skirtOps.push(add(S(skirtTop + SK.hip - 0.035, 0.2 * w, 0.44 * w, SLOT.bottom, { wave: 0.022, waves: 10, c: [0, skirtTop, 0], disp: { kind: "folds", amp: 0.006, freq: 14, c: [0, skirtTop, 0] } })));
    skirtOps.push(add(tor([0, skirtTop - 0.01, 0], 0.205 * w, 0.02, M.fab(SLOT.bottomTrim), undefined, 1, 0.86), 0.008));
  }
  if (outer?.kind === "durumagi") skirtOps.push(add(S(0.6, 0.235 * w, 0.35 * w, SLOT.outer, { wave: 0.01 })));
  if (outer?.kind === "labcoat") skirtOps.push(add(S(0.46, 0.235 * w, 0.31 * w, SLOT.outer, { gap: 0.3, wave: 0.006 })));
  if (outer?.kind === "apron") {
    skirtOps.push(add(S(0.38, 0.235 * w, 0.29 * w, SLOT.outer, { front: 1.0, wave: 0.008 })));
    skirtOps.push(add(box([0, -0.1, 0.25 * w], [0.08, 0.05, 0.01], 0.01, M.fab(SLOT.outer)), 0.004));
  }
  if (bottom.trim && skirtish && bottom.kind !== "chima") {
    const len = bottom.kind === "skirt" ? 0.32 : 0.56;
    const rHem = bottom.kind === "skirt" ? 0.31 : 0.36;
    skirtOps.push(add(S(0.04, rHem * w * 0.985, rHem * w * 1.015, SLOT.bottomTrim, { wave: 0, c: [0, skirtTop - len + 0.035, 0] }), 0.004));
  }
  if (skirtOps.length) pieces.skirt = { ops: skirtOps };

  // ---------------------------------------------------------------- arms
  for (const [side, s] of [["L", 1], ["R", -1]] as const) {
    const upperBody = grp([
      add(cone([0, 0.0, 0], [0, -0.22, 0], 0.084 * aw, 0.068 * aw, M.skin)),
      add(sph([0, 0.0, 0], 0.088 * aw, M.skin), 0.03),
    ], M.skin);
    const upper: Op[] = [add(upperBody)];
    const wide = top.kind === "jeogori";
    const sm = M.fab(sleeveSlot);
    if (sleeves === "long") upper.push(add(shell(upperBody, wide ? 0.036 : outerSleeves ? 0.03 : 0.02, sm, [above(-0.26)], folds(0.003)), 0.004));
    if (sleeves === "short") {
      upper.push(add(shell(upperBody, 0.016, sm, [above(-0.1)]), 0.004));
      upper.push(add(tor([0, -0.095, 0], 0.08 * aw + 0.014, 0.013, M.fab(SLOT.topTrim)), 0.004));
    }
    if (sleeves === "rolled") {
      upper.push(add(shell(upperBody, 0.016, sm, [above(-0.18)]), 0.004));
      upper.push(add({ ...tor([0, -0.17, 0], 0.074 * aw + 0.016, 0.022, sm), disp: { kind: "folds", amp: 0.003, freq: 6, c: [0, -0.17, 0] } }, 0.006));
    }
    pieces[`upper${side}`] = { ops: upper };

    const foreBody = grp([add(cone([0, 0.01, 0], [0, -0.19, 0], 0.07 * aw, 0.053 * aw, M.skin))], M.skin);
    const fore: Op[] = [add(foreBody)];
    if (sleeves === "long") {
      fore.push(add(shell(foreBody, wide ? 0.034 : outerSleeves ? 0.024 : 0.014, sm, [above(-0.17)], folds(0.003)), 0.004));
      fore.push(add(tor([0, -0.165, 0], 0.056 * aw + (wide ? 0.034 : 0.02), 0.016, M.fab(top.kind === "jeogori" ? SLOT.topTrim : cuffSlot)), 0.004));
    }
    // Chunky hand: palm, four curled fingers and a thumb (palm faces the body).
    const hy = -SK.foreArm;
    const hand: Op[] = [add(ell([-s * 0.004, hy - 0.045, 0.004], [0.042, 0.056, 0.058], handMat), 0.0)];
    [0.036, 0.012, -0.012, -0.035].forEach((z, i) => {
      const lenF = i === 0 || i === 3 ? 0.03 : 0.036;
      const a: V3 = [-s * 0.004, hy - 0.085, z];
      const b: V3 = [-s * 0.016, hy - 0.085 - lenF, z * 1.05];
      const c: V3 = [-s * 0.034, hy - 0.1 - lenF, z * 1.05];
      hand.push(add(cap(a, b, 0.0185, handMat), 0.012));
      hand.push(add(cap(b, c, 0.0165, handMat), 0.008));
    });
    hand.push(add(cap([-s * 0.022, hy - 0.03, 0.042], [-s * 0.036, hy - 0.075, 0.068], 0.02, handMat), 0.014));
    fore.push(add(grp(hand, handMat), 0.02));
    // Props held in this hand (hand frame = elbow frame shifted by hy).
    const H = (p: V3): V3 => [p[0], p[1] + hy, p[2]];
    for (const e of o.extras ?? []) {
      const A = M.gloss(extraColorSlot(o, e.kind), 0.45);
      const right = side === "R";
      if (right && e.kind === "flag") {
        fore.push(add(cap(H([0, -0.06, -0.38]), H([0, -0.06, 0.78]), 0.012, M.gloss(SLOT.white)), 0.0));
        fore.push(add(box(H([-s * 0.13, -0.06, 0.64]), [0.12, 0.006, 0.08], 0.006, M.fab(extraColorSlot(o, "flag"))), 0.0));
      }
      if (right && e.kind === "lightstick") {
        fore.push(add(cap(H([0, -0.06, -0.08]), H([0, -0.06, 0.1]), 0.018, M.gloss(SLOT.white)), 0.0));
        fore.push(add(sph(H([0, -0.06, 0.17]), 0.055, { slot: extraColorSlot(o, "lightstick"), rough: 0.15 }), 0.01));
      }
      if (right && e.kind === "rod") fore.push(add(cap(H([0, -0.06, -0.2]), H([0, -0.75, 1.0]), 0.01, M.gloss(SLOT.dark)), 0.0));
      if (right && e.kind === "racket") {
        fore.push(add(cap(H([0, -0.04, 0]), H([0, -0.32, 0]), 0.012, M.gloss(SLOT.dark)), 0.0));
        fore.push(add(tor(H([0, -0.44, 0]), 0.1, 0.01, A, [0, 0, Math.PI / 2], 1, 1.3), 0.0));
      }
      if (right && e.kind === "cup") {
        fore.push(add(cyl(H([0, -0.07, 0.07]), 0.06, 0.04, 0.01, M.fab(SLOT.white), [Math.PI / 2 - 0.2, 0, 0]), 0.0));
        fore.push(add(tor(H([0, -0.07, 0.07]), 0.042, 0.008, M.fab(SLOT.accent + 7), [Math.PI / 2 - 0.2, 0, 0]), 0.0));
      }
      if (right && e.kind === "pole") fore.push(add(cap(H([0, 0.1, 0.01]), H([0, -0.75, 0.01]), 0.012, M.metal(SLOT.dark)), 0.0));
      if (e.kind === "drumsticks") fore.push(add(cone(H([0, -0.04, -0.02]), H([0, -0.3, 0.17]), 0.011, 0.007, M.gloss(SLOT.accent + 7, 0.5)), 0.0));
      if (!right && e.kind === "watering-can") {
        fore.push(add(cyl(H([0, -0.18, 0.02]), 0.08, 0.075, 0.02, A), 0.0));
        fore.push(add(cone(H([0, -0.2, 0.08]), H([0, -0.1, 0.25]), 0.018, 0.01, A), 0.01));
        fore.push(add(tor(H([0, -0.08, 0.02]), 0.06, 0.01, A, [0, 0, Math.PI / 2]), 0.004));
      }
      if (!right && e.kind === "basket") {
        fore.push(add(box(H([0, -0.22, 0.02]), [0.1, 0.07, 0.13], 0.03, M.fab(extraColorSlot(o, "basket"))), 0.0));
        fore.push(add(tor(H([0, -0.15, 0.02]), 0.11, 0.01, M.fab(extraColorSlot(o, "basket")), [Math.PI / 2, 0, 0]), 0.0));
        fore.push(add(box(H([0, -0.15, 0.02]), [0.09, 0.012, 0.12], 0.012, M.fab(extraColorSlot(o, "basket", true))), 0.0));
      }
    }
    pieces[`fore${side}`] = { ops: fore };

    // ---------------------------------------------------------------- legs
    const thighBody = grp([add(cone([0, 0.03, 0], [0, -0.26, 0], 0.1 * aw, 0.084 * aw, M.skin))], M.skin);
    const shinBody = grp([add(cone([0, 0.01, 0], [0, -0.235, 0], 0.084 * aw, 0.06 * aw, M.skin))], M.skin);
    const trousers = bottom.kind === "trousers" || bottom.kind === "baji" || outer?.kind === "overalls";
    const legSlot = outer?.kind === "overalls" ? SLOT.outer : SLOT.bottom;
    if (!longHem && !longCoat) {
      const thigh: Op[] = [add(thighBody)];
      if (trousers || bottom.kind === "shorts")
        thigh.push(add(shell(thighBody, bottom.kind === "baji" ? 0.03 : 0.014, M.fab(legSlot), bottom.kind === "shorts" ? [above(-0.13)] : [], folds(0.003)), 0.004));
      if (bottom.kind === "shorts") thigh.push(add(tor([0, -0.125, 0], 0.092 * aw + 0.012, 0.014, M.fab(bottom.trim ? SLOT.bottomTrim : SLOT.bottom)), 0.004));
      pieces[`thigh${side}`] = { ops: thigh };
    }
    if (!longHem) {
      const shin: Op[] = [add(shinBody)];
      if (trousers || longCoat) {
        const baji = bottom.kind === "baji";
        shin.push(add(shell(shinBody, baji ? 0.034 : 0.014, M.fab(legSlot), [], folds(0.003)), 0.004));
        if (baji) shin.push(add(tor([0, -0.2, 0], 0.062 * aw + 0.02, 0.016, M.fab(SLOT.bottomTrim)), 0.006));
      }
      if (o.feet.kind === "sneakers" && !trousers) shin.push(add({ ...tor([0, -0.215, 0], 0.062 * aw + 0.004, 0.015, M.fab(SLOT.white)), disp: { kind: "rib", amp: 0.002, freq: 14, c: [0, -0.215, 0] } }, 0.004));
      if (o.feet.kind === "boots") {
        shin.push(add(shell(shinBody, 0.024, M.leather(SLOT.shoe), [below(-0.08)]), 0.004));
        shin.push(add(tor([0, -0.08, 0], 0.075 * aw + 0.022, 0.016, M.leather(SLOT.shoe)), 0.004));
      }
      pieces[`shin${side}`] = { ops: shin };
    }
    // Chunky shoes.
    const shoeM = o.feet.kind === "sneakers" ? M.fab(SLOT.shoe, 0.62) : M.leather(SLOT.shoe);
    const flat = o.feet.kind === "flats";
    const foot: Op[] = [
      add(ell([0, -0.012, 0.035], [0.074, flat ? 0.045 : 0.06, 0.115], shoeM)),
      add(ell([0, -0.028, 0.11], [0.072, flat ? 0.034 : 0.046, 0.08], shoeM), 0.04),
      add(box([0, -0.053, 0.06], [0.078, flat ? 0.01 : 0.014, 0.14], 0.012, o.feet.kind === "sneakers" || o.feet.sole ? M.fab(SLOT.sole, 0.7) : M.leather(SLOT.shoe)), 0.008),
    ];
    if (o.feet.kind === "sneakers") {
      for (let i = 0; i < 3; i++) foot.push(add(cap([-0.03, 0.018 - i * 0.012, 0.05 + i * 0.022], [0.03, 0.018 - i * 0.012, 0.05 + i * 0.022], 0.008, M.fab(SLOT.white)), 0.003));
      foot.push(add(ell([0, -0.03, 0.155], [0.06, 0.03, 0.04], M.fab(SLOT.sole, 0.7)), 0.01));
    }
    if (flat && o.feet.sole) foot.push(add(sph([0, -0.01, 0.17], 0.022, M.gloss(SLOT.sole)), 0.008));
    pieces[`foot${side}`] = { ops: foot };
  }

  // ---------------------------------------------------------------- head
  const HC: V3 = [0, SK.headCenter, 0.01];
  const at = (x: number, y: number, z: number): V3 => [HC[0] + x, HC[1] + y, HC[2] + z];
  const eyes: Figure["eyes"] = [];
  const expr = o.face?.expr ?? "smile";
  const flick = o.face?.flick ?? ["long", "bob", "ponytail", "bun"].includes(o.hair.style);
  // Round head: big cranium and forehead, soft jaw, full cheeks.
  const head: Op[] = [
    add(ell(at(0, 0.015, 0), [0.375, 0.365, 0.355], M.skin)),
    add(ell(at(0, -0.1, 0.05), [0.3, 0.21, 0.27], M.skin), 0.13),
    add(ell(at(0, -0.215, 0.1), [0.13, 0.085, 0.11], M.skin), 0.09),
  ];
  const browLift = expr === "excited" ? 0.02 : expr === "proud" ? 0.01 : 0;
  for (const s of [1, -1]) {
    // Big round eyes, ~24% of the head width, below the mid-line, about one
    // eye-width apart, turned with the curve of the face.
    const rot = s * 0.42;
    const E = at(s * 0.17, -0.065, 0.268);
    const r: V3 = [0.088, 0.1, 0.056];
    eyes.push({ c: E, r, iris: [-s * 0.05, -0.03], rot });
    head.push(sub({ t: "ell", c: E, r: [r[0] + 0.007, r[1] + 0.007, r[2] + 0.006], rot: [0, rot, 0] }, 0.012));
    // Soft full cheeks.
    head.push(add(ell(at(s * 0.17, -0.155, 0.19), [0.12, 0.1, 0.1], M.skin), 0.07));
    // Thin arched brows in the hair colour, inner end slightly up (friendly).
    const lift = browLift + (expr === "thoughtful" && s < 0 ? 0.022 : 0);
    head.push(...chain([at(s * 0.1, 0.112 + lift, 0.338), at(s * 0.17, 0.118 + lift, 0.31), at(s * 0.245, 0.092 + lift, 0.268)], 0.0105, M.fab(SLOT.brow, 0.6)));
    // Ears.
    head.push(add(ell(at(s * 0.36, -0.04, -0.01), [0.048, 0.08, 0.06], M.skin), 0.03));
    head.push(sub(ell(at(s * 0.39, -0.04, 0.005), [0.02, 0.043, 0.03], { slot: SLOT.skinShade, rough: 0.6 }), 0.012));
  }
  // Small soft button nose, low on the face.
  head.push(add(ell(at(0, -0.14, 0.338), [0.034, 0.028, 0.03], M.skin), 0.03));
  // Mouth: always a smile; an open D-shaped grin for the cheerful ones.
  const mouthM: Mat = { slot: SLOT.mouth, rough: 0.5 };
  const MY = -0.225;
  if (expr === "grin" || expr === "excited") {
    const wide = expr === "excited" ? 1.12 : 1;
    const top = MY + 0.012;
    head.push(sub({ t: "grp", m: mouthM, ops: [
      add(ell(at(0, top, 0.33), [0.058 * wide, 0.042 * wide, 0.05])),
      { op: "int", k: 0.006, n: plane([0, 1, 0], HC[1] + top) },
    ] }, 0.006));
    head.push(add(ell(at(0, top - 0.008, 0.3), [0.044 * wide, 0.009, 0.022], M.gloss(SLOT.white, 0.3)), 0.0));
    head.push(add(ell(at(0, top - 0.038 * wide, 0.296), [0.034 * wide, 0.014, 0.024], M.gloss(SLOT.lip, 0.35)), 0.0));
  } else {
    const up = expr === "proud" ? 0.03 : 0.024;
    head.push(sub({ t: "grp", ops: chain([at(-0.058, MY + up, 0.302), at(-0.03, MY + 0.002, 0.318), at(0, MY - 0.004, 0.322), at(0.03, MY + 0.002, 0.318), at(0.058, MY + up, 0.302)], 0.0075, mouthM), m: mouthM }, 0.005));
  }
  const cheeks: V3[] = [at(0.2, -0.15, 0.265), at(-0.2, -0.15, 0.265)];

  // Hair.
  const hat = o.head?.kind;
  const hatted = !!hat && hat !== "headband" && hat !== "visor";
  const style = hat === "gat" ? "topknot" : hat && ["beanie", "helmet", "chef", "hardhat"].includes(hat) && o.hair.style === "curly" ? "crop" : o.hair.style;
  const HM: Mat = { slot: SLOT.hair, rough: 0.42, paint: "hair" };
  const locks = (amp: number, freq = 13): Node["disp"] => ({ kind: "locks", amp, freq, c: HC });
  if (hat !== "headscarf") {
    const tight = style === "buzz" ? 0.012 : style === "crop" || style === "topknot" ? 0.025 : 0.035;
    // Hairline: removes the face and, for short cuts, the nape.
    const nape = style === "bob" || style === "long" ? -0.5 : -0.2;
    const hairline = plane([0, -1, 0.55], -(HC[1] - 0.02 + 0.55 * HC[2]));
    const shellOps: Op[] = [add(ell(at(0, 0.02, -0.012), [0.37 + tight, 0.35 + tight, 0.345 + tight], HM))];
    if (style === "bob" || style === "long") {
      const L = style === "long" ? 0.48 : 0.27;
      shellOps.push(add(ell(at(0, -0.1 - L * 0.35, -0.16), [0.34, 0.2 + L * 0.5, 0.2], HM), 0.08));
      for (const s of [1, -1]) shellOps.push(add(cone(at(s * 0.3, 0.08, 0.1), at(s * 0.33, 0.02 - L, 0.06), 0.085, 0.045, HM), 0.06));
    }
    const hairNode: Node = {
      t: "shell",
      of: grp(shellOps, HM),
      d: 0,
      m: HM,
      clip: [
        ...(style === "bob" || style === "long"
          ? [not(ell(at(0, -0.17, 0.33), [0.3, 0.34, 0.3]))]
          : [hairline, above(HC[1] + nape)]),
        // Under a crowned hat only the hair below its rim shows.
        ...(hat && !["gat", "headband", "visor", "straw", "ranger", "bucket"].includes(hat) ? [below(HC[1] + 0.15)] : []),
      ],
      disp: style === "curly" ? { kind: "bumps", amp: 0.018, freq: 55 } : locks(style === "buzz" ? 0.003 : 0.012),
    };
    head.push(add(hairNode, 0.012));
    // Fringe clumps (under a hat brim only the side ones).
    const fringe = (xs: number[], sweep = 0) => {
      for (const x of xs)
        head.push(add({ ...cone(at(x, 0.28, 0.22), at(x * 1.15 + sweep, 0.17, 0.33), 0.062, 0.022, HM), disp: locks(0.004, 30) }, 0.03));
    };
    if (!hatted && style !== "buzz" && style !== "curly") {
      if (style === "side") fringe([-0.15, -0.05, 0.05], 0.06);
      else fringe([-0.16, -0.055, 0.055, 0.16]);
    }
    if (style === "ponytail") {
      head.push(add(sph(at(0, 0.06, -0.36), 0.05, M.fab(SLOT.topTrim)), 0.01));
      head.push(add({ ...cone(at(0, 0.05, -0.39), at(0, -0.3, -0.45), 0.085, 0.02, HM), disp: locks(0.006, 20) }, 0.02));
    }
    if (style === "bun") {
      head.push(add({ ...sph(at(0, 0.2, -0.29), 0.14, HM), disp: locks(0.008, 16) }, 0.04));
      if (has(o, "binyeo")) head.push(add(cap(at(-0.2, 0.2, -0.3), at(0.22, 0.21, -0.3), 0.012, M.metal(extraColorSlot(o, "binyeo"))), 0.0));
    }
    if (style === "topknot" && !hatted) head.push(add(sph(at(0, 0.38, -0.02), 0.085, HM), 0.03));
    if (style === "curly" && !hatted) head.push(add({ ...ell(at(0, 0.12, -0.02), [0.4, 0.3, 0.39], HM), disp: { kind: "bumps", amp: 0.024, freq: 28 } }, 0.04));
  }

  // Headwear.
  if (o.head) {
    const H = M.fab(SLOT.hat, 0.75), B = M.fab(SLOT.hatBand, 0.6);
    const tilt: V3 = [-0.1, 0, 0];
    switch (o.head.kind) {
      case "straw":
        head.push(add({ ...cyl(at(0, 0.2, -0.01), 0.012, 0.56, 0.012, H, tilt), disp: { kind: "rib", amp: 0.002, freq: 60, c: HC } }, 0.0));
        head.push(add({ ...cyl(at(0, 0.29, -0.02), 0.1, 0.3, 0.07, H, tilt), disp: { kind: "rib", amp: 0.002, freq: 60, c: HC } }, 0.02));
        head.push(add(tor(at(0, 0.235, -0.015), 0.302, 0.024, B, tilt), 0.006));
        break;
      case "gat":
        head.push(add(cyl(at(0, 0.21, -0.01), 0.006, 0.62, 0.006, M.gloss(SLOT.hat, 0.5), [-0.06, 0, 0]), 0.0));
        head.push(add(cyl(at(0, 0.37, -0.02), 0.16, 0.185, 0.04, M.gloss(SLOT.hat, 0.5), [-0.06, 0, 0]), 0.0));
        head.push(add(tor(at(0, 0.23, -0.015), 0.19, 0.015, B, [-0.06, 0, 0]), 0.004));
        for (const s of [1, -1]) {
          const pts: V3[] = [];
          for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(at(s * (0.3 - 0.2 * t), 0.18 - 0.42 * t, 0.06 + 0.18 * t)); }
          for (const p of pts) head.push(add(sph(p, 0.014, M.gloss(SLOT.dark, 0.3)), 0.0));
        }
        break;
      case "cap":
      case "cap-back": {
        const back = o.head.kind === "cap-back";
        head.push(add({ t: "shell", of: ell(at(0, 0.06, -0.02), [0.4, 0.36, 0.395]), d: 0, m: H, clip: [above(HC[1] + 0.1)] }, 0.0));
        head.push(add(box(at(0, 0.12, back ? -0.38 : 0.38), [0.17, 0.012, 0.11], 0.012, B, [back ? -0.18 : 0.18, 0, 0]), 0.01));
        head.push(add(sph(at(0, 0.42, -0.02), 0.03, B), 0.008));
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; head.push(sub(cap(at(Math.sin(a) * 0.38, 0.12, Math.cos(a) * 0.38), at(Math.sin(a) * 0.05, 0.42, Math.cos(a) * 0.05), 0.004), 0.004)); }
        break;
      }
      case "bucket":
        head.push(add(cyl(at(0, 0.27, -0.01), 0.12, 0.34, 0.07, H), 0.02));
        head.push(add({ t: "skirt", c: at(0, 0.17, -0.01), len: 0.11, rTop: 0.33, rHem: 0.5, zs: 1, thick: 0.012, wave: 0.01, waves: 6, m: H }, 0.01));
        head.push(add(tor(at(0, 0.18, -0.01), 0.34, 0.016, B), 0.005));
        break;
      case "beanie":
        head.push(add({ t: "shell", of: ell(at(0, 0.06, -0.02), [0.4, 0.38, 0.4]), d: 0, m: H, clip: [above(HC[1] + 0.02)], disp: { kind: "rib", amp: 0.005, freq: 24, c: HC } }, 0.0));
        head.push(add({ ...tor(at(0, 0.09, -0.02), 0.385, 0.04, B, [-0.15, 0, 0], 1, 1), disp: { kind: "rib", amp: 0.004, freq: 30, c: HC } }, 0.01));
        head.push(add(sph(at(0, 0.45, -0.04), 0.06, B), 0.02));
        break;
      case "hardhat":
        head.push(add({ t: "shell", of: ell(at(0, 0.05, -0.01), [0.41, 0.4, 0.43]), d: 0, m: M.gloss(SLOT.hat, 0.35), clip: [above(HC[1] + 0.12)] }, 0.0));
        head.push(add(cyl(at(0, 0.13, 0.01), 0.008, 0.47, 0.008, M.gloss(SLOT.hat, 0.35)), 0.01));
        head.push(add(cap(at(0, 0.44, -0.3), at(0, 0.45, 0.3), 0.03, M.gloss(SLOT.hat, 0.35)), 0.02));
        break;
      case "chef":
        head.push(add(cyl(at(0, 0.28, -0.03), 0.1, 0.35, 0.02, H, [-0.12, 0, 0]), 0.0));
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; head.push(add(sph(at(Math.sin(a) * 0.2, 0.48, Math.cos(a) * 0.2 - 0.05), 0.17, H), 0.08)); }
        head.push(add(sph(at(0, 0.53, -0.05), 0.18, H), 0.08));
        break;
      case "visor":
        head.push(add(tor(at(0, 0.13, 0), 0.375, 0.028, H, [-0.12, 0, 0], 1, 0.98), 0.0));
        head.push(add(box(at(0, 0.11, 0.39), [0.17, 0.01, 0.1], 0.01, B, [0.22, 0, 0]), 0.01));
        break;
      case "headband":
        head.push(add(tor(at(0, 0.14, 0), 0.382, 0.03, H, [-0.18, 0, 0]), 0.0));
        break;
      case "helmet":
        head.push(add({ t: "shell", of: ell(at(0, 0.06, -0.04), [0.42, 0.38, 0.47]), d: 0, m: M.gloss(SLOT.hat, 0.3), clip: [above(HC[1] + 0.08)] }, 0.0));
        for (const x of [-0.12, 0, 0.12]) head.push(sub(cap(at(x, 0.41, 0.25), at(x * 1.2, 0.36, -0.35), 0.022, B), 0.01));
        for (const s of [1, -1]) head.push(add(cap(at(s * 0.33, 0.08, 0.02), at(s * 0.12, -0.27, 0.2), 0.01, M.fab(SLOT.dark)), 0.004));
        break;
      case "beret":
        head.push(add(ell(at(0.04, 0.27, -0.02), [0.41, 0.12, 0.41], H), 0.04));
        head.push(add(sph(at(0.04, 0.4, -0.02), 0.025, H), 0.01));
        break;
      case "flatcap":
        head.push(add(ell(at(0, 0.24, 0.02), [0.4, 0.15, 0.44], H), 0.05));
        head.push(add(box(at(0, 0.15, 0.38), [0.17, 0.012, 0.08], 0.012, H, [0.3, 0, 0]), 0.02));
        break;
      case "ranger":
        head.push(add(cyl(at(0, 0.2, -0.01), 0.012, 0.55, 0.012, H), 0.0));
        head.push(add(cyl(at(0, 0.32, -0.01), 0.13, 0.28, 0.06, H), 0.02));
        for (const s of [1, -1]) head.push(sub(sph(at(s * 0.14, 0.5, 0.05), 0.07), 0.03));
        head.push(sub(cap(at(0, 0.5, 0.2), at(0, 0.5, -0.2), 0.05), 0.03));
        head.push(add(tor(at(0, 0.23, -0.01), 0.282, 0.02, B), 0.005));
        break;
      case "headscarf":
        head.push(add({ t: "shell", of: ell(at(0, 0.02, -0.02), [0.4, 0.39, 0.385]), d: 0, m: H, clip: [plane([0, -1, 0.55], -(HC[1] + 0.03 + 0.55 * HC[2]))], disp: { kind: "folds", amp: 0.004, freq: 9, c: HC } }, 0.01));
        head.push(add(sph(at(0, 0.08, -0.38), 0.06, B), 0.02));
        for (const s of [1, -1]) head.push(add(cone(at(0, 0.08, -0.4), at(s * 0.08, -0.12, -0.42), 0.04, 0.025, H), 0.01));
        break;
    }
  }
  // Head-mounted extras.
  for (const e of o.extras ?? []) {
    const A = M.metal(extraColorSlot(o, e.kind));
    if (e.kind === "glasses" || e.kind === "sunglasses") {
      for (const s of [1, -1]) {
        const E = at(s * 0.172, -0.065, 0.345);
        head.push(add(tor(E, 0.106, 0.008, A, [Math.PI / 2, s * 0.35, 0], 1, 1.0), 0.0));
        if (e.kind === "sunglasses") head.push(add({ t: "ell", c: E, r: [0.105, 0.095, 0.012], rot: [0, s * 0.35, 0], m: M.gloss(SLOT.dark, 0.1) }, 0.0));
        head.push(add(cap(at(s * 0.27, -0.06, 0.31), at(s * 0.37, -0.03, 0.0), 0.007, A), 0.0));
      }
      head.push(add(cap(at(-0.068, -0.055, 0.36), at(0.068, -0.055, 0.36), 0.007, A), 0.0));
    }
    if (e.kind === "headphones") {
      head.push(add({ t: "shell", of: tor(at(0, 0.0, -0.02), 0.41, 0.025, M.fab(extraColorSlot(o, e.kind)), [0, 0, Math.PI / 2]), d: 0, m: M.gloss(extraColorSlot(o, e.kind), 0.4), clip: [above(HC[1] - 0.02)] }, 0.0));
      for (const s of [1, -1]) head.push(add(cyl(at(s * 0.38, -0.03, -0.01), 0.035, 0.08, 0.025, M.gloss(extraColorSlot(o, e.kind, true), 0.4), [0, 0, Math.PI / 2]), 0.01));
    }
    if (e.kind === "pencil") head.push(add(cone(at(0.34, 0.06, 0.12), at(0.36, 0.05, -0.08), 0.012, 0.008, M.gloss(SLOT.accent + 7, 0.5)), 0.0));
  }
  pieces.head = { ops: head };

  // ---------------------------------------------------------------- eyes
  const eyeOps: Op[] = [];
  for (const [i, s] of [1, -1].entries()) {
    const { c: E, r, rot } = eyes[i];
    eyeOps.push(add({ t: "ell", c: E, r, rot: [0, rot, 0], m: { slot: SLOT.iris, rough: 0.08, paint: "eye" } }));
    // Soft upper lash line hugging the top of the eye (+ an outer flick).
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const P = (lx: number, ly: number, lz: number): V3 => [E[0] + lx * cr + lz * sr, E[1] + ly, E[2] - lx * sr + lz * cr];
    const pts: V3[] = [];
    for (const deg of [168, 135, 100, 65, 30, 8]) {
      const a = (deg * Math.PI) / 180;
      const k = 0.95;
      pts.push(P(s * r[0] * k * Math.cos(a), r[1] * k * Math.sin(a) + 0.004, r[2] * Math.sqrt(1 - k * k) + 0.007));
    }
    if (flick) pts.push(P(s * r[0] * 1.16, r[1] * 0.5, 0.004));
    eyeOps.push(...chain(pts, 0.0092, { slot: SLOT.dark, rough: 0.5 }));
  }
  pieces.eyes = { ops: eyeOps };
  return { pieces, skirtTop, eyes, cheeks, mouth: at(0, -0.228, 0.31) };
}

/** Palette (sRGB hex per slot) for an outfit. Extras fill accent slots. */
export function outfitPalette(o: Outfit, mixFn: (a: string, b: string, t: number) => string, shadeFn: (h: string, a: number) => string): string[] {
  const pal: string[] = new Array(32).fill("#ff00ff");
  const hatColor = o.head?.color ?? "#e0b86d";
  pal[SLOT.skin] = o.skin;
  pal[SLOT.blush] = mixFn(o.skin, "#ff7470", 0.6);
  pal[SLOT.lip] = mixFn(o.skin, "#e0727c", 0.5);
  pal[SLOT.hair] = o.hair.color;
  pal[SLOT.hairLight] = shadeFn(o.hair.color, 0.42);
  pal[SLOT.brow] = mixFn(o.hair.color, o.skin, 0.22);
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
  pal[SLOT.mouth] = "#7a3036";
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
