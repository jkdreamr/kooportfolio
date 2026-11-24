import { describe, expect, it } from "vitest";
import { moveJourneyApproach } from "../src/game/core/journeyApproach";
import { journeyGate } from "../src/game/core/journey";
import { canWalk, findPath } from "../src/game/core/world";

describe("boarding walks around the compact Home allotments", () => {
  it.each([1 / 60, 1 / 144, 0.1])(
    "reaches both gates without cutting corners at %ss frames",
    (delta) => {
      for (const start of [
        [-28, 0],
        [-28, 2.2],
        [-24, 2],
        [-13, 9],
      ] as [number, number][])
        for (const mode of ["plane", "train"] as const) {
          const gate = journeyGate(mode, "home");
          const route = findPath(start, [...gate], "home");
          expect(route.length).toBeGreaterThan(0);
          let [x, z] = start;
          for (let frame = 0; frame < 8000 && route.length; frame++) {
            [x, z] = moveJourneyApproach(x, z, route, delta, "home");
            expect(canWalk(x, z, "home")).toBe(true);
          }
          expect(
            route.length,
            `${start} → ${mode}; stranded at ${x},${z}`,
          ).toBe(0);
          expect(Math.hypot(x - gate[0], z - gate[1])).toBeLessThan(1);
        }
    },
  );
});

it.each([1 / 60, 1 / 144, 0.1])(
  "boards from beside Korea picnic corners at %ss frames",
  (delta) => {
    const gate = journeyGate("plane", "korea");
    for (const start of [
      [28.69, -8.39],
      [40.69, -8.39],
    ] as [number, number][]) {
      expect(canWalk(...start, "korea")).toBe(true);
      const route = findPath(start, [...gate], "korea");
      expect(route.length, `path from ${start}`).toBeGreaterThan(0);
      let [x, z] = start;
      let stalled = 0;
      for (
        let frame = 0;
        frame < 8000 && route.length && stalled < 10;
        frame++
      ) {
        const [nextX, nextZ] = moveJourneyApproach(x, z, route, delta, "korea");
        stalled = x === nextX && z === nextZ ? stalled + 1 : 0;
        [x, z] = [nextX, nextZ];
        expect(canWalk(x, z, "korea")).toBe(true);
      }
      expect(
        route.length,
        `${start} at ${delta}s; stranded at ${x},${z}; next ${route[0]}`,
      ).toBe(0);
      expect(canWalk(x, z, "korea")).toBe(true);
    }
  },
);
