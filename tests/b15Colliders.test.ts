import { describe, expect, it } from "vitest";
import { canWalk } from "../src/game/core/world";
import { campusFountainWorld } from "../src/game/core/campus";
import { campusFountainSpec } from "../src/game/core/campusDistrict";
import { HERO_SPOTS } from "../src/game/core/heroSpots";

// B15: nobody stands in a fountain basin; the hero spots stay walkable.
describe("fountain and road colliders (B15)", () => {
  it("the Stanford quad fountain's basin is not walkable anywhere inside its rim", () => {
    const [x, z] = campusFountainWorld;
    const r = campusFountainSpec.basinRadius;
    for (let a = 0; a < 24; a++)
      for (const k of [0, 0.35, 0.7, 1]) {
        const px = x + Math.cos((a / 24) * Math.PI * 2) * r * k;
        const pz = z + Math.sin((a / 24) * Math.PI * 2) * r * k;
        expect(canWalk(px, pz, "stanford"), `${px.toFixed(2)},${pz.toFixed(2)}`).toBe(false);
      }
  });
  it("the Home garden column's basin is not walkable", () => {
    for (const [dx, dz] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]])
      expect(canWalk(-26 + dx, 0 + dz, "home")).toBe(false);
  });
  it("roads stay walkable: every world's hero spot (on its street) is", () => {
    for (const [world, spot] of Object.entries(HERO_SPOTS))
      expect(canWalk(spot.position[0], spot.position[1], world as keyof typeof HERO_SPOTS)).toBe(true);
  });
});
