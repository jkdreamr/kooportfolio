export const BEATS_PER_BAR = 4;
export const RHYME_BARS = 16;
export const RHYME_COUNT_IN_BARS = 1;
export const RHYME_BAR_POINTS = 100;
export const RHYME_TEMPOS = [
  { name: "Chill", bpm: 82 },
  { name: "Bounce", bpm: 96 },
  { name: "Sprint", bpm: 114 },
] as const;

// Rhyme dictionary: each family is a set of rhyming words fed in AABB couplets.
export const RHYME_FAMILIES: readonly (readonly string[])[] = [
  ["day", "play", "say", "way", "stay", "okay", "display", "away"],
  ["go", "flow", "show", "know", "glow", "throw", "below", "hello"],
  ["mind", "find", "behind", "rewind", "blind", "grind", "signed", "defined"],
  ["line", "sign", "shine", "design", "align", "divine", "fine", "nine"],
  ["cat", "hat", "that", "flat", "scat", "acrobat", "diplomat", "habitat"],
  ["beat", "heat", "street", "feet", "sweet", "repeat", "complete", "elite"],
  ["cool", "school", "rule", "pool", "tool", "fuel", "jewel", "drool"],
  [
    "sound",
    "ground",
    "around",
    "found",
    "bound",
    "round",
    "profound",
    "surround",
  ],
  [
    "light",
    "night",
    "bright",
    "sight",
    "flight",
    "right",
    "tonight",
    "delight",
  ],
  ["funk", "dunk", "trunk", "monk", "chunk", "debunk", "flunk", "skunk"],
  ["rock", "clock", "block", "shock", "stock", "unlock", "knock", "tick-tock"],
  ["cold", "gold", "hold", "bold", "told", "sold", "unfold", "enrolled"],
];

export type RhymeBar = { family: number; word: string };
export type RhymeGame = {
  phase: "ready" | "playing" | "done";
  seed: number;
  tempo: number;
  time: number;
  bars: RhymeBar[];
  barsDone: number;
  points: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rhymeBeatInterval(game: Pick<RhymeGame, "tempo">): number {
  return 60 / RHYME_TEMPOS[game.tempo].bpm;
}
export function rhymeBarInterval(game: Pick<RhymeGame, "tempo">): number {
  return rhymeBeatInterval(game) * BEATS_PER_BAR;
}
export function rhymeCountIn(game: Pick<RhymeGame, "tempo">): number {
  return rhymeBarInterval(game) * RHYME_COUNT_IN_BARS;
}
export function rhymeRoundEnd(game: RhymeGame): number {
  return rhymeCountIn(game) + game.bars.length * rhymeBarInterval(game);
}

// Bars run in AABB couplets: each pair shares one rhyme family, with the
// second bar landing a different word of the same family.
export function newRhymeGame(seed = Date.now(), tempo = 0): RhymeGame {
  const random = mulberry32(seed);
  const families = RHYME_FAMILIES.map((_, i) => i);
  for (let i = families.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [families[i], families[j]] = [families[j], families[i]];
  }
  const bars: RhymeBar[] = [];
  for (let couplet = 0; couplet < RHYME_BARS / 2; couplet++) {
    const family = families[couplet % families.length];
    const words = RHYME_FAMILIES[family];
    const first = Math.floor(random() * words.length);
    let second = Math.floor(random() * (words.length - 1));
    if (second >= first) second++;
    bars.push(
      { family, word: words[first] },
      { family, word: words[second] },
    );
  }
  return {
    phase: "ready",
    seed,
    tempo,
    time: 0,
    bars,
    barsDone: 0,
    points: 0,
  };
}

// Bar index the playhead sits in, or -1 during the count-in.
export function rhymeBarIndex(game: RhymeGame, time = game.time): number {
  const bar = Math.floor(
    (time - rhymeCountIn(game)) / rhymeBarInterval(game),
  );
  return bar < 0 ? -1 : Math.min(bar, game.bars.length - 1);
}

export function advanceRhyme(game: RhymeGame, dt: number): RhymeGame {
  if (game.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return game;
  const end = rhymeRoundEnd(game);
  const time = Math.min(end, game.time + dt);
  const barsDone =
    time >= end
      ? game.bars.length
      : Math.max(
          0,
          Math.floor(
            (time - rhymeCountIn(game)) / rhymeBarInterval(game),
          ),
        );
  return {
    ...game,
    time,
    barsDone,
    points: barsDone * RHYME_BAR_POINTS,
    phase: time >= end ? "done" : "playing",
  };
}

// Scoring is for playing the whole round through: every bar finished counts.
export function rhymeRewardCoins(game: RhymeGame): number {
  return game.phase === "done" && game.barsDone >= game.bars.length ? 15 : 0;
}

export const LIGHTS_TARGET = 0b111111111;
export function flipLights(board: number, tile: number): number {
  if (!Number.isInteger(tile) || tile < 0 || tile > 8) return board;
  const row = Math.floor(tile / 3),
    col = tile % 3;
  for (const [dr, dc] of [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const r = row + dr,
      c = col + dc;
    if (r >= 0 && r < 3 && c >= 0 && c < 3) board ^= 1 << (r * 3 + c);
  }
  return board;
}
const LIGHT_MOVES = Array.from({ length: 9 }, (_, tile) => flipLights(0, tile));
const LIGHT_PARS = [2, 3, 4, 5, 5, 6];

export function lightsPar(round: number): number {
  const r = Math.max(0, Math.floor(round) || 0);
  return LIGHT_PARS[Math.min(r, LIGHT_PARS.length - 1)];
}

function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newLightsBoard(round: number, seed = 0): number {
  // 3x3 presses are independent, so pressing k distinct tiles needs exactly k to undo.
  const random = seededRandom(Math.imul(seed | 0, 9973) + Math.floor(round));
  const tiles = Array.from({ length: 9 }, (_, tile) => tile);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles
    .slice(0, lightsPar(round))
    .reduce((board, tile) => board ^ LIGHT_MOVES[tile], LIGHTS_TARGET);
}

/** Bitmask of the tiles to press; on a 3x3 board it is unique. */
export function lightsSolution(board: number): number {
  for (let mask = 0; mask < 512; mask++) {
    let next = board;
    for (let tile = 0; tile < 9; tile++)
      if (mask & (1 << tile)) next ^= LIGHT_MOVES[tile];
    if (next === LIGHTS_TARGET) return mask;
  }
  return 0;
}

export function lightsHint(board: number): number | null {
  const mask = lightsSolution(board);
  if (!mask) return null;
  return Math.log2(mask & -mask);
}

/** Tiles a press on `tile` flips, as a bitmask. */
export function lightsReach(tile: number): number {
  return LIGHT_MOVES[tile] ?? 0;
}

const lightsHintKey = (board: number) => `joshua-exe-math-hints-v1:${board}`;
type HintStorage = Pick<Storage, "getItem" | "setItem">;

export function createLightsHintTracker(storage?: HintStorage) {
  const hinted = new Set<number>();
  return {
    reveal(startingBoard: number, board: number) {
      const tile = lightsHint(board);
      if (tile !== null && !hinted.has(startingBoard)) {
        hinted.add(startingBoard);
        try {
          (storage ?? localStorage).setItem(
            lightsHintKey(startingBoard),
            "1",
          );
        } catch {
          // Keep the reward blocked even if storage is unavailable.
        }
      }
      return tile;
    },
    wasUsed(startingBoard: number) {
      if (hinted.has(startingBoard)) return true;
      try {
        return (storage ?? localStorage).getItem(lightsHintKey(startingBoard)) === "1";
      } catch {
        return false;
      }
    },
  };
}
