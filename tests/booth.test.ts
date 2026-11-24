import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_STRIP_BYTES,
  STRIP_HEIGHT,
  STRIP_WIDTH,
  WALL_LIMIT,
} from "../src/shared/booth";
import worker from "../worker/index";
import type { BoothEnv } from "../worker/booth";

let sqlite: DatabaseSync;
let env: BoothEnv;

function statement(sql: string, values: SQLInputValue[] = []) {
  return {
    bind: (...bound: SQLInputValue[]) => statement(sql, bound),
    async all<T>() {
      return { results: sqlite.prepare(sql).all(...values) as T[] };
    },
  };
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0001_booth.sql", "0002_post_limits.sql"]) {
    sqlite.exec(
      readFileSync(
        new URL(`../migrations/booth/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  }
  env = {
    BOOTH_DB: {
      prepare: statement,
      async batch(statements) {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const query of statements) results.push(await query.all());
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
});

afterEach(() => sqlite.close());

function jpeg(width = STRIP_WIDTH) {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0,
    11,
    8,
    STRIP_HEIGHT >> 8,
    STRIP_HEIGHT & 255,
    width >> 8,
    width & 255,
    1,
    1,
    0x11,
    0,
    0xff,
    0xda,
    0,
    8,
    1,
    1,
    0,
    0,
    63,
    0,
    0x3f,
    0xff,
    0xd9,
  ]);
}

function request(method = "GET", body?: Uint8Array<ArrayBuffer>, headers = {}) {
  return new Request("https://preview.test/api/booth", {
    method,
    body,
    headers: {
      "Content-Type": "image/jpeg",
      Origin: "https://preview.test",
      ...headers,
    },
  });
}

describe("photo wall", () => {
  it("persists across requests and returns only the most recent strips", async () => {
    const bytes = jpeg();
    const ids = [];
    for (let index = 0; index < WALL_LIMIT + 2; index++) {
      const created = await worker.fetch(
        request("POST", bytes, {
          "CF-Connecting-IP": `192.0.2.${index + 1}`,
        }),
        env,
      );
      expect(created.status).toBe(201);
      ids.unshift((await created.json()).id);
    }
    const response = await worker.fetch(request(), env);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      strips: ids
        .slice(0, WALL_LIMIT)
        .map((id) => ({ id, jpeg: Buffer.from(bytes).toString("base64") })),
    });
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM booth_strips").get()?.count,
    ).toBe(WALL_LIMIT);
  });

  it("limits a visitor without evicting strips or blocking another visitor", async () => {
    const ip = "192.0.2.20";
    const post = (visitor: string) =>
      worker.fetch(
        request("POST", jpeg(), {
          "CF-Connecting-IP": visitor,
        }),
        env,
      );
    for (let count = 0; count < 3; count++)
      expect((await post(ip)).status).toBe(201);
    const before = await (await worker.fetch(request(), env)).json();
    const rejected = await post(ip);
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("Retry-After")).toBe("3600");
    expect(await (await worker.fetch(request(), env)).json()).toEqual(before);
    expect((await post("192.0.2.21")).status).toBe(201);
    const visitors = sqlite
      .prepare("SELECT DISTINCT visitor_hash FROM booth_post_limits")
      .all();
    expect(visitors).toHaveLength(2);
    expect(
      visitors.every(
        ({ visitor_hash }) =>
          typeof visitor_hash === "string" && visitor_hash.length === 44,
      ),
    ).toBe(true);
    sqlite.exec("UPDATE booth_post_limits SET posted_at = 0");
    expect((await post(ip)).status).toBe(201);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM booth_post_limits").get()
        ?.count,
    ).toBe(1);
  });

  it("rejects wrong origin, content type, size, dimensions and invalid JPEG headers", async () => {
    const entries = [
      [request("POST", jpeg(), { Origin: "https://elsewhere.test" }), 403],
      [request("POST", jpeg(), { "Content-Type": "image/png" }), 415],
      [request("POST", new Uint8Array(MAX_STRIP_BYTES + 1)), 413],
      [request("POST", jpeg(1)), 400],
      [request("POST", jpeg().slice(0, -1)), 400],
      [request("POST", new Uint8Array()), 400],
      [request("DELETE"), 405],
    ] as const;
    for (const [input, status] of entries) {
      expect((await worker.fetch(input, env)).status).toBe(status);
    }
    expect(await (await worker.fetch(request(), env)).json()).toEqual({
      strips: [],
    });
  });

  it("reports unavailable storage without claiming success", async () => {
    expect((await worker.fetch(request())).status).toBe(503);
    expect((await worker.fetch(request("POST", jpeg()))).status).toBe(503);
    sqlite.exec("DROP TABLE booth_strips");
    expect((await worker.fetch(request(), env)).status).toBe(503);
    expect((await worker.fetch(request("POST", jpeg()), env)).status).toBe(503);
  });
});
