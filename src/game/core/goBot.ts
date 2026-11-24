import { GO_SIZE, goGroup, goNeighbors, playGo, scoreGo, type GoGame } from "./go";

export const GO_LEVELS = ["easy", "medium", "hard"] as const;
export type GoLevel = typeof GO_LEVELS[number];
export const DEFAULT_GO_LEVEL: GoLevel = "medium";

const points = Array.from({ length: GO_SIZE ** 2 }, (_, point) => {
  const x = point % GO_SIZE, y = Math.floor(point / GO_SIZE);
  const neighbors = goNeighbors(point);
  const diagonals = [-1, 1].flatMap((dx) => [-1, 1].flatMap((dy) =>
    x + dx >= 0 && x + dx < GO_SIZE && y + dy >= 0 && y + dy < GO_SIZE
      ? [point + dx + dy * GO_SIZE] : []));
  const vicinity: [number, number][] = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const distance = Math.abs(dx) + Math.abs(dy);
      if (!distance || distance > 3 || x + dx < 0 || x + dx >= GO_SIZE ||
        y + dy < 0 || y + dy >= GO_SIZE) continue;
      vicinity.push([point + dx + dy * GO_SIZE, 4 - distance]);
    }
  }
  return { neighbors, diagonals, vicinity, line: Math.min(x, y, GO_SIZE - 1 - x, GO_SIZE - 1 - y) };
});

function groupsOn(board: GoGame["board"]) {
  const groups: ReturnType<typeof goGroup>[] = [];
  const at = new Map<number, ReturnType<typeof goGroup>>();
  board.forEach((stone, point) => {
    if (!stone || at.has(point)) return;
    const group = goGroup(board, point);
    groups.push(group);
    group.stones.forEach((p) => at.set(p, group));
  });
  return { groups, at };
}

type Candidate = { point: number; game: GoGame; priority: number; tactical: boolean };

function candidates(game: GoGame, level: GoLevel): Candidate[] {
  const { board, turn } = game;
  const { at } = groupsOn(board);
  const moves: Candidate[] = [];
  for (let point = 0; point < board.length; point++) {
    if (board[point]) continue;
    const { neighbors, diagonals, vicinity, line } = points[point];
    const own = new Set(neighbors.filter((n) => board[n] === turn).map((n) => at.get(n)!));
    const enemy = new Set(neighbors.filter((n) => board[n] && board[n] !== turn).map((n) => at.get(n)!));
    const eye = neighbors.every((n) => board[n] === turn) &&
      diagonals.filter((n) => board[n] !== turn).length <= (diagonals.length === 4 ? 1 : 0);
    if (eye && [...own].every((group) => group.liberties.size !== 1)) continue;
    const move = playGo(game, point);
    if (!move.ok) continue;
    const libs = goGroup(move.game.board, point).liberties.size;
    if (eye && libs < 2) continue;
    const save = libs > 1 ? [...own].reduce((n, g) => n + (g.liberties.size === 1 ? g.stones.length : 0), 0) : 0;
    const attack = libs > 1 ? [...enemy].reduce((n, g) => n + (g.liberties.size === 2 ? g.stones.length : 0), 0) : 0;
    const crowded = vicinity.reduce((n, [p, weight]) => n + (board[p] === turn ? weight : 0), 0);
    const opening = Math.max(0, 1 - game.moves / 20);
    const shape = opening * ([-1.4, 0.25, 2.8, 1.7, 0.5][line] - crowded * 0.23) +
      Math.min(libs, 5) * 0.26 + Math.max(0, own.size - 1) * 0.85 + enemy.size * 0.45 -
      crowded * 0.045 - (line === 0 ? 0.4 : 0);
    const noise = (((point * 37 + game.moves * 13) % 19) / 18 - 0.5) * (level === "easy" ? 3 : 0.18);
    const priority = shape + move.captured * 4.5 + save * (libs >= 3 ? 7.5 : 3.6) + Math.min(attack, 6) * 0.65 -
      (libs === 1 ? 4 + [...own].reduce((n, g) => n + g.stones.length * 1.8, 0) : 0) + noise;
    moves.push({ point, game: move.game, priority, tactical: move.captured > 0 || save > 0 || attack > 0 });
  }
  return moves.sort((a, b) => b.priority - a.priority);
}

function balance(game: GoGame) {
  const { board } = game;
  const { groups } = groupsOn(board);
  let value = 0;
  for (const { stones, liberties } of groups) {
    const health = liberties.size === 1 ? -0.8 : liberties.size === 2 ? 0.55 : 1;
    value += (board[stones[0]] === 1 ? 1 : -1) * stones.length * health;
  }
  for (let point = 0; point < board.length; point++) {
    if (board[point]) continue;
    const { neighbors, vicinity } = points[point];
    if (neighbors.every((p) => board[p] === 1)) { value++; continue; }
    if (neighbors.every((p) => board[p] === 2)) { value--; continue; }
    const influence = vicinity.reduce((n, [p, weight]) => n + (board[p] === 1 ? weight : board[p] === 2 ? -weight : 0), 0);
    value += 0.55 * influence / (6 + Math.abs(influence));
  }
  return value;
}

function canSettle(game: GoGame, moves: Candidate[]) {
  if (!game.passes || game.moves <= 20 || moves.some((m) => m.tactical)) return false;
  const opponent = game.turn === 1 ? 2 : 1;
  if (!game.board.includes(opponent)) return true;
  const score = scoreGo(game);
  return score.winner === game.turn && moves.every(({ point }) => score.owners[point] === game.turn);
}

type SearchEdge = { move: Candidate; prior: number; child?: SearchNode };
type SearchNode = { value: number; visits: number; total: number; edges: SearchEdge[] };
const HARD_VISITS = 180;
const HARD_BUDGET_MS = 1300;

function expand(game: GoGame, moves: Candidate[], width: number): SearchNode {
  const sign = game.turn === 1 ? 1 : -1;
  const value = balance(game);
  const ranked = moves.slice(0, 12).map((move) => {
    const lead = balance(move.game);
    return { move, rank: sign * (lead - value) + 0.48 * move.priority };
  }).sort((a, b) => b.rank - a.rank).slice(0, width);
  const weights = ranked.map(({ rank }) => Math.exp((rank - ranked[0].rank) / 5));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return { value, visits: 0, total: 0, edges: ranked.map(({ move }, i) => ({ move, prior: weights[i] / sum })) };
}

function searchHard(game: GoGame, moves: Candidate[]) {
  if (!moves.length) return null;
  const deadline = performance.now() + HARD_BUDGET_MS;
  const root = expand(game, moves, 10);
  const rootSign = game.turn === 1 ? 1 : -1;
  for (let i = 0; i < HARD_VISITS && performance.now() < deadline; i++) {
    let node = root, sign = rootSign;
    const path = [node];
    while (node.edges.length && path.length <= 16) {
      const scale = 12 * Math.sqrt(node.visits + 1);
      let selected = node.edges[0], best = -Infinity;
      for (const edge of node.edges) {
        const child = edge.child;
        const mean = child?.visits ? child.total / child.visits : node.value - sign * 2;
        const score = sign * mean + scale * edge.prior / (1 + (child?.visits ?? 0));
        if (score > best) { selected = edge; best = score; }
      }
      if (!selected.child) {
        const next = selected.move.game;
        selected.child = expand(next, candidates(next, "hard"), 6);
        node = selected.child;
        path.push(node);
        break;
      }
      node = selected.child;
      path.push(node);
      sign *= -1;
    }
    for (const parent of path) {
      parent.visits++;
      parent.total += node.value;
    }
  }
  let best = root.edges[0];
  for (const edge of root.edges) {
    if ((edge.child?.visits ?? 0) > (best.child?.visits ?? 0)) best = edge;
  }
  return best.move.point;
}

export function chooseGoMove(game: GoGame, level: GoLevel = DEFAULT_GO_LEVEL): number | null {
  if (game.phase !== "playing") return null;
  const moves = candidates(game, level);
  if (!moves.length || canSettle(game, moves)) return null;
  if (level === "easy") return moves[0].priority >= 0 ? moves[0].point : null;

  const sign = game.turn === 1 ? 1 : -1;
  const before = sign * balance(game);
  if (level === "hard") {
    return searchHard(game, moves.filter((move) => move.tactical || move.priority >= 0 || sign * balance(move.game) > before));
  }
  let best: Candidate | undefined, bestValue = -Infinity;
  for (const move of moves.slice(0, 12)) {
    const after = sign * balance(move.game);
    if (!move.tactical && move.priority < 0 && after <= before) continue;
    const value = after + move.priority * 0.48;
    if (value > bestValue) { best = move; bestValue = value; }
  }
  return best?.point ?? null;
}
