/**
 * The 17 Banner Rush cards and the unit specs behind them (§3). Every name,
 * figure and effect is original. Times are in ticks (20 per second), speeds
 * in tiles per tick, distances in tiles.
 */
import { TICK_HZ } from "./constants";

export type CardId =
  | "skater"
  | "runners"
  | "kites"
  | "slinger"
  | "shieldbearer"
  | "hoop"
  | "rowers"
  | "lantern"
  | "beekeeper"
  | "haycart"
  | "balloon"
  | "mascot"
  | "telescope"
  | "stall"
  | "gostone"
  | "smash"
  | "comet";

export const CARD_IDS: readonly CardId[] = [
  "skater",
  "runners",
  "kites",
  "slinger",
  "shieldbearer",
  "hoop",
  "rowers",
  "lantern",
  "beekeeper",
  "haycart",
  "balloon",
  "mascot",
  "telescope",
  "stall",
  "gostone",
  "smash",
  "comet",
];
export const cardIndex = (id: CardId) => CARD_IDS.indexOf(id);

/** Unit kinds (indices into UNIT_SPECS). */
export const K_LOOKOUT = 0;
export const K_KEEP = 1;
export const K_SKATER = 2;
export const K_RUNNER = 3;
export const K_KITE = 4;
export const K_SLINGER = 5;
export const K_SHIELD = 6;
export const K_HOOP = 7;
export const K_ROWER = 8;
export const K_LANTERN = 9;
export const K_BEEKEEPER = 10;
export const K_HAYCART = 11;
export const K_BALLOON = 12;
export const K_MASCOT = 13;
export const K_COOK = 14;
export const K_TELESCOPE = 15;
export const K_STALL = 16;
export const UNIT_KIND_COUNT = 17;

export type UnitKind =
  | "lookout"
  | "keep"
  | "skater"
  | "runner"
  | "kite"
  | "slinger"
  | "shieldbearer"
  | "hoop"
  | "rower"
  | "lantern"
  | "beekeeper"
  | "haycart"
  | "balloon"
  | "mascot"
  | "cook"
  | "telescope"
  | "stall";
export const UNIT_KINDS: readonly UnitKind[] = [
  "lookout",
  "keep",
  "skater",
  "runner",
  "kite",
  "slinger",
  "shieldbearer",
  "hoop",
  "rower",
  "lantern",
  "beekeeper",
  "haycart",
  "balloon",
  "mascot",
  "cook",
  "telescope",
  "stall",
];

/** 0 ground (ground troops, buildings, towers), 1 all (+ air), 2 buildings only. */
export const T_GROUND = 0;
export const T_ALL = 1;
export const T_BUILDINGS = 2;

export type UnitSpec = {
  kind: UnitKind;
  hp: number;
  dmg: number;
  /** Ticks between hits. */
  hit: number;
  /** Ticks from acquiring a target to the first impact. */
  first: number;
  /** Wind-up ticks (the swing animation): melee 4, ranged 5, towers 3. */
  swing: number;
  /** Tiles per tick. */
  speed: number;
  range: number;
  sight: number;
  targets: 0 | 1 | 2;
  air: boolean;
  radius: number;
  mass: number;
  building: boolean;
  tower: boolean;
  splash: number;
  /** Ground-only splash (the Mascot's bump). */
  splashGround: boolean;
  /** Projectile speed in tiles per tick (0 = melee). */
  proj: number;
  resist: number;
};

const s = (sec: number) => Math.floor(sec * TICK_HZ + 0.5);
const v = (tilesPerSec: number) => tilesPerSec / TICK_HZ;
const sightFor = (range: number) => (range >= 2 ? Math.max(5.5, range + 0.5) : 5.5);

function spec(kind: UnitKind, o: Partial<UnitSpec> & { hp: number; radius: number; mass: number }): UnitSpec {
  const range = o.range ?? 0.6;
  return {
    kind,
    dmg: 0,
    hit: 20,
    first: 8,
    swing: o.proj ? 5 : 4,
    speed: 0,
    range,
    sight: o.sight ?? sightFor(range),
    targets: T_GROUND,
    air: false,
    building: false,
    tower: false,
    splash: 0,
    splashGround: false,
    proj: 0,
    resist: 0,
    ...o,
  };
}

export const UNIT_SPECS: readonly UnitSpec[] = [
  spec("lookout", { hp: 2400, dmg: 90, hit: 16, first: 8, swing: 3, range: 7, sight: 7, targets: T_ALL, radius: 1.4, mass: 1e9, building: true, tower: true, proj: v(14) }),
  spec("keep", { hp: 4000, dmg: 100, hit: 20, first: 10, swing: 3, range: 7, sight: 7, targets: T_ALL, radius: 1.9, mass: 1e9, building: true, tower: true, proj: v(14) }),
  spec("skater", { hp: 240, dmg: 52, hit: s(1.0), first: s(0.4), speed: v(2.0), range: 0.6, radius: 0.4, mass: 3 }),
  spec("runner", { hp: 160, dmg: 48, hit: s(1.0), first: s(0.4), speed: v(1.5), range: 0.6, radius: 0.35, mass: 2 }),
  spec("kite", { hp: 170, dmg: 48, hit: s(1.0), first: s(0.4), speed: v(1.5), range: 1.0, targets: T_ALL, air: true, radius: 0.4, mass: 2 }),
  spec("slinger", { hp: 300, dmg: 95, hit: s(1.1), first: s(0.6), speed: v(1.0), range: 5.0, targets: T_ALL, radius: 0.45, mass: 3, proj: v(12) }),
  spec("shieldbearer", { hp: 1000, dmg: 70, hit: s(1.2), first: s(0.5), speed: v(1.0), range: 0.8, radius: 0.55, mass: 8, resist: 0.3 }),
  spec("hoop", { hp: 340, dmg: 230, hit: s(2.2), first: s(1.0), speed: v(1.0), range: 6.0, targets: T_ALL, radius: 0.45, mass: 3, proj: v(9) }),
  spec("rower", { hp: 620, dmg: 100, hit: s(1.3), first: s(0.5), speed: v(1.0), range: 0.8, radius: 0.5, mass: 6 }),
  spec("lantern", { hp: 560, dmg: 55, hit: s(1.4), first: s(0.7), speed: v(1.0), range: 4.5, targets: T_ALL, radius: 0.45, mass: 4, proj: v(10) }),
  spec("beekeeper", { hp: 400, dmg: 120, hit: s(1.5), first: s(0.8), speed: v(1.0), range: 4.5, targets: T_ALL, radius: 0.45, mass: 4, proj: v(8), splash: 1.4 }),
  spec("haycart", { hp: 2100, dmg: 190, hit: s(1.5), first: s(0.6), speed: v(1.0), range: 0.8, targets: T_BUILDINGS, radius: 0.75, mass: 12 }),
  spec("balloon", { hp: 1300, dmg: 380, hit: s(3.0), first: s(0.5), speed: v(1.0), range: 0.6, targets: T_BUILDINGS, air: true, radius: 0.8, mass: 10 }),
  spec("mascot", { hp: 3600, dmg: 170, hit: s(1.6), first: s(0.7), speed: v(0.75), range: 1.0, radius: 0.85, mass: 18, splash: 1.0, splashGround: true }),
  spec("cook", { hp: 160, dmg: 48, hit: s(1.0), first: s(0.4), speed: v(1.5), range: 0.6, radius: 0.35, mass: 2 }),
  spec("telescope", { hp: 900, dmg: 22, hit: 8, first: 8, swing: 0, range: 5.5, sight: 5.5, targets: T_ALL, radius: 1.0, mass: 1e9, building: true }),
  spec("stall", { hp: 1000, dmg: 0, hit: 0, first: 0, swing: 0, range: 0, sight: 0, radius: 1.0, mass: 1e9, building: true }),
];

export type CardType = "troop" | "building" | "spell";
export type CardTag =
  | "tank"
  | "swarm"
  | "ranged"
  | "splash"
  | "antiAir"
  | "winCondition"
  | "cycle"
  | "building"
  | "spell"
  | "support";

export type Card = {
  id: CardId;
  name: string;
  cost: number;
  type: CardType;
  /** Unit kind spawned (troops and buildings). */
  unit: number;
  count: number;
  tags: readonly CardTag[];
  /** One line for the info sheet. */
  special: string;
};

const card = (id: CardId, name: string, cost: number, type: CardType, unit: number, count: number, tags: CardTag[], special: string): Card => ({ id, name, cost, type, unit, count, tags, special });

export const CARDS: Readonly<Record<CardId, Card>> = {
  skater: card("skater", "Skater", 1, "troop", K_SKATER, 1, ["cycle"], "Very fast. The cheap cycle card and distraction."),
  runners: card("runners", "Runners", 2, "troop", K_RUNNER, 3, ["swarm", "cycle"], "Three quick joggers. Swarm a lone shooter."),
  kites: card("kites", "Kite Trio", 3, "troop", K_KITE, 3, ["swarm", "antiAir"], "Three kites that fly over the river and ground troops."),
  slinger: card("slinger", "Slinger", 3, "troop", K_SLINGER, 1, ["ranged", "antiAir"], "Throws beanbags from 5 tiles. Hits flying units."),
  shieldbearer: card("shieldbearer", "Shieldbearer", 3, "troop", K_SHIELD, 1, ["tank"], "Takes 30% less from anything thrown, tower shots included."),
  hoop: card("hoop", "Hoop Shooter", 4, "troop", K_HOOP, 1, ["ranged", "antiAir"], "High arcing shots from 6 tiles. Every third shot is a swish: ×1.5."),
  rowers: card("rowers", "Rower Duo", 4, "troop", K_ROWER, 2, ["winCondition"], "After 2 s of walking they charge: double speed, next hit ×2."),
  lantern: card("lantern", "Lantern Keeper", 4, "troop", K_LANTERN, 1, ["ranged", "antiAir", "support"], "Heals every friendly troop within 3 tiles by 36 each second."),
  beekeeper: card("beekeeper", "Beekeeper", 4, "troop", K_BEEKEEPER, 1, ["ranged", "splash", "antiAir"], "Bee clouds splash everything within 1.4 tiles."),
  haycart: card("haycart", "Hay Cart", 5, "troop", K_HAYCART, 1, ["tank", "winCondition"], "Ignores troops and rolls straight for buildings."),
  balloon: card("balloon", "Parade Balloon", 5, "troop", K_BALLOON, 1, ["tank", "winCondition"], "Flies to buildings. Pops for 180 when it falls."),
  mascot: card("mascot", "Acorn Mascot", 6, "troop", K_MASCOT, 1, ["tank", "splash", "winCondition"], "Huge and slow. Its belly-bump splashes 1 tile around."),
  telescope: card("telescope", "Telescope", 4, "building", K_TELESCOPE, 1, ["building", "ranged", "antiAir"], "A beam that grows stronger the longer it stays on one target."),
  stall: card("stall", "Kitchen Stall", 5, "building", K_STALL, 1, ["building", "swarm"], "Sends out a Cook every 4.5 s. Pulls building-targeters."),
  gostone: card("gostone", "Go Stone", 2, "spell", -1, 0, ["spell", "splash", "antiAir", "cycle"], "Stuns everything in 2 tiles for 0.8 s."),
  smash: card("smash", "Badminton Smash", 3, "spell", -1, 0, ["spell", "splash", "antiAir"], "Flies 7 tiles ahead, hitting and knocking back each enemy once."),
  comet: card("comet", "Comet", 4, "spell", -1, 0, ["spell", "splash", "antiAir"], "Lands after 1 s for 540 in 2.5 tiles."),
};

export const hasTag = (id: CardId, tag: CardTag) => CARDS[id].tags.includes(tag);

/** Spells (§3.3). */
export const SPELLS = {
  gostone: { radius: 2.0, delay: 7, dmg: 110, tower: 35, stun: 16 },
  smash: { width: 2.4, length: 7, speed: 0.5, dmg: 200, tower: 60, knock: 1.4, heavyKnock: 0.4, knockTicks: 5 },
  comet: { radius: 2.5, delay: 20, dmg: 540, tower: 160, knock: 0.6, knockTicks: 4 },
} as const;
export const BALLOON_POP = { radius: 2.0, dmg: 180, tower: 60 } as const;
export const TELESCOPE = { beam: 8, ramp: [22, 60, 170] as const, stepTicks: 40, life: 600, decay: 3, decayEvery: 2 } as const;
export const STALL = { firstSpawn: 20, every: 90, decay: 25, decayEvery: 18, ahead: 1.4, cookDeploy: 10 } as const;
export const ROWER_CHARGE = { walkTicks: 40, speed: 2.0 / TICK_HZ, mult: 2 } as const;
/** [R2-5] Heals the 3 most-damaged other friendly troops in range; auras do not stack. */
export const LANTERN_AURA = { every: 20, radius: 3.0, heal: 36, maxTargets: 3 } as const;
export const HOOP_SWISH = { every: 3, mult: 1.5 } as const;

/** Formations, own frame (forward is −y). */
export const FORMATIONS: Partial<Record<CardId, readonly (readonly [number, number])[]>> = {
  runners: [
    [0, -0.45],
    [-0.45, 0.35],
    [0.45, 0.35],
  ],
  kites: [
    [0, -0.585],
    [-0.585, 0.455],
    [0.585, 0.455],
  ],
  rowers: [
    [-0.55, 0],
    [0.55, 0],
  ],
};

/** Formation offsets by card index, flattened (x0, y0, x1, y1, …), or null. */
export const MEMBER_OFFSETS: readonly (Float64Array | null)[] = CARD_IDS.map((id) => {
  const f = FORMATIONS[id];
  return f ? Float64Array.from(f.flat()) : null;
});

export type Deck = readonly CardId[];
export const STARTER_COLLECTION: readonly CardId[] = [
  "skater",
  "runners",
  "slinger",
  "shieldbearer",
  "rowers",
  "beekeeper",
  "hoop",
  "haycart",
  "telescope",
  "smash",
  "gostone",
];
export const UNLOCKS: readonly { wins: number; card: CardId }[] = [
  { wins: 1, card: "kites" },
  { wins: 3, card: "lantern" },
  { wins: 5, card: "comet" },
  { wins: 8, card: "balloon" },
  { wins: 11, card: "stall" },
  { wins: 15, card: "mascot" },
];
export const STARTER_DECKS: Readonly<Record<"lawnRush" | "lookoutWall" | "paradeDay", { name: string; cards: readonly CardId[]; plan: string }>> = {
  lawnRush: {
    name: "Lawn Rush",
    cards: ["skater", "runners", "slinger", "rowers", "haycart", "beekeeper", "smash", "gostone"],
    plan: "Hay Cart at the bridge with Runners behind; Smash their answer; cycle fast with the Skater.",
  },
  lookoutWall: {
    name: "Lookout Wall",
    cards: ["shieldbearer", "slinger", "beekeeper", "hoop", "telescope", "runners", "smash", "haycart"],
    plan: "Defend with the Telescope and ranged troops, then walk the survivors over behind a Hay Cart.",
  },
  paradeDay: {
    name: "Parade Day",
    cards: ["mascot", "balloon", "kites", "lantern", "slinger", "runners", "comet", "gostone"],
    plan: "Build one big push from behind the Keep in double Glow.",
  },
};

/** 8 distinct cards, all known (and owned, when a collection is given). */
export function validDeck(deck: readonly unknown[], owned?: readonly CardId[]): deck is CardId[] {
  if (!Array.isArray(deck) || deck.length !== 8) return false;
  const seen = new Set<string>();
  for (const c of deck) {
    if (typeof c !== "string" || !(CARD_IDS as readonly string[]).includes(c) || seen.has(c)) return false;
    if (owned && !owned.includes(c as CardId)) return false;
    seen.add(c);
  }
  return true;
}

export function deckWarnings(deck: readonly CardId[]): string[] {
  const out: string[] = [];
  if (!deck.some((c) => UNIT_SPECS[CARDS[c].unit]?.targets === T_ALL || CARDS[c].type === "spell"))
    out.push("Nothing here can hit flying units.");
  if (!deck.some((c) => CARDS[c].type === "spell")) out.push("No spell in this deck.");
  if (averageCost(deck) > 4.3) out.push("Average cost is high: you will wait a lot.");
  return out;
}
export const averageCost = (deck: readonly CardId[]) =>
  deck.length ? deck.reduce((a, c) => a + CARDS[c].cost, 0) / deck.length : 0;

/** Counter table (§3.5) for the Captain and Maxed tiers: unit kind → card → score. */
export const COUNTERS: Readonly<Partial<Record<UnitKind, Partial<Record<CardId, number>>>>> = {
  skater: { runners: 2, skater: 1 },
  runner: { smash: 2, beekeeper: 2, gostone: 1, mascot: 1 },
  cook: { smash: 2, beekeeper: 2, gostone: 1, mascot: 1 },
  kite: { smash: 2, beekeeper: 2, slinger: 2, hoop: 1 },
  slinger: { skater: 2, runners: 2, comet: 2, smash: 1 },
  shieldbearer: { runners: 2, telescope: 2, rowers: 2 },
  hoop: { skater: 2, runners: 2, comet: 2, smash: 1 },
  rower: { runners: 2, skater: 2, gostone: 2, telescope: 2 },
  lantern: { comet: 1, rowers: 2, skater: 2 },
  beekeeper: { skater: 2, rowers: 2, comet: 2 },
  haycart: { telescope: 2, stall: 2, runners: 2, rowers: 2 },
  balloon: { slinger: 2, hoop: 2, kites: 2, telescope: 2 },
  mascot: { telescope: 2, rowers: 2, kites: 2, skater: 1 },
  telescope: { gostone: 2, runners: 2, comet: 1 },
  stall: { beekeeper: 2, mascot: 1 },
};

/**
 * Balance index N of §3.4 with Revision 2 (R2-6 … R2-9): geometric-mean
 * value per Glow; the Lantern's heal counts as 36 × 2 expected allies per
 * second (no support discount); `resist` uses the mean of raw HP and HP
 * against projectiles; splash troops count 1.5 targets.
 */
export function balanceIndex(id: CardId): number {
  const c = CARDS[id];
  if (c.type !== "troop") return BUILDING_SPELL_INDEX[id] ?? NaN;
  const u = UNIT_SPECS[c.unit];
  let dmg = u.dmg;
  if (u.kind === "hoop") dmg = (u.dmg * (2 + HOOP_SWISH.mult)) / 3;
  let dps = (dmg / (u.hit / TICK_HZ)) * c.count;
  if (u.splash > 0 && !c.tags.includes("tank")) dps *= 1.5;
  if (u.kind === "lantern") dps += LANTERN_AURA.heal * 2;
  const hp = u.resist > 0 ? (u.hp + u.hp / (1 - u.resist)) / 2 : u.hp;
  const value = Math.sqrt(dps * hp * c.count);
  let mod = 1;
  if (c.tags.includes("ranged") && u.range >= 4.5) mod *= 0.55;
  if (u.air) mod *= 0.8;
  if (c.tags.includes("swarm")) mod *= 1.25;
  if (u.targets === T_BUILDINGS) mod *= 1.1;
  return value / (100 * c.cost * mod);
}

/** [R2-10] Buildings and spells: N = value delivered over the reference trades / cost (band 0.85–1.15). */
export const TRADE_CASES: Partial<Record<CardId, { cost: number; cases: readonly { vs: string; glow: number }[]; total?: number }>> = {
  telescope: { cost: 4, cases: [{ vs: "runners", glow: -2 }, { vs: "rowers", glow: 0 }, { vs: "haycart", glow: 1 }, { vs: "mascot", glow: 2 }] },
  stall: { cost: 5, cases: [{ vs: "cooks", glow: 4.27 }, { vs: "pull", glow: 0.75 }], total: 5.02 },
  gostone: { cost: 2, cases: [{ vs: "stun", glow: 0.6 }, { vs: "finish", glow: 1.0 }, { vs: "chip", glow: 0.23 }], total: 1.83 },
  smash: { cost: 3, cases: [{ vs: "runners", glow: 2.0 }, { vs: "kites", glow: 3.0 }, { vs: "runners+", glow: 3.3 }], total: 2.97 },
  comet: { cost: 4, cases: [{ vs: "troop", glow: 4.0 }, { vs: "chip", glow: 0.53 }], total: 3.85 },
};
function tradeIndex(id: CardId): number {
  const t = TRADE_CASES[id]!;
  if (t.total !== undefined) return t.total / t.cost;
  const mean = t.cases.reduce((a, c) => a + c.glow, 0) / t.cases.length;
  return (t.cost + mean) / t.cost;
}
const BUILDING_SPELL_INDEX: Partial<Record<CardId, number>> = Object.fromEntries(
  Object.keys(TRADE_CASES).map((id) => [id, tradeIndex(id as CardId)]),
);
