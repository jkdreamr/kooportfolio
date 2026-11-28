import { describe, expect, it } from "vitest";
import {
  freshSave,
  parseSave,
  writeGuestSave,
  SAVE_KEY,
} from "../src/shared/save";
import {
  canWalk,
  destinationsInWorld,
  doors,
  findPath,
  moveWorld,
} from "../src/game/core/world";
import { WORLD_IDS } from "../src/game/core/worlds";
import { dailySeed } from "../src/game/core/rowing";
import {
  launchBall,
  stepBall,
  type BallState,
} from "../src/game/core/basketball";
import { campusObstacles, campusStops } from "../src/game/core/campus";

describe("guest save trust boundary", () => {
  it("keeps earned progress after exploring the expanded village edges", () => {
    for (const position of [
      [19, 0],
      [-19, 0],
      [0, 16],
      [0, -17],
      [28, 0],
      [-28, 0],
      [0, 32],
      [0, -33],
    ] as [number, number][]) {
      expect(canWalk(...position)).toBe(true);
      const save = {
        ...freshSave(),
        position,
        memories: ["race-1"],
        revision: 1,
      };
      expect(parseSave(JSON.stringify(save))).toEqual(save);
    }
  });
  it("refuses a stale tab write after another tab progresses", () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
    const baseline = writeGuestSave(storage, freshSave(), null);
    const earned = { ...freshSave(), memories: ["race"], revision: 1 };
    expect(writeGuestSave(storage, earned, baseline)).not.toBeNull();
    expect(writeGuestSave(storage, freshSave(), baseline)).toBeNull();
    expect(parseSave(storage.getItem(SAVE_KEY)).memories).toEqual(["race"]);
  });
  it("round trips actual progress and rejects corrupt or unknown schema", () => {
    const save = { ...freshSave(), memories: ["finish-1"], revision: 1 };
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    for (const raw of [
      "{bad",
      "null",
      "{}",
      JSON.stringify({ ...save, version: 2 }),
      JSON.stringify({ ...save, position: [Infinity, 0] }),
    ])
      expect(() => parseSave(raw)).toThrow();
    expect(parseSave(null).memories).toEqual([]);
  });
  it("drops legacy economy fields from old saves", () => {
    const legacy = {
      ...freshSave(),
      coins: 120,
      xp: 30,
      upgrades: { boathouse: 2, garden: 3, kitchen: 1 },
      collectedAt: 5,
      rewards: ["x"],
      bestRace: 40,
      bestBasket: 7,
    };
    expect(parseSave(JSON.stringify(legacy))).toEqual(freshSave());
  });
});
describe("walkable physical world", () => {
  it("follows the Kitchen marker from the plaza without a perimeter stall", () => {
    const kitchen = doors.find((door) => door.id === "kitchen")!;
    for (const start of [
      [0, 5],
      [-3.8, 16.4],
      [-12.4, 8.6],
    ] as [number, number][]) {
      let position = start;
      const path = findPath(position, [kitchen.x, kitchen.z]);
      expect(path.length).toBeGreaterThan(0);
      for (const target of path) {
        for (let frame = 0; frame < 120; frame++) {
          const dx = target[0] - position[0],
            dz = target[1] - position[1];
          const distance = Math.hypot(dx, dz);
          if (distance < 0.0001) break;
          const step = Math.min(4.6 / 60, distance);
          position = moveWorld(
            ...position,
            (dx / distance) * step,
            (dz / distance) * step,
          );
        }
        expect(
          Math.hypot(position[0] - target[0], position[1] - target[1]),
        ).toBeLessThan(0.001);
      }
      expect(
        Math.hypot(position[0] - kitchen.x, position[1] - kitchen.z),
      ).toBeLessThan(1.9);
    }
  });
  it("cannot tunnel through a building or leave the island", () => {
    const house = doors.find((door) => door.id === "boathouse")!;
    expect(moveWorld(house.x, house.z + 2, 0, -8)[1]).toBeGreaterThan(
      house.footprint[1] + house.footprint[3],
    );
    const p = moveWorld(0, 5, 100, 100);
    expect(canWalk(...p)).toBe(true);
  });
  it.each(WORLD_IDS)(
    "finds collision-free paths to every %s destination",
    (world) => {
      for (const door of destinationsInWorld(world)) {
        const path = findPath([0, 5], [door.x, door.z], world);
        expect(path.length, door.id).toBeGreaterThan(0);
        expect(
          path.every((p) => canWalk(...p, world)),
          door.id,
        ).toBe(true);
        expect(
          Math.hypot(path.at(-1)![0] - door.x, path.at(-1)![1] - door.z),
          door.id,
        ).toBeLessThan(1.2);
      }
    },
  );
  it("reaches every rotated campus stop without crossing its buildings", () => {
    for (const [x, z] of campusObstacles) expect(canWalk(x, z)).toBe(false);
    for (const [name, target] of Object.entries(campusStops)) {
      expect(canWalk(...target), name).toBe(true);
      const path = findPath([0, 5], target);
      expect(path.length, name).toBeGreaterThan(0);
      expect(
        path.every((p) => canWalk(...p)),
        name,
      ).toBe(true);
      let position: [number, number] = [0, 5];
      for (const waypoint of path) {
        for (let frame = 0; frame < 120; frame++) {
          const dx = waypoint[0] - position[0],
            dz = waypoint[1] - position[1];
          const distance = Math.hypot(dx, dz);
          if (distance < 0.0001) break;
          const step = Math.min(4.6 / 60, distance);
          position = moveWorld(
            ...position,
            (dx / distance) * step,
            (dz / distance) * step,
          );
        }
        expect(
          Math.hypot(position[0] - waypoint[0], position[1] - waypoint[1]),
          name,
        ).toBeLessThan(0.001);
      }
      expect(
        Math.hypot(position[0] - target[0], position[1] - target[1]),
        name,
      ).toBeLessThan(1.2);
    }
  });
  it("can navigate between distant districts and keeps every destination reachable", () => {
    for (const start of doors)
      for (const destination of doors) {
        if (start === destination) continue;
        const path = findPath(
          [start.x, start.z],
          [destination.x, destination.z],
        );
        expect(path.length, `${start.id} → ${destination.id}`).toBeGreaterThan(
          0,
        );
        expect(path.every((p) => canWalk(...p))).toBe(true);
        expect(
          Math.hypot(
            path.at(-1)![0] - destination.x,
            path.at(-1)![1] - destination.z,
          ),
        ).toBeLessThan(1.2);
      }
  }, 15000);
  it("traverses a Study-to-Court corner without cutting the collision edge", () => {
    const study = doors.find((door) => door.id === "office")!,
      court = doors.find((door) => door.id === "basketball")!;
    let position: [number, number] = [study.x, study.z];
    const path = findPath(position, [court.x, court.z]);
    for (const target of path) {
      for (let frame = 0; frame < 200; frame++) {
        const dx = target[0] - position[0],
          dz = target[1] - position[1],
          distance = Math.hypot(dx, dz);
        if (distance < 0.0001) break;
        const step = Math.min(4.6 / 60, distance);
        position = moveWorld(
          ...position,
          (dx / distance) * step,
          (dz / distance) * step,
        );
      }
      expect(
        Math.hypot(position[0] - target[0], position[1] - target[1]),
      ).toBeLessThan(0.001);
    }
    expect(
      Math.hypot(position[0] - court.x, position[1] - court.z),
    ).toBeLessThan(1.9);
  });
});
describe("rowing simulation", () => {
  // The race itself is covered by rowing.test.ts and rowing.tuning.test.ts.
  it("uses the UTC calendar date for daily practice", () => {
    expect(dailySeed(new Date("2026-11-23T00:01Z"))).toBe(
      dailySeed(new Date("2026-11-23T23:59Z")),
    );
    expect(dailySeed(new Date("2026-11-24T00:00Z"))).not.toBe(
      dailySeed(new Date("2026-11-23T23:59Z")),
    );
  });
});
describe("basketball physics", () => {
  const shoot = (charge: number, aim = 0) => {
    let b = launchBall(0, 5, charge, aim),
      scores = 0;
    for (let i = 0; i < 480; i++) {
      const next = stepBall(b, 1 / 120);
      b = next.ball;
      scores += Number(next.score);
    }
    return { b, scores };
  };
  it("scores a timed shot only once and misses underpowered or mis-aimed shots", () => {
    expect(shoot(0.62).scores).toBe(1);
    expect(shoot(0.05).scores).toBe(0);
    expect(shoot(0.62, 0.5).scores).toBe(0);
  });
  it("bounces off floor, solid board and rim", () => {
    const make = (p: BallState["p"], v: BallState["v"]): BallState => ({
      p,
      v,
      age: 0,
      bounced: false,
      scored: false,
    });
    expect(
      stepBall(make({ x: 0, y: 0.24, z: 0 }, { x: 0, y: -3, z: 0 }), 1 / 60)
        .ball.v.y,
    ).toBeGreaterThan(0);
    expect(
      stepBall(make({ x: 0, y: 4, z: -5.45 }, { x: 0, y: 0, z: -5 }), 1 / 60)
        .ball.v.z,
    ).toBeGreaterThan(0);
    expect(
      stepBall(make({ x: 0.53, y: 3.3, z: -5 }, { x: 0, y: -1, z: 0 }), 1 / 120)
        .collision,
    ).toBe(true);
  });
});
