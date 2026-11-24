import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readLocalLeaderboard,
  readPendingRun,
  recordLeaderboardResult,
  saveLocalLeaderboardEntry,
} from "../src/game/core/leaderboard";
import type { LeaderboardEntry, Scoreboard } from "../src/shared/leaderboard";
import worker from "../worker/index";
import type { LeaderboardEnv } from "../worker/leaderboard";

const sprint = "rowing-sprint";
const basketball = "basketball-attack";
const score = (
  board: Scoreboard,
  score: number,
  name = "Guest",
): LeaderboardEntry => ({ id: crypto.randomUUID(), board, score, name });

function request(board?: Scoreboard, payload?: unknown, headers = {}) {
  return new Request(
    `https://example.test/api/leaderboard${board ? `?board=${board}` : ""}`,
    {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        Origin: "https://example.test",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.0.2.1",
        ...headers,
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    },
  );
}

describe("shared leaderboard", () => {
  let db: DatabaseSync;
  const statement = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    async first<T>() {
      return (db.prepare(sql).get(...params) ?? null) as T | null;
    },
    async all<T>() {
      return { results: db.prepare(sql).all(...params) as T[] };
    },
    async run() {
      return {
        meta: { changes: Number(db.prepare(sql).run(...params).changes) },
      };
    },
  });
  const env: LeaderboardEnv = { LEADERBOARD_DB: { prepare: statement } };
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(
      readFileSync(
        new URL(
          "../migrations/leaderboard/0001_leaderboard.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  });
  afterEach(() => db.close());

  it("ranks game-specific scores and returns at most ten public entries", async () => {
    for (let i = 1; i <= 11; i++) {
      const draft = score(sprint, 50_000 - i);
      expect((await worker.fetch(request(undefined, draft), env)).status).toBe(
        201,
      );
    }
    for (const [i, points] of [10, 20].entries()) {
      await worker.fetch(
        request(undefined, score(basketball, points), {
          "CF-Connecting-IP": `192.0.2.${i + 2}`,
        }),
        env,
      );
    }
    const rowing = await (await worker.fetch(request(sprint), env)).json();
    expect(rowing.entries).toHaveLength(10);
    expect(rowing.entries.map((item: LeaderboardEntry) => item.score)).toEqual(
      Array.from({ length: 10 }, (_, i) => 49_989 + i),
    );
    expect(Object.keys(rowing.entries[0]).sort()).toEqual([
      "board",
      "id",
      "name",
      "score",
    ]);
    const hoops = await (await worker.fetch(request(basketball), env)).json();
    expect(hoops.entries.map((item: LeaderboardEntry) => item.score)).toEqual([
      20, 10,
    ]);
  });

  it("validates submissions, limits posting and safely retries the same run", async () => {
    const draft = score(basketball, 20, "  Rower  ");
    const post = (body: unknown, headers?: Record<string, string>) =>
      worker.fetch(request(undefined, body, headers), env);
    expect((await post({ ...draft, score: 1001 })).status).toBe(400);
    expect((await post({ ...draft, name: "x".repeat(25) })).status).toBe(400);
    expect((await post({ ...draft, board: "__proto__" })).status).toBe(400);
    expect((await post(draft, { Origin: "https://other.test" })).status).toBe(
      403,
    );
    expect((await post("x".repeat(2000))).status).toBe(413);
    expect((await post(draft)).status).toBe(201);
    for (let i = 0; i < 11; i++)
      expect((await post(score(basketball, 5))).status).toBe(201);
    expect((await post(score(basketball, 6))).status).toBe(429);
    expect((await post({ ...draft, score: 21 })).status).toBe(409);
    const retry = await post(draft);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ entry: { name: "Rower" } });
  });

  it("reports the shared board unavailable without a working binding", async () => {
    expect((await worker.fetch(request(sprint))).status).toBe(503);
    db.exec("DROP TABLE leaderboard_scores");
    expect((await worker.fetch(request(sprint), env)).status).toBe(503);
  });
});

describe("device leaderboard", () => {
  it("persists the best unsent run in each event and consumes it after saving", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
    const slow = score(sprint, 47_000);
    const fast = score(sprint, 44_000);
    recordLeaderboardResult(fast, storage);
    recordLeaderboardResult(slow, storage);
    recordLeaderboardResult(score(basketball, 20), storage);
    expect(readPendingRun(sprint, storage)).toMatchObject({ id: fast.id });
    saveLocalLeaderboardEntry(fast, storage);
    saveLocalLeaderboardEntry(fast, storage);
    recordLeaderboardResult(slow, storage);
    saveLocalLeaderboardEntry(slow, storage);
    expect(readPendingRun(sprint, storage)).toBeUndefined();
    expect(readPendingRun(basketball, storage)?.score).toBe(20);
    expect(readLocalLeaderboard(sprint, storage)).toEqual([fast, slow]);
    expect(readLocalLeaderboard(basketball, storage)).toEqual([]);
  });
});
