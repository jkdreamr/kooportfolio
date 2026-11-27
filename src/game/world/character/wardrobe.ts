import * as THREE from "three";
import {
  makeLook,
  type Hold,
  type Joint,
  type Look,
  type Palette,
  type Part,
  type Vec3,
} from "./rig";

/**
 * Data-driven wardrobe: an `Outfit` says what a character is made of and
 * wears; `compileOutfit` turns it into the rig's flat part list (a `Look`).
 * Everything is built from the rig's shared geometry kit, so a new garment
 * costs triangles but never a draw call or a shader.
 *
 * Joint frames (character units, y up, +z forward): pelvis at the hips
 * (belt ≈ y 0.12), chest 0.1 above it (torso lathe −0.09 … 0.55, front
 * surface z ≈ 0.2), neck/head above, shoulders at chest (±0.268, 0.415),
 * elbows −0.255 below, hands −0.245 below that, hips at pelvis (±0.118,
 * −0.035), knees −0.345, ankles −0.325 (ankle ≈ 0.065 above the ground).
 */

export type HairStyle =
  | "crop"
  | "buzz"
  | "side"
  | "bob"
  | "long"
  | "ponytail"
  | "bun"
  | "curly"
  | "topknot";
export type TopKind =
  | "tee"
  | "shirt"
  | "polo"
  | "jersey"
  | "tank"
  | "hoodie"
  | "turtleneck"
  | "sweater"
  | "jeogori"
  | "chef";
export type BottomKind =
  | "trousers"
  | "shorts"
  | "skirt"
  | "long-skirt"
  | "chima"
  | "baji";
export type OuterKind =
  | "jacket"
  | "blazer"
  | "vest"
  | "labcoat"
  | "durumagi"
  | "apron"
  | "cardigan"
  | "overalls";
export type HeadKind =
  | "straw"
  | "gat"
  | "cap"
  | "cap-back"
  | "bucket"
  | "beanie"
  | "hardhat"
  | "chef"
  | "visor"
  | "headband"
  | "helmet"
  | "beret"
  | "flatcap"
  | "ranger"
  | "headscarf";
export type FootKind = "shoes" | "sneakers" | "boots" | "flats";
export type ExtraKind =
  | "glasses"
  | "sunglasses"
  | "scarf"
  | "lanyard"
  | "backpack"
  | "satchel"
  | "tote"
  | "camera"
  | "book"
  | "clipboard"
  | "flag"
  | "ball"
  | "racket"
  | "drumsticks"
  | "rod"
  | "guitar"
  | "watering-can"
  | "lightstick"
  | "pole"
  | "map"
  | "headphones"
  | "cup"
  | "basket"
  | "envelope"
  | "rope"
  | "pencil"
  | "towel"
  | "whistle"
  | "binyeo"
  | "roll"
  | "number"
  | "goreum";
export type Extra = { kind: ExtraKind; color?: string; color2?: string };

export type Outfit = {
  /** Height (uniform scale) and width (torso/limb girth), both ≈1. */
  build?: { height?: number; width?: number };
  skin: string;
  /** Iris colour. */
  eyes?: string;
  hair: { style: HairStyle; color: string };
  top: {
    kind: TopKind;
    color: string;
    trim?: string;
    sleeves?: "long" | "short" | "none" | "rolled";
  };
  bottom: { kind: BottomKind; color: string; trim?: string };
  outer?: { kind: OuterKind; color: string; trim?: string };
  belt?: { color: string; buckle?: string; pouch?: string };
  head?: { kind: HeadKind; color: string; band?: string };
  feet: { kind: FootKind; color: string; sole?: string };
  gloves?: string;
  extras?: Extra[];
};

// --- Colour helpers ----------------------------------------------------------
const tmp = new THREE.Color(),
  tmp2 = new THREE.Color();
/** Lighten (>0) or darken (<0) a hex colour, in linear-ish sRGB space. */
export function shade(hex: string, amount: number) {
  tmp.set(hex);
  if (amount >= 0) tmp.lerp(tmp2.set("#ffffff"), amount);
  else tmp.multiplyScalar(1 + amount);
  return `#${tmp.getHexString()}`;
}
export function mix(a: string, b: string, t: number) {
  tmp.set(a).lerp(tmp2.set(b), t);
  return `#${tmp.getHexString()}`;
}

const mirrorJoint = (j: Joint): Joint =>
  j.endsWith("L") ? ((j.slice(0, -1) + "R") as Joint) : j;
const mirror = (part: Part): Part => ({
  ...part,
  joint: mirrorJoint(part.joint),
  p: [-part.p[0], part.p[1], part.p[2]],
  r: part.r ? [part.r[0], -part.r[1], -part.r[2]] : undefined,
});

type Ctx = {
  parts: Part[];
  w: number;
  add: (part: Part) => void;
  pair: (part: Part) => void;
};

// --- Body --------------------------------------------------------------------
function body(c: Ctx, o: Outfit) {
  const { w } = c;
  const top = o.top,
    bottom = o.bottom,
    outer = o.outer;
  const sleeveColor =
    outer && ["jacket", "blazer", "labcoat", "durumagi", "cardigan"].includes(outer.kind)
      ? outer.color
      : top.color;
  const torsoColor =
    outer &&
    ["jacket", "blazer", "vest", "labcoat", "durumagi", "cardigan"].includes(
      outer.kind,
    )
      ? outer.color
      : top.color;
  const sleeves = outer
    ? outer.kind === "vest" || outer.kind === "apron" || outer.kind === "overalls"
      ? (top.sleeves ?? "short")
      : "long"
    : (top.sleeves ??
      (top.kind === "tank" || top.kind === "jersey"
        ? "none"
        : top.kind === "tee" || top.kind === "polo"
          ? "short"
          : "long"));
  // Torso + neck.
  c.add({ kind: "torso", joint: "chest", p: [0, 0, 0], s: [w, 1, w], color: torsoColor, breath: true });
  c.add({
    kind: "limb",
    joint: "neck",
    p: [0, 0.09, 0.01],
    s: [0.078, 0.12, 0.078],
    color: top.kind === "turtleneck" ? top.color : o.skin,
  });
  // Arms: upper sleeve, forearm (skin or sleeve), cuffs.
  const upper = sleeves === "none" ? o.skin : sleeveColor;
  const fore = sleeves === "long" ? sleeveColor : o.skin;
  const aw = 0.5 + w * 0.5;
  c.pair({ kind: "limb", joint: "shoulderL", p: [0, 0.02, 0], s: [0.09 * aw, 0.27, 0.09 * aw], color: upper });
  c.pair({ kind: "limb", joint: "elbowL", p: [0, 0.02, 0], s: [0.07 * aw, 0.25, 0.07 * aw], color: fore });
  if (sleeves === "short" || sleeves === "rolled") {
    // A short sleeve is a wider fabric cap over the bare upper arm.
    c.pair({
      kind: "limb",
      joint: "shoulderL",
      p: [0, 0.035, 0],
      s: [0.112 * aw, sleeves === "rolled" ? 0.27 : 0.16, 0.112 * aw],
      color: sleeveColor,
      lod: "near",
    });
    if (sleeves === "rolled")
      c.pair({ kind: "band", joint: "elbowL", p: [0, 0.0, 0], s: [0.085 * aw, 0.06, 0.085 * aw], color: shade(sleeveColor, 0.12) });
  }
  if (sleeves === "long") {
    const cuff = outer?.trim ?? top.trim ?? shade(sleeveColor, -0.18);
    c.pair({ kind: "band", joint: "handL", p: [0, 0.04, 0], s: [0.074 * aw, 0.05, 0.074 * aw], color: cuff });
  }
  if (sleeves === "none" && top.trim)
    c.pair({ kind: "band", joint: "shoulderL", p: [0.0, -0.02, 0], s: [0.098 * aw, 0.035, 0.098 * aw], r: [0, 0, 0.25], color: top.trim });
  // Hands: a mitten palm with fingers curled and a separate thumb.
  const hand = o.gloves ?? o.skin;
  c.pair({ kind: "bead", joint: "handL", p: [0, -0.045, 0.005], s: [0.058, 0.075, 0.066], color: hand });
  c.pair({ kind: "bead", joint: "handL", p: [-0.03, -0.035, 0.045], s: [0.022, 0.048, 0.024], r: [0.5, 0, -0.35], color: hand });
  c.pair({ kind: "box", joint: "handL", p: [0, -0.05, 0.0], s: [0.1, 0.12, 0.1], color: hand, lod: "far" });

  // Lower body.
  const longHem = bottom.kind === "chima" || bottom.kind === "long-skirt";
  const skirtish = bottom.kind === "skirt" || longHem;
  const legColor = skirtish ? o.skin : bottom.color;
  if (!skirtish || bottom.kind === "skirt") {
    // Seat/hips (hidden under skirts and long coats).
    if (!skirtish)
      c.add({ kind: "limb", joint: "pelvis", p: [0, 0.11, 0], s: [0.215 * w, 0.21, 0.178 * w], color: bottom.color });
  }
  if (!longHem) {
    const shorts = bottom.kind === "shorts";
    if (!skirtish)
      c.pair({
        kind: "limb",
        joint: "hipL",
        p: [0, 0.03, 0],
        s: [0.108 * aw, shorts ? 0.2 : 0.36, 0.108 * aw],
        color: bottom.color,
      });
    if (shorts || skirtish)
      c.pair({ kind: "limb", joint: "hipL", p: [0, 0.02, 0], s: [0.092 * aw, 0.36, 0.092 * aw], color: o.skin, lod: skirtish ? "near" : undefined });
    if (shorts && bottom.trim)
      c.pair({ kind: "box", joint: "hipL", p: [0.1, -0.08, 0], s: [0.02, 0.2, 0.05], color: bottom.trim, lod: "near" });
    const shinColor = shorts || bottom.kind === "skirt" ? o.skin : legColor;
    const baji = bottom.kind === "baji";
    c.pair({
      kind: "limb",
      joint: "kneeL",
      p: [0, 0.02, 0],
      s: [0.09 * aw * (baji ? 1.2 : 1), 0.34, 0.09 * aw * (baji ? 1.2 : 1)],
      color: shinColor,
    });
    if (baji)
      c.pair({ kind: "band", joint: "ankleL", p: [0, 0.04, 0], s: [0.07, 0.05, 0.07], color: shade(bottom.color, -0.25) });
  }
  // Skirts and dresses: front and back panels flare with the stride.
  const hemColor = bottom.trim;
  const panels = (
    joint: Joint,
    y: number,
    radius: number,
    length: number,
    color: string,
    flare: number,
    lod?: "near",
  ) => {
    for (const ry of [0, Math.PI])
      c.add({
        kind: "skirt",
        joint,
        p: [0, y, ry ? -0.004 : 0],
        s: [radius * w, length, radius * 0.86 * w],
        r: [0, ry, 0],
        color,
        flare,
        lod,
      });
  };
  if (bottom.kind === "skirt") panels("pelvis", 0.13, 0.36, 0.48, bottom.color, 1);
  if (bottom.kind === "long-skirt") panels("pelvis", 0.13, 0.42, 0.86, bottom.color, 1.1);
  if (bottom.kind === "chima") {
    // Tied high under the arms, a full bell to the ankles.
    panels("chest", 0.31, 0.4, 1.22, bottom.color, 1.3);
    c.add({ kind: "band", joint: "chest", p: [0, 0.31, 0], s: [0.25 * w, 0.045, 0.21 * w], color: hemColor ?? shade(bottom.color, 0.25) });
  }
  // Shoes.
  feet(c, o);
}

function feet(c: Ctx, o: Outfit) {
  const f = o.feet;
  const flat = f.kind === "flats";
  c.pair({
    kind: "box",
    joint: "ankleL",
    p: [0, flat ? -0.04 : -0.03, 0.055],
    s: [flat ? 0.15 : 0.17, flat ? 0.08 : 0.11, flat ? 0.27 : 0.3],
    color: f.color,
  });
  if (f.kind === "sneakers" || (f.kind === "boots" && f.sole))
    c.pair({ kind: "box", joint: "ankleL", p: [0, -0.087, 0.058], s: [0.18, 0.035, 0.31], color: f.sole ?? "#f2efe8", lod: "near" });
  if (f.kind === "sneakers")
    c.pair({ kind: "band", joint: "ankleL", p: [0, 0.035, 0], s: [0.072, 0.05, 0.072], color: "#f1eee6" });
  if (f.kind === "boots")
    c.pair({ kind: "limb", joint: "kneeL", p: [0, -0.14, 0], s: [0.1, 0.2, 0.1], color: f.color });
  if (flat && f.sole)
    // Kkotsin-style toe accent.
    c.pair({ kind: "bead", joint: "ankleL", p: [0, -0.02, 0.17], s: [0.04, 0.025, 0.03], color: f.sole });
}

// --- Upper layers --------------------------------------------------------------
function topDetail(c: Ctx, o: Outfit) {
  const { w } = c;
  const top = o.top;
  const trim = top.trim ?? shade(top.color, -0.2);
  const hem = (color: string, y = 0.02) =>
    c.add({ kind: "band", joint: "chest", p: [0, y, 0], s: [0.233 * w, 0.035, 0.188 * w], color });
  switch (top.kind) {
    case "tee":
    case "tank":
      c.add({ kind: "band", joint: "chest", p: [0, 0.525, 0], s: [0.105, 0.03, 0.09], color: trim });
      break;
    case "jersey":
      c.add({ kind: "band", joint: "chest", p: [0, 0.525, 0.005], s: [0.11, 0.035, 0.095], r: [-0.25, 0, 0], color: trim });
      hem(trim);
      break;
    case "turtleneck":
      c.add({ kind: "band", joint: "chest", p: [0, 0.56, 0.005], s: [0.095, 0.1, 0.09], color: shade(top.color, -0.08) });
      break;
    case "sweater":
      c.add({ kind: "band", joint: "chest", p: [0, 0.53, 0], s: [0.11, 0.045, 0.095], color: trim });
      hem(trim, 0.03);
      break;
    case "hoodie":
      // Hood folded behind the neck, drawstrings and a front pocket.
      c.add({ kind: "crown", joint: "chest", p: [0, 0.5, -0.1], s: [0.75, 0.65, 0.7], r: [-1.9, 0, 0], color: shade(top.color, -0.06) });
      c.pair({ kind: "box", joint: "chest", p: [0.045, 0.4, 0.205], s: [0.012, 0.12, 0.012], color: "#efe9df", lod: "near" });
      c.add({ kind: "box", joint: "chest", p: [0, 0.12, 0.2], s: [0.26, 0.11, 0.03], r: [0.05, 0, 0], color: shade(top.color, -0.08), lod: "near" });
      hem(shade(top.color, -0.1), 0.0);
      break;
    case "shirt":
    case "polo":
    case "chef":
      if (!o.outer || o.outer.kind === "vest" || o.outer.kind === "apron" || o.outer.kind === "overalls") {
        // The chest is covered by a vest/apron/bib: collar only.
        const covered = !!o.outer;
        // Collar flaps and a button placket.
        c.pair({ kind: "box", joint: "chest", p: [0.055, 0.5, 0.15], s: [0.1, 0.022, 0.08], r: [0.85, 0, 0.35], color: top.kind === "chef" ? top.color : shade(top.color, 0.08) });
        if (top.kind === "chef") {
          // Double-breasted: two rows of buttons.
          for (const y of [0.42, 0.3, 0.18])
            c.pair({ kind: "bead", joint: "chest", p: [0.07, y, 0.205], s: [0.016, 0.016, 0.01], color: "#d8d2c8" });
        } else if (!covered) {
          c.add({ kind: "box", joint: "chest", p: [0, 0.3, 0.205], s: [0.03, top.kind === "polo" ? 0.16 : 0.42, 0.012], r: [-0.06, 0, 0], color: shade(top.color, -0.08), lod: "near" });
          for (const y of top.kind === "polo" ? [0.42, 0.34] : [0.44, 0.32, 0.2])
            c.add({ kind: "bead", joint: "chest", p: [0, y, 0.213], s: [0.012, 0.012, 0.008], color: "#f2ede4" });
        }
      }
      break;
    case "jeogori":
      // Short jacket: white dongjeong collar crossing to the right, the
      // goreum ribbon bow, contrasting cuffs (set via trim).
      c.add({ kind: "box", joint: "chest", p: [-0.03, 0.43, 0.18], s: [0.045, 0.24, 0.025], r: [-0.3, 0, 0.75], color: "#f4f1ea" });
      c.add({ kind: "box", joint: "chest", p: [0.06, 0.44, 0.17], s: [0.05, 0.2, 0.024], r: [-0.3, 0, -0.55], color: shade(top.color, -0.15) });
      break;
  }
}

function outerLayer(c: Ctx, o: Outfit) {
  const outer = o.outer;
  if (!outer) return;
  const { w } = c;
  const trim = outer.trim ?? shade(outer.color, -0.22);
  const inner = (height = 0.3, y = 0.31) =>
    c.add({ kind: "box", joint: "chest", p: [0, y, 0.2], s: [0.12, height, 0.02], r: [-0.07, 0, 0], color: o.top.color });
  const lapels = (color: string) =>
    c.pair({ kind: "box", joint: "chest", p: [0.065, 0.38, 0.205], s: [0.05, 0.26, 0.022], r: [-0.08, 0, 0.32], color, lod: "near" });
  const tails = (y: number, length: number, color: string, gap: number, flare: number) => {
    // Two panels with an open front.
    for (const side of [1, -1])
      c.add({
        kind: "skirt",
        joint: "pelvis",
        p: [0, y, 0],
        s: [0.36 * w * (side < 0 ? 1.012 : 1), length, 0.31 * w * (side < 0 ? 1.012 : 1)],
        r: [0, side * (Math.PI / 2 + gap), 0],
        color,
        flare,
      });
  };
  switch (outer.kind) {
    case "jacket":
    case "blazer":
      inner();
      lapels(outer.kind === "blazer" ? shade(outer.color, -0.12) : trim);
      c.add({ kind: "band", joint: "chest", p: [0, 0.02, 0], s: [0.24 * w, 0.04, 0.194 * w], color: trim });
      if (outer.kind === "blazer")
        c.add({ kind: "box", joint: "chest", p: [0.13, 0.36, 0.19], s: [0.07, 0.012, 0.02], color: shade(outer.color, -0.15), lod: "near" });
      break;
    case "cardigan":
      inner(0.36, 0.28);
      c.pair({ kind: "box", joint: "chest", p: [0.07, 0.28, 0.205], s: [0.018, 0.4, 0.018], color: trim, lod: "near" });
      for (const y of [0.32, 0.2, 0.08])
        c.add({ kind: "bead", joint: "chest", p: [0.075, y, 0.214], s: [0.014, 0.014, 0.009], color: shade(outer.color, 0.35) });
      c.add({ kind: "band", joint: "chest", p: [0, 0.02, 0], s: [0.24 * w, 0.045, 0.194 * w], color: trim });
      break;
    case "vest":
      inner(0.26, 0.36);
      c.pair({ kind: "box", joint: "chest", p: [0.12, 0.17, 0.19], s: [0.09, 0.08, 0.03], r: [0, 0.35, 0], color: shade(outer.color, -0.1), lod: "near" });
      c.add({ kind: "band", joint: "chest", p: [0, 0.02, 0], s: [0.24 * w, 0.04, 0.194 * w], color: trim });
      break;
    case "labcoat":
      inner();
      lapels(shade(outer.color, -0.06));
      tails(0.11, 0.62, outer.color, 0.16, 0.7);
      c.add({ kind: "box", joint: "chest", p: [0.13, 0.3, 0.195], s: [0.08, 0.07, 0.02], r: [0, 0.35, 0], color: shade(outer.color, -0.07), lod: "near" });
      c.add({ kind: "bead", joint: "chest", p: [0.15, 0.345, 0.205], s: [0.008, 0.035, 0.008], color: "#3a5f9a" });
      break;
    case "durumagi":
      // Long closed overcoat with the goreum bow; white baji show beneath.
      c.add({ kind: "box", joint: "chest", p: [-0.02, 0.43, 0.185], s: [0.04, 0.26, 0.024], r: [-0.3, 0, 0.7], color: "#f4f1ea" });
      for (const ry of [0, Math.PI])
        c.add({ kind: "skirt", joint: "pelvis", p: [0, 0.12, ry ? -0.004 : 0], s: [0.39 * w, 0.92, 0.33 * w], r: [0, ry, 0], color: outer.color, flare: 0.8 });
      c.add({ kind: "box", joint: "chest", p: [-0.08, 0.27, 0.205], s: [0.035, 0.24, 0.012], r: [0.05, 0, 0.15], color: trim, lod: "near" });
      c.add({ kind: "bead", joint: "chest", p: [-0.07, 0.36, 0.215], s: [0.03, 0.022, 0.018], color: trim });
      break;
    case "apron": {
      // Bib, neck strap, waist tie and a front panel over the legs.
      c.add({ kind: "box", joint: "chest", p: [0, 0.32, 0.2], s: [0.25, 0.3, 0.02], r: [-0.06, 0, 0], color: outer.color });
      c.pair({ kind: "box", joint: "chest", p: [0.09, 0.5, 0.14], s: [0.03, 0.14, 0.012], r: [-0.6, 0, -0.25], color: outer.color, lod: "near" });
      c.add({ kind: "band", joint: "pelvis", p: [0, 0.13, 0], s: [0.24 * w, 0.035, 0.195 * w], color: trim });
      c.add({ kind: "skirt", joint: "pelvis", p: [0, 0.13, 0.004], s: [0.37 * w, 0.58, 0.33 * w], color: outer.color, flare: 0.8 });
      c.add({ kind: "box", joint: "pelvis", p: [0, -0.12, 0.27], s: [0.18, 0.1, 0.02], r: [-0.2, 0, 0], color: shade(outer.color, -0.08), lod: "near" });
      break;
    }
    case "overalls":
      c.add({ kind: "box", joint: "chest", p: [0, 0.22, 0.2], s: [0.24, 0.24, 0.02], r: [-0.04, 0, 0], color: outer.color });
      c.pair({ kind: "box", joint: "chest", p: [0.08, 0.42, 0.13], s: [0.035, 0.26, 0.012], r: [-0.5, 0, 0], color: outer.color, lod: "near" });
      c.pair({ kind: "bead", joint: "chest", p: [0.08, 0.33, 0.215], s: [0.016, 0.016, 0.01], color: "#c9b27a" });
      c.add({ kind: "box", joint: "chest", p: [0, 0.22, 0.212], s: [0.1, 0.08, 0.01], color: shade(outer.color, -0.1), lod: "near" });
      break;
  }
}

function belt(c: Ctx, o: Outfit) {
  if (!o.belt) return;
  const { w } = c;
  c.add({ kind: "band", joint: "pelvis", p: [0, 0.12, 0], s: [0.237 * w, 0.045, 0.192 * w], color: o.belt.color });
  c.add({ kind: "bead", joint: "pelvis", p: [0, 0.12, 0.19 * w], s: [0.035, 0.03, 0.014], color: o.belt.buckle ?? "#c8a24e" });
  if (o.belt.pouch)
    c.add({ kind: "box", joint: "pelvis", p: [0.2 * w, 0.03, 0.09], s: [0.07, 0.12, 0.1], r: [0, 0.5, 0], color: o.belt.pouch });
}

// --- Head --------------------------------------------------------------------
function face(c: Ctx, o: Outfit, earsHidden: boolean) {
  const iris = o.eyes ?? "#3a2a20";
  const brow = shade(o.hair.color, -0.15);
  for (const x of [0.112, -0.112]) {
    c.add({ kind: "bead", joint: "head", p: [x, 0.282, 0.283], s: [0.056, 0.068, 0.034], color: "#f6f2ec", eye: true });
    c.add({ kind: "bead", joint: "head", p: [x * 1.02, 0.276, 0.307], s: [0.037, 0.05, 0.02], color: iris, eye: true });
    c.add({ kind: "bead", joint: "head", p: [x + 0.014, 0.296, 0.325], s: [0.012, 0.014, 0.007], color: "#ffffff", glow: 2.4, eye: true });
    c.add({ kind: "box", joint: "head", p: [x, 0.28, 0.29], s: [0.05, 0.06, 0.03], color: "#2a2522", lod: "far" });
  }
  c.pair({ kind: "bead", joint: "head", p: [0.115, 0.342, 0.302], s: [0.052, 0.013, 0.018], r: [0, 0.25, -0.12], color: brow });
  c.add({ kind: "bead", joint: "head", p: [0, 0.218, 0.322], s: [0.034, 0.03, 0.03], color: shade(o.skin, -0.04) });
  c.add({ kind: "bead", joint: "head", p: [0, 0.158, 0.3], s: [0.045, 0.011, 0.013], color: mix(o.skin, "#8f3f3c", 0.6), mouth: true });
  c.pair({ kind: "bead", joint: "head", p: [0.19, 0.2, 0.262], s: [0.052, 0.026, 0.014], r: [0, 0.6, 0], color: mix(o.skin, "#e8806e", 0.45) });
  if (!earsHidden)
    c.pair({ kind: "bead", joint: "head", p: [0.33, 0.27, 0.0], s: [0.05, 0.074, 0.04], color: o.skin });
}

function hair(c: Ctx, o: Outfit, hatted: boolean) {
  const color = o.hair.color;
  const style = o.hair.style;
  const lift = shade(color, 0.08);
  const lock = (p: Vec3, s: Vec3, rx = 0, rz = 0, ry?: number, near = true) =>
    c.add({
      kind: "lock",
      joint: "head",
      p,
      s,
      // Curl outward from the head centre unless told otherwise.
      r: [rx, ry ?? Math.atan2(p[0], p[2] - 0.0), rz],
      color: s[1] > 0.3 ? color : lift,
      lod: near ? "near" : undefined,
    });
  const tight = style === "buzz" ? 0.985 : style === "crop" || style === "topknot" ? 0.995 : 1;
  c.add({ kind: "hair", joint: "head", p: [0, 0.3, 0], s: [0.355 * tight, 0.348 * tight, 0.34 * tight], color });
  if (style === "buzz") return;
  // Fringe clumps over the forehead (hidden by a hat crown).
  const fringe = () => {
    if (hatted) return;
    lock([0.1, 0.48, 0.25], [0.11, 0.17, 0.09], 0.35, -0.35);
    lock([-0.02, 0.5, 0.27], [0.12, 0.19, 0.09], 0.4, 0.15);
    lock([-0.14, 0.47, 0.23], [0.1, 0.15, 0.08], 0.35, 0.45);
  };
  switch (style) {
    case "crop":
    case "topknot":
      if (!hatted) fringe();
      if (style === "topknot" && !hatted)
        c.add({ kind: "sphere", joint: "head", p: [0, 0.68, -0.02], s: [0.09, 0.1, 0.09], color });
      break;
    case "side":
      if (!hatted) {
        lock([0.06, 0.52, 0.24], [0.13, 0.2, 0.1], 0.5, 1.15);
        lock([-0.1, 0.5, 0.25], [0.12, 0.17, 0.09], 0.45, 1.0);
      }
      lock([0.31, 0.32, 0.05], [0.09, 0.15, 0.08], 0, 0.1);
      break;
    case "bob":
    case "long": {
      const long = style === "long";
      fringe();
      for (const side of [1, -1])
        lock([0.27 * side, 0.32, 0.04], [0.15, long ? 0.42 : 0.29, 0.13], 0.0, 0.1 * side);
      lock([0, 0.36, -0.2], [0.26, long ? 0.62 : 0.32, 0.14], -0.15, 0, Math.PI, false);
      break;
    }
    case "ponytail":
      if (!hatted) fringe();
      c.add({ kind: "bead", joint: "head", p: [0, 0.43, -0.31], s: [0.05, 0.05, 0.05], color: o.top.trim ?? shade(color, -0.3) });
      lock([0, 0.43, -0.34], [0.12, 0.44, 0.1], -0.55, 0, Math.PI, true);
      c.add({ kind: "limb", joint: "head", p: [0, 0.42, -0.34], s: [0.08, 0.36, 0.07], r: [0.5, 0, 0], color, lod: "far" });
      break;
    case "bun":
      if (!hatted) fringe();
      c.add({ kind: "sphere", joint: "head", p: [0, 0.52, -0.25], s: [0.15, 0.14, 0.14], color });
      break;
    case "curly":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const y = 0.4 + Math.cos(a * 2) * 0.08;
        lock([Math.sin(a) * 0.31, y, Math.cos(a) * 0.29 - 0.02], [0.12, 0.14, 0.11], 0.2, 0, undefined, true);
      }
      break;
  }
}

function headwear(c: Ctx, o: Outfit) {
  const h = o.head;
  if (!h) return;
  const band = h.band ?? shade(h.color, -0.25);
  const crown = (p: Vec3, s: Vec3, color = h.color, r: Vec3 = [-0.1, 0, 0]) =>
    c.add({ kind: "crown", joint: "head", p, s, r, color });
  const brim = (p: Vec3, s: Vec3, color = h.color, r: Vec3 = [-0.1, 0, 0]) =>
    c.add({ kind: "brim", joint: "head", p, s, r, color });
  const hatBand = (y: number, radius: number, height = 0.055, color = band) =>
    c.add({ kind: "band", joint: "head", p: [0, y, -0.012], s: [radius, height, radius], r: [-0.1, 0, 0], color });
  const visor = (y: number, color = h.color, back = false) =>
    c.add({ kind: "box", joint: "head", p: [0, y, back ? -0.33 : 0.3], s: [0.3, 0.025, 0.22], r: [back ? -0.18 : 0.18, 0, 0], color });
  switch (h.kind) {
    case "straw":
      brim([0, 0.5, -0.01], [1, 1, 1]);
      crown([0, 0.5, -0.01], [1, 1, 1]);
      hatBand(0.535, 0.292);
      break;
    case "gat":
      // Wide, flat horsehair brim; tall narrow crown; beaded chin cord.
      brim([0, 0.53, -0.01], [1.02, 0.35, 1.02], h.color, [-0.06, 0, 0]);
      crown([0, 0.53, -0.01], [0.62, 1.25, 0.62], h.color, [-0.06, 0, 0]);
      hatBand(0.545, 0.18, 0.04, shade(h.color, 0.12));
      c.pair({ kind: "box", joint: "head", p: [0.25, 0.24, 0.12], s: [0.012, 0.42, 0.012], r: [0.25, 0, -0.32], color: band, lod: "near" });
      break;
    case "cap":
    case "cap-back":
      crown([0, 0.43, -0.02], [1.2, 1.05, 1.2], h.color, [-0.15, 0, 0]);
      visor(0.45, band, h.kind === "cap-back");
      c.add({ kind: "bead", joint: "head", p: [0, 0.665, -0.03], s: [0.025, 0.015, 0.025], color: band });
      break;
    case "bucket":
      crown([0, 0.44, -0.01], [1.18, 1.05, 1.18]);
      brim([0, 0.47, -0.01], [0.82, 1.6, 0.82]);
      hatBand(0.48, 0.34, 0.04);
      break;
    case "beanie":
      crown([0, 0.4, -0.02], [1.22, 1.45, 1.2], h.color, [-0.18, 0, 0]);
      c.add({ kind: "band", joint: "head", p: [0, 0.43, -0.02], s: [0.36, 0.08, 0.35], r: [-0.18, 0, 0], color: band });
      break;
    case "hardhat":
      crown([0, 0.44, -0.01], [1.25, 1.25, 1.28]);
      brim([0, 0.47, -0.01], [0.78, 0.6, 0.8]);
      c.add({ kind: "box", joint: "head", p: [0, 0.62, 0.0], s: [0.06, 0.05, 0.62], r: [-0.1, 0, 0], color: shade(h.color, -0.08) });
      break;
    case "chef":
      c.add({ kind: "band", joint: "head", p: [0, 0.6, -0.03], s: [0.31, 0.2, 0.3], r: [-0.12, 0, 0], color: h.color });
      crown([0, 0.66, -0.05], [1.32, 1.3, 1.3], shade(h.color, -0.02), [-0.12, 0, 0]);
      break;
    case "visor":
      hatBand(0.45, 0.345, 0.07, h.color);
      visor(0.43, band);
      break;
    case "headband":
      c.add({ kind: "band", joint: "head", p: [0, 0.44, 0], s: [0.352, 0.055, 0.342], r: [-0.18, 0, 0], color: h.color });
      break;
    case "helmet":
      crown([0, 0.42, -0.04], [1.28, 1.3, 1.36], h.color, [-0.2, 0, 0]);
      c.add({ kind: "box", joint: "head", p: [0, 0.66, -0.04], s: [0.05, 0.03, 0.5], r: [-0.2, 0, 0], color: band });
      c.pair({ kind: "box", joint: "head", p: [0.12, 0.64, -0.04], s: [0.04, 0.03, 0.4], r: [-0.2, 0, -0.35], color: band, lod: "near" });
      break;
    case "beret":
      crown([0.03, 0.54, -0.02], [1.32, 0.6, 1.3], h.color, [-0.1, 0, -0.22]);
      break;
    case "flatcap":
      crown([0, 0.5, -0.03], [1.22, 0.62, 1.28], h.color, [-0.2, 0, 0]);
      visor(0.5, shade(h.color, -0.06));
      break;
    case "ranger":
      brim([0, 0.5, -0.01], [1.0, 0.7, 1.0]);
      crown([0, 0.5, -0.01], [0.98, 1.2, 0.98]);
      hatBand(0.53, 0.282, 0.05);
      break;
    case "headscarf":
      c.add({ kind: "hair", joint: "head", p: [0, 0.31, -0.01], s: [0.37, 0.36, 0.355], color: h.color });
      c.add({ kind: "bead", joint: "head", p: [0, 0.42, -0.36], s: [0.06, 0.05, 0.04], color: band });
      c.pair({ kind: "lock", joint: "head", p: [0.04, 0.4, -0.36], s: [0.07, 0.2, 0.05], r: [-0.4, Math.PI, 0.3], color: h.color, lod: "near" });
      break;
  }
}

// --- Accessories and props ------------------------------------------------------
function extras(c: Ctx, o: Outfit) {
  const holds: { holdL?: Hold; holdR?: Hold } = {};
  const hand = (side: "L" | "R") => (side === "L" ? "handL" : "handR");
  for (const e of o.extras ?? []) {
    const color = e.color ?? "#5a4632";
    const own = (fallback: string) => e.color ?? fallback;
    switch (e.kind) {
      case "glasses":
      case "sunglasses":
        for (const x of [0.112, -0.112]) {
          c.add({ kind: "band", joint: "head", p: [x, 0.282, 0.33], s: [0.066, 0.012, 0.066], r: [Math.PI / 2, 0, 0], color });
          if (e.kind === "sunglasses")
            c.add({ kind: "bead", joint: "head", p: [x, 0.282, 0.33], s: [0.062, 0.056, 0.012], color: "#1b1d22" });
        }
        c.add({ kind: "box", joint: "head", p: [0, 0.3, 0.335], s: [0.06, 0.012, 0.012], color });
        c.pair({ kind: "box", joint: "head", p: [0.24, 0.29, 0.17], s: [0.012, 0.012, 0.26], r: [0, 0.6, 0], color, lod: "near" });
        break;
      case "scarf":
        c.add({ kind: "band", joint: "chest", p: [0, 0.53, 0.005], s: [0.15, 0.08, 0.135], r: [-0.12, 0, 0], color });
        c.add({ kind: "box", joint: "chest", p: [0.07, 0.38, 0.2], s: [0.07, 0.24, 0.025], r: [-0.12, 0, 0.12], color: shade(color, -0.08) });
        break;
      case "lanyard":
        c.pair({ kind: "box", joint: "chest", p: [0.05, 0.43, 0.205], s: [0.014, 0.17, 0.01], r: [-0.12, 0, 0.28], color, lod: "near" });
        c.add({ kind: "box", joint: "chest", p: [0, 0.3, 0.222], s: [0.075, 0.1, 0.012], r: [-0.05, 0, 0], color: e.color2 ?? "#f4f2ec" });
        break;
      case "whistle":
        c.pair({ kind: "box", joint: "chest", p: [0.05, 0.43, 0.205], s: [0.012, 0.17, 0.008], r: [-0.12, 0, 0.28], color, lod: "near" });
        c.add({ kind: "bead", joint: "chest", p: [0, 0.32, 0.225], s: [0.03, 0.022, 0.04], color: "#cfd3d6" });
        break;
      case "number":
        c.add({ kind: "box", joint: "chest", p: [0, 0.27, 0.205], s: [0.13, 0.14, 0.012], r: [-0.04, 0, 0], color });
        c.add({ kind: "box", joint: "chest", p: [0, 0.27, 0.212], s: [0.026, 0.1, 0.008], r: [-0.04, 0, 0], color: e.color2 ?? "#2a2d35", lod: "near" });
        break;
      case "backpack":
        c.add({ kind: "box", joint: "chest", p: [0, 0.29, -0.27], s: [0.36, 0.4, 0.17], color });
        c.add({ kind: "box", joint: "chest", p: [0, 0.2, -0.36], s: [0.24, 0.16, 0.06], color: shade(color, -0.12), lod: "near" });
        c.pair({ kind: "box", joint: "chest", p: [0.13, 0.36, 0.205], s: [0.04, 0.3, 0.018], r: [-0.08, 0, 0], color: e.color2 ?? shade(color, -0.25), lod: "near" });
        break;
      case "satchel":
      case "tote":
        c.add({ kind: "box", joint: "chest", p: [0, 0.3, 0.214], s: [0.035, 0.62, 0.016], r: [-0.08, 0, 0.72], color: e.color2 ?? shade(color, -0.2), lod: "near" });
        c.add({
          kind: "box",
          joint: "pelvis",
          p: [-0.27, 0.06, 0.02],
          s: e.kind === "tote" ? [0.08, 0.28, 0.26] : [0.09, 0.2, 0.28],
          r: [0, 0, 0.08],
          color,
        });
        if (e.kind === "satchel")
          c.add({ kind: "box", joint: "pelvis", p: [-0.315, 0.1, 0.02], s: [0.02, 0.12, 0.27], r: [0, 0, 0.08], color: shade(color, -0.15), lod: "near" });
        break;
      case "camera":
        c.pair({ kind: "box", joint: "chest", p: [0.06, 0.38, 0.21], s: [0.014, 0.26, 0.01], r: [-0.12, 0, 0.2], color: "#2a2a2a", lod: "near" });
        c.add({ kind: "box", joint: "chest", p: [0, 0.2, 0.25], s: [0.16, 0.1, 0.075], color: own("#2b2b2e") });
        c.add({ kind: "bead", joint: "chest", p: [0.02, 0.2, 0.3], s: [0.042, 0.042, 0.035], color: "#3c4148" });
        c.add({ kind: "bead", joint: "chest", p: [0.02, 0.2, 0.33], s: [0.026, 0.026, 0.01], color: "#8fb0c8" });
        break;
      case "book":
      case "clipboard":
      case "map":
      case "envelope":
        holds.holdL = { arm: 0.42, elbow: 1.55, spread: 0.18 };
        if (e.kind === "book") {
          c.add({ kind: "box", joint: "chest", p: [0.14, 0.2, 0.3], s: [0.14, 0.19, 0.045], r: [-0.25, 0.25, 0], color });
          c.add({ kind: "box", joint: "chest", p: [0.145, 0.2, 0.305], s: [0.125, 0.175, 0.038], r: [-0.25, 0.25, 0], color: "#f1ebdc", lod: "near" });
        } else if (e.kind === "clipboard") {
          c.add({ kind: "box", joint: "chest", p: [0.13, 0.22, 0.31], s: [0.17, 0.23, 0.014], r: [-0.3, 0.2, 0], color });
          c.add({ kind: "box", joint: "chest", p: [0.13, 0.215, 0.318], s: [0.145, 0.19, 0.008], r: [-0.3, 0.2, 0], color: "#f6f3ec", lod: "near" });
          c.add({ kind: "bead", joint: "chest", p: [0.13, 0.33, 0.29], s: [0.035, 0.014, 0.012], r: [-0.3, 0.2, 0], color: "#c4c7cc" });
        } else if (e.kind === "map") {
          holds.holdR = { arm: 0.42, elbow: 1.55, spread: 0.18 };
          c.add({ kind: "box", joint: "chest", p: [0, 0.2, 0.33], s: [0.36, 0.22, 0.01], r: [-0.55, 0, 0], color: own("#e8dcb8") });
          c.add({ kind: "box", joint: "chest", p: [0.05, 0.2, 0.336], s: [0.08, 0.12, 0.006], r: [-0.55, 0, 0.3], color: "#7fa36a", lod: "near" });
        } else {
          c.add({ kind: "box", joint: "chest", p: [0.14, 0.2, 0.3], s: [0.18, 0.12, 0.012], r: [-0.25, 0.25, 0], color: own("#f2ece0") });
          c.add({ kind: "box", joint: "chest", p: [0.14, 0.22, 0.307], s: [0.04, 0.03, 0.006], r: [-0.25, 0.25, 0], color: "#b5463a", lod: "near" });
        }
        break;
      case "cup":
        holds.holdR = { arm: 0.3, elbow: 1.5, spread: 0.12 };
        c.add({ kind: "limb", joint: hand("R"), p: [0, -0.06, 0.06], s: [0.045, 0.1, 0.045], r: [Math.PI / 2 - 0.2, 0, 0], color: own("#e9e1d0"), lod: "near" });
        c.add({ kind: "band", joint: hand("R"), p: [0, -0.06, 0.04], s: [0.047, 0.035, 0.047], r: [Math.PI / 2 - 0.2, 0, 0], color: "#7b5136" });
        break;
      case "flag":
        holds.holdR = { arm: 0.2, elbow: 1.35 };
        c.add({ kind: "limb", joint: hand("R"), p: [0, -0.04, -0.3], s: [0.013, 1.0, 0.013], r: [-Math.PI / 2, 0, 0], color: "#d9d4c8" });
        c.add({ kind: "box", joint: hand("R"), p: [0, -0.05 - 0.12, 0.56], s: [0.012, 0.24, 0.16], r: [-Math.PI / 2 + 0.1, 0, 0], color });
        break;
      case "lightstick":
        holds.holdR = { arm: 0.35, elbow: 1.7 };
        c.add({ kind: "limb", joint: hand("R"), p: [0, -0.04, -0.05], s: [0.02, 0.14, 0.02], r: [-Math.PI / 2, 0, 0], color: "#f2eef0", lod: "near" });
        c.add({ kind: "bead", joint: hand("R"), p: [0, -0.04, 0.16], s: [0.055, 0.055, 0.055], color, glow: 1.6 });
        break;
      case "pole":
        c.add({ kind: "limb", joint: hand("R"), p: [0, 0.08, 0.01], s: [0.014, 0.82, 0.014], color: own("#5e6670"), lod: "near" });
        break;
      case "rod":
        holds.holdR = { arm: 0.35, elbow: 1.1 };
        c.add({ kind: "limb", joint: hand("R"), p: [0, -0.04, -0.15], s: [0.012, 1.3, 0.012], r: [-Math.PI / 2 - 0.55, 0, 0], color: own("#3d3a36") });
        c.add({ kind: "bead", joint: hand("R"), p: [0.04, -0.03, 0.02], s: [0.03, 0.03, 0.02], color: "#b8bcc0" });
        break;
      case "ball":
        holds.holdL = { arm: 0.15, elbow: 1.2, spread: 0.35 };
        c.add({ kind: "sphere", joint: "chest", p: [0.33, 0.12, 0.16], s: [0.13, 0.13, 0.13], color: own("#d9752f") });
        break;
      case "racket":
        c.add({ kind: "limb", joint: hand("R"), p: [0, -0.02, 0.0], s: [0.012, 0.28, 0.012], color: "#2e2e33", lod: "near" });
        c.add({ kind: "band", joint: hand("R"), p: [0, -0.42, 0.0], s: [0.1, 0.012, 0.13], r: [0, 0, Math.PI / 2], color });
        break;
      case "drumsticks":
        for (const side of ["L", "R"] as const)
          c.add({ kind: "limb", joint: hand(side), p: [0, -0.02, 0.0], s: [0.012, 0.36, 0.012], r: [-0.5, 0, 0], color: own("#d8b98a"), lod: "near" });
        break;
      case "guitar":
        c.add({ kind: "box", joint: "chest", p: [0.02, 0.18, -0.25], s: [0.3, 0.38, 0.1], r: [0, 0, 0.55], color });
        c.add({ kind: "box", joint: "chest", p: [-0.18, 0.5, -0.25], s: [0.05, 0.38, 0.03], r: [0, 0, 0.55], color: e.color2 ?? "#3a2a1e" });
        c.add({ kind: "box", joint: "chest", p: [0, 0.3, 0.214], s: [0.03, 0.62, 0.014], r: [-0.08, 0, -0.72], color: "#2c2a28", lod: "near" });
        break;
      case "watering-can":
        holds.holdL = { arm: 0.1, elbow: 0.5 };
        c.add({ kind: "box", joint: hand("L"), p: [0, -0.16, 0.02], s: [0.13, 0.16, 0.2], color });
        c.add({ kind: "limb", joint: hand("L"), p: [0, -0.18, 0.1], s: [0.016, 0.18, 0.016], r: [-2.2, 0, 0], color, lod: "near" });
        break;
      case "headphones":
        c.add({ kind: "box", joint: "head", p: [0, 0.665, -0.02], s: [0.62, 0.03, 0.06], r: [-0.1, 0, 0], color });
        c.pair({ kind: "box", joint: "head", p: [0.34, 0.33, 0.0], s: [0.07, 0.13, 0.12], color: e.color2 ?? shade(color, -0.2) });
        break;
      case "basket":
        holds.holdL = { arm: 0.1, elbow: 0.6 };
        c.add({ kind: "box", joint: hand("L"), p: [0, -0.2, 0.02], s: [0.2, 0.14, 0.26], color });
        c.add({ kind: "band", joint: hand("L"), p: [0, -0.1, 0.02], s: [0.12, 0.012, 0.12], r: [0, Math.PI / 2, Math.PI / 2], color: shade(color, -0.15) });
        c.add({ kind: "box", joint: hand("L"), p: [0, -0.13, 0.02], s: [0.18, 0.03, 0.24], color: e.color2 ?? "#d98f8a", lod: "near" });
        break;
      case "rope":
        c.add({ kind: "band", joint: "chest", p: [-0.12, 0.3, 0.0], s: [0.24, 0.05, 0.24], r: [0.1, 0, 0.9], color: own("#c8b386") });
        break;
      case "pencil":
        c.add({ kind: "box", joint: "head", p: [0.3, 0.38, 0.06], s: [0.014, 0.014, 0.17], r: [0, 0.2, 0], color: "#e8c34a" });
        break;
      case "towel":
        c.add({ kind: "box", joint: "chest", p: [0.15, 0.48, 0.0], s: [0.1, 0.03, 0.4], r: [0, 0, -0.4], color });
        c.add({ kind: "box", joint: "chest", p: [0.2, 0.3, 0.17], s: [0.08, 0.26, 0.02], r: [-0.1, 0, -0.2], color, lod: "near" });
        break;
      case "binyeo":
        c.add({ kind: "box", joint: "head", p: [0, 0.52, -0.25], s: [0.4, 0.018, 0.018], color: own("#c9a24a") });
        break;
      case "roll":
        c.add({ kind: "limb", joint: "chest", p: [-0.2, 0.62, -0.24], s: [0.04, 0.6, 0.04], r: [0, 0, -0.5], color });
        break;
      case "goreum":
        c.pair({ kind: "box", joint: "chest", p: [-0.065, 0.27, 0.215], s: [0.035, 0.25, 0.01], r: [0.05, 0, 0.12], color, lod: "near" });
        c.add({ kind: "bead", joint: "chest", p: [-0.06, 0.37, 0.22], s: [0.032, 0.024, 0.016], color });
        break;
    }
  }
  return holds;
}

const HIDES_EARS: ReadonlySet<HairStyle> = new Set(["bob", "long"]);
const COVERS_HAIR: ReadonlySet<HeadKind> = new Set([
  "beanie",
  "helmet",
  "chef",
  "hardhat",
]);

/** Compile an outfit to the rig's part list. Deterministic: equal outfits
 * give equal keys, so batches recolour only on change. */
export function compileOutfit(o: Outfit, key = JSON.stringify(o)): Look {
  const parts: Part[] = [];
  const w = o.build?.width ?? 1;
  const c: Ctx = {
    parts,
    w,
    add: (part) => parts.push(part),
    pair: (part) => parts.push(part, mirror(part)),
  };
  body(c, o);
  topDetail(c, o);
  outerLayer(c, o);
  belt(c, o);
  // Head.
  c.add({ kind: "sphere", joint: "head", p: [0, 0.3, 0.01], s: [0.34, 0.325, 0.318], color: o.skin });
  const hat = o.head?.kind;
  const hatted = !!hat && hat !== "headband" && hat !== "visor";
  face(c, o, HIDES_EARS.has(o.hair.style) || hat === "headscarf");
  if (hat !== "headscarf")
    hair(
      c,
      {
        ...o,
        hair: {
          ...o.hair,
          // A gat sits on a topknot; tight hats flatten fringe and curls.
          style:
            hat === "gat"
              ? "topknot"
              : hat && COVERS_HAIR.has(hat) && o.hair.style === "curly"
                ? "crop"
                : o.hair.style,
        },
      },
      hatted,
    );
  headwear(c, o);
  const holds = extras(c, o);
  return makeLook(key, parts, { ...holds, scale: o.build?.height ?? 1 });
}

/** The classic look (player, scene extras): shirt colour, trousers, shoes,
 * straw hat or short hair, upgraded with the face, hand and trim detail. */
export function outfitFromPalette(p: Palette): Outfit {
  return {
    skin: p.skin,
    hair: { style: "crop", color: p.hair },
    top: { kind: "tee", color: p.shirt, trim: shade(p.shirt, -0.18) },
    bottom: { kind: "trousers", color: p.pants },
    belt: { color: "#6a4a33", buckle: "#c8a24e" },
    head: p.hasHat ? { kind: "straw", color: p.hat, band: p.band } : undefined,
    feet: { kind: "shoes", color: p.shoe },
  };
}

const paletteLooks = new Map<string, Look>();
export const paletteKey = (p: Palette) =>
  `${p.shirt}|${p.pants}|${p.skin}|${p.hair}|${p.shoe}|${p.hat}|${p.band}|${p.hasHat}`;
/** Cached look for a palette (the old `Palette` API keeps working). */
export function lookFromPalette(p: Palette): Look {
  const key = paletteKey(p);
  let look = paletteLooks.get(key);
  if (!look) {
    if (paletteLooks.size > 64) paletteLooks.clear();
    paletteLooks.set(key, (look = compileOutfit(outfitFromPalette(p), `palette:${key}`)));
  }
  return look;
}
