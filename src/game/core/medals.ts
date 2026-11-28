/**
 * Medals (PLAN_GAMES §3.3), as data. Four tiers per game: 1 bronze, 2 silver,
 * 3 gold, 4 the game's named top tier. Each tier is a condition on
 * `save.bests`, so a medal needs no stored state of its own: a game earns
 * medals by writing the bests named here.
 *
 * Keys may hold `{v}`, a variant (rowing distance, Beat Lab chart): with a
 * variant it is filled in; without one it matches any single key segment,
 * so the game's medal is its best over every variant. `*` always matches one
 * segment.
 *
 * THRESHOLDS ARE PROVISIONAL: the five flagships are re-set once from the
 * tuning bots' printouts (§3.3); only this file changes.
 */

export type MedalTier = 0 | 1 | 2 | 3 | 4;
export const TIER_NAMES = ["", "Bronze", "Silver", "Gold"] as const;

/** A condition on the bests map. `atLeast`: best ≥ n (max over matching keys).
 * `atMost`: a best exists and is ≤ n (min over matching keys). `exists`: any. */
export type BestCondition =
  | { key: string; atLeast: number }
  | { key: string; atMost: number }
  | { key: string; exists: true };

export type MedalTierSpec = {
  when: BestCondition;
  /** What it takes, for "next medal at …" ("60 points", "Beat the Captain"). */
  need: string;
};

export type MedalSpec = {
  /** The game's display name. */
  name: string;
  /** Name of the top tier (MVP, Head of the River, …). */
  top: string;
  /** Variant ids `{v}` stands for, when the game has them. Informational:
   * matching does not depend on it (charts are open-ended). */
  variants?: readonly string[];
  /** Bronze, silver, gold, top. */
  tiers: readonly [MedalTierSpec, MedalTierSpec, MedalTierSpec, MedalTierSpec];
};

export type MedalGame =
  | "basketball"
  | "rowing"
  | "badminton"
  | "stadium"
  | "music"
  | "skate"
  | "math"
  | "paper-toss"
  | "go"
  | "kitchen"
  | "gym"
  | "pong"
  | "blackjack";

const atLeast = (key: string, n: number, need: string): MedalTierSpec => ({ when: { key, atLeast: n }, need });
const atMost = (key: string, n: number, need: string): MedalTierSpec => ({ when: { key, atMost: n }, need });
const exists = (key: string, need: string): MedalTierSpec => ({ when: { key, exists: true }, need });

export const MEDALS: Readonly<Record<MedalGame, MedalSpec>> = {
  basketball: {
    name: "Basketball",
    top: "MVP",
    tiers: [
      // Written by Blacktop (scenes/Basketball.tsx): wins per rival, and
      // `basketball.ladder` = 1 for all three in one sitting without a loss.
      atLeast("basketball.wins.classmate", 1, "Beat the Classmate"),
      atLeast("basketball.wins.hooper", 1, "Beat the Hooper"),
      atLeast("basketball.wins.legend", 1, "Beat The Legend"),
      atLeast("basketball.ladder", 1, "Beat all three in one sitting"),
    ],
  },
  // Place is the best (lowest) finishing place; `rowing.cox.hotr.<d>` counts
  // wins within 3% of ROW_PAR (written by the rowing game).
  rowing: {
    name: "Rowing",
    top: "Head of the River",
    variants: ["360", "750"],
    tiers: [
      exists("rowing.cox.place.{v}", "Finish a race"),
      atMost("rowing.cox.place.{v}", 2, "Finish in the top two"),
      atMost("rowing.cox.place.{v}", 1, "Win a race"),
      atLeast("rowing.cox.hotr.{v}", 1, "Win within 3% of par"),
    ],
  },
  badminton: {
    name: "Badminton",
    top: "Club Champion",
    tiers: [
      atLeast("badminton.wins.freshman", 1, "Beat the Freshman"),
      atLeast("badminton.wins.captain", 1, "Beat the Club Captain"),
      atLeast("badminton.wins.wall", 1, "Beat The Wall"),
      atLeast("badminton.ladder", 1, "Beat all three in one sitting"),
    ],
  },
  stadium: {
    name: "Field Goals",
    top: "Ice in the Veins",
    tiers: [
      atLeast("stadium.yards", 40, "A 40-yard make"),
      atLeast("stadium.yards", 48, "A 48-yard make"),
      atLeast("stadium.yards", 54, "A 54-yard make"),
      atLeast("stadium.yards", 60, "A 60-yard make"),
    ],
  },
  // Open Mic is freestyle, so its medals are for taking part: `music.rounds`
  // counts finished takes, `music.beats` distinct beats finished, and
  // `music.landed` the most rhymes landed in one take (of 16).
  music: {
    name: "Beat Lab",
    top: "Open Mic Regular",
    tiers: [
      atLeast("music.rounds", 1, "Finish a take"),
      atLeast("music.beats", 3, "Takes on 3 different beats"),
      atLeast("music.beats", 8, "Takes on all 8 beats"),
      atLeast("music.landed", 16, "Land all 16 rhymes in a take"),
    ],
  },
  // `skate.clean` counts gold runs with no bails and all three goals.
  skate: {
    name: "Skate",
    top: "Clean Line",
    tiers: [
      atLeast("skate.score.run", 2000, "A 2,000 run"),
      atLeast("skate.score.run", 6000, "A 6,000 run"),
      atLeast("skate.score.run", 12000, "A 12,000 run"),
      atLeast("skate.clean", 1, "Gold, no bails, all three goals"),
    ],
  },
  // `math.par` counts boards solved in par; `math.sprint` is the best Sprint
  // time in seconds (min); `math.proof` counts Sprints with every board in par.
  math: {
    name: "Math Lab",
    top: "Proof",
    tiers: [
      atLeast("math.par", 1, "Solve a board in par"),
      atMost("math.sprint", 150, "Sprint under 150 s"),
      atMost("math.sprint", 90, "Sprint under 90 s"),
      atLeast("math.proof", 1, "Sprint with every board in par"),
    ],
  },
  "paper-toss": {
    name: "Paper Toss",
    top: "Wastebasket Legend",
    tiers: [
      atLeast("paper-toss.level", 3, "Clear level 3"),
      atLeast("paper-toss.level", 5, "Clear level 5"),
      atLeast("paper-toss.streak", 10, "A streak of 10"),
      atLeast("paper-toss.streak", 20, "A streak of 20"),
    ],
  },
  go: {
    name: "Go",
    top: "Dan",
    tiers: [
      atLeast("go.capture.wins", 1, "Win First Capture"),
      atLeast("go.wins.easy", 1, "Beat Easy"),
      atLeast("go.wins.medium", 1, "Beat Medium"),
      atLeast("go.wins.hard", 1, "Beat Hard"),
    ],
  },
  // `kitchen.day` is the next day to play, so passing Day n stores n + 1.
  // `kitchen.allA` counts shifts with every plate graded A.
  kitchen: {
    name: "Kitchen",
    top: "Head Chef",
    tiers: [
      atLeast("kitchen.day", 2, "Pass Day 1"),
      atLeast("kitchen.day", 4, "Pass Day 3"),
      atLeast("kitchen.day", 6, "Pass Day 5"),
      atLeast("kitchen.allA", 1, "A shift of all A plates"),
    ],
  },
  gym: {
    name: "Bench",
    top: "Spotter Not Needed",
    tiers: [
      atLeast("gym.reps", 8, "8 reps"),
      atLeast("gym.reps", 14, "14 reps"),
      atLeast("gym.reps", 20, "20 reps"),
      atLeast("gym.reps", 30, "30 reps"),
    ],
  },
  pong: {
    name: "Cup Toss",
    top: "Perfect Rack",
    tiers: [
      exists("pong.throws", "Clear all six cups"),
      atMost("pong.throws", 9, "Clear in 9 throws"),
      atMost("pong.throws", 7, "Clear in 7 throws"),
      atMost("pong.throws", 6, "Clear in 6 throws"),
    ],
  },
  blackjack: {
    name: "Blackjack",
    top: "High Roller",
    tiers: [
      atLeast("blackjack.stack", 150, "A stack of 150"),
      atLeast("blackjack.stack", 250, "A stack of 250"),
      atLeast("blackjack.stack", 400, "A stack of 400"),
      atLeast("blackjack.stack", 800, "A stack of 800"),
    ],
  },
};
export const MEDAL_GAMES = Object.keys(MEDALS) as MedalGame[];
export const isMedalGame = (v: unknown): v is MedalGame => typeof v === "string" && v in MEDALS;

type Bests = Readonly<Record<string, number>> | undefined;

function keyMatcher(pattern: string, variant?: string): (key: string) => boolean {
  const filled = variant === undefined ? pattern : pattern.split("{v}").join(variant);
  if (!filled.includes("*") && !filled.includes("{v}")) return (key) => key === filled;
  const parts = filled.split(".");
  return (key) => {
    const k = key.split(".");
    return k.length === parts.length && parts.every((p, i) => p === "*" || p === "{v}" || p === k[i]);
  };
}

/** The values of every best matching `pattern` (see the header). */
export function bestValues(bests: Bests, pattern: string, variant?: string): number[] {
  if (!bests) return [];
  const match = keyMatcher(pattern, variant);
  const out: number[] = [];
  for (const [k, v] of Object.entries(bests)) if (match(k) && Number.isFinite(v)) out.push(v);
  return out;
}

/** True when the condition holds for these bests. */
export function meets(bests: Bests, c: BestCondition, variant?: string): boolean {
  const values = bestValues(bests, c.key, variant);
  if (!values.length) return false;
  if ("atLeast" in c) return Math.max(...values) >= c.atLeast;
  if ("atMost" in c) return Math.min(...values) <= c.atMost;
  return true;
}

/** The highest tier held (0 = none). With a variant, that variant only. */
export function medalFor(game: MedalGame, bests: Bests, variant?: string): MedalTier {
  const tiers = MEDALS[game].tiers;
  for (let i = tiers.length - 1; i >= 0; i--) if (meets(bests, tiers[i].when, variant)) return (i + 1) as MedalTier;
  return 0;
}

/** Display name of a tier for a game ("Gold", "MVP"; "" for 0). */
export const tierName = (game: MedalGame, tier: MedalTier) => (tier === 4 ? MEDALS[game].top : TIER_NAMES[tier]);

export type NextMedal = { tier: 1 | 2 | 3 | 4; name: string; need: string };
/** The next tier above the one held, and what it takes; null at the top. */
export function nextMedal(game: MedalGame, bests: Bests, variant?: string): NextMedal | null {
  const held = medalFor(game, bests, variant);
  if (held === 4) return null;
  const tier = (held + 1) as 1 | 2 | 3 | 4;
  return { tier, name: tierName(game, tier), need: MEDALS[game].tiers[tier - 1].need };
}

/** How many games hold at least `tier` (the Village gold stamp counts golds). */
export function gamesAtTier(bests: Bests, tier: MedalTier): number {
  let n = 0;
  for (const game of MEDAL_GAMES) if (medalFor(game, bests) >= tier) n++;
  return n;
}
