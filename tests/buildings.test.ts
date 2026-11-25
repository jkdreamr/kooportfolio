import { describe, expect, it } from "vitest";
import {
  gardenStored,
  kitchenBurners,
  raceCoins,
} from "../src/shared/buildings";
import {
  collectGarden,
  freshSave,
  parseSave,
  reward,
  upgrade,
} from "../src/shared/save";

const MIN = 60000;

describe("building perks", () => {
  it("fills the garden over time up to its storage cap", () => {
    expect(gardenStored(1, 0, 5 * MIN)).toBe(5);
    expect(gardenStored(1, 0, 600 * MIN)).toBe(20);
    expect(gardenStored(2, 0, 10 * MIN)).toBe(20);
    expect(gardenStored(3, 0, 600 * MIN)).toBe(150);
    expect(gardenStored(1, 10 * MIN, 0)).toBe(0);
  });

  it("collects stored garden coins once", () => {
    const s = freshSave(0);
    const collected = collectGarden(s, 7.5 * MIN);
    expect(collected.coins).toBe(7);
    expect(collected.collectedAt).toBe(7.5 * MIN);
    expect(collectGarden(collected, 7.5 * MIN)).toBe(collected);
    expect(collectGarden(s, 30000)).toBe(s);
  });

  it("banks the garden before upgrading it", () => {
    const s = reward(freshSave(0), "a", 40, 0);
    const next = upgrade(s, "garden", 10 * MIN);
    expect(next.coins).toBe(10);
    expect(next.upgrades.garden).toBe(2);
    expect(next.collectedAt).toBe(10 * MIN);
  });

  it("adds burners and race prizes per level", () => {
    expect([1, 2, 3].map(kitchenBurners)).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((level) => raceCoins(100, level))).toEqual([
      100, 125, 150,
    ]);
    let s = reward(freshSave(0), "a", 260, 0);
    s = upgrade(upgrade(s, "kitchen"), "kitchen");
    expect(s.upgrades.kitchen).toBe(3);
    expect(s.coins).toBe(0);
  });

  it("migrates saves from before the kitchen and garden collector", () => {
    const old = { ...freshSave(0), upgrades: { boathouse: 2, garden: 1 } };
    delete (old as Partial<typeof old>).collectedAt;
    const s = parseSave(JSON.stringify(old), 5 * MIN);
    expect(s.upgrades).toEqual({ boathouse: 2, garden: 1, kitchen: 1 });
    expect(s.collectedAt).toBe(5 * MIN);
    expect(parseSave(JSON.stringify(freshSave(9 * MIN)), MIN).collectedAt).toBe(
      MIN,
    );
  });
});
