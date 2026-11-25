import { describe, expect, it } from "vitest";
import {
  boardingPose,
  journeyEase,
  journeyGate,
  journeyPose,
  journeyRidePose,
} from "../src/game/core/journey";
import { railForWorld, railPose } from "../src/game/core/islandRail";
import { canWalk, findPath } from "../src/game/core/world";
import type { WorldId } from "../src/game/core/worlds";
import { WORLD_ELLIPSE } from "../src/shared/world-bounds";

const expectWalkableRoute = (
  position: [number, number],
  route: [number, number][],
  world: WorldId,
) => {
  expect(route.length).toBeGreaterThan(0);
  for (const target of route) {
    const distance = Math.hypot(
      target[0] - position[0],
      target[1] - position[1],
    );
    const steps = Math.max(1, Math.ceil(distance / 0.05));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      expect(
        canWalk(
          position[0] + (target[0] - position[0]) * t,
          position[1] + (target[1] - position[1]) * t,
          world,
        ),
      ).toBe(true);
    }
    position = target;
  }
};

describe("world-space transport", () => {
  it("can reach the airport from a photo-booth corner off the pathfinding grid", () => {
    const position: [number, number] = [-4.91, -7.04];
    expect(canWalk(...position, "korea")).toBe(true);
    expectWalkableRoute(
      position,
      findPath(position, [...journeyGate("plane")], "korea"),
      "korea",
    );
  });
  it("can reach the airport through a Stanford alley that needs a turn", () => {
    // A wall beside this alley leaves no straight-connected grid seed.
    const position: [number, number] = [28, 43.5];
    expect(canWalk(...position, "stanford")).toBe(true);
    expectWalkableRoute(
      position,
      findPath(position, [...journeyGate("plane")], "stanford"),
      "stanford",
    );
  });
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

  it("starts and stops at rest without a last-frame tilt or altitude jump", () => {
    for (const end of [0, 1]) {
      const parked = journeyPose("plane", end);
      const near = journeyPose("plane", end === 0 ? 0.0001 : 0.9999);
      expect(
        Math.hypot(near.x - parked.x, near.y - parked.y, near.z - parked.z),
      ).toBeLessThan(0.00001);
      expect(near.pitch).toBeCloseTo(0, 5);
      expect(near.roll ?? 0).toBeCloseTo(0, 5);
    }
    for (const mode of ["train"] as const) {
      for (const end of [0, 1]) {
        const near = journeyPose(mode, end === 0 ? 0.0001 : 0.9999);
        expect(near.pitch).toBeCloseTo(0, 5);
        expect(near.roll ?? 0).toBeCloseTo(0, 5);
      }
    }
  });

  it("pitches with the flight path and banks only after takeoff", () => {
    const climb = journeyPose("plane", 0.3);
    const descent = journeyPose("plane", 0.7);
    expect(climb.pitch).toBeLessThan(0);
    expect(descent.pitch).toBeGreaterThan(0);
    expect(climb.pitch).toBeCloseTo(-descent.pitch);
    expect(journeyPose("plane", 0.04).y).toBeCloseTo(1.2);
    expect(journeyPose("plane", 0.04).roll).toBeCloseTo(0);
    expect(climb.roll).toBeLessThan(0);
    const before = journeyPose("plane", 0.3 - 0.0001);
    const after = journeyPose("plane", 0.3 + 0.0001);
    const tangentPitch = -Math.atan2(
      after.y - before.y,
      Math.hypot(after.x - before.x, after.z - before.z),
    );
    expect(climb.pitch).toBeCloseTo(tangentPitch, 4);
  });

  it("walks a reversible boarding path from ground level into the cabin", () => {
    for (const mode of ["plane", "train"] as const) {
      for (const world of ["home", "stanford", "korea"] as const) {
        if (world === "korea" && mode !== "plane") continue;
        const start = boardingPose(mode, 0, world),
          end = boardingPose(mode, 1, world);
        expect([start.x, start.z]).toEqual([...journeyGate(mode, world)]);
        expect(start.y).toBe(0.18);
        expect(start.visible).toBe(true);
        expect(end.visible).toBe(false);
        for (let step = 0; step <= 100; step++) {
          const pose = boardingPose(mode, step / 100, world);
          expect(Number.isFinite(pose.heading)).toBe(true);
          expect(pose.y).toBeGreaterThanOrEqual(0.18);
          if (mode === "plane") {
            expect(pose.y).toBeLessThanOrEqual(0.72);
            expect(canWalk(pose.x, pose.z, world)).toBe(true);
          }
        }
      }
      expect(journeyEase(0.0001)).toBeLessThan(0.00000001);
      expect(1 - journeyEase(0.9999)).toBeLessThan(0.00000001);
    }
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
            expect(p).toMatchObject(
              railPose(progress, coach * rail.coachTurns, world),
            );
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
