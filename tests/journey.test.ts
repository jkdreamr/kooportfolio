import { describe, expect, it } from "vitest";
import { journeyGate, journeyPose } from "../src/game/core/journey";
import { canWalk, findPath } from "../src/game/core/world";
import { WORLD_ELLIPSE } from "../src/shared/world-bounds";

describe("world-space transport", () => {
  it("boards at reachable gates in each region", () => {
    for (const world of ["home", "stanford", "korea"] as const) {
      for (const mode of world === "korea"
        ? (["plane"] as const)
        : (["plane", "train"] as const)) {
        const gate = journeyGate(mode);
        expect(canWalk(gate[0], gate[1], world)).toBe(true);
        const route = findPath([0, 5], [gate[0], gate[1]], world);
        expect(route.length).toBeGreaterThan(0);
        expect(route.every(([x, z]) => canWalk(x, z, world))).toBe(true);
      }
    }
  });
  it("takes off offshore and returns exactly to the destination apron", () => {
    const start = journeyPose("plane", 0),
      end = journeyPose("plane", 1);
    expect(end.x).toBeCloseTo(start.x);
    expect(end.y).toBeCloseTo(start.y);
    expect(end.z).toBeCloseTo(start.z);
    const mid = journeyPose("plane", 0.5);
    expect(mid.y).toBeGreaterThan(30);
    expect(
      (mid.x / WORLD_ELLIPSE.radiusX) ** 2 +
        ((mid.z - WORLD_ELLIPSE.centerZ) / WORLD_ELLIPSE.radiusZ) ** 2,
    ).toBeGreaterThan(1);
  });
  it("keeps the train grounded on its coastal rail through both directions", () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1])
      expect(journeyPose("train", p).y).toBe(1);
    const a = journeyPose("train", 0),
      b = journeyPose("train", 1);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.z).toBeCloseTo(a.z);
  });
});
