import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worker, { type Env } from "../worker/index";
import {
  healthRequest,
  healthStatus,
  reportRequest,
  writingDeleteRequest,
  writingPostRequest,
} from "../src/shared/api";
import { REPORT_HIDE_AT } from "../worker/http";
import { REPORTS_PER_HOUR } from "../worker/report";
import { fakeD1, migrationFiles } from "./helpers/d1";

const SITE = "https://kooportfolio.vercel.app";
const API = "https://joshua-exe.example.workers.dev";
const ADMIN = "a1".repeat(32);
let sqlite: DatabaseSync;
let env: Env;

beforeEach(() => {
  const fake = fakeD1();
  sqlite = fake.sqlite;
  // Production shape: one database bound as DB, the Vercel origin allowed.
  env = { DB: fake.db, ALLOWED_ORIGINS: `${SITE},-preview.vercel.app`, ADMIN_TOKEN: ADMIN };
});
afterEach(() => sqlite.close());

/** A request exactly as the client builds it (src/shared/api.ts). */
function client({ url, init }: { url: string; init: RequestInit }, ip = "203.0.113.7", origin = SITE) {
  const headers = new Headers(init.headers);
  if (origin) headers.set("Origin", origin);
  headers.set("CF-Connecting-IP", ip);
  return new Request(url, { method: init.method, headers, body: init.body as BodyInit | undefined });
}
const draft = { title: "River at dusk", author: "Visitor", body: "Quiet water, two oars." };
/** Test words stay out of the source as plain text (as in moderation.test). */
const rot13 = (s: string) =>
  s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const ids = () => ({ id: crypto.randomUUID(), deleteToken: crypto.randomUUID().replace(/-/g, "").repeat(2) });

describe("worker contract", () => {
  it("answers /api/health exactly as the client's probe expects", async () => {
    const response = await worker.fetch(client(healthRequest(API)), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.clone().json()).toEqual({ ok: true, features: { report: true } });
    expect(await healthStatus(response)).toEqual({ live: true, features: { report: true } });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
  });

  it("reports not-live without a database, so the client keeps its local copies", async () => {
    const response = await worker.fetch(client(healthRequest(API)), { ALLOWED_ORIGINS: SITE });
    expect(response.status).toBe(503);
    expect(await healthStatus(response)).toEqual({ live: false, features: {} });
  });

  it("handles CORS per ALLOWED_ORIGINS, preflights included", async () => {
    const preflight = (origin: string, path = "/api/report") =>
      worker.fetch(
        new Request(`${API}${path}`, {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
        }),
        env,
      );
    const allowed = await preflight(SITE);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(allowed.headers.get("Access-Control-Allow-Methods")).toContain("DELETE");
    expect(allowed.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    const preview = await preflight("https://kooportfolio-git-x-preview.vercel.app", "/api/booth");
    expect(preview.headers.get("Access-Control-Allow-Origin")).toBe("https://kooportfolio-git-x-preview.vercel.app");
    const other = await preflight("https://elsewhere.example");
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
    // A write from an origin that is not allowed never lands.
    const post = await worker.fetch(client(writingPostRequest(draft, ids(), API), undefined, "https://elsewhere.example"), env);
    expect(post.status).toBe(403);
  });

  it("answers unknown paths with JSON 404, never the old 503 stub", async () => {
    const response = await worker.fetch(new Request(`${API}/api/scores`), env);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found." });
  });

  it("ships every migration in one directory for one database", () => {
    expect(migrationFiles()).toEqual([
      "0001_writing.sql",
      "0002_booth.sql",
      "0003_booth_post_limits.sql",
      "0004_reports.sql",
    ]);
  });
});

describe("server-side moderation and limits", () => {
  it("refuses links and abuse in any field, whatever the client checked", async () => {
    for (const bad of [
      { ...draft, body: "visit www.example.com now" },
      { ...draft, title: "free stuff at spam.xyz" },
      { ...draft, author: rot13("fuvg").replace("i", "1") },
      { ...draft, body: `you are ${rot13("shpxvat").split("").join(" ")}` },
    ]) {
      const response = await worker.fetch(client(writingPostRequest(bad, ids(), API)), env);
      expect(response.status).toBe(400);
      expect((await response.json()).reason).toMatch(/link|language/);
    }
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM writing_posts").get()?.n).toBe(0);
  });

  it("keeps a minute between two posts from one network, then allows the next", async () => {
    expect((await worker.fetch(client(writingPostRequest(draft, ids(), API)), env)).status).toBe(201);
    const early = await worker.fetch(client(writingPostRequest(draft, ids(), API)), env);
    expect(early.status).toBe(429);
    const wait = Number(early.headers.get("Retry-After"));
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60);
    // Another visitor is not held up.
    expect((await worker.fetch(client(writingPostRequest(draft, ids(), API), "203.0.113.8"), env)).status).toBe(201);
    sqlite.exec("UPDATE writing_receipts SET created_at = created_at - 61000");
    expect((await worker.fetch(client(writingPostRequest(draft, ids(), API)), env)).status).toBe(201);
  });

  it("lets the owner delete any post with the admin token, from anywhere", async () => {
    const mine = ids();
    await worker.fetch(client(writingPostRequest(draft, mine, API)), env);
    const stranger = await worker.fetch(client(writingDeleteRequest(mine.id, "c".repeat(64), API)), env);
    expect(stranger.status).toBe(404);
    // curl from a terminal: no Origin header at all.
    const admin = await worker.fetch(client(writingDeleteRequest(mine.id, ADMIN, API), undefined, ""), env);
    expect(admin.status).toBe(200);
    expect(await admin.json()).toEqual({ deleted: true });
  });
});

describe("reports", () => {
  async function publish() {
    const mine = ids();
    const response = await worker.fetch(client(writingPostRequest(draft, mine, API), "203.0.113.99"), env);
    expect(response.status).toBe(201);
    return mine.id;
  }

  it(`hides a post after ${REPORT_HIDE_AT} reports from different networks`, async () => {
    const id = await publish();
    const list = async () => (await (await worker.fetch(new Request(`${API}/api/writing`), env)).json()).posts;
    for (let i = 1; i <= REPORT_HIDE_AT; i++) {
      expect(await list()).toHaveLength(1);
      const response = await worker.fetch(client(reportRequest("writing", id, API), `198.51.100.${i}`), env);
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ reported: true });
    }
    expect(await list()).toEqual([]);
    const review = await worker.fetch(
      new Request(`${API}/api/report`, { headers: { Authorization: `Bearer ${ADMIN}` } }),
      env,
    );
    expect(review.status).toBe(200);
    expect((await review.json()).reports).toEqual([
      expect.objectContaining({ kind: "writing", id, reports: REPORT_HIDE_AT, hidden: true }),
    ]);
    expect((await worker.fetch(new Request(`${API}/api/report`), env)).status).toBe(403);
  });

  it("validates reports and bounds how many one network files", async () => {
    const id = await publish();
    const bad = (body: unknown) =>
      worker.fetch(
        new Request(`${API}/api/report`, {
          method: "POST",
          headers: { Origin: SITE, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        env,
      );
    expect((await bad({ kind: "video", id })).status).toBe(400);
    expect((await bad({ kind: "writing", id: "nope" })).status).toBe(400);
    expect((await bad({ kind: "writing", id: crypto.randomUUID() })).status).toBe(404);
    expect((await bad({ kind: "strip", id: "x".repeat(2000) })).status).toBe(413);
    const stamp = Date.now();
    const insert = sqlite.prepare("INSERT INTO reports VALUES ('writing', ?, ?, ?)");
    // Fill this network's hourly allowance with other reports.
    const { dailyNetwork } = await import("../worker/http");
    const network = await dailyNetwork(new Request(API, { headers: { "CF-Connecting-IP": "203.0.113.50" } }));
    for (let i = 0; i < REPORTS_PER_HOUR; i++) insert.run(crypto.randomUUID(), network, stamp);
    const limited = await worker.fetch(client(reportRequest("writing", id, API), "203.0.113.50"), env);
    expect(limited.status).toBe(429);
  });
});
