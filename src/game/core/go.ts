// Small-board Go: positional superko, no suicide, Chinese-style area scoring.
// Dead groups are agreed during scoring; resume play to settle a disagreement.
export const GO_SIZE = 9;
export const GO_KOMI = 6.5;
export type GoColor = 1 | 2;
export type GoStone = 0 | GoColor;
export type GoGame = {
  board: GoStone[];
  turn: GoColor;
  history: string[];
  captures: [number, number];
  passes: number;
  moves: number;
  last: number | null;
  phase: "playing" | "scoring" | "finished";
  dead: number[];
};
export function newGoGame(): GoGame {
  const board = Array<GoStone>(GO_SIZE * GO_SIZE).fill(0);
  return {
    board, turn: 1, history: [board.join("")], captures: [0, 0],
    passes: 0, moves: 0, last: null, phase: "playing", dead: [],
  };
}
export function goNeighbors(point: number) {
  const x = point % GO_SIZE, y = Math.floor(point / GO_SIZE);
  return [x > 0 ? point - 1 : -1, x < GO_SIZE - 1 ? point + 1 : -1,
    y > 0 ? point - GO_SIZE : -1, y < GO_SIZE - 1 ? point + GO_SIZE : -1]
    .filter((n) => n >= 0);
}
export function goGroup(board: readonly GoStone[], start: number) {
  const stones = new Set<number>([start]), liberties = new Set<number>();
  for (const point of stones) {
    for (const n of goNeighbors(point)) {
      if (board[n] === 0) liberties.add(n);
      else if (board[n] === board[start]) stones.add(n);
    }
  }
  return { stones: [...stones], liberties };
}
export type GoMove = { ok: true; game: GoGame; captured: number } |
  { ok: false; reason: string };
export function playGo(game: GoGame, point: number): GoMove {
  if (game.phase !== "playing") return { ok: false, reason: "Resume play first." };
  if (!Number.isInteger(point) || point < 0 || point >= game.board.length)
    return { ok: false, reason: "Choose an intersection." };
  if (game.board[point]) return { ok: false, reason: "That point is occupied." };
  const board = [...game.board];
  board[point] = game.turn;
  let captured = 0;
  for (const n of goNeighbors(point)) {
    if (board[n] && board[n] !== game.turn) {
      const group = goGroup(board, n);
      if (group.liberties.size === 0) {
        captured += group.stones.length;
        group.stones.forEach((stone) => { board[stone] = 0; });
      }
    }
  }
  if (goGroup(board, point).liberties.size === 0)
    return { ok: false, reason: "That group would have no liberties." };
  const position = board.join("");
  if (game.history.includes(position))
    return { ok: false, reason: "Ko: that would repeat a board position." };
  const captures: [number, number] = [...game.captures];
  captures[game.turn - 1] += captured;
  return { ok: true, captured, game: {
    ...game, board, turn: game.turn === 1 ? 2 : 1, captures,
    history: [...game.history, position], passes: 0,
    moves: game.moves + 1, last: point,
  } };
}
export function passGo(game: GoGame): GoGame {
  if (game.phase !== "playing") return game;
  return { ...game, turn: game.turn === 1 ? 2 : 1, last: null,
    passes: game.passes + 1, moves: game.moves + 1,
    phase: game.passes >= 1 ? "scoring" : "playing" };
}
export function toggleGoDead(game: GoGame, point: number): GoGame {
  if (game.phase !== "scoring" || !game.board[point]) return game;
  const group = goGroup(game.board, point).stones;
  const dead = new Set(game.dead);
  const remove = dead.has(point);
  group.forEach((stone) => { if (remove) dead.delete(stone); else dead.add(stone); });
  return { ...game, dead: [...dead] };
}
export function resumeGo(game: GoGame): GoGame {
  return game.phase === "scoring"
    ? { ...game, phase: "playing", passes: 0, dead: [] } : game;
}
export function scoreGo(game: GoGame) {
  const board = [...game.board];
  game.dead.forEach((point) => { board[point] = 0; });
  const owners = [...board], seen = new Set<number>();
  const points = [0, GO_KOMI];
  board.forEach((stone, point) => {
    if (stone) { points[stone - 1]++; return; }
    if (seen.has(point)) return;
    const region = new Set([point]), borders = new Set<GoColor>();
    for (const p of region) {
      seen.add(p);
      for (const n of goNeighbors(p)) {
        if (board[n]) borders.add(board[n] as GoColor);
        else region.add(n);
      }
    }
    if (borders.size === 1) {
      const owner = [...borders][0];
      points[owner - 1] += region.size;
      region.forEach((p) => { owners[p] = owner; });
    }
  });
  return { black: points[0], white: points[1], owners,
    winner: (points[0] > points[1] ? 1 : 2) as GoColor,
    margin: Math.abs(points[0] - points[1]) };
}
