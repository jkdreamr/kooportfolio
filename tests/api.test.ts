import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiUnavailable,
  apiAvailable,
  probeApi,
  readJson,
  resetApiAvailable,
} from "../src/shared/api";

const html = () =>
  new Response("<!doctype html><html></html>", {
    status: 200,
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

describe("apiAvailable", () => {
  it("is true only for a 2xx JSON answer", async () => {
    expect(await probeApi(async () => json({ ok: true }))).toBe(true);
    expect(await probeApi(async () => html())).toBe(false);
    expect(await probeApi(async () => json({ error: "x" }, 503))).toBe(false);
    expect(
      await probeApi(async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).toBe(false);
  });
  it("gives up after the timeout", async () => {
    const hang = (_: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      );
    const started = Date.now();
    expect(await probeApi(hang, 40)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it("probes /api/health once per session", async () => {
    const fetcher = vi.fn(async () => html());
    vi.stubGlobal("fetch", fetcher);
    expect(await apiAvailable()).toBe(false);
    expect(await apiAvailable()).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/health$/);
  });
});
