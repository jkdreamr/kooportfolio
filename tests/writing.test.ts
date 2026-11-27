import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import worker from "../worker/index";
import type { WritingEnv } from "../worker/writing";
import { fakeD1 } from "./helpers/d1";

let sqlite: DatabaseSync, env: WritingEnv;
const token = "a".repeat(64);
const post = (extra = {}) => ({
  id: crypto.randomUUID(),
  deleteToken: token,
  title: "A night on the river",
  author: "Visitor",
  body: "The river was quiet.\n\nWe rowed home.",
  ...extra,
});
function request(method = "GET", body?: unknown, path = "", headers = {}) {
  return new Request(`https://example.test/api/writing${path}`, {
    method,
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.1",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
beforeEach(() => {
  const fake = fakeD1();
  sqlite = fake.sqlite;
  env = {
    WRITING_DB: fake.db,
    WRITING_ADMIN_TOKEN: "b".repeat(64),
  };
});
afterEach(() => sqlite.close());

describe("shared public writing", () => {
  it("persists across requests and never returns moderation secrets or network hashes", async () => {
    const draft = post();
    expect((await worker.fetch(request("POST", draft), env)).status).toBe(201);
    const response = await worker.fetch(request(), env);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const data = await response.json();
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0]).toMatchObject({
      title: draft.title,
      body: draft.body,
      author: draft.author,
    });
    expect(Object.keys(data.posts[0]).sort()).toEqual([
      "author",
      "body",
      "createdAt",
      "id",
      "title",
    ]);
  });
  it("does not invent cloud persistence without a binding or migration", async () => {
    expect((await worker.fetch(request())).status).toBe(503);
    sqlite.exec("DROP TABLE writing_posts");
    expect((await worker.fetch(request(), env)).status).toBe(503);
  });
  it("validates text and rejects cross-origin writes, invalid JSON and oversized streams", async () => {
    for (const invalid of [
      { title: " " },
      { author: "x".repeat(33) },
      { body: "x".repeat(6001) },
      { body: "\u0000" },
      { title: 123 },
      { deleteToken: "short" },
    ]) {
      expect(
        (await worker.fetch(request("POST", post(invalid)), env)).status,
      ).toBe(400);
    }
    expect(
      (
        await worker.fetch(
          request("POST", post(), "", { Origin: "https://elsewhere.test" }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (await worker.fetch(request("POST", "x".repeat(40000)), env)).status,
    ).toBe(413);
    const badJson = new Request("https://example.test/api/writing", {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        "Content-Type": "application/json",
      },
      body: "{",
    });
    expect((await worker.fetch(badJson, env)).status).toBe(400);
  });
  it("makes a retry idempotent, without allowing another token to claim a post", async () => {
    const draft = post();
    await worker.fetch(request("POST", draft), env);
    expect((await worker.fetch(request("POST", draft), env)).status).toBe(200);
    expect(
      (
        await worker.fetch(
          request("POST", { ...draft, deleteToken: "c".repeat(64) }),
          env,
        )
      ).status,
    ).toBe(409);
    expect(
      (await (await worker.fetch(request(), env)).json()).posts,
    ).toHaveLength(1);
  });
  it("enforces the network limit even after self-deletion", async () => {
    for (let i = 0; i < 3; i++) {
      const draft = post();
      expect((await worker.fetch(request("POST", draft), env)).status).toBe(
        201,
      );
      // Past the one-minute cooldown between two posts.
      sqlite.exec("UPDATE writing_receipts SET created_at = created_at - 61000");
      expect(
        (
          await worker.fetch(
            request("DELETE", undefined, `/${draft.id}`, {
              Authorization: `Bearer ${token}`,
            }),
            env,
          )
        ).status,
      ).toBe(200);
    }
    const limited = await worker.fetch(request("POST", post()), env);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("3600");
    expect(
      (
        await worker.fetch(
          request("POST", post(), "", { "CF-Connecting-IP": "192.0.2.2" }),
          env,
        )
      ).status,
    ).toBe(201);
  });
  it("bounds total storage and global posting", async () => {
    const now = Date.now();
    const receipt = sqlite.prepare(
      "INSERT INTO writing_receipts VALUES (?, ?)",
    );
    for (let i = 0; i < 100; i++) receipt.run(`network-${i}`, now);
    expect((await worker.fetch(request("POST", post()), env)).status).toBe(429);
    sqlite.exec("DELETE FROM writing_receipts");
    const insert = sqlite.prepare(
      "INSERT INTO writing_posts VALUES (?, 'Title', 'Name', 'Body', 1, 'hash', 'network')",
    );
    for (let i = 0; i < 500; i++) insert.run(crypto.randomUUID());
    expect((await worker.fetch(request("POST", post()), env)).status).toBe(429);
  });
  it("pages tied timestamps without missing or repeating posts", async () => {
    const insert = sqlite.prepare(
      "INSERT INTO writing_posts VALUES (?, 'Title', 'Name', 'Body', 123, 'hash', 'network')",
    );
    for (let i = 0; i < 27; i++) insert.run(crypto.randomUUID());
    const first = await (await worker.fetch(request(), env)).json();
    const second = await (
      await worker.fetch(
        request("GET", undefined, `?before=${encodeURIComponent(first.next)}`),
        env,
      )
    ).json();
    expect(first.posts).toHaveLength(24);
    expect(second.posts).toHaveLength(3);
    expect(second.next).toBeNull();
    expect(
      new Set(
        [...first.posts, ...second.posts].map((p: { id: string }) => p.id),
      ).size,
    ).toBe(27);
    expect(
      (await worker.fetch(request("GET", undefined, "?before=bad"), env))
        .status,
    ).toBe(400);
  });
  it("permits only the author token or moderator to remove writing", async () => {
    const draft = post();
    await worker.fetch(request("POST", draft), env);
    expect(
      (
        await worker.fetch(
          request("DELETE", undefined, `/${draft.id}`, {
            Authorization: `Bearer ${"d".repeat(64)}`,
          }),
          env,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await worker.fetch(
          request("DELETE", undefined, `/${draft.id}`, {
            Authorization: `Bearer ${env.WRITING_ADMIN_TOKEN}`,
          }),
          env,
        )
      ).status,
    ).toBe(200);
    expect((await (await worker.fetch(request(), env)).json()).posts).toEqual(
      [],
    );
  });
});
