import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampZoom,
  makeStarField,
  MAX_ZOOM,
  MIN_ZOOM,
  PAN_LIMIT,
  SKY_PATTERNS,
  starsVisible,
} from "../src/game/core/stargazing";

describe("telescope sky", () => {
  it("shows stars after dark in auto time as well as presets, never at noon", () => {
    expect(starsVisible(23)).toBe(true);
    expect(starsVisible(0)).toBe(true);
    expect(starsVisible(4)).toBe(true);
    expect(starsVisible(19.5)).toBe(true);
    expect(starsVisible(5.5)).toBe(false);
    expect(starsVisible(12)).toBe(false);
    expect(starsVisible(18)).toBe(false);
    expect(starsVisible(24)).toBe(starsVisible(0));
    expect(starsVisible(NaN)).toBe(false);
  });

  it("keeps all supported aim/zoom combinations inside the generated sky", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampPan(-1e6)).toBe(-PAN_LIMIT);
    expect(clampPan(1e6)).toBe(PAN_LIMIT);
    expect(PAN_LIMIT + 300 / MIN_ZOOM).toBeLessThan(750);
  });

  it("keeps the same stars fixed between renders and separates each target field", () => {
    const field = makeStarField(2026);
    expect(field).toEqual(makeStarField(2026));
    expect(field).not.toEqual(makeStarField(2027));
    expect(field).toHaveLength(430);
    expect(
      field.every(
        (star) =>
          Math.abs(star.x) <= 750 && Math.abs(star.y) <= 750 && star.radius > 0,
      ),
    ).toBe(true);
    for (const pattern of SKY_PATTERNS) {
      for (const [a, b] of pattern.lines) {
        expect(pattern.stars[a]).toBeDefined();
        expect(pattern.stars[b]).toBeDefined();
      }
    }
  });
});
