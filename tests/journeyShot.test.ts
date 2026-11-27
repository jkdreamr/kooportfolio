import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canSwapWorld,
  cruiseEase,
  journeyChase,
  journeyHour,
  journeyVeil,
  JOURNEY_SHOT,
  shortestArc,
} from "../src/game/core/journey";
import { smoothFocus } from "../src/game/world/env/atmosphere";

const FPS = 30;
const frames = (seconds: number) => Array.from({ length: Math.round(seconds * FPS) + 1 }, (_, i) => i / (seconds * FPS));

describe("travel as one shot (B7)", () => {
  it("shortestArc goes the short way round the clock", () => {
    expect(shortestArc(15, 7)).toBeCloseTo(-8);
    expect(shortestArc(22, 2)).toBeCloseTo(4);
    expect(shortestArc(2, 22)).toBeCloseTo(-4);
    expect(shortestArc(6, 18)).toBeCloseTo(12);
    expect(shortestArc(9.5, 9.5)).toBe(0);
  });

  it("veil: clear, then up through the swap, then clear, with no step", () => {
    expect(journeyVeil(0)).toBe(0);
    expect(journeyVeil(0.29)).toBe(0);
    expect(journeyVeil(0.44)).toBeCloseTo(1, 6);
    expect(journeyVeil(JOURNEY_SHOT.swap)).toBe(1);
    expect(journeyVeil(0.56)).toBeCloseTo(1, 6);
    expect(journeyVeil(0.7)).toBeCloseTo(0, 6);
    expect(journeyVeil(1)).toBe(0);
    for (const seconds of [18, 14]) {
      const ps = frames(seconds);
      for (let i = 1; i < ps.length; i++)
        // 0.14 of a 14 s ride is 2 s: a smootherstep peaks at 1.875× mean.
        expect(Math.abs(journeyVeil(ps[i]) - journeyVeil(ps[i - 1]))).toBeLessThan(0.035);
    }
  });

  it("swaps only behind a complete veil", () => {
    expect(canSwapWorld(1)).toBe(true);
    expect(canSwapWorld(0.999)).toBe(true);
    expect(canSwapWorld(0.99)).toBe(false);
    expect(canSwapWorld(0)).toBe(false);
    // At the swap point the veil is complete, on both paths.
    expect(canSwapWorld(journeyVeil(JOURNEY_SHOT.swap))).toBe(true);
    expect(canSwapWorld(journeyVeil(JOURNEY_SHOT.swap, true))).toBe(true);
    // And the camera is in the chase then, not the overview.
    expect(journeyChase(JOURNEY_SHOT.swap)).toBe(1);
  });

  it("reduced motion: a 0.4 s fog cross-fade at the midpoint, no chase", () => {
    const s = JOURNEY_SHOT.reducedSeconds;
    expect(journeyVeil(0.4, true)).toBe(0);
    expect(journeyVeil(0.5 - 0.21 / s, true)).toBe(0);
    expect(journeyVeil(0.5, true)).toBe(1);
    expect(journeyVeil(0.5 + 0.21 / s, true)).toBe(0);
    expect(journeyChase(0.5, true)).toBe(0);
  });

  it("chase camera eases in and out with zero speed at both ends", () => {
    expect(journeyChase(0)).toBe(0);
    expect(journeyChase(1)).toBe(0);
    const d = 1e-4;
    expect((journeyChase(d) - journeyChase(0)) / d).toBeLessThan(0.01);
    expect((journeyChase(1) - journeyChase(1 - d)) / d).toBeGreaterThan(-0.01);
  });

  it("hour: monotonic along the arc, under 0.05 h per frame at 30 fps", () => {
    for (const [from, to, seconds] of [
      [15.2, 7.2, 18], // Home afternoon → Korea morning (−8 h)
      [7.2, 15.2, 18],
      [23.5, 16.5, 18], // across midnight (−7 h)
      [16.6, 16.6, 14], // Home → Stanford share a clock
    ] as const) {
      const ps = frames(seconds);
      const hours = ps.map((p) => journeyHour(p, from, to));
      const arc = shortestArc(from, to);
      expect(hours[0]).toBeCloseTo(from, 6);
      expect(hours[hours.length - 1]).toBeCloseTo(((to % 24) + 24) % 24, 6);
      for (let i = 1; i < hours.length; i++) {
        const step = shortestArc(hours[i - 1], hours[i]);
        expect(Math.abs(step)).toBeLessThan(0.05);
        if (arc !== 0) expect(step * Math.sign(arc)).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it("cruise ease starts and ends at rest and never overshoots", () => {
    expect(cruiseEase(0)).toBe(0);
    expect(cruiseEase(1)).toBeCloseTo(1, 9);
    let last = 0;
    for (let i = 1; i <= 1000; i++) {
      const v = cruiseEase(i / 1000);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect((cruiseEase(1e-4) - cruiseEase(0)) / 1e-4).toBeLessThan(0.01);
  });
});

describe("landing fog (B8)", () => {
  it("damps small focus changes", () => {
    const next = smoothFocus(100, 110, 1 / 60);
    expect(next).toBeGreaterThan(100);
    expect(next).toBeLessThan(110);
  });
  it("snaps on a camera cut (more than 25% of the focus distance)", () => {
    // Journey close-up → island overview: the overview must not render
    // inside close-up fog for even one frame.
    expect(smoothFocus(40, 320, 1 / 60)).toBe(320);
    expect(smoothFocus(320, 40, 1 / 60)).toBe(40);
  });
  it("starts from the first focus it sees", () => {
    expect(smoothFocus(0, 150, 1 / 60)).toBe(150);
  });
});

describe("clock on load (B7a)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  const store = (entries: Record<string, string>) => ({
    getItem: (k: string) => entries[k] ?? null,
    setItem: (k: string, v: string) => void (entries[k] = v),
    removeItem: (k: string) => void delete entries[k],
  });
  it("a Korea save starts the clock on Seoul's hour", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {
      localStorage: store({ "joshua-exe-save-v1": JSON.stringify({ world: "korea", position: [0, 5] }) }),
      sessionStorage: store({}),
    });
    const { daylightClock, useTimeOfDay } = await import("../src/game/core/timeOfDay");
    const { readWorldHour } = await import("../src/game/core/worldTime");
    const seoul = readWorldHour("Asia/Seoul");
    expect(Math.abs(shortestArc(daylightClock.hour, seoul))).toBeLessThan(0.01);
    expect(useTimeOfDay.getState().timeZone).toBe("Asia/Seoul");
  });
  it("a Home save (or none) keeps Pacific time", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {
      localStorage: store({ "joshua-exe-save-v1": JSON.stringify({ world: "home", position: [0, 5] }) }),
      sessionStorage: store({}),
    });
    const { useTimeOfDay } = await import("../src/game/core/timeOfDay");
    expect(useTimeOfDay.getState().timeZone).toBe("America/Los_Angeles");
  });
});
