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
  if (error > HIT_WINDOW)
    return {
      ...game,
      combo: 0,
      comboHits: [],
      points: Math.max(0, game.points - 35),
      feedback: "Off beat",
      feedbackAt: game.time,
    };
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
export function newLightsBoard(round: number): number {
  // Scramble a solved board with legal moves; every puzzle is solvable.
  const scrambles = [
    [0, 4, 8],
    [1, 3, 6, 8],
    [0, 2, 4, 7, 8],
  ];
  const steps = scrambles[((Math.floor(round) % 3) + 3) % 3];
  return steps.reduce(flipLights, LIGHTS_TARGET);
}
export function lightsHint(board: number): number | null {
  if (board === LIGHTS_TARGET) return null;
  // Only 512 move combinations exist; XOR moves commute and cancel in pairs.
  let shortest: number[] | null = null;
  for (let mask = 1; mask < 512; mask++) {
    let next = board;
    const moves: number[] = [];
    for (let tile = 0; tile < 9; tile++)
      if (mask & (1 << tile)) {
        next = flipLights(next, tile);
        moves.push(tile);
      }
    if (next === LIGHTS_TARGET && (!shortest || moves.length < shortest.length))
      shortest = moves;
  }
  return shortest?.[0] ?? null;
}
