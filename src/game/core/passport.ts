/**
 * The Village Passport (PLAN_GAMES §3.2), as data. Pure: no store, no DOM.
 *
 * A stamp is earned when the save holds the memory `stamp:<id>` (written by
 * `useGame.getState().earnStamp(id)`), or when its `when` condition holds
 * for the save's bests, memories, Daily Three record and WS-I's discoveries.
 * Most stamps therefore need no stored state of their own: a game that
 * writes the bests named here inks its stamp.
 *
 * Skeleton (J0): ids, names and conditions are fixed; art, the panel and the
 * announcer are J1. Discovery item ids follow WS-I's room kits
 * (`<roomId>:<itemId>`) and are provisional until WS-I lands.
 */
import type { Save } from "../../shared/save";
import { gamesAtTier, meets, type BestCondition, type MedalGame, type MedalTier, medalFor } from "./medals";

export { medalFor, nextMedal, tierName, MEDALS, type MedalGame, type MedalTier, type NextMedal } from "./medals";

export type StampWorld = "home" | "stanford" | "korea" | "village";

/** World colours for stamp art and pennants. */
export const STAMP_COLOURS: Readonly<Record<StampWorld, string>> = {
  home: "#6c9746",
  stanford: "#b5553c",
  korea: "#3f6f9a",
  village: "#c79a3a",
};

export type StampCondition =
  | BestCondition
  | { memory: string }
  | { any: readonly StampCondition[] }
  | { all: readonly StampCondition[] }
  /** At least `count` discoveries across these rooms. */
  | { discovered: number; rooms: readonly string[] }
  /** One discovery, `<roomId>:<itemId>`. */
  | { found: string }
  /** The longest Daily Three streak is at least this (1 = finished one). */
  | { dailyBest: number }
  /** At least `games` games hold a medal of `tier` or better. */
  | { medals: MedalTier; games: number }
  | { medal: MedalGame; tier: MedalTier };

export type Stamp = {
  id: string;
  world: StampWorld;
  /** Short name for the toast ("Stamp: Coxswain") and the card. */
  name: string;
  /** One line on the unearned outline. */
  how: string;
  /** Derived condition; absent for stamps earned only by `earnStamp`. */
  when?: StampCondition;
};

/** House rooms on the Home island (the `home.rooms` discovery count). */
export const HOME_ROOMS = ["office", "music", "writing", "go", "stadium", "theater", "kitchen"] as const;
/** The four Korea landmarks; each visit is the memory `sight:<id>`. */
export const KOREA_SIGHTS = ["gwanghwamun", "bukchon", "sejong", "namsan"] as const;
export const sightMemory = (id: string) => `sight:${id}`;

const best = (key: string, n: number): BestCondition => ({ key, atLeast: n });

export const STAMPS: readonly Stamp[] = [
  // Home
  { id: "home.toss", world: "home", name: "Paper Toss", how: "Clear level 3 of Paper Toss", when: best("paper-toss.level", 3) },
  { id: "home.kitchen", world: "home", name: "Line Cook", how: "Earn a star in a lunch rush", when: best("kitchen.stars", 1) },
  { id: "home.go", world: "home", name: "First Stone", how: "Win First Capture or a game of Go", when: { any: [best("go.capture.wins", 1), best("go.wins.*", 1)] } },
  { id: "home.kick", world: "home", name: "Forty Yards", how: "Make a 40-yard field goal", when: best("stadium.yards", 40) },
  { id: "home.beat", world: "home", name: "Open Mic", how: "Finish a freestyle take in the Beat Lab", when: best("music.rounds", 1) },
  { id: "home.cinema", world: "home", name: "Matinee", how: "Sit through a minute at the cinema" },
  { id: "home.words", world: "home", name: "Reader", how: "Read a piece in the Writing room" },
  { id: "home.banner", world: "home", name: "Banner Rush", how: "Win a Banner Rush match", when: best("banner-rush.wins", 1) },
  { id: "home.keep", world: "home", name: "Keep Taker", how: "Win Banner Rush with all three banners", when: best("banner-rush.three-banners", 1) },
  { id: "home.ground", world: "home", name: "Palace Court", how: "Reach 300 Ribbons in Banner Rush", when: best("banner-rush.ribbons", 300) },
  { id: "home.market", world: "home", name: "Market Day", how: "Take three baskets to the market" },
  { id: "home.post", world: "home", name: "Post Round", how: "Deliver all four parcels" },
  { id: "home.cat", world: "home", name: "Cat Friend", how: "Pet the cat" },
  { id: "home.rooms", world: "home", name: "Explorer", how: "Find 10 things in the house rooms", when: { discovered: 10, rooms: HOME_ROOMS } },
  // Stanford
  { id: "stanford.hoops", world: "stanford", name: "Buckets", how: "Score 30 in Hot Shot", when: best("basketball.points.hot", 30) },
  { id: "stanford.shuttle", world: "stanford", name: "Shuttler", how: "Win a badminton game", when: { any: [best("badminton.wins.*", 1), best("badminton.wins", 1)] } },
  { id: "stanford.crew", world: "stanford", name: "Coxswain", how: "Finish a Grand Prix", when: { any: [{ key: "rowing.gp.place.novice", exists: true }, { key: "rowing.gp.place.varsity", exists: true }, { key: "rowing.gp.place.head", exists: true }] } },
  { id: "stanford.skate", world: "stanford", name: "Line Run", how: "Land a 2,000 run", when: best("skate.score.run", 2000) },
  { id: "stanford.josh", world: "stanford", name: "J-O-S-H", how: "Collect J-O-S-H in the skate park" },
  { id: "stanford.lights", world: "stanford", name: "Lights Out", how: "Solve a Lights board in par", when: best("math.par", 1) },
  { id: "stanford.bench", world: "stanford", name: "Bench", how: "Make 8 clean lifts", when: best("gym.reps", 8) },
  { id: "stanford.kappa", world: "stanford", name: "House Games", how: "Clear the cups or win a blackjack hand", when: { any: [{ key: "pong.throws", exists: true }, best("blackjack.stack", 101)] } },
  { id: "stanford.books", world: "stanford", name: "Overdue", how: "Return three library books" },
  { id: "stanford.coxbox", world: "stanford", name: "Megaphone", how: "Bring the megaphone to the boathouse" },
  { id: "stanford.key", world: "stanford", name: "Hoover Key", how: "Open the Hoover stash", when: { memory: "campus-stash" } },
  { id: "stanford.squirrel", world: "stanford", name: "Acorn", how: "Feed a squirrel an acorn" },
  // Korea
  { id: "korea.photo", world: "korea", name: "Photo Strip", how: "Take a photo strip" },
  { id: "korea.ramen", world: "korea", name: "Lunch by the River", how: "Bring ramen to the picnic" },
  { id: "korea.fish", world: "korea", name: "Catch of the Day", how: "Bring two fish to the cat" },
  { id: "korea.sights", world: "korea", name: "Four Sights", how: "Visit Gwanghwamun, Bukchon, Sejong and Namsan", when: { all: KOREA_SIGHTS.map((id) => ({ memory: sightMemory(id) })) } },
  { id: "korea.bridge", world: "korea", name: "Night Bridge", how: "Cross the bridge at night" },
  { id: "korea.office", world: "korea", name: "Hiring Board", how: "Read the hiring board at the Cognition office", when: { found: "cognition:hiring" } },
  { id: "korea.magpies", world: "korea", name: "Magpies", how: "Scatter the magpies" },
  { id: "korea.movie", world: "korea", name: "Late Show", how: "Sit through a minute at the Korea cinema" },
  // Village
  { id: "village.train", world: "village", name: "All Aboard", how: "Ride the island train" },
  { id: "village.flight", world: "village", name: "Flyer", how: "Fly to another world" },
  { id: "village.stars", world: "village", name: "Stargazer", how: "Look through the telescope after dark" },
  { id: "village.daily", world: "village", name: "Daily Three", how: "Finish a Daily Three", when: { dailyBest: 1 } },
  { id: "village.week", world: "village", name: "Week Streak", how: "Finish the Daily Three seven days running", when: { dailyBest: 7 } },
  { id: "village.gold", world: "village", name: "Five Golds", how: "Hold a gold medal in five games", when: { medals: 3, games: 5 } },
];

export const STAMP_IDS: readonly string[] = STAMPS.map((s) => s.id);
const BY_ID = new Map(STAMPS.map((s) => [s.id, s]));
export const isStampId = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);
export const stampById = (id: string): Stamp | undefined => BY_ID.get(id);
/** The memory flag that records an earned stamp. */
export const stampMemory = (id: string) => `stamp:${id}`;

export type PassportSave = Pick<Save, "memories"> & Partial<Pick<Save, "bests" | "daily">>;
/** WS-I's discoveries (`useDiscoveries.getState().found`): `<room>:<item>` → true. */
export type DiscoveryFound = Readonly<Record<string, true | undefined>>;

function holds(c: StampCondition, save: PassportSave, found: DiscoveryFound): boolean {
  if ("any" in c) return c.any.some((x) => holds(x, save, found));
  if ("all" in c) return c.all.every((x) => holds(x, save, found));
  if ("memory" in c) return save.memories.includes(c.memory);
  if ("found" in c) return found[c.found] === true;
  if ("discovered" in c) {
    let n = 0;
    for (const key of Object.keys(found)) {
      const room = key.slice(0, key.indexOf(":"));
      if (found[key] === true && c.rooms.includes(room)) n++;
    }
    return n >= c.discovered;
  }
  if ("dailyBest" in c) return (save.daily?.best ?? 0) >= c.dailyBest;
  if ("medals" in c) return gamesAtTier(save.bests, c.medals) >= c.games;
  if ("medal" in c) return medalFor(c.medal, save.bests) >= c.tier;
  return meets(save.bests, c);
}

/** True when stamp `id` is earned (by its memory flag or its condition). */
export function stampEarned(stamp: Stamp, save: PassportSave, found: DiscoveryFound = {}): boolean {
  return save.memories.includes(stampMemory(stamp.id)) || (!!stamp.when && holds(stamp.when, save, found));
}

/** Every earned stamp id. Monotonic: bests only improve and memories and
 * discoveries are only added, so a stamp once earned stays earned. */
export function stampsEarned(save: PassportSave, found: DiscoveryFound = {}): Set<string> {
  const out = new Set<string>();
  for (const s of STAMPS) if (stampEarned(s, save, found)) out.add(s.id);
  return out;
}
