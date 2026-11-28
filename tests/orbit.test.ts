import { beforeEach, describe, expect, it } from "vitest";
import {
  ORBIT_PITCH_MAX,
  ORBIT_PITCH_MIN,
  orbit,
  orbitDrag,
  orbitGrab,
  orbitHome,
  orbitRelease,
  orbitReset,
  stepOrbit,
} from "../src/game/core/worldView";

describe("village view look-around", () => {
  beforeEach(() => orbitReset());

  it("turns with a drag and keeps pitch in its small range", () => {
    orbitGrab();
    orbitDrag(-200, 0, 0.1);
    expect(orbit.yaw).toBeGreaterThan(0.3);
    orbitDrag(0, 5000, 0.1);
    expect(orbit.pitch).toBe(ORBIT_PITCH_MAX);
    orbitDrag(0, -10000, 0.1);
    expect(orbit.pitch).toBe(ORBIT_PITCH_MIN);
  });

  it("wraps yaw to (-π, π]", () => {
    orbitGrab();
    for (let i = 0; i < 20; i++) orbitDrag(-400, 0, 0.1);
    expect(Math.abs(orbit.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  it("coasts after a fling and stops; reduced motion stops dead", () => {
    orbitGrab();
    orbitDrag(-60, 0, 0.016);
    orbitDrag(-60, 0, 0.016);
    orbitRelease(false, 10);
    const yaw = orbit.yaw;
    stepOrbit(1 / 60, 0, false);
    expect(orbit.yaw).toBeGreaterThan(yaw);
    for (let i = 0; i < 600; i++) stepOrbit(1 / 60, 0, false);
    expect(orbit.velocity).toBe(0);

    orbitGrab();
    orbitDrag(-60, 0, 0.016);
    orbitRelease(true, 10);
    const still = orbit.yaw;
    stepOrbit(1 / 60, 0, true);
    expect(orbit.yaw).toBe(still);
  });

  it("a pause before release does not fling", () => {
    orbitGrab();
    orbitDrag(-60, 0, 0.016);
    orbitRelease(false, 200);
    expect(orbit.velocity).toBe(0);
  });

  it("keys turn at a steady rate and Whole island eases home", () => {
    stepOrbit(0.5, 1, false);
    expect(orbit.yaw).toBeLessThan(-0.5);
    orbitHome(false);
    for (let i = 0; i < 300; i++) stepOrbit(1 / 60, 0, false);
    expect(orbit.yaw).toBe(0);
    expect(orbit.homing).toBe(false);
  });
});
