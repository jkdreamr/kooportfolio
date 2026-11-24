import {
  compareScores,
  LEADERBOARD_LIMIT,
  LEADERBOARD_PATH,
  readLeaderboardEntry,
  readLeaderboardRun,
  type LeaderboardEntry,
  type LeaderboardRun,
  type Scoreboard,
} from "../../shared/leaderboard";

export const LEADERBOARD_STORAGE_KEY = "joshua-exe-leaderboard-v1";
type LocalBoard = {
  runs: Partial<Record<Scoreboard, LeaderboardRun>>;
  entries: LeaderboardEntry[];
};
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
let sessionBoard: LocalBoard | undefined;

function validItems<T>(items: unknown, read: (value: unknown) => T | null) {
  return Array.isArray(items)
    ? items.map(read).filter((value): value is T => value !== null)
    : [];
}

function load(storage?: Storage): LocalBoard {
  if (!storage && sessionBoard) return sessionBoard;
  try {
    const data = JSON.parse(
      (storage ?? localStorage).getItem(LEADERBOARD_STORAGE_KEY) ?? "null",
    );
    return {
      runs: Object.fromEntries(
        validItems(Object.values(data?.runs ?? {}), readLeaderboardRun).map(
          (run) => [run.board, run],
        ),
      ),
      entries: validItems(data?.entries, readLeaderboardEntry),
    };
  } catch {
    return { runs: {}, entries: [] };
  }
}

function save(data: LocalBoard, storage?: Storage) {
  try {
    (storage ?? localStorage).setItem(
      LEADERBOARD_STORAGE_KEY,
      JSON.stringify(data),
    );
    if (!storage) sessionBoard = undefined;
  } catch {
    if (!storage) sessionBoard = data;
  }
}

function sortedEntries(entries: LeaderboardEntry[], board: Scoreboard) {
  return entries
    .filter((entry) => entry.board === board)
    .sort((a, b) => compareScores(board, a.score, b.score))
    .slice(0, LEADERBOARD_LIMIT);
}

export function recordLeaderboardResult(
  run: LeaderboardRun,
  storage?: Storage,
) {
  const valid = readLeaderboardRun(run);
  if (!valid) return;
  const data = load(storage);
  if (data.entries.some((item) => item.id === valid.id)) return;
  const best = data.runs[valid.board];
  if (best && compareScores(valid.board, valid.score, best.score) >= 0) return;
  data.runs[valid.board] = valid;
  save(data, storage);
}

export function readPendingRun(board: Scoreboard, storage?: Storage) {
  return load(storage).runs[board];
}

export function readLocalLeaderboard(board: Scoreboard, storage?: Storage) {
  return sortedEntries(load(storage).entries, board);
}

export function saveLocalLeaderboardEntry(
  entry: LeaderboardEntry,
  storage?: Storage,
) {
  const valid = readLeaderboardEntry(entry);
  if (!valid) return;
  const data = load(storage);
  if (data.entries.some((item) => item.id === valid.id)) return;
  data.entries = [
    ...data.entries.filter((item) => item.board !== valid.board),
    ...sortedEntries([...data.entries, valid], valid.board),
  ];
  if (data.runs[valid.board]?.id === valid.id) delete data.runs[valid.board];
  save(data, storage);
}

export async function fetchLeaderboard(
  board: Scoreboard,
  signal?: AbortSignal,
) {
  try {
    const response = await fetch(`${LEADERBOARD_PATH}?board=${board}`, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(4000)])
        : AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data?.entries)) return null;
    return sortedEntries(validItems(data.entries, readLeaderboardEntry), board);
  } catch {
    return null;
  }
}

export async function submitLeaderboardEntry(
  entry: LeaderboardEntry,
): Promise<"shared" | "local"> {
  let response: Response;
  try {
    response = await fetch(LEADERBOARD_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return "local";
  }
  if (response.status >= 500) return "local";
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Could not post score.");
  }
  return "shared";
}
