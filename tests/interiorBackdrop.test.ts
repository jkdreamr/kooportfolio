import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DAYLIGHT_KEYS } from "../src/game/core/daylight";
import { interiorBackdrop } from "../src/game/world/TimeOfDayLighting";

const contrastWithWhite = (c: THREE.Color) => 1.05 / (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b + 0.05);

describe("interior backdrop (B9)", () => {
  it("every sky stop at every key keeps white text at 4.5:1 or better", () => {
    for (const key of DAYLIGHT_KEYS)
      for (const stop of [key.zenith, key.mid, key.horizon])
        expect(contrastWithWhite(interiorBackdrop(new THREE.Color(stop)))).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps the hue: a sunset stays warmer than a noon backdrop", () => {
    const dusk = interiorBackdrop(new THREE.Color(DAYLIGHT_KEYS.find((k) => k.hour === 18)!.horizon));
    const noon = interiorBackdrop(new THREE.Color(DAYLIGHT_KEYS.find((k) => k.hour === 12)!.horizon));
    expect(dusk.r / dusk.b).toBeGreaterThan(noon.r / noon.b);
  });
});
