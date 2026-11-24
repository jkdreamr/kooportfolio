import { describe, expect, it } from "vitest";
import { HOME_GARDEN_WALKS } from "../src/game/core/homeGardens";
import { canWalk, doorsInWorld, findPath } from "../src/game/core/world";
import { AIRPORT_GATE, STATION_GATE } from "../src/game/core/journey";

describe("Home planted districts", () => {
  it("keeps the centerline of every authored garden walk traversable", () => {
    for (const [x, z, width, depth] of HOME_GARDEN_WALKS) {
      const horizontal = width > depth;
      const length = Math.max(width, depth);
      for (let step = -length / 2 + 0.5; step < length / 2; step += 0.5) {
        const at = [
          x + (horizontal ? step : 0),
          z + (horizontal ? 0 : step),
        ] as const;
        expect(canWalk(...at, "home"), `walk blocked at ${at}`).toBe(true);
      }
    }
  });

  it("keeps each named room and both transit gates reachable from the plaza", () => {
    for (const destination of [
      ...doorsInWorld("home").map((door) => [door.x, door.z] as const),
      AIRPORT_GATE,
      STATION_GATE,
    ])
      expect(
        findPath([0, 5], [...destination], "home").length,
        `route to ${destination}`,
      ).toBeGreaterThan(0);
  });
});
