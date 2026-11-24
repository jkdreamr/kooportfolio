import { describe, expect, it } from "vitest";
import {
  activitySpots,
  BOOK_RESHELVE_SECONDS,
  COINS,
  freshActivities,
  PARCEL_DOORS,
  stepRegionalActivity as step,
  nearbyRegionalActivity,
  regionalActionLabel,
  regionalPayout,
} from "../src/game/core/regionalActivities";
import { canWalk } from "../src/game/core/world";

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
    expect(nearbyRegionalActivity("stanford", -14.5, 0)).toBeUndefined();
    expect(nearbyRegionalActivity("home", 0, 5)).toBeUndefined();
    expect(nearbyRegionalActivity("home", -14.5, 0)?.id).toBe("harvest-0");
    expect(nearbyRegionalActivity("korea", 39, 10.6)?.id).toBe("ramen");
    expect(nearbyRegionalActivity("home", 39, 10.6)).toBeUndefined();
  });
});

describe("coin-earning side quests", () => {
  it("pays for delivered produce by garden level and for served ramen", () => {
    let s = step(step(freshActivities(), "harvest-0", 0), "harvest-1", 0);
    expect(regionalPayout(s, "produce", 1, 1)).toBe(2 * COINS.crop);
    expect(regionalPayout(s, "produce", 1, 3)).toBe(6 * COINS.crop);
    expect(regionalPayout(freshActivities(), "produce", 1)).toBe(0);
    s = step(s, "ramen", 2);
    expect(regionalPayout(s, "picnic", 3)).toBe(COINS.ramen);
    expect(regionalPayout(step(s, "picnic", 3), "picnic", 4)).toBe(0);
  });
  it("routes each parcel to one door and only offers that drop-off while carrying it", () => {
    let s = freshActivities();
    const [x, z] = PARCEL_DOORS[0].p;
    expect(nearbyRegionalActivity("home", x, z, s)).toBeUndefined();
    s = step(s, "postbox", 0);
    expect(s.parcel).toBe(0);
    expect(step(s, "postbox", 1)).toBe(s);
    expect(nearbyRegionalActivity("home", x, z, s)?.id).toBe("parcel-0");
    expect(regionalPayout(s, "parcel-1", 1)).toBe(0);
    expect(step(s, "parcel-1", 1)).toBe(s);
    expect(regionalPayout(s, "parcel-0", 1)).toBe(COINS.parcel);
    s = step(s, "parcel-0", 1);
    expect([s.parcel, s.parcelsDelivered]).toEqual([null, 1]);
    expect(step(s, "postbox", 2).parcel).toBe(1);
  });
  it("collects campus books, pays on return and reshelves them later", () => {
    let s = step(step(freshActivities(), "book-0", 0), "book-2", 0);
    expect(step(s, "book-0", 10)).toBe(s);
    expect(regionalActionLabel(s, "bookdrop", 1)).toBe("Return 2 books");
    expect(regionalPayout(s, "bookdrop", 1)).toBe(2 * COINS.book);
    s = step(s, "bookdrop", 1);
    expect([s.books, s.booksReturned]).toEqual([0, 2]);
    expect(step(s, "book-0", BOOK_RESHELVE_SECONDS).books).toBe(1);
  });
  it("pays a fish only when reeled inside the bite window", () => {
    let s = step(freshActivities(), "fish-0", 0, () => 0);
    expect(s.biteAt[0]).toBe(3);
    expect(regionalActionLabel(s, "fish-0", 1)).toBe("Waiting");
    expect(step(s, "fish-0", 1)).toBe(s);
    expect(regionalPayout(s, "fish-0", 1)).toBe(0);
    expect(regionalPayout(s, "fish-0", 4)).toBe(COINS.fish);
    const caught = step(s, "fish-0", 4);
    expect([caught.biteAt[0], caught.fishCaught]).toEqual([null, 1]);
    expect(regionalActionLabel(s, "fish-0", 6)).toBe("Got away · Cast");
    expect(regionalPayout(s, "fish-0", 6)).toBe(0);
    s = step(s, "fish-0", 6, () => 0.5);
    expect([s.biteAt[0], s.fishCaught]).toEqual([11, 0]);
  });
  it("places every new spot on walkable ground in its own world", () => {
    for (const spot of activitySpots)
      expect(canWalk(spot.p[0], spot.p[1], spot.world), spot.id).toBe(true);
  });
});
