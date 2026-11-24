import { describe, expect, it } from "vitest";
import {
  boardingPose,
  journeyEase,
  journeyGate,
  journeyPose,
} from "../src/game/core/journey";
import { canWalk, findPath } from "../src/game/core/world";
import { WORLD_ELLIPSE } from "../src/shared/world-bounds";

describe("world-space transport", () => {
  it("can reach the airport from a photo-booth corner off the pathfinding grid", () => {
    let position: [number, number] = [-4.91, -7.04];
    expect(canWalk(...position, "korea")).toBe(true);
    const route = findPath(position, [...journeyGate("plane")], "korea");
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
            "korea",
          ),
        ).toBe(true);
      }
      position = target;
    }
  });
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

  it("starts and stops at rest without a last-frame tilt or altitude jump", () => {
    for (const mode of ["plane", "train", "car"] as const) {
      for (const end of [0, 1]) {
        const parked = journeyPose(mode, end);
        const near = journeyPose(mode, end === 0 ? 0.0001 : 0.9999);
        expect(
          Math.hypot(near.x - parked.x, near.y - parked.y, near.z - parked.z),
        ).toBeLessThan(0.00001);
        expect(near.pitch).toBeCloseTo(0, 5);
        expect(near.roll).toBeCloseTo(0, 5);
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
    for (const mode of ["plane", "train", "car"] as const) {
      const start = boardingPose(mode, 0),
        end = boardingPose(mode, 1);
      expect([start.x, start.z]).toEqual([...journeyGate(mode)]);
      expect(start.y).toBe(0.18);
      expect(start.visible).toBe(true);
      expect(end.visible).toBe(false);
      for (let step = 0; step <= 100; step++) {
        const pose = boardingPose(mode, step / 100);
        expect(Number.isFinite(pose.heading)).toBe(true);
        expect(pose.y).toBeGreaterThanOrEqual(0.18);
        if (mode === "plane") {
          expect(pose.y).toBeLessThanOrEqual(0.72);
          for (const world of ["home", "stanford", "korea"] as const)
            expect(canWalk(pose.x, pose.z, world)).toBe(true);
        }
      }
      expect(journeyEase(0.0001)).toBeLessThan(0.00000001);
      expect(1 - journeyEase(0.9999)).toBeLessThan(0.00000001);
    }
  });
});
