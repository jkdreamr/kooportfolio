import { describe, expect, it } from "vitest";
import { freshSave, parseSave, reward } from "../src/shared/save";
import {
  HOOVER,
  collectHooverKey,
  claimHooverStash,
} from "../src/game/core/hoover";
import { canWalk, findPath } from "../src/game/core/world";
import { moveInterior } from "../src/game/core/houseRooms";

describe("Hoover discovery", () => {
  it("keeps key and door approaches outside the tower, with a walkable route", () => {
    for (const point of [HOOVER.key, HOOVER.door]) {
      expect(canWalk(point[0], point[1])).toBe(true);
      expect(findPath([20, 20], [...point]).length).toBeGreaterThan(0);
    }
  });
  it("requires the key and preserves the one-time stash after reload and recent-run eviction", () => {
    const empty = freshSave();
    expect(claimHooverStash(empty)).toBe(empty);
    const keyed = collectHooverKey(empty);
    expect(collectHooverKey(keyed)).toBe(keyed);
    let save = claimHooverStash(keyed);
    expect(save.coins).toBe(75);
    for (let i = 0; i < 300; i++) save = reward(save, `run-${i}`, 0, 0);
    const reloaded = parseSave(JSON.stringify(save));
    expect(claimHooverStash(reloaded)).toBe(reloaded);
    expect(reloaded.coins).toBe(75);
  });
  it("stops walking through the chest while leaving a wide collection approach", () => {
    const [x, z] = moveInterior("secret", 0, 0, 0, -6);
    expect(x).toBe(0);
    expect(z).toBeGreaterThan(-1.2);
    expect(Math.hypot(x, z + 3)).toBeLessThan(3);
  });
});
