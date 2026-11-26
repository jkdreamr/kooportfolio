import { describe, expect, it } from "vitest";
import {
  KOREA_SIGHTS,
  KOREA_SIGHT_PAVING,
  KOREA_SIGHT_SOLIDS,
} from "../src/game/core/koreaSights";
import { KOREA_VISITORS } from "../src/game/core/koreaVisitors";
import { isOnKoreaLand } from "../src/game/core/koreaDistrict";
import { isKoreaGardenWalk } from "../src/game/core/koreaLandmarks";
import { terrainHeightAt } from "../src/game/core/terrain";
import { villagers } from "../src/game/core/npcs";
import {
  canWalk,
  destinationsInWorld,
  findPath,
} from "../src/game/core/world";
import { journeyGate } from "../src/game/core/journey";

const places = destinationsInWorld("korea");
const gap = ([cx, cz, hx, hz]: readonly number[], x: number, z: number) =>
  Math.hypot(
    Math.max(0, Math.abs(x - cx) - hx),
    Math.max(0, Math.abs(z - cz) - hz),
  );
// Hillside pieces sit on the unwalkable terrain above the streets.
const onHill = ([cx, cz]: readonly number[]) =>
  terrainHeightAt(cx, cz, "korea") > 0;

describe("Korea sights placement", () => {
  it("keeps every new footprint well clear of doors, landmarks and gates", () => {
    const gates = [journeyGate("plane", "korea")];
    for (const solid of KOREA_SIGHT_SOLIDS) {
      for (const place of places)
        expect(gap(solid, place.x, place.z), `${solid} vs ${place.id}`).toBeGreaterThan(2);
      for (const [x, z] of gates)
        expect(gap(solid, x, z), `${solid} vs gate`).toBeGreaterThan(4);
    }
  });

  it("sits on land, off the garden walks (hillside pieces on the hill)", () => {
    for (const solid of KOREA_SIGHT_SOLIDS) {
      const [cx, cz, hx, hz] = solid;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [0, 0],
      ]) {
        const x = cx + sx * hx,
          z = cz + sz * hz;
        if (onHill(solid)) {
          expect(isOnKoreaLand(x, z), `${solid} hill`).toBe(false);
          continue;
        }
        expect(isOnKoreaLand(x, z, 0.3), `${solid} on land`).toBe(true);
        expect(isKoreaGardenWalk(x, z), `${solid} on a walk`).toBe(false);
      }
    }
    for (const [x, z] of KOREA_SIGHT_PAVING)
      expect(isOnKoreaLand(x, z), `paving ${x},${z}`).toBe(true);
  });

  it("is solid for the player", () => {
    for (const [cx, cz] of KOREA_SIGHT_SOLIDS)
      expect(canWalk(cx, cz, "korea"), `${cx},${cz}`).toBe(false);
  });

  it("keeps Sungnyemun's arch and the main routes walkable", () => {
    const { x, z } = KOREA_SIGHTS.sungnyemun;
    expect(canWalk(x, z, "korea")).toBe(true);
    expect(findPath([x - 5, z], [x + 5, z], "korea").length).toBeGreaterThan(0);
    // Every door / landmark approach is still reachable from the plaza.
    for (const place of places)
      expect(findPath([0, 5], [place.x, place.z], "korea").length, place.id).toBeGreaterThan(0);
  });

  it("adds 5-8 visitors with 2-4 short lines each, on walkable loops", () => {
    expect(KOREA_VISITORS.length).toBeGreaterThanOrEqual(5);
    expect(KOREA_VISITORS.length).toBeLessThanOrEqual(8);
    for (const visitor of KOREA_VISITORS) {
      expect(villagers.some((v) => v.id === visitor.id)).toBe(true);
      expect(visitor.lines.length).toBeGreaterThanOrEqual(2);
      expect(visitor.lines.length).toBeLessThanOrEqual(4);
      for (const line of visitor.lines) expect(line.length).toBeLessThan(140);
      for (const [x, z] of visitor.route)
        expect(canWalk(x, z, "korea"), `${visitor.id} ${x},${z}`).toBe(true);
      expect(places.some((p) => p.id === visitor.place), visitor.id).toBe(true);
    }
  });

  it("does not strand any existing Korea villager", () => {
    for (const npc of villagers) {
      if (!npc.route.every(([x, z]) => isOnKoreaLand(x, z))) continue;
      for (const [x, z] of npc.route)
        for (const solid of KOREA_SIGHT_SOLIDS)
          expect(gap(solid, x, z), `${npc.id} ${x},${z}`).toBeGreaterThan(0.3);
    }
  });
});
