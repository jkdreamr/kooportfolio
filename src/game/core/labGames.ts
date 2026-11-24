export const BEAT_INTERVAL = 0.6;
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

const phrase = [0, 2, 1, 2, 0, 3, 1, 2, 0, 1, 3, 2, 0, 2, 3, 1];
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
  best: number;
  feedback: string;
};
export function newBeatGame(): BeatGame {
  return {
    phase: "ready",
    time: 0,
    points: 0,
    combo: 0,
    best: 0,
    feedback: "",
    notes: [...phrase, ...phrase.map((lane) => (lane + 1) % 4)].map(
      (lane, i) => ({
        lane,
        at: 2.4 + i * BEAT_INTERVAL,
        hit: false,
        missed: false,
      }),
    ),
  };
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
    phase: time > notes[notes.length - 1].at + 0.6 ? "done" : "playing",
    combo: missed ? 0 : game.combo,
    feedback: missed ? "Miss" : game.feedback,
  };
}
export function hitBeat(game: BeatGame, lane: number): BeatGame {
  if (
    game.phase !== "playing" ||
    !Number.isInteger(lane) ||
    lane < 0 ||
    lane > 3
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
      points: Math.max(0, game.points - 35),
      feedback: "Off beat",
    };
  const combo = game.combo + 1;
  return {
    ...game,
    combo,
    best: Math.max(game.best, combo),
    points: game.points + (error <= 0.08 ? 100 : 60),
    feedback: error <= 0.08 ? "Perfect" : "Good",
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
