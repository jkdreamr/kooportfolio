import {
  isScoreboard,
  LEADERBOARD_LIMIT,
  readLeaderboardEntry,
  scoreboards,
  type LeaderboardEntry,
} from "../src/shared/leaderboard";
import { isAllowedOrigin, type CorsEnv } from "./cors";

type Statement = {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
};

export type LeaderboardEnv = CorsEnv & {
  LEADERBOARD_DB?: { prepare(sql: string): Statement };
};

const hour = 3_600_000;
const maxBody = 1024;
const unavailable = () =>
  reply({ error: "Shared scores are not enabled." }, 503);
const reply = (body: unknown, status = 200, headers = {}) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

async function readBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new Error("json");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("json");
  const bytes = new Uint8Array(maxBody);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.length > maxBody) {
      await reader.cancel();
      throw new RangeError("size");
    }
    bytes.set(value, size);
    size += value.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
}

async function networkBucket(request: Request, now: number) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${Math.floor(now / hour)}:${ip}`),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

export async function leaderboardApi(
  request: Request,
  env: LeaderboardEnv,
): Promise<Response> {
  const { LEADERBOARD_DB: db } = env;
  if (!db) return unavailable();
  const url = new URL(request.url);
  try {
    if (request.method === "GET") {
      const board = url.searchParams.get("board");
      if (!isScoreboard(board)) return reply({ error: "Unknown board." }, 400);
      const { results } = await db
        .prepare(
          `SELECT id, board, score, name FROM leaderboard_scores
           WHERE board = ? ORDER BY score ${scoreboards[board].order},
           created_at ASC, id ASC LIMIT ?`,
        )
        .bind(board, LEADERBOARD_LIMIT)
        .all<LeaderboardEntry>();
      return reply({ entries: results });
    }
    if (request.method !== "POST")
      return reply({ error: "Method not allowed." }, 405, {
        Allow: "GET, POST",
      });
    const origin = request.headers.get("Origin");
    if (!origin || !isAllowedOrigin(origin, request.url, env))
      return reply({ error: "Use the in-game leaderboard." }, 403);

    let raw: unknown;
    try {
      raw = await readBody(request);
    } catch (error) {
      return error instanceof RangeError
        ? reply({ error: "Score entry is too large." }, 413)
        : reply({ error: "Send a JSON score." }, 400);
    }
    const entry = readLeaderboardEntry(raw);
    if (!entry) return reply({ error: "Check the name and score." }, 400);

    const now = Date.now();
    const network = await networkBucket(request, now);
    const inserted = await db
      .prepare(
        `INSERT INTO leaderboard_scores (id, board, score, name, created_at, network)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM leaderboard_scores WHERE network = ? AND created_at > ?) < 12
           AND (SELECT COUNT(*) FROM leaderboard_scores WHERE created_at > ?) < 200
           AND (SELECT COUNT(*) FROM leaderboard_scores) < 10000
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        entry.id,
        entry.board,
        entry.score,
        entry.name,
        now,
        network,
        network,
        now - hour,
        now - hour,
      )
      .run();
    if (inserted.meta.changes) return reply({ entry }, 201);

    const existing = await db
      .prepare(
        "SELECT id, board, score, name FROM leaderboard_scores WHERE id = ?",
      )
      .bind(entry.id)
      .first<LeaderboardEntry>();
    if (!existing)
      return reply(
        { error: "Score submissions are full. Try again later." },
        429,
        {
          "Retry-After": "3600",
        },
      );
    if (
      existing.board !== entry.board ||
      existing.name !== entry.name ||
      existing.score !== entry.score
    )
      return reply({ error: "This run was already submitted." }, 409);
    return reply({ entry: existing });
  } catch {
    return unavailable();
  }
}
