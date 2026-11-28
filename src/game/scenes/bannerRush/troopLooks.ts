/**
 * Troop looks (§3.6): one rig Look per (unit kind, side), compiled once and
 * cached. Outfits use the wardrobe's own pieces; team colour goes on the top
 * or outer layer and hat band. Extra props are plain rig parts, drawn at both
 * LODs so they read on medium too. Character files are used, never edited.
 */
import type { Look, Part } from "../../world/character/rig";
import type { Outfit } from "../../world/character/wardrobe";
import { engine } from "./engineApi";

const shade = (hex: string, k: number) => engine().wardrobe.shade(hex, k);
import type { Villager } from "../../core/npcs";

export type LookKind =
  | "skater"
  | "runner"
  | "cook"
  | "slinger"
  | "shieldbearer"
  | "hoop"
  | "rower"
  | "lantern"
  | "beekeeper"
  | "pusher"
  | "mascot"
  | "crew";

const SKINS = ["#efc5a0", "#d9a578", "#b98058", "#f1d0b0", "#8d5a3c", "#e2b48c"];
const HAIRS = ["#3e3632", "#5a3a26", "#1f1c1a", "#8a5a34", "#c69a5b", "#2c2420"];
const pick = <T,>(list: T[], i: number) => list[i % list.length];

const extra = (p: Omit<Part, "lod">): Part => ({ ...p });

function outfit(kind: LookKind, team: string, palace: boolean): { o: Outfit; parts: Part[]; scale: number } {
  const dark = shade(team, -0.25);
  const n = ["skater", "runner", "cook", "slinger", "shieldbearer", "hoop", "rower", "lantern", "beekeeper", "pusher", "mascot", "crew"].indexOf(kind);
  const skin = pick(SKINS, n * 7 + 1);
  const hair = pick(HAIRS, n * 5 + 2);
  const base = { skin, hair: { style: "crop" as const, color: hair } };
  switch (kind) {
    case "skater":
      return {
        o: { ...base, hair: { style: "side", color: hair }, top: { kind: "hoodie", color: team, trim: dark }, bottom: { kind: "shorts", color: "#40505a" }, head: { kind: "cap-back", color: dark, band: team }, feet: { kind: "sneakers", color: "#efe9dc", sole: "#3a3a3a" } },
        parts: [],
        scale: 0.82,
      };
    case "runner":
      return {
        o: { ...base, hair: { style: "ponytail", color: hair }, top: { kind: "tank", color: team, trim: "#f4ecd6" }, bottom: { kind: "shorts", color: "#2f3a44" }, head: { kind: "headband", color: "#f4ecd6", band: team }, feet: { kind: "sneakers", color: "#f4ecd6", sole: team }, extras: [{ kind: "number", color: "#f4ecd6", color2: "#2a2d35" }] },
        parts: [],
        scale: 0.62,
      };
    case "cook":
      return {
        o: { ...base, top: { kind: "chef", color: "#f4efe2" }, bottom: { kind: "trousers", color: "#3a3f45" }, outer: { kind: "apron", color: team }, head: { kind: "chef", color: "#fbf8f0" }, feet: { kind: "shoes", color: "#2c2a28" } },
        parts: [
          extra({ kind: "limb", joint: "handR", p: [0, 0.02, 0.02], s: [0.025, 0.42, 0.025], r: [-1.2, 0, 0], color: "#b9a27c" }),
          extra({ kind: "sphere", joint: "handR", p: [0, -0.06, 0.4], s: [0.09, 0.05, 0.09], color: "#c9c4b8" }),
        ],
        scale: 0.62,
      };
    case "slinger":
      return {
        o: { ...base, hair: { style: "curly", color: hair }, top: { kind: "shirt", color: "#efe2bf", sleeves: "rolled" }, bottom: { kind: "trousers", color: "#5a4a3a" }, outer: { kind: "vest", color: team }, head: { kind: "flatcap", color: dark }, feet: { kind: "boots", color: "#5a3e2a" }, extras: [{ kind: "satchel", color: "#8a603a" }] },
        parts: [
          extra({ kind: "limb", joint: "handR", p: [0, 0, 0], s: [0.018, 0.34, 0.018], color: "#6b4a2c" }),
          extra({ kind: "sphere", joint: "handR", p: [0, -0.36, 0], s: [0.07, 0.07, 0.07], color: "#efe2bf" }),
        ],
        scale: 0.82,
      };
    case "shieldbearer":
      return {
        o: { ...base, build: { width: 1.15 }, top: { kind: "sweater", color: "#e9dcc0" }, bottom: { kind: "trousers", color: "#4a4038" }, outer: { kind: "overalls", color: team }, head: { kind: "helmet", color: "#b8bcc0", band: team }, feet: { kind: "boots", color: "#4a3426" } },
        parts: [
          // A round table-top shield on the left forearm, team rim band.
          extra({ kind: "crown", joint: "handL", p: [0.06, 0.02, 0.12], s: [1.45, 0.25, 1.45], r: [Math.PI / 2, 0, 0.2], color: "#8a603a" }),
          extra({ kind: "band", joint: "handL", p: [0.06, 0.02, 0.15], s: [0.41, 0.05, 0.41], r: [Math.PI / 2, 0, 0], color: team }),
          extra({ kind: "limb", joint: "handR", p: [0, 0.1, 0.02], s: [0.04, 0.5, 0.04], r: [-0.3, 0, 0], color: "#d8c39a" }),
        ],
        scale: 1.1,
      };
    case "hoop":
      return {
        o: { ...base, top: { kind: "jersey", color: team, trim: "#f4ecd6", sleeves: "none" }, bottom: { kind: "shorts", color: team }, head: { kind: "headband", color: "#f4ecd6", band: team }, feet: { kind: "sneakers", color: "#f4ecd6", sole: dark }, extras: [{ kind: "number", color: "#f4ecd6", color2: dark }, { kind: "ball" }] },
        parts: [],
        scale: 0.86,
      };
    case "rower":
      return {
        o: { ...base, hair: { style: "buzz", color: hair }, top: { kind: "tee", color: team, sleeves: "short" }, bottom: { kind: "shorts", color: "#2f3a44" }, head: { kind: "visor", color: "#f4ecd6", band: team }, feet: { kind: "sneakers", color: "#efe9dc" } },
        parts: [
          // An oar across both hands: shaft and a team blade.
          extra({ kind: "limb", joint: "handR", p: [0.1, 0, 0.05], s: [0.025, 1.0, 0.025], r: [0, 0, 1.45], color: "#d8c39a" }),
          extra({ kind: "box", joint: "handR", p: [-0.95, 0.05, 0.05], s: [0.3, 0.1, 0.03], r: [0, 0, 0.12], color: team }),
        ],
        scale: 1.0,
      };
    case "lantern":
      return {
        o: { ...base, hair: { style: "bun", color: hair }, top: { kind: "jeogori", color: "#f4efe2", trim: team }, bottom: { kind: palace ? "baji" : "chima", color: team }, head: palace ? { kind: "gat", color: "#2a2622" } : { kind: "straw", color: "#e0b86d", band: team }, feet: { kind: "flats", color: "#efe9dc" } },
        parts: [
          extra({ kind: "limb", joint: "handR", p: [0, 0.45, 0], s: [0.02, 0.85, 0.02], color: "#6b4a2c" }),
          extra({ kind: "sphere", joint: "handR", p: [0, 0.5, 0.12], s: [0.1, 0.13, 0.1], color: "#ffd27a", glow: 1.25 }),
        ],
        scale: 0.86,
      };
    case "beekeeper":
      return {
        o: { ...base, top: { kind: "shirt", color: "#f4efe2" }, bottom: { kind: "trousers", color: "#e9e0c8" }, outer: { kind: "labcoat", color: "#f1ead6", trim: team }, head: { kind: "bucket", color: "#efe6cc", band: team }, gloves: "#d8c39a", feet: { kind: "boots", color: "#6b5a44" } },
        parts: [
          extra({ kind: "box", joint: "handR", p: [0, -0.05, 0.05], s: [0.1, 0.16, 0.1], color: "#b8bcc0" }),
          extra({ kind: "crown", joint: "handR", p: [0, 0.04, 0.05], s: [0.35, 0.4, 0.35], color: "#8a8c90" }),
          // A light veil from the hat brim.
          extra({ kind: "skirt", joint: "head", p: [0, 0.34, 0], s: [0.44, 0.24, 0.44], color: "#e8e2d2" }),
        ],
        scale: 0.86,
      };
    case "pusher":
      return {
        o: { ...base, top: { kind: "shirt", color: "#efe2bf", sleeves: "rolled" }, bottom: { kind: "trousers", color: "#5a4a3a" }, outer: { kind: "overalls", color: team }, head: { kind: "straw", color: "#e0b86d", band: team }, feet: { kind: "boots", color: "#5a3e2a" } },
        parts: [],
        scale: 0.7,
      };
    case "mascot":
      return {
        o: { ...base, build: { height: 1.0, width: 1.6 }, top: { kind: "sweater", color: "#b98a52" }, bottom: { kind: "trousers", color: "#8a603a" }, head: { kind: "beanie", color: "#6b4a2c", band: team }, gloves: "#6b4a2c", feet: { kind: "boots", color: "#4a3426" } },
        parts: [
          extra({ kind: "sphere", joint: "chest", p: [0, 0.22, 0.12], s: [0.36, 0.36, 0.33], color: "#c89a5e" }),
          extra({ kind: "crown", joint: "head", p: [0, 0.5, 0], s: [1.35, 0.9, 1.35], color: "#6b4a2c" }),
          extra({ kind: "limb", joint: "head", p: [0, 0.78, 0], s: [0.03, 0.14, 0.03], r: [Math.PI, 0, 0], color: "#4a3426" }),
        ],
        scale: 1.45,
      };
    case "crew":
      return {
        o: { ...base, top: { kind: "tee", color: team }, bottom: { kind: "trousers", color: "#3a4547" }, head: { kind: "cap", color: team, band: dark }, feet: { kind: "shoes", color: "#efe2c8" } },
        parts: [],
        scale: 0.7,
      };
  }
}

const cache = new Map<string, Look>();
/** The look for a unit kind on a side (team colour), cached for the session. */
export function troopLook(kind: LookKind, team: string, palace = false): Look {
  const key = `br:${kind}:${team}:${palace ? 1 : 0}`;
  let look = cache.get(key);
  if (!look) {
    const { o, parts, scale } = outfit(kind, team, palace);
    const compiled = engine().wardrobe.compileOutfit(o, key);
    look = engine().rig.makeLook(key, [...compiled.parts, ...parts], { holdL: compiled.holdL, holdR: compiled.holdR, scale: scale * (o.build?.height ?? 1) });
    cache.set(key, look);
  }
  return look;
}

/** Your commander: your saved colour and hat. */
export function commanderLook(color: string, hat: boolean): Look {
  return engine().wardrobe.lookFromPalette({ ...engine().rig.DEFAULT_PALETTE, shirt: color, hasHat: hat });
}
export const rivalCommanderLook = (npc: Villager) => engine().wardrobe.lookFor(npc);

/** Unit kind (rules) → look kind (null: drawn as props only). */
export const LOOK_OF: Record<string, LookKind | null> = {
  skater: "skater",
  runner: "runner",
  kite: null,
  slinger: "slinger",
  shieldbearer: "shieldbearer",
  hoop: "hoop",
  rower: "rower",
  lantern: "lantern",
  beekeeper: "beekeeper",
  haycart: "pusher",
  balloon: null,
  mascot: "mascot",
  cook: "cook",
  telescope: null,
  stall: null,
  lookout: null,
  keep: null,
};
