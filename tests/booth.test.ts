import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_STRIP_BYTES,
  STRIP_HEIGHT,
  STRIP_WIDTH,
  WALL_LIMIT,
} from "../src/shared/booth";
import worker from "../worker/index";
import type { BoothEnv } from "../worker/booth";
import { fakeD1 } from "./helpers/d1";

let sqlite: DatabaseSync;
let env: BoothEnv;

beforeEach(() => {
  const fake = fakeD1();
  sqlite = fake.sqlite;
  env = { BOOTH_DB: fake.db };
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
    for (let count = 0; count < 3; count++) {
      expect((await post(ip)).status).toBe(201);
      // Past the one-minute cooldown between two strips.
      sqlite.exec("UPDATE booth_post_limits SET posted_at = posted_at - 61");
    }
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

  it("keeps a minute between two strips from one visitor", async () => {
    const post = () =>
      worker.fetch(request("POST", jpeg(), { "CF-Connecting-IP": "192.0.2.40" }), env);
    expect((await post()).status).toBe(201);
    const early = await post();
    expect(early.status).toBe(429);
    const wait = Number(early.headers.get("Retry-After"));
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60);
    sqlite.exec("UPDATE booth_post_limits SET posted_at = posted_at - 61");
    expect((await post()).status).toBe(201);
  });

  it("hides a strip after three reports and lets the owner delete it", async () => {
    const created = await worker.fetch(request("POST", jpeg(), { "CF-Connecting-IP": "192.0.2.50" }), env);
    const { id } = await created.json();
    const report = (ip: string) =>
      worker.fetch(
        new Request("https://preview.test/api/report", {
          method: "POST",
          headers: { Origin: "https://preview.test", "Content-Type": "application/json", "CF-Connecting-IP": ip },
          body: JSON.stringify({ kind: "strip", id }),
        }),
        env,
      );
    for (const ip of ["198.51.100.1", "198.51.100.2"]) expect((await report(ip)).status).toBe(202);
    // A repeat from the same network counts once.
    expect((await report("198.51.100.2")).status).toBe(202);
    expect((await (await worker.fetch(request(), env)).json()).strips).toHaveLength(1);
    expect((await report("198.51.100.3")).status).toBe(202);
    expect((await (await worker.fetch(request(), env)).json()).strips).toEqual([]);
    const admin = "e".repeat(64);
    const remove = (token: string) =>
      worker.fetch(
        new Request(`https://preview.test/api/booth/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }),
        { ...env, ADMIN_TOKEN: admin },
      );
    expect((await remove("f".repeat(64))).status).toBe(403);
    expect((await remove(admin)).status).toBe(200);
    expect((await remove(admin)).status).toBe(404);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reports").get()?.count).toBe(0);
  });
});
