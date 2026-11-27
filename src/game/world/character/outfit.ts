/**
 * Outfit data model (pure: no three.js, so the offline sculpt can use it).
 * See wardrobe.ts (primitive rig) and sculpt/ (baked sculpted rig).
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
  /** Friendly expression for the sculpted face (always a smile of some kind). */
  face?: { expr?: Expression; flick?: boolean };
};
export type Expression = "smile" | "grin" | "proud" | "excited" | "thoughtful";

// --- Colour helpers (sRGB hex) ---------------------------------------------------
const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbHex = (c: number[]) =>
  "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** Lighten (>0, toward white) or darken (<0) a hex colour. */
export function shade(hex: string, amount: number) {
  const c = hexRgb(hex);
  return rgbHex(amount >= 0 ? c.map((v) => v + (255 - v) * amount) : c.map((v) => v * (1 + amount)));
}
export function mix(a: string, b: string, t: number) {
  const x = hexRgb(a), y = hexRgb(b);
  return rgbHex(x.map((v, i) => v + (y[i] - v) * t));
}
export const hexToRgb01 = (hex: string): [number, number, number] =>
  hexRgb(hex).map((v) => v / 255) as [number, number, number];

/** Arm poses for held props (shoulder pitch / elbow bend). */
export type Hold = { arm: number; elbow: number; spread?: number };
export function holdsFor(o: Outfit): { holdL?: Hold; holdR?: Hold } {
  const h: { holdL?: Hold; holdR?: Hold } = {};
  for (const e of o.extras ?? []) {
    switch (e.kind) {
      case "book": case "clipboard": case "envelope":
        h.holdL = { arm: 0.42, elbow: 1.55, spread: 0.18 }; break;
      case "map":
        h.holdL = { arm: 0.42, elbow: 1.55, spread: 0.18 };
        h.holdR = { arm: 0.42, elbow: 1.55, spread: 0.18 }; break;
      case "cup": h.holdR = { arm: 0.3, elbow: 1.5, spread: 0.12 }; break;
      case "flag": h.holdR = { arm: 0.2, elbow: 1.35 }; break;
      case "lightstick": h.holdR = { arm: 0.35, elbow: 1.7 }; break;
      case "rod": h.holdR = { arm: 0.35, elbow: 1.1 }; break;
      case "ball": h.holdL = { arm: 0.15, elbow: 1.2, spread: 0.35 }; break;
      case "watering-can": h.holdL = { arm: 0.1, elbow: 0.5 }; break;
      case "basket": h.holdL = { arm: 0.1, elbow: 0.6 }; break;
    }
  }
  return h;
}

/** Structural copy of rig.ts Palette (kept here so this module stays pure). */
export type PaletteLike = { shirt: string; pants: string; skin: string; hair: string; shoe: string; hat: string; band: string; hasHat: boolean };
/** The classic look (player, scene extras): shirt colour, trousers, shoes,
 * straw hat or short hair, upgraded with the face, hand and trim detail. */
export function outfitFromPalette(p: PaletteLike): Outfit {
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

