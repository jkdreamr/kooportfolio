import { describe, expect, it } from "vitest";
import { HOME_GARDEN_WALKS } from "../src/game/core/homeGardens";
import { canWalk, doors, doorsInWorld, findPath } from "../src/game/core/world";
import { journeyGate } from "../src/game/core/journey";
import {
  PARCEL_DOORS,
  freshActivities,
  nearbyRegionalActivity,
} from "../src/game/core/regionalActivities";

describe("Home planted districts", () => {
  it("keeps every full-size destination in one connected village block", () => {
    const block = doorsInWorld("home");
    const edgeGap = (a: (typeof block)[number], b: (typeof block)[number]) => {
      const [ax, az, aw, ad] = a.footprint;
      const [bx, bz, bw, bd] = b.footprint;
      return Math.hypot(
        Math.max(0, Math.abs(ax - bx) - aw - bw),
        Math.max(0, Math.abs(az - bz) - ad - bd),
      );
    };
    for (const a of block) {
      const original = doors.find(({ id }) => id === a.id)!;
      expect(a.scale).toEqual(original.scale);
      expect(a.footprint.slice(2)).toEqual(original.footprint.slice(2));
      for (const b of block.filter(({ id }) => id !== a.id)) {
        expect(edgeGap(a, b), `${a.id}/${b.id} overlap`).toBeGreaterThan(1.2);
      }
    }
    // One street and its front steps may separate neighbours, not a full lawn
    // or planted district. This fails when Go/Kitchen form a detached cluster.
    const reached = new Set([block[0].id]);
    for (let pass = 0; pass < block.length; pass++)
      for (const a of block.filter(({ id }) => reached.has(id)))
        for (const b of block) if (edgeGap(a, b) <= 8) reached.add(b.id);
    expect(reached.size).toBe(block.length);
  });

  it("keeps parcel deliveries at their actual Home entrances", () => {
    for (const parcel of PARCEL_DOORS) {
      const door = doorsInWorld("home").find((item) => item.id === parcel.id)!;
      expect(
        Math.hypot(parcel.p[0] - door.x, parcel.p[1] - door.z),
        parcel.id,
      ).toBeLessThan(0.1);
    }
  });

  it("does not intercept any room entrance with a fresh-run side activity", () => {
    for (const door of doorsInWorld("home"))
      expect(
        nearbyRegionalActivity("home", door.x, door.z, freshActivities()),
        door.name,
      ).toBeUndefined();
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
      journeyGate("plane", "home"),
      journeyGate("train", "home"),
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
