export const BEAT_INTERVAL = 0.6;
export const BEAT_COUNT_IN = 4 * BEAT_INTERVAL;
export const HIT_WINDOW = 0.21;
export const BEAT_PAD_KEYS = ["F", "G", "H", "J"] as const;

export function beatPadLane({
  key,
  altKey,
  ctrlKey,
  metaKey,
  isComposing,
}: Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "isComposing"
>): number {
  if (altKey || ctrlKey || metaKey || isComposing) return -1;
  const letter = BEAT_PAD_KEYS.findIndex((pad) => pad === key.toUpperCase());
  return letter >= 0 ? letter : /^[1-4]$/.test(key) ? Number(key) - 1 : -1;
}

const phrase = [0, 0, 2, 2, 0, 2, 1, 2, 0, 1, 3, 2, 0, 2, 3, 1];
const variation = [0, 1, 2, 2.5, 4, 5, 6, 6.5, 8, 9, 10, 10.5, 12, 13, 14, 15];
export type BeatNote = {
  lane: number;
  at: number;
  hit: boolean;
  missed: boolean;
};
export type BeatGame = {
  phase: "ready" | "playing" | "done";
  time: number;
  notes: BeatNote[];
  points: number;
  combo: number;
  comboHits: number[];
  best: number;
  feedback: string;
  feedbackAt: number;
};
export function newBeatGame(): BeatGame {
  return {
    phase: "ready",
    time: 0,
    points: 0,
    combo: 0,
    comboHits: [],
    best: 0,
    feedback: "",
    feedbackAt: 0,
    notes: [...phrase, ...phrase.map((lane) => (lane + 1) % 4)].map(
      (lane, i) => ({
        lane,
        at:
          BEAT_COUNT_IN +
          (i < phrase.length
            ? i
            : phrase.length + variation[i - phrase.length]) *
            BEAT_INTERVAL,
        hit: false,
        missed: false,
      }),
    ),
  };
}
export function beatRoundEnd(game: BeatGame): number {
  return game.notes[game.notes.length - 1].at + BEAT_INTERVAL;
}

export function beatCue(game: BeatGame, lane: number): boolean {
  return (
    game.phase === "playing" &&
    game.notes.some(
      (note) =>
        note.lane === lane &&
        !note.hit &&
        !note.missed &&
        Math.abs(note.at - game.time) <= HIT_WINDOW,
    )
  );
}

function consecutiveHits(notes: BeatNote[], hits: number[]): number {
  if (!hits.length) return 0;
  const lastHit = Math.max(...hits);
  if (notes.slice(lastHit + 1).some((note) => note.missed)) return 0;
  let combo = 0;
  while (hits.includes(lastHit - combo)) combo++;
  return combo;
}

export function advanceBeat(game: BeatGame, dt: number): BeatGame {
  if (game.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return game;
  const time = game.time + dt;
  let missed = false;
  const notes = game.notes.map((note) => {
    if (!note.hit && !note.missed && time - note.at > HIT_WINDOW) {
      missed = true;
      return { ...note, missed: true };
    }
    return note;
  });
  return {
    ...game,
    time,
    notes,
    phase: time >= beatRoundEnd(game) ? "done" : "playing",
    combo: missed ? consecutiveHits(notes, game.comboHits) : game.combo,
    feedback: missed ? "Miss" : game.feedback,
    feedbackAt: missed ? time : game.feedbackAt,
  };
}
export function hitBeat(game: BeatGame, lane: number): BeatGame {
  if (
    game.phase !== "playing" ||
    !Number.isInteger(lane) ||
    lane < 0 ||
    lane > 3 ||
    game.time < BEAT_COUNT_IN - HIT_WINDOW
  )
    return game;
  const candidates = game.notes.filter(
    (n) => n.lane === lane && !n.hit && !n.missed,
  );
  const note = candidates.sort(
    (a, b) => Math.abs(a.at - game.time) - Math.abs(b.at - game.time),
  )[0];
  const error = note ? Math.abs(note.at - game.time) : Infinity;
  if (error > HIT_WINDOW) {
    if (game.time < BEAT_COUNT_IN) return game;
    return {
      ...game,
      combo: 0,
      comboHits: [],
      points: Math.max(0, game.points - 35),
      feedback: "Off beat",
      feedbackAt: game.time,
    };
  }
  const comboHits = [...game.comboHits, game.notes.indexOf(note)];
  const combo = consecutiveHits(game.notes, comboHits);
  return {
    ...game,
    combo,
    comboHits,
    best: Math.max(game.best, combo),
    points: game.points + (error <= 0.08 ? 100 : 60),
    feedback: error <= 0.08 ? "Perfect" : "Good",
    feedbackAt: game.time,
    notes: game.notes.map((n) => (n === note ? { ...n, hit: true } : n)),
  };
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
