import { describe, expect, it } from "vitest";
import { onStanfordLand, STANFORD_SHORE } from "../src/shared/stanford-ground";
import { journeyGate, journeyRidePose } from "../src/game/core/journey";
import { railForWorld, railPose } from "../src/game/core/islandRail";
import { destinationsInWorld } from "../src/game/core/world";
import {
  STANFORD_RAIL_LENGTH,
  STANFORD_RAIL_POINTS,
  STANFORD_RAIL_PROFILE,
  STANFORD_STATION_GATE,
  STANFORD_STATION,
  STANFORD_BULLETIN,
  STANFORD_BULLETIN_ENTRY,
  STANFORD_TELESCOPE,
  STANFORD_TELESCOPE_ENTRY,
  stanfordRailPose,
} from "../src/shared/stanford-transport";

const shoreDistance = (x: number, z: number) =>
  Math.min(
    ...STANFORD_SHORE.map(([ax, az], index) => {
      const [bx, bz] = STANFORD_SHORE[(index + 1) % STANFORD_SHORE.length];
      const dx = bx - ax,
        dz = bz - az;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)),
      );
      return Math.hypot(x - ax - t * dx, z - az - t * dz);
    }),
  );

describe("compact Stanford transport", () => {
  it("removes both distant land arms while retaining the full-size telescope and approaches", () => {
    expect(onStanfordLand(-73, 22)).toBe(false);
    expect(onStanfordLand(-19, -38)).toBe(false);
    expect(onStanfordLand(...STANFORD_STATION_GATE, 0.45)).toBe(true);
    expect(onStanfordLand(...STANFORD_TELESCOPE_ENTRY, 0.45)).toBe(true);
    for (const [x, z] of [STANFORD_BULLETIN, [-2.4, -4.3], [2.4, -4.3]])
      expect(onStanfordLand(x, z, 0.6)).toBe(true);
    for (let step = 0; step < 48; step++) {
      const angle = (step * Math.PI) / 24;
      expect(
        onStanfordLand(
          STANFORD_TELESCOPE[0] + 6.8 * Math.cos(angle),
          STANFORD_TELESCOPE[1] - 0.5 + 6.8 * Math.sin(angle),
          0.5,
        ),
      ).toBe(true);
    }
  });

  it("uses the compact route for real arrival gates, Places and each mounted journey coach", () => {
    const rail = railForWorld("stanford");
    expect(rail).toMatchObject(STANFORD_RAIL_PROFILE);
    expect(rail.station).toEqual(STANFORD_STATION);
    expect(journeyGate("train", "stanford")).toEqual(STANFORD_STATION_GATE);
    for (const [id, [x, z]] of [
      ["station", STANFORD_STATION_GATE],
      ["stargazing", STANFORD_TELESCOPE_ENTRY],
      ["bulletin", STANFORD_BULLETIN_ENTRY],
    ] as const)
      expect(
        destinationsInWorld("stanford").find((place) => place.id === id),
      ).toMatchObject({ x, z });
    for (let step = 0; step <= 64; step++) {
      const progress = step / 64;
      for (let coach = 0; coach < 3; coach++) {
        const expected = stanfordRailPose(progress, coach * rail.coachTurns);
        expect(railPose(progress, coach * rail.coachTurns, "stanford")).toEqual(
          expected,
        );
        expect(
          journeyRidePose(
            "train",
            progress,
            "home",
            "stanford",
            "stanford",
            coach,
          ),
        ).toEqual({ ...expected, y: rail.height, pitch: 0 });
      }
    }
  });

  it("hugs the occupied coastline without crossing land or clipping train-width clearance", () => {
    expect(STANFORD_RAIL_LENGTH).toBeLessThan(400);
    for (const [x, z] of STANFORD_RAIL_POINTS) {
      expect(onStanfordLand(x, z), `rail over land at ${x},${z}`).toBe(false);
      expect(
        shoreDistance(x, z),
        `train clearance at ${x},${z}`,
      ).toBeGreaterThan(1.5);
      expect(shoreDistance(x, z), `distant rail at ${x},${z}`).toBeLessThan(12);
    }
  });

  it("joins the station smoothly and spaces full-size coaches around every coastal bend", () => {
    expect(stanfordRailPose(0)).toMatchObject({ x: -31, z: 22 });
    expect(stanfordRailPose(1)).toEqual(stanfordRailPose(0));
    const before = stanfordRailPose(1 - 0.00001),
      after = stanfordRailPose(0.00001);
    expect(Math.hypot(before.x - after.x, before.z - after.z)).toBeLessThan(
      0.02,
    );
    for (let step = 0; step < 500; step++) {
      const front = stanfordRailPose(step / 500),
        back = stanfordRailPose(step / 500, STANFORD_RAIL_PROFILE.coachTurns);
      expect(Math.hypot(front.x - back.x, front.z - back.z)).toBeGreaterThan(
        5.5,
      );
      expect(Math.abs(front.heading)).toBeLessThanOrEqual(Math.PI);
    }
  });
});
