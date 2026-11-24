import { describe, expect, it } from "vitest";
import {
  freshActivities,
  stepRegionalActivity as step,
  nearbyRegionalActivity,
  regionalActionLabel,
} from "../src/game/core/regionalActivities";

describe("physical neighborhood activities", () => {
  it("removes harvested stock, respects basket capacity, and regrows instead of allowing repeated pickup", () => {
    let s = freshActivities();
    s = step(s, "harvest-0", 0);
    expect(s.basket).toBe(1);
    expect(step(s, "harvest-0", 34)).toBe(s);
    expect(regionalActionLabel(s, "harvest-0", 30)).toBe("Growing · 5s");
    s = step(step(s, "harvest-1", 1), "harvest-2", 2);
    expect(s.basket).toBe(3);
    expect(step(s, "harvest-3", 3)).toBe(s);
    s = step(s, "produce", 4);
    expect([s.basket, s.produceCrates]).toEqual([0, 3]);
    expect(step(s, "produce", 5)).toBe(s);
    expect(step(s, "harvest-0", 35).basket).toBe(1);
  });
  it("requires a carried bowl and a hungry picnic guest, then makes the loop repeatable", () => {
    const empty = freshActivities();
    expect(step(empty, "picnic", 0)).toBe(empty);
    let s = step(empty, "ramen", 0);
    expect(step(s, "ramen", 1)).toBe(s);
    s = step(s, "picnic", 2);
    expect([s.bowl, s.mealsServed, s.guestFedUntil]).toEqual([false, 1, 32]);
    s = step(s, "ramen", 3);
    expect(step(s, "picnic", 31)).toBe(s);
    expect(step(s, "picnic", 32).mealsServed).toBe(2);
  });
  it("offers actions only near their own region and chooses the closest garden bed", () => {
    expect(nearbyRegionalActivity("stanford", 16.5, 42)).toBeUndefined();
    expect(nearbyRegionalActivity("home", 0, 5)).toBeUndefined();
    expect(nearbyRegionalActivity("home", 16.5, 42)?.id).toBe("harvest-0");
    expect(nearbyRegionalActivity("korea", 39, 10.6)?.id).toBe("ramen");
    expect(nearbyRegionalActivity("home", 39, 10.6)).toBeUndefined();
  });
});
