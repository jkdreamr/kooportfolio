import { describe, expect, it } from "vitest";
import { canWalk, doorsInWorld } from "../src/game/core/world";
import { insidePolygon } from "../src/game/core/coast";
import type { WorldId } from "../src/game/core/worlds";
import {
  grassField,
  lakesFor,
  lipLoop,
  PAVED,
  rockField,
  shoreField,
  touchesWalkable,
  understoryField,
} from "../src/game/world/env/placement";

const worlds: WorldId[] = ["home", "korea", "stanford"];

describe("environment placement", () => {
  for (const world of worlds) {
    const rocks = rockField(world);
    const doors = doorsInWorld(world);

    it(`${world}: granite stays off walkable ground and doorways`, () => {
      expect(rocks.length).toBeGreaterThan(40);
      const blocked = rocks.filter(({ x, z, size }) =>
        touchesWalkable(x, z, size * 0.8, world),
      );
      expect(blocked).toEqual([]);
      for (const door of doors)
        for (const { x, z } of rocks)
          expect(Math.hypot(x - door.x, z - door.z)).toBeGreaterThan(2);
    });

    it(`${world}: grass never covers paths, paving or doorways`, () => {
      const tufts = grassField(world, 25_000);
      expect(tufts.length).toBeGreaterThan(2_000);
      expect(tufts.length).toBeLessThanOrEqual(25_000);
      const onPath = tufts.filter(({ x, z }) =>
        PAVED[world].some(
          ([cx, cz, w, d]) =>
            Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2,
        ),
      );
      expect(onPath).toEqual([]);
      for (const door of doors)
        expect(
          tufts.some(({ x, z }) => Math.hypot(x - door.x, z - door.z) < 1.5),
        ).toBe(false);
      // A tier prefix is an even thinning, not one corner of the island.
      const few = grassField(world, 2_000);
      const spreadX = Math.max(...few.map((t) => t.x)) - Math.min(...few.map((t) => t.x));
      expect(spreadX).toBeGreaterThan(30);
    }, 30_000);

    it(`${world}: understory stays off walkable ground, doorways and water`, () => {
      const clumps = understoryField(world);
      expect(clumps.length).toBeGreaterThan(150);
      expect(clumps.filter(({ x, z }) => canWalk(x, z, world))).toEqual([]);
      for (const door of doors)
        expect(clumps.some(({ x, z }) => Math.hypot(x - door.x, z - door.z) < 2.9)).toBe(false);
      for (const lake of lakesFor(world))
        expect(clumps.some(({ x, z }) => insidePolygon(x, z, lake.outline))).toBe(false);
      // Every kind is used, and a prefix spreads over the island.
      expect(new Set(clumps.map((c) => c.kind)).size).toBe(4);
      const few = clumps.slice(0, 60);
      expect(Math.max(...few.map((c) => c.x)) - Math.min(...few.map((c) => c.x))).toBeGreaterThan(30);
    }, 60_000);

    it(`${world}: lakes and their lips sit on unwalkable land`, () => {
      for (const lake of lakesFor(world)) {
        for (const loop of [lake.outline, lipLoop(lake.outline)])
          for (const [x, z] of loop) expect(canWalk(x, z, world)).toBe(false);
      }
    });

    it(`${world}: shoreline pebbles never stand on walkable ground`, () => {
      const standing = shoreField(world).filter(
        ({ kind, y, size }) => kind === "pebble" && y + size * 0.45 > 0.34,
      );
      expect(standing.filter(({ x, z }) => canWalk(x, z, world))).toEqual([]);
    });
  }

  it("home holds lakes in its cove shelves", () => {
    expect(lakesFor("home").length).toBeGreaterThanOrEqual(3);
  });
});
