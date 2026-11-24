import { describe, expect, it } from "vitest";
import {
  SKATE,
  SKATE_RAILS,
  idleSkateInput,
  newSkateGame,
  skateHeight,
  stepSkate,
  type SkateInput,
  type SkateState,
} from "../src/game/core/skate";

const idle = idleSkateInput();
function advance(
  g: SkateState,
  seconds: number,
  input: Partial<SkateInput> = {},
) {
  for (let i = 0; i < Math.round(seconds * 120); i++)
    stepSkate(g, { ...idle, ...input }, 1 / 120);
}
function ollie(g: SkateState) {
  stepSkate(g, { ...idle, jump: true }, 1 / 120);
}

describe("free-skating park", () => {
  it("covers a large park with physical banks, hip and a flat entry", () => {
    expect(SKATE.halfWidth * 2 * SKATE.worldScale).toBeGreaterThanOrEqual(40);
    expect(SKATE.halfDepth * 2 * SKATE.worldScale).toBeGreaterThanOrEqual(48);
    expect(skateHeight(0, 0)).toBeCloseTo(0.18);
    expect(skateHeight(SKATE.halfWidth, 0)).toBeGreaterThan(2);
    expect(skateHeight(0, -SKATE.halfDepth)).toBeGreaterThan(2);
    expect(skateHeight(0, SKATE.halfDepth)).toBeCloseTo(0.18);
    expect(skateHeight(3, -3)).toBeGreaterThan(1.2);
  });
  it("requires pushing, steers freely, brakes and stays in bounds", () => {
    const g = newSkateGame();
    advance(g, 1);
    expect(g.z).toBe(8);
    advance(g, 1, { push: 1 });
    expect(g.z).toBeLessThan(7);
    const startX = g.x;
    advance(g, 0.5, { push: 1, steer: 1 });
    expect(g.x).toBeGreaterThan(startX);
    advance(g, 1, { brake: true });
    expect(g.speed).toBe(0);
    advance(g, 50, { push: 1, steer: 0.1 });
    expect(Math.abs(g.x)).toBeLessThanOrEqual(SKATE.halfWidth);
    expect(Math.abs(g.z)).toBeLessThanOrEqual(SKATE.halfDepth);
    expect(Number.isFinite(g.y)).toBe(true);
  });
  it("banks a clean ollie and flip chain only after landing and link timeout", () => {
    const g = newSkateGame();
    ollie(g);
    stepSkate(g, { ...idle, trick: "kickflip" }, 1 / 120);
    advance(g, 0.55);
    expect(g.grounded).toBe(false);
    expect(g.score).toBe(0);
    expect(g.count).toBe(2);
    expect(g.combo).toBe(330);
    advance(g, 3);
    expect(g.grounded).toBe(true);
    expect(g.score).toBe(660);
    expect(g.bestCombo).toBe(660);
    expect(g.combo).toBe(0);
  });
  it.each([
    { trick: "kickflip", points: 660 },
    { trick: "shove-it", points: 520 },
  ] as const)(
    "lands a one-action $trick without a separate ollie",
    ({ trick, points }) => {
      for (const fps of [15, 60, 120]) {
        const g = newSkateGame();
        stepSkate(g, { ...idle, trick }, 1 / fps);
        expect(g.grounded).toBe(false);
        expect(g.trick).toBe(trick);
        expect(g.count).toBe(1);
        expect(g.score).toBe(0);
        for (let frame = 0; frame < 4 * fps; frame++)
          stepSkate(g, idle, 1 / fps);
        expect(g.grounded).toBe(true);
        expect(g.bailTime).toBe(0);
        expect(g.score).toBe(points);
        expect(g.bestCombo).toBe(points);
      }
    },
  );
  it("chains a one-action flip out of a held grind", () => {
    const g = newSkateGame(),
      rail = SKATE_RAILS[0];
    Object.assign(g, { x: rail.x, z: 1.5, speed: 4 });
    advance(g, 0.05, { grind: true });
    expect(g.rail).toBe(0);
    stepSkate(g, { ...idle, trick: "kickflip", grind: true }, 1 / 120);
    expect(g.rail).toBe(-1);
    expect(g.grounded).toBe(false);
    expect(g.trick).toBe("kickflip");
    expect(g.railLock).toBeGreaterThan(0);
    // Keep holding through the next rail catch, exit and ground link timeout.
    advance(g, 6, { grind: true });
    expect(g.score).toBeGreaterThan(660);
    expect(g.bailTime).toBe(0);
  });
  it("loses only the unbanked line if a late flip hits the ground", () => {
    const g = newSkateGame();
    g.score = 1234;
    ollie(g);
    advance(g, 0.64);
    stepSkate(g, { ...idle, trick: "kickflip" }, 1 / 120);
    advance(g, 0.25);
    expect(g.bailTime).toBeGreaterThan(0);
    expect(g.combo).toBe(0);
    expect(g.score).toBe(1234);
    advance(g, 1);
    expect(g.bailTime).toBe(0);
    ollie(g);
    expect(g.grounded).toBe(false);
  });
  it("captures rails only when aligned and held, and lets an ollie link out", () => {
    const g = newSkateGame(),
      rail = SKATE_RAILS[0];
    Object.assign(g, { x: rail.x, z: 1.5, speed: 4 });
    advance(g, 0.05);
    expect(g.rail).toBe(-1);
    advance(g, 0.05, { grind: true });
    expect(g.rail).toBe(0);
    expect(g.y).toBe(rail.height);
    expect(g.combo).toBeGreaterThanOrEqual(200);
    advance(g, 0.5, { grind: true });
    const grindPoints = g.combo;
    stepSkate(g, { ...idle, jump: true, grind: true }, 1 / 120);
    expect(g.rail).toBe(-1);
    expect(g.combo).toBeGreaterThan(grindPoints);
    expect(g.vy).toBeGreaterThan(0);
    advance(g, 4);
    expect(g.score).toBeGreaterThan(500);
  });
  it("does not teleport a distant skater onto a rail", () => {
    const g = newSkateGame();
    Object.assign(g, { x: -1, z: 1, speed: 4 });
    advance(g, 1, { grind: true });
    expect(g.rail).toBe(-1);
    expect(g.combo).toBe(0);
  });
  it("ends timed runs, stops scoring and never counts an unfinished airborne line", () => {
    const g = newSkateGame("run");
    g.time = 59.9;
    ollie(g);
    advance(g, 0.2);
    expect(g.phase).toBe("done");
    expect(g.score).toBe(0);
    expect(g.combo).toBe(0);
    const time = g.time;
    advance(g, 2, { jump: true, push: 1, trick: "kickflip" });
    expect(g.time).toBe(time);
    expect(g.score).toBe(0);
    const free = newSkateGame();
    advance(free, 61);
    expect(free.phase).toBe("riding");
  });
  it("ends after 60 active seconds even below the physics frame budget", () => {
    for (const fps of [4, 15, 60]) {
      const g = newSkateGame("run");
      for (let frame = 0; frame < 60 * fps; frame++)
        stepSkate(g, idle, 1 / fps);
      expect(g.phase, `${fps} FPS`).toBe("done");
      expect(g.time).toBe(SKATE.duration);
    }
  });
  it("ignores invalid time and keeps contacts stable over different frame rates", () => {
    const g = newSkateGame();
    stepSkate(g, { ...idle, push: 1 }, NaN);
    stepSkate(g, { ...idle, push: 1 }, -1);
    expect(g.time).toBe(0);
    const slow = newSkateGame(),
      fast = newSkateGame();
    for (let i = 0; i < 30; i++) stepSkate(slow, { ...idle, push: 1 }, 1 / 30);
    for (let i = 0; i < 120; i++)
      stepSkate(fast, { ...idle, push: 1 }, 1 / 120);
    expect(slow.z).toBeCloseTo(fast.z, 4);
    expect(slow.speed).toBeCloseTo(fast.speed, 4);
  });
});
