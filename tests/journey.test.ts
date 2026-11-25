import { describe, expect, it } from "vitest";
import {
  journeyGate,
  journeyPose,
  journeyRidePose,
} from "../src/game/core/journey";
import { railForWorld } from "../src/game/core/islandRail";
import { canWalk, findPath } from "../src/game/core/world";
import { WORLD_ELLIPSE } from "../src/shared/world-bounds";

describe("world-space transport", () => {
  it("boards at reachable gates in each region", () => {
    for (const world of ["home", "stanford", "korea"] as const) {
      for (const mode of world === "korea"
        ? (["plane"] as const)
        : (["plane", "train"] as const)) {
        const gate = journeyGate(mode, world);
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
  it("keeps every traveling coach on the mounted railway before and after the region handoff", () => {
    for (const [from, to] of [
      ["home", "stanford"],
      ["stanford", "home"],
    ] as const) {
      for (let step = 0; step <= 100; step++) {
        const progress = step / 100;
        // Include either side of the scenery commit at the midpoint.
        const worlds =
          progress === 0.5 ? [from, to] : [progress < 0.5 ? from : to];
        for (const world of worlds) {
          const rail = railForWorld(world);
          for (let coach = 0; coach < 3; coach++) {
            const p = journeyRidePose(
              "train",
              progress,
              from,
              to,
              world,
              coach,
            );
            expect(
              ((p.x - rail.centerX) / rail.radiusX) ** 2 +
                ((p.z - rail.centerZ) / rail.radiusZ) ** 2,
            ).toBeCloseTo(1, 8);
            expect(p.y).toBe(rail.height);
            // The Stanford airport is centered at (58, 52), with its apron
            // extending to z=61; no car may pass through that footprint.
            if (world === "stanford")
              expect(p.x < 50 || p.x > 66 || p.z < 44 || p.z > 64).toBe(true);
          }
        }
      }
    }
  });
});
