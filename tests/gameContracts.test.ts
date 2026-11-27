import { beforeEach, describe, expect, it } from "vitest";
import { gameQa, registerGameQa } from "../src/game/core/gameQa";
import { dayNumber, onRun, reportRun, type RunReport } from "../src/game/core/daily";
import { claimEscape, escapeGameMode, startGameMode, useGameMode } from "../src/game/core/gameMode";
import { isCue } from "../src/game/core/audio/cues";
import { isPaletteName } from "../src/game/core/audio/palette";
import { useGame } from "../src/game/core/store";

describe("J0 contracts", () => {
  it("registerGameQa exposes window-free handles and unregisters only its own", () => {
    expect(gameQa("basketball")).toBeUndefined();
    const a = { state: () => ({ points: 1 }) };
    const offA = registerGameQa("basketball", a);
    expect(gameQa("basketball")?.state()).toEqual({ points: 1 });
    const b = { state: () => 2, act: () => {} };
    const offB = registerGameQa("basketball", b);
    offA();
    expect(gameQa("basketball")).toBe(b);
    offB();
    expect(gameQa("basketball")).toBeUndefined();
    const offRow = registerGameQa("rowing", { state: () => null });
    expect(gameQa("rowing")).toBeDefined();
    offRow();
  });
  it("dayNumber rolls at 00:00 UTC", () => {
    expect(dayNumber(new Date("1970-01-02T00:00:00Z"))).toBe(1);
    expect(dayNumber(new Date("2026-11-27T23:59:59Z"))).toBe(dayNumber(new Date("2026-11-27T00:00:00Z")));
    expect(dayNumber(new Date("2026-11-28T00:00:00Z")) - dayNumber(new Date("2026-11-27T12:00:00Z"))).toBe(1);
  });
  it("reportRun reaches listeners, survives a failing one, and stops after unsubscribe", () => {
    const seen: RunReport[] = [];
    const offBad = onRun(() => {
      throw new Error("boom");
    });
    const off = onRun((r) => seen.push(r));
    const now = new Date("2026-11-27T10:00:00Z");
    reportRun("basketball", { mode: "rush", score: 42 }, now);
    expect(seen).toEqual([{ game: "basketball", result: { mode: "rush", score: 42 }, day: dayNumber(now), at: now.getTime() }]);
    off();
    offBad();
    reportRun("go", { mode: "capture", score: 1, won: true });
    expect(seen).toHaveLength(1);
  });
  it("new cues are palette sounds; groan and the six life cues are cues", () => {
    for (const n of ["flutter", "purr", "quack", "splash", "rustle", "chirp", "crowd-hush", "groan"]) {
      expect(isCue(n)).toBe(true);
      expect(isPaletteName(n)).toBe(true);
    }
  });
});

describe("Escape claims (pausable games)", () => {
  beforeEach(() => {
    useGameMode.setState({ active: null });
    useGame.setState({ scene: "gym", world: "stanford", panel: "none", paused: false, traveling: false });
  });
  it("without a claim Escape ends the mode, as before", () => {
    expect(startGameMode("gym")).toBe(true);
    expect(escapeGameMode()).toBe(true);
    expect(useGameMode.getState().active).toBeNull();
  });
  it("a claim for the active game takes Escape and keeps the mode", () => {
    let pauses = 0;
    const off = claimEscape("gym", () => {
      pauses++;
    });
    const other = claimEscape("go", () => {
      throw new Error("never called");
    });
    expect(startGameMode("gym")).toBe(true);
    expect(escapeGameMode()).toBe(true);
    expect(pauses).toBe(1);
    expect(useGameMode.getState().active?.id).toBe("gym");
    expect(escapeGameMode(true)).toBe(false);
    off();
    other();
    expect(escapeGameMode()).toBe(true);
    expect(useGameMode.getState().active).toBeNull();
  });
  it("a claim returning false lets the mode end; the latest claim wins", () => {
    const calls: string[] = [];
    const offA = claimEscape("gym", () => {
      calls.push("a");
    });
    const offB = claimEscape("gym", () => {
      calls.push("b");
      return false;
    });
    startGameMode("gym");
    expect(escapeGameMode()).toBe(true);
    expect(calls).toEqual(["b"]);
    expect(useGameMode.getState().active).toBeNull();
    offA();
    offB();
  });
});
