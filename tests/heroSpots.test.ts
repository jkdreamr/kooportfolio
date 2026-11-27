import { describe, expect, it } from "vitest";
import { FLIGHT_OBSTACLES, HERO_SPOTS } from "../src/game/core/heroSpots";
import { canWalk } from "../src/game/core/world";
import { MAX_EXPLORE_DISTANCE, MIN_EXPLORE_DISTANCE } from "../src/game/core/worldView";

const WORLDS = ["home", "korea", "stanford"] as const;

describe("hero spots (B1)", () => {
  for (const world of WORLDS) {
    const spot = HERO_SPOTS[world];
    it(`${world}: the first landing stands on walkable ground`, () => {
      expect(canWalk(spot.position[0], spot.position[1], world)).toBe(true);
    });
    it(`${world}: at least 2.5 m from every flight obstacle`, () => {
      for (const [cx, cz, hx, hz] of FLIGHT_OBSTACLES[world]) {
        const dx = Math.max(0, Math.abs(spot.position[0] - cx) - hx);
        const dz = Math.max(0, Math.abs(spot.position[1] - cz) - hz);
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(2.5);
      }
    });
    it(`${world}: a valid boom length and heading`, () => {
      expect(spot.exploreDistance).toBeGreaterThanOrEqual(MIN_EXPLORE_DISTANCE);
      expect(spot.exploreDistance).toBeLessThanOrEqual(MAX_EXPLORE_DISTANCE);
      expect(Number.isFinite(spot.heading)).toBe(true);
    });
    it(`${world}: obstacles are well-formed boxes above the ground`, () => {
      for (const [, , hx, hz, top] of FLIGHT_OBSTACLES[world]) {
        expect(hx).toBeGreaterThan(0);
        expect(hz).toBeGreaterThan(0);
        expect(top).toBeGreaterThan(1.5);
      }
    });
  }
});
