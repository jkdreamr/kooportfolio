import { describe, expect, it } from "vitest";
import {
  ambientMix,
  ANIMALS,
  animalPose,
  birdPose,
  planePose,
} from "../src/game/core/wildlife";
import { canWalk, doors } from "../src/game/core/world";
import { POND } from "../src/game/core/pond";

describe("ambient wildlife", () => {
  it("keeps every land circuit on walkable ground and away from doorways", () => {
    for (const animal of ANIMALS.filter((a) => a.kind !== "duck")) {
      for (let t = 0; t < 150; t += 0.13) {
        const pose = animalPose(animal, t);
        expect(
          canWalk(pose.x, pose.z),
          `${animal.kind} at ${pose.x},${pose.z}`,
        ).toBe(true);
        for (const door of doors)
          expect(Math.hypot(pose.x - door.x, pose.z - door.z)).toBeGreaterThan(
            1.9,
          );
        const next = animalPose(animal, t + 0.01);
        expect(
          Math.hypot(next.x - pose.x, next.z - pose.z),
        ).toBeLessThanOrEqual(animal.speed * 0.01001);
      }
    }
  });
  it("keeps ducks on the pond and air traffic above rooftops", () => {
    for (let t = 0; t < 220; t += 0.27) {
      for (const duck of ANIMALS.filter((a) => a.kind === "duck")) {
        const pose = animalPose(duck, t);
        expect(
          ((pose.x - POND.x) / (POND.radiusX - 0.5)) ** 2 +
            ((pose.z - POND.z) / (POND.radiusZ - 0.5)) ** 2,
        ).toBeLessThan(1);
      }
      for (let i = 0; i < 7; i++) expect(birdPose(t, i).y).toBeGreaterThan(8);
      expect(planePose(t).y).toBeGreaterThan(12);
    }
    expect(planePose(0).visible).toBe(true);
    expect(planePose(40).visible).toBe(false);
    expect(planePose(110)).toEqual(planePose(0));
  });
});

describe("outdoor sound mix", () => {
  it("replaces daytime bird recordings with crickets at night and across midnight", () => {
    expect(ambientMix(12, 0, 5, "hub").birds).toBeGreaterThan(0);
    expect(ambientMix(12, 0, 5, "hub").crickets).toBe(0);
    expect(ambientMix(23, 0, 5, "hub").birds).toBe(0);
    expect(ambientMix(23, 0, 5, "hub").crickets).toBeGreaterThan(0);
    expect(ambientMix(24, 0, 5, "hub")).toEqual(ambientMix(0, 0, 5, "hub"));
  });
  it("localizes water and leaves all interiors silent", () => {
    expect(ambientMix(12, POND.x, POND.z, "hub").water).toBeGreaterThan(
      ambientMix(12, 0, 5, "hub").water,
    );
    expect(ambientMix(12, 0, -30, "hub").water).toBe(0);
    expect(ambientMix(12, 5, 35, "hub").water).toBe(0);
    expect(ambientMix(12, 0, 0, "rowing").water).toBeGreaterThan(0);
    for (const scene of [
      "office",
      "boathouse",
      "kappa",
      "kitchen",
      "gym",
      "cognition",
      "music",
      "math",
    ])
      expect(ambientMix(12, 0, 35, scene)).toEqual({
        birds: 0,
        crickets: 0,
        water: 0,
        rain: 0,
        wind: 0,
      });
  });
});
