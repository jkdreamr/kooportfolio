import { describe, expect, it } from "vitest";
import {
  DAY_MAGNITUDE_LIMIT,
  eyepieceSkyColor,
  lunarPosition,
  NIGHT_MAGNITUDE_LIMIT,
  SKY_LOCATIONS,
  STAR_CATALOGUE,
  starVisibility,
  telescopeSkyState,
} from "../src/game/core/stargazing";
import { rgbHex, sampleSkyPalette, TIME_PRESETS } from "../src/game/core/daylight";
import { FIRST_VISIT_HOUR } from "../src/game/core/timeOfDay";

const brightest = Math.min(...STAR_CATALOGUE.map((star) => star[3]));
const visibleStars = (hour: number) => {
  const { magnitudeLimit } = telescopeSkyState(hour);
  return STAR_CATALOGUE.filter(
    (star) => starVisibility(star[3], magnitudeLimit) > 0,
  ).length;
};

describe("telescope sky follows the village clock", () => {
  it("opens on a daytime sky (no stars) on the first-visit afternoon", () => {
    const sky = telescopeSkyState(FIRST_VISIT_HOUR);
    expect(sky.phase).toBe("day");
    expect(sky.stars).toBe(0);
    expect(sky.daylight).toBeGreaterThan(0.95);
    expect(visibleStars(FIRST_VISIT_HOUR)).toBe(0);
    // Even Sirius stays hidden by day.
    expect(starVisibility(brightest, DAY_MAGNITUDE_LIMIT)).toBe(0);
  });

  it("maps day, dusk and night presets to day, twilight and the full chart", () => {
    expect(telescopeSkyState(TIME_PRESETS.day.hour).phase).toBe("day");
    const dusk = telescopeSkyState(19);
    expect(dusk.phase).toBe("twilight");
    expect(dusk.stars).toBeGreaterThan(0.2);
    expect(dusk.stars).toBeLessThan(0.8);
    // Twilight shows the bright stars only.
    expect(visibleStars(19)).toBeGreaterThan(5);
    expect(visibleStars(19)).toBeLessThan(STAR_CATALOGUE.length / 4);
    const night = telescopeSkyState(TIME_PRESETS.night.hour);
    expect(night.phase).toBe("night");
    expect(night.stars).toBe(1);
    expect(night.daylight).toBe(0);
    expect(night.magnitudeLimit).toBe(NIGHT_MAGNITUDE_LIMIT);
    expect(visibleStars(TIME_PRESETS.night.hour)).toBe(STAR_CATALOGUE.length);
    // Dawn mirrors dusk.
    expect(telescopeSkyState(TIME_PRESETS.dawn.hour).phase).toBe("twilight");
    expect(telescopeSkyState(TIME_PRESETS.sunrise.hour).phase).toBe("day");
  });

  it("fades stars in continuously and monotonically through dusk (no pop)", () => {
    let previous = telescopeSkyState(16).stars;
    for (let hour = 16; hour <= 22; hour += 0.02) {
      const { stars } = telescopeSkyState(hour);
      expect(stars).toBeGreaterThanOrEqual(previous - 1e-9);
      // A 4 Hz clock post during a 4.5 s skip moves ~0.4 h: stay well below a pop.
      expect(stars - previous).toBeLessThan(0.03);
      previous = stars;
    }
    for (const hour of [0, 3, 6, 9, 12, 15, 18, 21, 23.99])
      expect(
        Math.abs(telescopeSkyState(hour).stars - telescopeSkyState(hour + 0.01).stars),
      ).toBeLessThan(0.02);
  });

  it("uses the village sky colours: blue by day, dark through the eyepiece by night", () => {
    const day = telescopeSkyState(12);
    expect(rgbHex(day.palette.top)).toBe("#7fb0dc");
    expect(rgbHex(sampleSkyPalette(12).horizon)).toBe("#dce5c7");
    const zenith = eyepieceSkyColor(day, 80);
    expect(zenith[2]).toBeGreaterThan(zenith[0]); // blue sky
    const night = eyepieceSkyColor(telescopeSkyState(23), 80);
    expect(Math.max(...night)).toBeLessThan(0.2);
    expect(Math.max(...zenith)).toBeGreaterThan(0.7);
  });

  it("tracks the real Moon: full on 2026-11-24, new on 2026-12-09", () => {
    const bay = SKY_LOCATIONS.home;
    expect(
      lunarPosition(new Date("2026-11-24T15:00:00Z"), bay).illumination,
    ).toBeGreaterThan(0.98);
    expect(
      lunarPosition(new Date("2026-12-09T00:00:00Z"), bay).illumination,
    ).toBeLessThan(0.02);
    const firstQuarter = lunarPosition(new Date("2026-11-17T12:00:00Z"), bay);
    expect(firstQuarter.waxing).toBe(true);
    expect(firstQuarter.illumination).toBeGreaterThan(0.35);
    expect(firstQuarter.illumination).toBeLessThan(0.75);
  });
});
