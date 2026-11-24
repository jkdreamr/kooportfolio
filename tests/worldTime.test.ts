import { afterEach, describe, expect, it, vi } from "vitest";
import { readWorldHour, WORLD_TIME_ZONES } from "../src/game/core/worldTime";
import { daylightClock, useTimeOfDay } from "../src/game/core/timeOfDay";

const { pacific, korea } = WORLD_TIME_ZONES;

afterEach(() => {
  vi.useRealTimers();
  useTimeOfDay.getState().setTimeZone(pacific);
  useTimeOfDay.getState().setMode("auto");
});

describe("real regional daylight", () => {
  it("uses Pacific time for the home/Stanford world and next-day Seoul time", () => {
    const now = new Date("2026-11-24T00:30:00Z");
    expect(readWorldHour(pacific, now)).toBe(16.5);
    expect(readWorldHour(korea, now)).toBe(9.5);
  });

  it("uses Pacific daylight saving in summer, not a fixed UTC offset", () => {
    const now = new Date("2026-07-15T20:15:00Z");
    expect(readWorldHour(pacific, now)).toBe(13.25);
    expect(readWorldHour(korea, now)).toBe(5.25);
  });

  it("handles both Pacific DST boundaries while Seoul stays continuous", () => {
    const spring = new Date("2026-03-08T10:00:00Z");
    const autumn = new Date("2026-11-01T09:00:00Z");
    expect(readWorldHour(pacific, new Date(+spring - 1000))).toBeCloseTo(
      2 - 1 / 3600,
    );
    expect(readWorldHour(pacific, spring)).toBe(3);
    expect(readWorldHour(pacific, new Date(+autumn - 1000))).toBeCloseTo(
      2 - 1 / 3600,
    );
    expect(readWorldHour(pacific, autumn)).toBe(1);
    expect(readWorldHour(korea, spring)).toBe(19);
    expect(readWorldHour(korea, autumn)).toBe(18);
  });

  it("uses 00 at destination midnight and preserves seconds", () => {
    expect(readWorldHour(korea, new Date("2026-11-23T15:00:00Z"))).toBe(0);
    expect(
      readWorldHour(pacific, new Date("2026-11-24T08:00:30.500Z")),
    ).toBeCloseTo(30.5 / 3600, 8);
  });

  it("switches Auto immediately between destination clocks and back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T00:30:00Z"));
    const time = useTimeOfDay.getState();
    time.setMode("auto");
    expect(useTimeOfDay.getState().hour).toBe(16.5);
    time.setTimeZone(korea);
    expect(useTimeOfDay.getState().hour).toBe(9.5);
    expect(daylightClock.hour).toBe(9.5);
    time.setTimeZone(pacific);
    expect(daylightClock.hour).toBe(16.5);
  });

  it("keeps manual presets on travel and resumes the destination's real clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T00:30:00Z"));
    const time = useTimeOfDay.getState();
    time.setMode("night");
    daylightClock.hour = 23;
    time.setTimeZone(korea);
    expect(useTimeOfDay.getState().mode).toBe("night");
    expect(daylightClock.hour).toBe(23);
    time.setMode("auto");
    expect(useTimeOfDay.getState().hour).toBe(9.5);
    expect(daylightClock.hour).toBe(9.5);
  });
});
