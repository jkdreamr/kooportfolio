import { describe, expect, it } from "vitest";
import { ISLAND_RAIL, railPose } from "../src/game/core/islandRail";
import { youtubeEmbedUrl } from "../src/game/core/theaterProgram";

describe("coastal railway", () => {
  it("closes without a position or heading discontinuity", () => {
    const before = railPose(1 - 0.00001),
      after = railPose(1 + 0.00001);
    expect(Math.hypot(before.x - after.x, before.z - after.z)).toBeLessThan(
      0.02,
    );
    const headingDelta = before.heading - after.heading;
    expect(
      Math.abs(Math.atan2(Math.sin(headingDelta), Math.cos(headingDelta))),
    ).toBeLessThan(0.001);
    expect(railPose(0).x).toBeCloseTo(-ISLAND_RAIL.radiusX);
    expect(railPose(0).z).toBeCloseTo(ISLAND_RAIL.station[1]);
  });
  it("keeps coaches on the same coastal loop outside campus", () => {
    for (let step = 0; step < 500; step++) {
      for (const offset of [0, 0.011, 0.022]) {
        const p = railPose(step / 500, offset);
        const ellipse =
          (p.x / ISLAND_RAIL.radiusX) ** 2 +
          ((p.z - ISLAND_RAIL.centerZ) / ISLAND_RAIL.radiusZ) ** 2;
        expect(ellipse).toBeCloseTo(1);
        expect(p.x < -1 || p.x > 41 || p.z < 22 || p.z > 70).toBe(true);
      }
    }
  });
});

describe("on-demand official player URLs", () => {
  it("accepts only video IDs, never arbitrary iframe URLs", () => {
    const url = new URL(youtubeEmbedUrl("o2E2wLm_LlY"));
    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/o2E2wLm_LlY");
    for (const invalid of [
      "",
      "javascript:alert(1)",
      "https://example.com",
      "o2E2wLm_LlY?x=y",
    ])
      expect(() => youtubeEmbedUrl(invalid)).toThrow();
  });
});
