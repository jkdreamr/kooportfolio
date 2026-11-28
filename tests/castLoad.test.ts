import { afterEach, describe, expect, it, vi } from "vitest";
import { assignTiers, TIER_BIAS } from "../src/game/world/character/crowdTiers";

/** A minimal, valid cast file: magic, manifest, empty pools. */
function castBytes(v = 3) {
  const json = new TextEncoder().encode(JSON.stringify({ v, q: 4095, nv: 0, ni: 0, shapes: [], chars: { a: { p: {}, skirtTop: 0.1 } } }));
  const buf = new ArrayBuffer(((8 + json.length + 3) & ~3) + 4);
  const view = new DataView(buf);
  view.setUint32(0, 0x31524843, true);
  view.setUint32(4, json.length, true);
  new Uint8Array(buf, 8, json.length).set(json);
  return buf;
}
const respond = (body: BodyInit, status = 200) => new Response(body, { status });

describe("cast download", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ignores an HTML fallback served for the .gz and loads the raw file", async () => {
    const { fetchCast } = await import("../src/game/world/character/sculpt/runtime");
    const fetch = vi.fn(async (url: string) =>
      url.endsWith(".gz") ? respond("<!doctype html><html></html>") : respond(castBytes()),
    );
    vi.stubGlobal("fetch", fetch);
    const cast = await fetchCast("/characters/cast-v1.bin");
    expect(cast.has("a")).toBe(true);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["/characters/cast-v1.bin.gz", "/characters/cast-v1.bin"]);
  });

  it("accepts a .gz the host already decoded (cast bytes, no gzip header)", async () => {
    const { fetchCast } = await import("../src/game/world/character/sculpt/runtime");
    const fetch = vi.fn(async () => respond(castBytes()));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchCast("/c.bin")).has("a")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a cast of another manifest version (primitives stand in)", async () => {
    const { fetchCast, Cast, CAST_VERSION } = await import("../src/game/world/character/sculpt/runtime");
    expect(() => new Cast(castBytes(CAST_VERSION + 1))).toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => respond(castBytes(CAST_VERSION - 1))));
    await expect(fetchCast("/c.bin")).rejects.toThrow();
  });

  it("forgets a failed load and retries with a growing delay, then gives up", async () => {
    vi.resetModules();
    const runtime = await import("../src/game/world/character/sculpt/runtime");
    vi.stubGlobal("fetch", vi.fn(async () => respond("", 503)));
    expect(runtime.castRetryDelay()).toBeNull();
    expect(await runtime.loadCast("/c.bin")).toBeNull();
    expect(runtime.castRetryDelay()).toBe(runtime.CAST_RETRY_MS[0]);
    vi.stubGlobal("fetch", vi.fn(async () => respond(castBytes())));
    const cast = await runtime.loadCast("/c.bin");
    expect(cast?.has("a")).toBe(true);
    expect(runtime.castNow()).toBe(cast);
    // Cached once loaded.
    expect(await runtime.loadCast("/c.bin")).toBe(cast);
  });
});

describe("crowd LOD tiers", () => {
  const setup = (dists: number[], tiers?: number[]) => ({
    tier: Uint8Array.from(tiers ?? dists.map(() => 0)),
    dist: Float32Array.from(dists),
    order: dists.map((_, i) => i),
  });

  it("counts slots as it assigns them: the caps hold exactly", () => {
    // Twenty villagers all inside both radii.
    const slots = setup(Array.from({ length: 20 }, (_, i) => 2 + i * 0.5));
    assignTiers(slots, { heroMax: 0, midMax: 8, heroIn: () => true, midIn: () => true });
    expect([...slots.tier].filter((t) => t === 1)).toHaveLength(8);
    expect([...slots.tier].filter((t) => t === 2)).toHaveLength(0);
    assignTiers(slots, { heroMax: 5, midMax: 10, heroIn: () => true, midIn: () => true });
    expect([...slots.tier].filter((t) => t === 2)).toHaveLength(5);
    expect([...slots.tier].filter((t) => t === 1)).toHaveLength(10);
    // Nearest first: the five closest are the heroes.
    expect([...slots.tier.slice(0, 5)]).toEqual([2, 2, 2, 2, 2]);
  });

  it("keeps an incumbent at the cap until a newcomer is clearly nearer", () => {
    // Villager 0 holds the only mid slot; villager 1 walks past it.
    const slots = setup([10, 10.5], [1, 0]);
    const rule = { heroMax: 0, midMax: 1, heroIn: () => false, midIn: () => true };
    for (const d of [10.5, 10, 9.6, 9.2, 8.8]) {
      slots.dist[1] = d;
      assignTiers(slots, rule);
      expect([...slots.tier]).toEqual([1, 0]);
    }
    slots.dist[1] = 10 - TIER_BIAS - 0.1;
    assignTiers(slots, rule);
    expect([...slots.tier]).toEqual([0, 1]);
  });
});
