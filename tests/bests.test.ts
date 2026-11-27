import { describe, expect, it, vi } from "vitest";
import { cleanBests, countBest, freshSave, isBestKey, parseSave, recordBest, SAVE_KEY } from "../src/shared/save";

describe("personal bests in the save (D8)", () => {
  it("old saves without bests parse unchanged", () => {
    const old = { ...freshSave(), revision: 3, position: [1, 2] };
    const parsed = parseSave(JSON.stringify(old));
    expect(parsed).toEqual(old);
    expect("bests" in parsed).toBe(false);
  });
  it("bad entries are dropped, never the save", () => {
    const raw = { ...freshSave(), bests: { "basketball.points": 42, "bad key": 3, "go.wins.easy": -1, "pong.throws": "7", "skate.combo": 1e12 } };
    expect(parseSave(JSON.stringify(raw)).bests).toEqual({ "basketball.points": 42 });
    expect(parseSave(JSON.stringify({ ...freshSave(), bests: [1, 2] })).bests).toBeUndefined();
    expect(cleanBests(null)).toBeUndefined();
  });
  it("max keeps the highest, min the lowest; the first value is a best", () => {
    let r = recordBest(undefined, "basketball.points", 12);
    expect(r).toEqual({ bests: { "basketball.points": 12 }, improved: true, previous: undefined });
    r = recordBest(r.bests, "basketball.points", 9);
    expect(r.improved).toBe(false);
    expect(r.bests["basketball.points"]).toBe(12);
    r = recordBest(r.bests, "basketball.points", 15);
    expect(r).toMatchObject({ improved: true, previous: 12 });
    let t = recordBest(undefined, "rowing.time.500", 101.5, "min");
    t = recordBest(t.bests, "rowing.time.500", 99.2, "min");
    expect(t.bests["rowing.time.500"]).toBe(99.2);
    expect(recordBest(t.bests, "rowing.time.500", 120, "min").improved).toBe(false);
  });
  it("equal is not a new best", () => {
    expect(recordBest({ "pong.throws": 8 }, "pong.throws", 8, "min").improved).toBe(false);
    expect(recordBest({ "skate.combo": 8 }, "skate.combo", 8).improved).toBe(false);
  });
  it("rejects bad keys and values without throwing", () => {
    expect(isBestKey("go.wins.easy")).toBe(true);
    expect(isBestKey("Go")).toBe(false);
    expect(recordBest({}, "nope", 3).improved).toBe(false);
    expect(recordBest({}, "a.b", NaN).improved).toBe(false);
    expect(recordBest({}, "a.b", -2).improved).toBe(false);
  });
  it("counts wins", () => {
    let c = countBest(undefined, "badminton.wins");
    c = countBest(c.bests, "badminton.wins");
    expect(c.bests["badminton.wins"]).toBe(2);
  });
  it("a best persists across a reload", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    try {
      vi.resetModules();
      let { useGame } = await import("../src/game/core/store");
      expect(useGame.getState().recordBest("stadium.made", 4).improved).toBe(true);
      expect(JSON.parse(store.get(SAVE_KEY)!).bests).toEqual({ "stadium.made": 4 });
      vi.resetModules();
      ({ useGame } = await import("../src/game/core/store"));
      expect(useGame.getState().save.bests).toEqual({ "stadium.made": 4 });
      expect(useGame.getState().recordBest("stadium.made", 3).improved).toBe(false);
      expect(useGame.getState().recordBest("stadium.made", 5)).toMatchObject({ improved: true, previous: 4 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
