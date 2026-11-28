/**
 * Meta (§7, Revision 2): the local profile, Ribbons and Grounds, opponent
 * tiers, unlocks, the daily challenge on the village's UTC day number, and
 * the three Passport stamps. Pure: storage and dates come from the caller.
 */
import { CARDS, CARD_IDS, STARTER_COLLECTION, STARTER_DECKS, UNLOCKS, validDeck, type CardId } from "./cards";
import { fnv1aString, nextRandom } from "./rng";
import type { AiTier, Modifier } from "./types";
import type { StampId } from "./stamps";

export const PROFILE_KEY = "joshua-exe-banner-rush-v1";
export type Ground = "home" | "palace" | "quad";
export type Settings = {
  emotes: "on" | "mute" | "off";
  keepSelected: boolean;
  relaxed: boolean;
  numbers: boolean;
  highContrast: boolean;
  textSize: 100 | 115 | 130;
};
export type DailyEntry = { day: number; bestScore: number; attempts: number; won: boolean; relaxed: boolean };
export type Profile = {
  v: 1;
  tutorialDone: boolean;
  ribbons: number;
  bestRibbons: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  lossStreak: number;
  matches: number;
  decks: CardId[][];
  deckNames: string[];
  activeDeck: number;
  settings: Settings;
  daily: DailyEntry[];
  lastOpponent: string;
  seedCounter: number;
  hintsShown: number;
};

export const DEFAULT_SETTINGS: Settings = { emotes: "on", keepSelected: false, relaxed: false, numbers: true, highContrast: false, textSize: 100 };

export function freshProfile(): Profile {
  return {
    v: 1,
    tutorialDone: false,
    ribbons: 0,
    bestRibbons: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    lossStreak: 0,
    matches: 0,
    decks: [[...STARTER_DECKS.lawnRush.cards], [...STARTER_DECKS.lookoutWall.cards], [...STARTER_DECKS.lawnRush.cards]],
    deckNames: ["Deck 1", "Deck 2", "Deck 3"],
    activeDeck: 0,
    settings: { ...DEFAULT_SETTINGS },
    daily: [],
    lastOpponent: "",
    seedCounter: 1,
    hintsShown: 0,
  };
}

const int = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d;
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Parses and repairs a stored profile; never throws. */
export function parseProfile(raw: unknown): Profile {
  const p = freshProfile();
  let o: Record<string, unknown> | null = null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (v && typeof v === "object" && !Array.isArray(v)) o = v as Record<string, unknown>;
  } catch {
    o = null;
  }
  if (!o) return p;
  p.tutorialDone = bool(o.tutorialDone, false);
  p.ribbons = int(o.ribbons, 0, 99999, 0);
  p.bestRibbons = Math.max(p.ribbons, int(o.bestRibbons, 0, 99999, 0));
  p.wins = int(o.wins, 0, 1e6, 0);
  p.losses = int(o.losses, 0, 1e6, 0);
  p.draws = int(o.draws, 0, 1e6, 0);
  p.streak = int(o.streak, 0, 1e6, 0);
  p.lossStreak = int(o.lossStreak, 0, 1e6, 0);
  p.matches = int(o.matches, 0, 1e6, p.wins + p.losses + p.draws);
  if (Array.isArray(o.decks))
    for (let i = 0; i < 3; i++) {
      const d = (o.decks as unknown[])[i];
      if (Array.isArray(d) && validDeck(d)) p.decks[i] = [...d] as CardId[];
    }
  if (Array.isArray(o.deckNames))
    for (let i = 0; i < 3; i++) {
      const n = (o.deckNames as unknown[])[i];
      if (typeof n === "string" && n.trim()) p.deckNames[i] = n.trim().slice(0, 16);
    }
  p.activeDeck = int(o.activeDeck, 0, 2, 0);
  const st = o.settings;
  if (st && typeof st === "object") {
    const s = st as Record<string, unknown>;
    p.settings.emotes = s.emotes === "mute" || s.emotes === "off" ? s.emotes : "on";
    p.settings.keepSelected = bool(s.keepSelected, false);
    p.settings.relaxed = bool(s.relaxed, false);
    p.settings.numbers = bool(s.numbers, true);
    p.settings.highContrast = bool(s.highContrast, false);
    p.settings.textSize = s.textSize === 115 || s.textSize === 130 ? s.textSize : 100;
  }
  if (Array.isArray(o.daily))
    p.daily = (o.daily as unknown[])
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as Record<string, unknown>).day === "number")
      .map((e) => ({ day: int(e.day, 0, 1e7, 0), bestScore: int(e.bestScore, 0, 1e7, 0), attempts: int(e.attempts, 0, 1e5, 0), won: bool(e.won, false), relaxed: bool(e.relaxed, false) }))
      .slice(-30);
  p.lastOpponent = typeof o.lastOpponent === "string" ? o.lastOpponent.slice(0, 32) : "";
  p.seedCounter = int(o.seedCounter, 1, 2 ** 30, 1);
  p.hintsShown = int(o.hintsShown, 0, 1e6, 0);
  return p;
}

/* ------------------------------------------------- Ribbons, Grounds, tiers */

export const TIER_ORDER: readonly AiTier[] = ["sprout", "villager", "captain", "maxed"];
export const TIER_NAMES: Record<AiTier, string> = { sprout: "Sprout", villager: "Villager", captain: "Captain", maxed: "Maxed" };
export const groundFor = (ribbons: number): Ground => (ribbons >= 700 ? "quad" : ribbons >= 300 ? "palace" : "home");
export const groundFloor = (best: number) => (best >= 700 ? 700 : best >= 300 ? 300 : 0);
export function tierFor(ribbons: number, lossStreak = 0): AiTier {
  let i = ribbons < 120 ? 0 : ribbons < 400 ? 1 : ribbons < 800 ? 2 : 3;
  if (lossStreak >= 3) i = Math.max(0, i - 1);
  return TIER_ORDER[i];
}
/** Ribbon change for a ladder result (§7.2). */
export function ribbonDelta(result: "win" | "loss" | "draw", margin: number, tier: AiTier) {
  if (result === "win") return 30 + 2 * Math.max(0, Math.min(3, margin));
  if (result === "loss") return -(10 + 4 * TIER_ORDER.indexOf(tier));
  return 0;
}
export function applyRibbons(ribbons: number, best: number, delta: number) {
  const floor = groundFloor(best);
  const next = Math.max(floor, Math.max(0, ribbons + delta));
  return { ribbons: next, best: Math.max(best, next) };
}

/** Owned cards from a win count. */
export function ownedCards(wins: number): CardId[] {
  return [...STARTER_COLLECTION, ...UNLOCKS.filter((u) => wins >= u.wins).map((u) => u.card)];
}
export function nextUnlock(wins: number) {
  return UNLOCKS.find((u) => wins < u.wins) ?? null;
}
export function unlockedBy(winsBefore: number, winsAfter: number): CardId | null {
  return UNLOCKS.find((u) => winsBefore < u.wins && winsAfter >= u.wins)?.card ?? null;
}

/* --------------------------------------------------------------- Opponents */

export type Opponent = { id: string; name: string; tier: AiTier; deck: CardId[] };
const lookoutWallComet = STARTER_DECKS.lookoutWall.cards.map((c) => (c === "runners" ? "comet" : c)) as CardId[];
export const OPPONENTS: readonly Opponent[] = [
  { id: "gardener", name: "Gardener", tier: "sprout", deck: ["runners", "slinger", "shieldbearer", "beekeeper", "haycart", "skater", "gostone", "stall"] },
  { id: "neighbor", name: "Neighbor", tier: "sprout", deck: [...STARTER_DECKS.lawnRush.cards] },
  { id: "cook", name: "Cook", tier: "villager", deck: ["stall", "shieldbearer", "beekeeper", "slinger", "runners", "haycart", "smash", "gostone"] },
  { id: "hooper", name: "Hooper", tier: "villager", deck: ["hoop", "shieldbearer", "skater", "runners", "rowers", "telescope", "smash", "comet"] },
  { id: "coxswain", name: "Coxswain", tier: "captain", deck: ["rowers", "skater", "runners", "slinger", "haycart", "kites", "smash", "gostone"] },
  { id: "researcher", name: "Researcher", tier: "captain", deck: lookoutWallComet },
  { id: "producer", name: "Producer", tier: "maxed", deck: ["kites", "runners", "stall", "balloon", "shieldbearer", "slinger", "gostone", "comet"] },
  { id: "classmate", name: "Classmate", tier: "maxed", deck: [...STARTER_DECKS.paradeDay.cards] },
];
export function pickOpponent(tier: AiTier, seed: number, avoid = ""): Opponent {
  const pool = OPPONENTS.filter((o) => o.tier === tier);
  const [r] = nextRandom(seed);
  let pick = pool[Math.floor(r * pool.length)];
  if (pick.id === avoid && pool.length > 1) pick = pool.find((o) => o.id !== avoid)!;
  return pick;
}

/* ------------------------------------------------------------------- Daily */

export const dailySeed = (day: number) => fnv1aString(`banner-rush-daily-${day}`);
export type DailyModifier = "doubleStart" | "shortMatch" | "hideNext" | "heavyLookouts" | "swiftRiver" | "none";
export const DAILY_MODIFIERS: readonly DailyModifier[] = ["doubleStart", "shortMatch", "hideNext", "heavyLookouts", "swiftRiver", "none"];
export const MODIFIER_TEXT: Record<DailyModifier, string> = {
  doubleStart: "Double Glow from the start",
  shortMatch: "A 2:00 match",
  hideNext: "The next card is hidden",
  heavyLookouts: "Lookouts have 25% more HP",
  swiftRiver: "Every troop moves 15% faster",
  none: "No twist today",
};
export type DailyConfig = { day: number; seed: number; deck: CardId[]; opponent: Opponent; ground: Ground; modifier: DailyModifier; modifiers: Modifier[] };
export function dailyConfig(day: number): DailyConfig {
  let seed = dailySeed(day) | 0;
  const rnd = () => {
    const [r, n] = nextRandom(seed);
    seed = n;
    return r;
  };
  const by = (pred: (id: CardId) => boolean, taken: CardId[]) => {
    const pool = CARD_IDS.filter((c) => pred(c) && !taken.includes(c));
    return pool[Math.floor(rnd() * pool.length)];
  };
  const deck: CardId[] = [];
  const tags = (c: CardId) => CARDS[c].tags as readonly string[];
  deck.push(by((c) => tags(c).includes("tank") && !tags(c).includes("winCondition"), deck) ?? by((c) => tags(c).includes("tank"), deck));
  deck.push(by((c) => tags(c).includes("winCondition"), deck));
  deck.push(by((c) => tags(c).includes("ranged") && CARDS[c].type === "troop", deck));
  deck.push(by((c) => tags(c).includes("ranged"), deck));
  deck.push(by((c) => tags(c).includes("swarm"), deck));
  deck.push(by((c) => CARDS[c].type === "spell", deck));
  deck.push(by(() => true, deck));
  deck.push(by(() => true, deck));
  const captains = OPPONENTS.filter((o) => o.tier === "captain");
  const opponent = captains[Math.floor(rnd() * captains.length)];
  const ground = (["home", "palace", "quad"] as const)[Math.floor(rnd() * 3)];
  const modifier = DAILY_MODIFIERS[Math.floor(rnd() * DAILY_MODIFIERS.length)];
  const modifiers: Modifier[] = modifier === "none" ? [] : [{ kind: modifier } as Modifier];
  return { day, seed: dailySeed(day), deck, opponent, ground, modifier, modifiers };
}
/** Daily score (§7.3). */
export function dailyScore(myBanners: number, theirBanners: number, myTowerHp: number, won: boolean, seconds: number) {
  return Math.max(0, Math.floor(1000 * myBanners - 400 * theirBanners + myTowerHp / 20 + (won ? Math.max(0, 300 - seconds) : 0)));
}

/* ------------------------------------------------------------------ Stamps */

export type MatchResult = { won: boolean; banners: number; daily: boolean };
/** [R2-2] Newly earned Passport stamps. */
export function stampsFor(before: Profile, after: Profile, result: MatchResult): StampId[] {
  const out: StampId[] = [];
  if (result.won && before.wins === 0 && after.wins > 0) out.push("home.banner");
  if (result.won && result.banners >= 3) out.push("home.keep");
  if (before.bestRibbons < 300 && after.bestRibbons >= 300) out.push("home.ground");
  return out;
}
