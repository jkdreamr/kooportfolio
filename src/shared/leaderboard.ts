export const LEADERBOARD_PATH = "/api/leaderboard";
export const LEADERBOARD_LIMIT = 10;
export const LEADERBOARD_NAME_LIMIT = 24;

export const scoreboards = {
  "rowing-sprint": {
    label: "Rowing · 360 m",
    instruction: "Finish a Sprint to log a time.",
    order: "ASC",
    min: 1,
    max: 99_999_999,
  },
  "rowing-regatta": {
    label: "Rowing · 750 m",
    instruction: "Finish a Regatta to log a time.",
    order: "ASC",
    min: 1,
    max: 99_999_999,
  },
  "basketball-attack": {
    label: "Basketball · 90 seconds",
    instruction: "Finish a 90-second challenge to log a score.",
    order: "DESC",
    min: 1,
    max: 1000,
  },
} as const;

export type Scoreboard = keyof typeof scoreboards;
export type LeaderboardRun = { id: string; board: Scoreboard; score: number };
export type LeaderboardEntry = LeaderboardRun & { name: string };

export function isScoreboard(value: unknown): value is Scoreboard {
  return typeof value === "string" && Object.hasOwn(scoreboards, value);
}

export function readLeaderboardRun(value: unknown): LeaderboardRun | null {
  if (!value || typeof value !== "object") return null;
  const { id, board, score } = value as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    !/^[a-z0-9-]{16,80}$/.test(id) ||
    !isScoreboard(board) ||
    typeof score !== "number" ||
    !Number.isSafeInteger(score) ||
    score < scoreboards[board].min ||
    score > scoreboards[board].max
  )
    return null;
  return { id, board, score };
}

export function readLeaderboardEntry(value: unknown): LeaderboardEntry | null {
  const run = readLeaderboardRun(value);
  if (!run) return null;
  const { name } = value as Record<string, unknown>;
  if (typeof name !== "string") return null;
  const clean = name.trim();
  if (
    !clean ||
    clean.length > LEADERBOARD_NAME_LIMIT ||
    /[\p{Cc}\p{Cf}]/u.test(clean)
  )
    return null;
  return { ...run, name: clean };
}

export function compareScores(board: Scoreboard, a: number, b: number) {
  return scoreboards[board].order === "ASC" ? a - b : b - a;
}

export function formatLeaderboardScore(board: Scoreboard, score: number) {
  if (board === "basketball-attack") return `${score} pts`;
  const minutes = Math.floor(score / 60_000);
  const seconds = ((score % 60_000) / 1000).toFixed(3);
  return `${minutes}:${seconds.padStart(6, "0")}`;
}
