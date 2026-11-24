import { describe, expect, it } from "vitest";
import {
  canWalk,
  destinationsInWorld,
  doorsInWorld,
  findPath,
  moveWorld,
} from "../src/game/core/world";
import { campusStops } from "../src/game/core/campus";
import { HOOVER } from "../src/game/core/hoover";
import {
  STANFORD_WALKS,
  isStanfordTownSpace,
} from "../src/game/core/stanfordLayout";
import { forest } from "../src/game/core/scenery";
import { villageGardenPlots } from "../src/game/core/villageGardens";
import { createNpcActors, nearestNpc, villagers } from "../src/game/core/npcs";
import { belongsToWorld } from "../src/game/core/worlds";
import { runtime, useGame, walkTo } from "../src/game/core/store";
import { ISLAND_RAIL } from "../src/game/core/islandRail";
import { onStanfordLand } from "../src/shared/stanford-ground";
import { freshSave, parseSave } from "../src/shared/save";
import { animalsInWorld, animalPose } from "../src/game/core/wildlife";

describe("compact Stanford village", () => {
  it("does not retain invisible trunk collisions where shore-edge trees were removed", () => {
    const clearings = forest.filter(
      ({ x, z }) =>
        !isStanfordTownSpace(x, z, 3) &&
        onStanfordLand(x, z, 1) &&
        !onStanfordLand(x, z, 5),
    );
    expect(clearings.length).toBeGreaterThan(0);
    for (const { x, z } of clearings)
      expect(canWalk(x, z, "stanford"), `shore clearing: ${x},${z}`).toBe(true);
  });
  it("cuts the vacant grass behind Math/Badminton instead of filling it with props", () => {
    for (const [x, z] of [
      [28.5, 0],
      [55, 14.5],
      [58, 30],
      [20, -25],
      [0, 90],
    ]) {
      expect(onStanfordLand(x, z), `${x},${z}`).toBe(false);
      expect(canWalk(x, z, "stanford"), `${x},${z}`).toBe(false);
    }
    for (const {
      footprint: [x, z, hx, hz],
    } of doorsInWorld("stanford"))
      for (const dx of [-hx, hx])
        for (const dz of [-hz, hz])
          expect(
            onStanfordLand(x + dx, z + dz, 0.6),
            `${x + dx},${z + dz}`,
          ).toBe(true);
    for (const [x, z, w, d] of STANFORD_WALKS)
      for (const dx of [-w / 2, w / 2])
        for (const dz of [-d / 2, d / 2])
          expect(
            onStanfordLand(x + dx, z + dz, 0.6),
            `${x + dx},${z + dz}`,
          ).toBe(true);
  });
  it("moves old Stanford lawn saves to the plaza without losing progress or changing other worlds", () => {
    const previous = {
      ...freshSave(),
      coins: 75,
      xp: 21,
      memories: ["hoover-key"],
      world: "stanford" as const,
      position: [55, 14.5] as [number, number],
    };
    expect(parseSave(JSON.stringify(previous))).toEqual({
      ...previous,
      position: [0, 5],
    });
    expect(
      parseSave(JSON.stringify({ ...previous, world: "home" })).position,
    ).toEqual(previous.position);
    for (const position of [
      [-73, 22],
      [58, 61],
      [20, 21.6],
    ])
      expect(
        parseSave(JSON.stringify({ ...previous, position })).position,
      ).toEqual(position);
  });
  it("keeps Stanford's existing animals on land after the coastline is tightened", () => {
    for (const animal of animalsInWorld("stanford"))
      for (let t = 0; t < 180; t += 0.4) {
        const { x, z } = animalPose(animal, t);
        expect(onStanfordLand(x, z, 0.5), `${animal.kind}: ${x},${z}`).toBe(
          true,
        );
        if (animal.kind !== "duck")
          expect(canWalk(x, z, "stanford"), `${animal.kind}: ${x},${z}`).toBe(
            true,
          );
      }
  });
  it("gives Places a continuous Boathouse route from each relocated doorway", () => {
    const boat = destinationsInWorld("stanford").find(
      ({ id }) => id === "boathouse",
    )!;
    useGame.setState({ scene: "hub", world: "stanford" });
    const starts = [
      [0, 5],
      [20, 21.6],
      [-73, ISLAND_RAIL.station[1]],
      [58, 61],
      ...doorsInWorld("stanford")
        .filter(({ id }) => id !== "boathouse")
        .map(({ x, z }) => [x, z]),
    ];
    for (const [x, z] of starts) {
      expect(canWalk(x, z, "stanford"), `${x},${z}`).toBe(true);
      runtime.x = x;
      runtime.z = z;
      walkTo(boat.x, boat.z);
      expect(runtime.target, `${x},${z}`).not.toBeNull();
      let position: [number, number] = [x, z];
      for (const waypoint of [runtime.target!, ...runtime.path]) {
        const moved = moveWorld(
          ...position,
          waypoint[0] - position[0],
          waypoint[1] - position[1],
          "stanford",
        );
        expect(
          Math.hypot(moved[0] - waypoint[0], moved[1] - waypoint[1]),
          `${x},${z}`,
        ).toBeLessThan(0.01);
        position = moved;
      }
      expect(
        Math.hypot(position[0] - boat.x, position[1] - boat.z),
      ).toBeLessThan(1.2);
    }
  });
  it("keeps every resident individually reachable for a conversation", () => {
    const ids = new Set(
      villagers
        .filter((npc) => belongsToWorld(npc.place, "stanford"))
        .map((npc) => npc.id),
    );
    const actors = createNpcActors().filter((actor) => ids.has(actor.id));
    for (const actor of actors)
      expect(nearestNpc(actors, actor.x, actor.z, "stanford")?.id).toBe(
        actor.id,
      );
  });
  it("keeps retained gardens out of the storefronts and new walking streets", () => {
    const plots = villageGardenPlots("stanford");
    expect(plots.length).toBeGreaterThan(0);
    for (const { x, z, orchard } of plots) {
      const halfX = orchard ? 0.35 : 0.85,
        halfZ = orchard ? 0.35 : 1.5;
      for (const {
        footprint: [cx, cz, hx, hz],
      } of doorsInWorld("stanford"))
        expect(
          Math.abs(x - cx) < hx + halfX + 0.3 &&
            Math.abs(z - cz) < hz + halfZ + 0.3,
        ).toBe(false);
      for (const [cx, cz, width, depth] of STANFORD_WALKS)
        expect(
          Math.abs(x - cx) < width / 2 + halfX &&
            Math.abs(z - cz) < depth / 2 + halfZ,
        ).toBe(false);
    }
  });
  it("keeps neighboring, full-size storefronts a short walk apart", () => {
    const row = ["gym", "kappa", "math", "badminton"].map(
      (id) => doorsInWorld("stanford").find((door) => door.id === id)!,
    );
    for (let i = 1; i < row.length; i++) {
      const previous = row[i - 1],
        next = row[i];
      const gap =
        next.footprint[0] -
        next.footprint[2] -
        previous.footprint[0] -
        previous.footprint[2];
      expect(gap).toBeGreaterThan(0.6);
      expect(gap).toBeLessThan(3);
      expect(Math.hypot(next.x - previous.x, next.z - previous.z)).toBeLessThan(
        14,
      );
    }
    expect(row.map((door) => door.scale)).toEqual([
      [1.5, 1.2, 1.5],
      [1.5, 1.2, 1.5],
      [1.5, 1.2, 1.5],
      [1, 1, 1],
    ]);
  });

  it("connects the entrance to every moved door, campus stop and hidden-key approach", () => {
    const targets = [
      ...destinationsInWorld("stanford").map(
        (door) => [door.x, door.z] as [number, number],
      ),
      ...Object.values(campusStops),
      [...HOOVER.key] as [number, number],
      [...HOOVER.door] as [number, number],
    ];
    for (const target of targets) {
      expect(canWalk(...target, "stanford"), `${target}`).toBe(true);
      let position: [number, number] = [20, 21.6];
      const path = findPath(position, target, "stanford");
      expect(path.length, `${target}`).toBeGreaterThan(0);
      for (const waypoint of path) {
        const moved = moveWorld(
          ...position,
          waypoint[0] - position[0],
          waypoint[1] - position[1],
          "stanford",
        );
        expect(
          Math.hypot(moved[0] - waypoint[0], moved[1] - waypoint[1]),
          `${target}`,
        ).toBeLessThan(0.01);
        position = moved;
      }
      expect(
        Math.hypot(position[0] - target[0], position[1] - target[1]),
      ).toBeLessThan(1.2);
    }
  });

  it("keeps the new connecting street centerlines clear of physical obstacles", () => {
    // Core frontage and links; transport/shared-landmark trails retain their existing scenery.
    for (const [x, z, width, depth] of STANFORD_WALKS.slice(0, 10)) {
      const horizontal = width > depth;
      const length = Math.max(width, depth);
      for (
        let distance = -length / 2 + 0.4;
        distance <= length / 2 - 0.4;
        distance += 0.2
      ) {
        const point = horizontal ? [x + distance, z] : [x, z + distance];
        expect(canWalk(point[0], point[1], "stanford"), `${point}`).toBe(true);
      }
    }
  });
});
