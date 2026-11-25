import { describe, expect, it } from "vitest";
import {
  advanceHour,
  clockText,
  sampleDaylight,
  TIME_PRESETS,
  wrapHour,
} from "../src/game/core/daylight";

describe("village daylight", () => {
  it("glides to regional time in Auto without a midnight discontinuity", () => {
    let hour = 12;
    for (let i = 0; i < 100; i++) hour = advanceHour(hour, 0.1, "auto", 23.99);
    expect(hour).toBeCloseTo(23.99, 6);
    expect(advanceHour(23.99, 0.1, "auto", 0)).toBe(0);
    const midnight = sampleDaylight(0);
    const before = sampleDaylight(24 - 1e-6);
    for (const key of ["key", "hemi", "ambient", "fill", "night"] as const)
      expect(before[key]).toBeCloseTo(midnight[key], 5);
  });

  it("holds inactive frames and resynchronizes Auto without accelerating time", () => {
    expect(advanceHour(12, 0, "auto", 18)).toBe(12);
    expect(advanceHour(12, -1, "auto", 18)).toBe(12);
    // A long pause resumes with one eased step, not a fast-forward.
    const resumed = advanceHour(12, 900, "auto", 18);
    expect(resumed).toBeGreaterThan(12);
    expect(resumed).toBeLessThan(13);
    const resumedNight = advanceHour(12, 900, "night");
    expect(resumedNight).toBeGreaterThan(12);
    expect(resumedNight).toBeLessThan(13);
  });

  it("smoothly reaches every selected time, taking the short way over midnight", () => {
    const dawnStep = advanceHour(23.5, 0.1, "dawn");
    expect(dawnStep).toBeGreaterThan(23.5);
    for (const [mode, preset] of Object.entries(TIME_PRESETS)) {
      let hour = 12;
      for (let i = 0; i < 100; i++)
        hour = advanceHour(hour, 0.1, mode as keyof typeof TIME_PRESETS);
      expect(hour).toBeCloseTo(preset.hour, 6);
    }
  });

  it("maintains minimum outdoor key and ambient light throughout the day", () => {
    for (let hour = -24; hour <= 48; hour += 0.05) {
      const light = sampleDaylight(hour);
      expect(light.key).toBeGreaterThanOrEqual(0.85);
      expect(light.hemi).toBeGreaterThanOrEqual(0.85);
      expect(light.ambient).toBeGreaterThanOrEqual(0.16);
      expect(light.night).toBeGreaterThanOrEqual(0);
      expect(light.night).toBeLessThanOrEqual(1);
    }
    expect(sampleDaylight(23).night).toBe(1);
    expect(sampleDaylight(12).night).toBe(0);
  });

  it("formats the village clock at midnight and the edge of each minute", () => {
    expect(clockText(0)).toBe("00:00");
    expect(clockText(6.5)).toBe("06:30");
    expect(clockText(23.9999)).toBe("23:59");
    expect(clockText(24)).toBe("00:00");
    expect(wrapHour(-1)).toBe(23);
  });
});
