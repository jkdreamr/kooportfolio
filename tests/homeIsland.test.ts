import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { WORLD_ELLIPSE } from "../src/shared/world-bounds";
import {
  HOME_ISLAND,
  HOME_RAIL_POINTS,
  HOME_SHORE,
  isHomeLand,
  islandForWorld,
} from "../src/game/core/homeIsland";
import {
  distanceToPolygon,
  minCurveRadius,
  offsetLoop,
} from "../src/game/core/coast";
import {
  islandCenter,
  islandZoom,
  ISLAND_CAMERA_OFFSET,
} from "../src/game/core/islandCamera";
import {
  HOME_RAIL_LENGTH,
  railForWorld,
  railPose,
} from "../src/game/core/islandRail";
import {
  AIRPORT_GATE,
  STATION_GATE,
  journeyGate,
  journeyPose,
} from "../src/game/core/journey";
import {
  canWalk,
  destinationsInWorld,
  doorsInWorld,
  findPath,
  moveWorld,
} from "../src/game/core/world";
import { activitySpots } from "../src/game/core/regionalActivities";
import { HOME_ANIMALS, animalPose } from "../src/game/core/wildlife";
import { villagers } from "../src/game/core/npcs";
import { STANFORD_STATION_GATE } from "../src/shared/stanford-transport";

describe("Home’s actual compact island", () => {
  it("keeps the seated Reader on the relocated bench beside the talking approach", () => {
    const reader = villagers.find(({ id }) => id === "reader")!;
    const seat = reader.stops![0].seat!;
    expect(seat.position).toEqual([10, 3.2]);
    expect(
      Math.hypot(
        reader.route[0][0] - seat.position[0],
        reader.route[0][1] - seat.position[1],
      ),
    ).toBeLessThan(1.5);
  });
  it("removes four fifths of the old walkable land, not just the camera view", () => {
    expect(HOME_ISLAND.radiusX * HOME_ISLAND.radiusZ).toBeLessThan(
      WORLD_ELLIPSE.radiusX * WORLD_ELLIPSE.radiusZ * 0.21,
    );
    for (const point of [
      [0, 29],
      [-26, 42],
      [20, 48],
      [58, 61],
    ] as const)
      expect(canWalk(point[0], point[1], "home")).toBe(false);
    expect(islandForWorld("stanford")).toEqual({
      centerX: 0,
      ...WORLD_ELLIPSE,
    });
    expect(islandForWorld("korea")).toEqual({ centerX: 0, ...WORLD_ELLIPSE });
  });

  it("keeps the full-size buildings, activities and transformed travel labels reachable", () => {
    const targets = [
      ...destinationsInWorld("home").map(({ x, z }) => [x, z] as const),
      ...activitySpots
        .filter(({ world }) => world === "home")
        .map(({ p }) => p),
    ];
    for (const target of targets) {
      expect(canWalk(target[0], target[1], "home"), `${target}`).toBe(true);
      const path = findPath([0, 5], [...target], "home");
      expect(path.length, `${target}`).toBeGreaterThan(0);
      expect(path.every(([x, z]) => canWalk(x, z, "home"))).toBe(true);
    }
    for (const {
      footprint: [x, z, w, d],
    } of doorsInWorld("home"))
      for (const dx of [-w, w])
        for (const dz of [-d, d])
          expect(
            ((x + dx - HOME_ISLAND.centerX) / HOME_ISLAND.radiusX) ** 2 +
              ((z + dz - HOME_ISLAND.centerZ) / HOME_ISLAND.radiusZ) ** 2,
          ).toBeLessThan(1);
  });

  it("stops movement at the new shore instead of allowing invisible old lawn", () => {
    const [x, z] = moveWorld(0, 10, 0, 40, "home");
    expect(canWalk(x, z, "home")).toBe(true);
    expect(z).toBeLessThan(14);
  });

  it("keeps regional gates independent and closes Home's compact coastal train loop", () => {
    expect(journeyGate("plane", "stanford")).toEqual(AIRPORT_GATE);
    expect(journeyGate("plane", "korea")).toEqual(AIRPORT_GATE);
    expect(journeyGate("train", "stanford")).toEqual(STANFORD_STATION_GATE);
    expect(journeyGate("train", "korea")).toEqual(STATION_GATE);
    const rail = railForWorld("home");
    expect(rail.station[1]).toBe(HOME_ISLAND.centerZ);
    for (const mode of ["train", "plane"] as const) {
      const a = journeyPose(mode, 0, "home"),
        b = journeyPose(mode, 1, "home");
      expect(b.x).toBeCloseTo(a.x);
      expect(b.z).toBeCloseTo(a.z);
    }
    // The loop follows the organic shore, not an ellipse: closed, gentle
    // enough for full-size coaches, and never over the lawn.
    expect(HOME_RAIL_LENGTH).toBeGreaterThan(255);
    expect(HOME_RAIL_LENGTH).toBeLessThan(290);
    expect(minCurveRadius(HOME_RAIL_POINTS, 4)).toBeGreaterThanOrEqual(8);
    const before = railPose(1 - 0.00001, 0, "home"),
      after = railPose(0.00001, 0, "home");
    expect(Math.hypot(before.x - after.x, before.z - after.z)).toBeLessThan(
      0.02,
    );
    const turn = before.heading - after.heading;
    expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeLessThan(
      0.05,
    );
    let previous = railPose(0, 0, "home").heading;
    for (let i = 0; i < 600; i++) {
      const p = railPose(i / 600, 0, "home");
      const coach = railPose(i / 600, rail.coachTurns, "home");
      expect(Math.hypot(p.x - coach.x, p.z - coach.z)).toBeGreaterThan(4.4);
      expect(Math.hypot(p.x - coach.x, p.z - coach.z)).toBeLessThan(5.51);
      expect(isHomeLand(p.x, p.z), `${p.x},${p.z}`).toBe(false);
      expect(distanceToPolygon(p.x, p.z, HOME_SHORE)).toBeGreaterThan(1.5);
      expect(Math.abs(p.x - rail.centerX)).toBeLessThanOrEqual(rail.radiusX);
      expect(Math.abs(p.z - rail.centerZ)).toBeLessThanOrEqual(rail.radiusZ);
      // No kinks: under 4 degrees of turn per 1/600 lap (0.45 of track).
      const bend = p.heading - previous;
      expect(Math.abs(Math.atan2(Math.sin(bend), Math.cos(bend)))).toBeLessThan(
        0.07,
      );
      previous = p.heading;
    }
  });

  it("keeps Home’s animals on land and out of the relocated beds", () => {
    for (const animal of HOME_ANIMALS)
      for (let t = 0; t < 120; t += 0.2) {
        const p = animalPose(animal, t);
        expect(canWalk(p.x, p.z, "home"), `${animal.kind}: ${p.x},${p.z}`).toBe(
          true,
        );
      }
  });

  it.each([
    [1440, 900],
    [390, 844],
    [844, 390],
  ])("fits the organic shore and rail at %s × %s", (width, height) => {
    const [centerX, centerZ] = islandCenter("home");
    expect([centerX, centerZ]).toEqual([
      HOME_ISLAND.centerX,
      HOME_ISLAND.centerZ,
    ]);
    const camera = new OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0.1,
      350,
    );
    camera.position.set(
      centerX + ISLAND_CAMERA_OFFSET[0],
      ISLAND_CAMERA_OFFSET[1],
      centerZ + ISLAND_CAMERA_OFFSET[2],
    );
    camera.lookAt(centerX, 0.7, centerZ);
    camera.zoom = islandZoom(width, height, "home");
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Sleepers and the rock ledge reach 1.5 beyond the rail's centreline.
    for (const [x, z] of offsetLoop(HOME_RAIL_POINTS, 1.5)) {
      const point = new Vector3(x, 0, z).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(0.98);
      expect(Math.abs(point.y)).toBeLessThan(0.9);
    }
    for (const [x, z] of HOME_SHORE) {
      const point = new Vector3(x, 13, z).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(0.98);
      expect(Math.abs(point.y)).toBeLessThan(0.9);
    }
  });
});
