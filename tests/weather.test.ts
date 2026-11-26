import { describe, expect, it } from "vitest";
import { sampleWeather } from "../src/game/core/weather";
import { ambientMix } from "../src/game/core/wildlife";

describe("village weather", () => {
  it("reveals mist at dawn, clear noon, sunset rain and snow after dark", () => {
    expect(sampleWeather(5.5).fog).toBeGreaterThan(0.5);
    expect(sampleWeather(12)).toEqual({ rain: 0, fog: 0, snow: 0, wind: 0 });
    expect(sampleWeather(18).rain).toBeGreaterThan(0.4);
    // The first visit's late-afternoon arrival (16:36) is clear.
    expect(sampleWeather(16.6).rain).toBe(0);
    expect(sampleWeather(16.6).fog).toBeLessThan(0.05);
    expect(sampleWeather(23).snow).toBeGreaterThan(0.5);
    expect(ambientMix(18, 0, 0, "hub").rain).toBeGreaterThan(0.1);
    expect(ambientMix(23, 0, 0, "hub").wind).toBeGreaterThan(0);
    expect(ambientMix(12, 0, 0, "hub").rain).toBe(0);
  });
  it("keeps transitions bounded and continuous across midnight", () => {
    for (let h = -24; h < 48; h += 0.03) {
      const weather = sampleWeather(h),
        next = sampleWeather(h + 0.0001);
      for (const key of ["rain", "fog", "snow", "wind"] as const) {
        expect(weather[key]).toBeGreaterThanOrEqual(0);
        expect(weather[key]).toBeLessThanOrEqual(1);
        expect(Math.abs(next[key] - weather[key])).toBeLessThan(0.001);
      }
    }
    expect(sampleWeather(24)).toEqual(sampleWeather(0));
  });
});
