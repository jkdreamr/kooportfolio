import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiUnavailable,
  apiAvailable,
  apiBase,
  apiStatus,
  apiUrl,
  healthRequest,
  healthStatus,
  probeApi,
  readJson,
  reportRequest,
  resetApiAvailable,
  wallListRequest,
  wallPostRequest,
  writingDeleteRequest,
  writingListRequest,
  writingPostRequest,
} from "../src/shared/api";

const html = (status = 200) =>
  new Response("<!doctype html><html></html>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  resetApiAvailable();
});

describe("API base", () => {
  it("uses an absolute Worker origin, or the same origin when unset", () => {
    expect(apiBase({ VITE_API_BASE: "https://joshua.example.workers.dev/" })).toBe(
      "https://joshua.example.workers.dev",
    );
    expect(apiBase({})).toBe("");
    expect(apiBase({ VITE_API_BASE: "  " })).toBe("");
    expect(apiBase({ VITE_API_BASE: "not a url" })).toBe("");
    expect(apiUrl("/api/health", "https://w.example.dev")).toBe("https://w.example.dev/api/health");
    expect(apiUrl("/api/health", "")).toBe("/api/health");
  });
});

describe("readJson", () => {
  it("parses JSON bodies", async () => {
    await expect(readJson(json({ ok: true }))).resolves.toEqual({ ok: true });
  });
  it("throws ApiUnavailable for a static host's HTML page, never a JSON.parse error", async () => {
    const error = await readJson(html()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiUnavailable);
    expect(String((error as Error).message)).not.toMatch(/Unexpected token/);
  });
  it("throws ApiUnavailable for malformed JSON", async () => {
    const bad = new Response("{nope", { headers: { "content-type": "application/json" } });
    await expect(readJson(bad)).rejects.toBeInstanceOf(ApiUnavailable);
  });
});

describe("health probe", () => {
  it("is live only for 200 JSON { ok: true }", async () => {
    expect((await healthStatus(json({ ok: true }))).live).toBe(true);
    expect((await healthStatus(json({ ok: true }, 201))).live).toBe(false);
    expect((await healthStatus(json({ status: "ok" }))).live).toBe(false);
    expect((await healthStatus(json({ ok: "yes" }))).live).toBe(false);
    expect((await healthStatus(html())).live).toBe(false);
    expect((await healthStatus(html(404))).live).toBe(false);
    expect((await healthStatus(json({ error: "x" }, 503))).live).toBe(false);
  });
  it("reads advertised features", async () => {
    expect((await healthStatus(json({ ok: true, features: { report: true } }))).features.report).toBe(true);
    expect((await healthStatus(json({ ok: true }))).features.report).toBe(false);
  });
  it("is not live when the network fails or the probe times out", async () => {
    expect(
      (
        await probeApi(async () => {
          throw new TypeError("Failed to fetch");
        })
      ).live,
    ).toBe(false);
    const hang = (_: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      );
    const started = Date.now();
    expect((await probeApi(hang, 40)).live).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it("probes <base>/api/health once per session, without cookies", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    expect(await apiAvailable()).toBe(true);
    expect((await apiStatus()).live).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toMatch(/\/api\/health$/);
    expect(init?.credentials).toBe("omit");
    expect(init?.signal).toBeDefined();
  });
  it("falls back to this device when the host answers with its index.html", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html()));
    expect(await apiAvailable()).toBe(false);
  });
});

describe("request builders", () => {
  const B = "https://w.example.dev";
  it("build the health and wall requests", () => {
    expect(healthRequest(B)).toMatchObject({ url: `${B}/api/health`, init: { method: "GET", mode: "cors" } });
    expect(wallListRequest(B)).toMatchObject({ url: `${B}/api/booth`, init: { method: "GET" } });
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
    const post = wallPostRequest(jpeg, B);
    expect(post.url).toBe(`${B}/api/booth`);
    expect(post.init.method).toBe("POST");
    expect((post.init.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(post.init.body).toBe(jpeg);
  });
  it("build the writing requests", () => {
    expect(writingListRequest(null, B).url).toBe(`${B}/api/writing`);
    expect(writingListRequest("17:abc", B).url).toBe(`${B}/api/writing?before=17%3Aabc`);
    const draft = { title: "T", author: "A", body: "B" };
    const ids = { id: "0f0e7c3e-1111-4222-8333-444455556666", deleteToken: "f".repeat(64) };
    const post = writingPostRequest(draft, ids, B);
    expect(post.init.method).toBe("POST");
    expect(JSON.parse(String(post.init.body))).toEqual({ ...draft, ...ids });
    const del = writingDeleteRequest(ids.id, ids.deleteToken, B);
    expect(del.url).toBe(`${B}/api/writing/${ids.id}`);
    expect(del.init.method).toBe("DELETE");
    expect((del.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ids.deleteToken}`);
  });
  it("build the report request", () => {
    const r = reportRequest("strip", "abc", B);
    expect(r.url).toBe(`${B}/api/report`);
    expect(JSON.parse(String(r.init.body))).toEqual({ kind: "strip", id: "abc" });
  });
});
