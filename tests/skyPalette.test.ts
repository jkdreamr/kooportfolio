import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DAYLIGHT_KEYS, rgbHex, sampleDaylight, sampleSkyPalette } from "../src/game/core/daylight";

describe("telescope sky matches the village's three-stop sky (B5)", () => {
  it("zenith, mid and horizon equal what TimeOfDayLighting lerps", () => {
    for (const hour of [0, 5, 6.5, 9, 13, 16.6, 18.5, 20, 22]) {
      const { index, blend } = sampleDaylight(hour);
      const palette = sampleSkyPalette(hour);
      for (const stop of ["zenith", "mid", "horizon"] as const) {
        const c = new THREE.Color(DAYLIGHT_KEYS[index][stop]).lerp(new THREE.Color(DAYLIGHT_KEYS[index + 1][stop]), blend);
        expect(rgbHex(palette[stop])).toBe(`#${c.getHexString()}`);
      }
    }
  });
});
