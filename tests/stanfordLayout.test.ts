import { describe, expect, it } from "vitest";
import {
  canWalk,
  doorsInWorld,
  findPath,
  moveWorld,
} from "../src/game/core/world";
import { campusStops } from "../src/game/core/campus";
import { HOOVER } from "../src/game/core/hoover";
import { STANFORD_WALKS } from "../src/game/core/stanfordLayout";
import { villageGardenPlots } from "../src/game/core/villageGardens";
import { createNpcActors, nearestNpc, villagers } from "../src/game/core/npcs";
import { belongsToWorld } from "../src/game/core/worlds";

describe("compact Stanford village", () => {
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
      ...doorsInWorld("stanford").map(
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
