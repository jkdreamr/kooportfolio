import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { WORLD_ELLIPSE } from "../src/shared/world-bounds";
import { HOME_ISLAND, islandForWorld } from "../src/game/core/homeIsland";
import {
  islandZoom,
  ISLAND_CAMERA_OFFSET,
} from "../src/game/core/islandCamera";
import { railForWorld, railPose } from "../src/game/core/islandRail";
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

  it("moves only Home’s gates and closes its compact coastal train loop", () => {
    expect(journeyGate("plane", "stanford")).toEqual(AIRPORT_GATE);
    expect(journeyGate("plane", "korea")).toEqual(AIRPORT_GATE);
    expect(journeyGate("train", "stanford")).toEqual(STATION_GATE);
    const rail = railForWorld("home");
    expect(rail.station[1]).toBe(HOME_ISLAND.centerZ);
    for (const mode of ["train", "plane"] as const) {
      const a = journeyPose(mode, 0, "home"),
        b = journeyPose(mode, 1, "home");
      expect(b.x).toBeCloseTo(a.x);
      expect(b.z).toBeCloseTo(a.z);
    }
    for (let i = 0; i < 100; i++) {
      const p = railPose(i / 100, 0, "home");
      const coach = railPose(i / 100, rail.coachTurns, "home");
      expect(Math.hypot(p.x - coach.x, p.z - coach.z)).toBeGreaterThan(4.4);
      expect(
        ((p.x - rail.centerX) / rail.radiusX) ** 2 +
          ((p.z - rail.centerZ) / rail.radiusZ) ** 2,
      ).toBeCloseTo(1);
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
  ])("fits the actual compact shore and rail at %s × %s", (width, height) => {
    const camera = new OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0.1,
      350,
    );
    camera.position.set(
      HOME_ISLAND.centerX + ISLAND_CAMERA_OFFSET[0],
      ISLAND_CAMERA_OFFSET[1],
      HOME_ISLAND.centerZ + ISLAND_CAMERA_OFFSET[2],
    );
    camera.lookAt(HOME_ISLAND.centerX, 0.7, HOME_ISLAND.centerZ);
    camera.zoom = islandZoom(width, height, "home");
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const rail = railForWorld("home");
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const point = new Vector3(
        rail.centerX + (rail.radiusX + 1.5) * Math.cos(a),
        0,
        rail.centerZ + (rail.radiusZ + 1.5) * Math.sin(a),
      ).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(0.98);
      expect(Math.abs(point.y)).toBeLessThan(0.9);
    }
  });
});
