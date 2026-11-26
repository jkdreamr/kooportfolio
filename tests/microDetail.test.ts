import { describe, expect, it } from "vitest";
import { canWalk, doorsInWorld } from "../src/game/core/world";
import type { WorldId } from "../src/game/core/worlds";
import { microDetail } from "../src/game/world/MicroDetail";

const worlds: WorldId[] = ["home", "korea", "stanford"];

describe("island micro-detail", () => {
  for (const world of worlds) {
    const kit = microDetail(world);
    // Anything a walker could visibly clip: standing above ankle height
    // with its foot on the ground.
    const standing = [...kit.solids, ...kit.rocks, ...kit.glass].filter(
      ({ p, s }) => p[1] - s[1] / 2 < 0.6 && p[1] + s[1] / 2 > 0.34,
    );

    it(`${world}: dresses the island within budget`, () => {
      expect(kit.glass.length).toBeGreaterThan(10);
      expect(kit.halos.length).toBeGreaterThan(6);
      expect(kit.rocks.length).toBeGreaterThan(20);
      const triangles =
        kit.solids.length * 12 +
        kit.rocks.length * 20 +
        kit.glass.length * 36 +
        kit.halos.length * 2;
      expect(triangles).toBeLessThan(40_000);
    });

    it(`${world}: nothing solid stands on walkable ground`, () => {
      const blocked = standing.filter(({ p }) => canWalk(p[0], p[2], world));
      expect(blocked.map(({ p }) => p)).toEqual([]);
    });

    it(`${world}: every doorway stays clear`, () => {
      for (const door of doorsInWorld(world))
        for (const { p } of standing)
          expect(Math.hypot(p[0] - door.x, p[2] - door.z)).toBeGreaterThan(1.2);
    });
  }
});
