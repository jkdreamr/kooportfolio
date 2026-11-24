import { describe, expect, it } from "vitest";
import { HOME_GARDEN_WALKS } from "../src/game/core/homeGardens";
import { canWalk, doors, doorsInWorld, findPath } from "../src/game/core/world";
import { AIRPORT_GATE, STATION_GATE } from "../src/game/core/journey";
import { PARCEL_DOORS } from "../src/game/core/regionalActivities";

describe("Home planted districts", () => {
  it("keeps parcel deliveries at their actual Home entrances", () => {
    for (const parcel of PARCEL_DOORS) {
      const door = doorsInWorld("home").find((item) => item.id === parcel.id)!;
      expect(parcel.p[0], parcel.id).toBeCloseTo(door.x);
      expect(parcel.p[1], parcel.id).toBeCloseTo(door.z);
    }
  });

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

  it("shortens actual walking routes, without scaling down the buildings", () => {
    // Routed distances from [0, 5] in the previous compact-travel layout.
    // Baselines include obstacles; these are not aerial distance estimates.
    const original = [
      ["theater", 75.6],
      ["writing", 57.8],
      ["stadium", 63.6],
      ["go", 60],
    ] as const;
    for (const [id, previousWalk] of original) {
      const door = doorsInWorld("home").find((door) => door.id === id)!;
      const unchanged = doors.find((door) => door.id === id)!;
      expect(door.scale).toEqual(unchanged.scale);
      expect(door.footprint.slice(2)).toEqual(unchanged.footprint.slice(2));
      const path = [[0, 5], ...findPath([0, 5], [door.x, door.z], "home")];
      const length = path
        .slice(1)
        .reduce(
          (sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]),
          0,
        );
      expect(length, id).toBeLessThan(previousWalk * 0.85);
    }
  });
});
