import { describe, expect, it } from "vitest";
import {
  applyUse,
  bestUse,
  carriedIn,
  destinations,
  drop,
  dropExpired,
  DROP_RETURN_SECONDS,
  handsFull,
  pickUp,
  purposeOf,
  QUESTS,
  questStamps,
  spotOf,
} from "../src/game/core/carry";
import { freshActivities, stepRegionalActivity } from "../src/game/core/regionalActivities";
import { POND } from "../src/game/core/pond";
import { isStampId } from "../src/game/core/passport";

describe("carry", () => {
  it("knows what is in your hands, per world", () => {
    const s = { ...freshActivities(), basket: 2, books: 1, bowl: true };
    expect(carriedIn("home", s)?.kind).toBe("basket");
    expect(carriedIn("stanford", s)?.kind).toBe("book");
    expect(carriedIn("korea", s)?.kind).toBe("ramen");
    expect(carriedIn("home", freshActivities())).toBeNull();
  });

  it("points each item at its destination", () => {
    expect(destinations({ kind: "book", count: 1, parcel: null })[0]).toEqual(spotOf("bookdrop"));
    expect(destinations({ kind: "parcel", count: 1, parcel: 2 })[0]).toEqual(spotOf("parcel-2"));
  });

  it("one kind at a time", () => {
    const s = { ...freshActivities(), basket: 1 };
    expect(handsFull("home", s, "postbox")).toBe(true);
    expect(handsFull("home", s, "harvest-1")).toBe(false);
    expect(handsFull("home", s, "produce")).toBe(false);
  });

  it("every item has exactly one best use, or a reason", () => {
    const s = { ...freshActivities(), basket: 1, parcel: 0, bowl: true, books: 2 };
    for (const [world, kind] of [
      ["home", "basket"],
      ["home", "parcel"],
      ["korea", "ramen"],
      ["stanford", "book"],
    ] as const) {
      const c = { kind, count: 1, parcel: kind === "parcel" ? 0 : null };
      const away = bestUse(world, c, s, 500, 500, 0);
      expect(away.label.length).toBeGreaterThan(0);
      if (away.disabled) expect(away.reason).toBeTruthy();
      const [x, z] = destinations(c)[0];
      const there = bestUse(world, c, s, x, z, 0);
      expect(there.action).toBe("give");
    }
    const ducks = bestUse("home", { kind: "basket", count: 1, parcel: null }, s, POND.x + 4, POND.z, 0);
    expect(ducks).toMatchObject({ action: "feed-ducks" });
    expect(ducks.disabled).toBeFalsy();
    expect(applyUse(s, "feed-ducks").basket).toBe(0);
    expect(applyUse(s, "eat").bowl).toBe(false);
  });

  it("drop and pick up keep the item", () => {
    const s = { ...freshActivities(), books: 2 };
    const out = drop("stanford", s, 3, 4, 10);
    expect(out.play.books).toBe(0);
    expect(out.dropped).toMatchObject({ kind: "book", count: 2, x: 3, z: 4 });
    expect(pickUp("stanford", out.play, out.dropped!).books).toBe(2);
    expect(dropExpired(out.dropped!, 10 + DROP_RETURN_SECONDS - 1)).toBe(false);
    expect(dropExpired(out.dropped!, 10 + DROP_RETURN_SECONDS)).toBe(true);
  });

  it("quests ink real stamps once their goal is met", () => {
    for (const q of QUESTS) expect(isStampId(q.stamp)).toBe(true);
    let s = freshActivities();
    expect(questStamps(s)).toEqual([]);
    for (let i = 0; i < 3; i++) {
      s = stepRegionalActivity(s, "book-" + i as never, 0);
    }
    s = stepRegionalActivity(s, "bookdrop", 0);
    expect(questStamps(s)).toContain("stanford.books");
    const c = { kind: "book" as const, count: 1, parcel: null };
    expect(purposeOf("stanford", c, { ...s, books: 1, booksReturned: 1 }, () => false)).toMatch(/Overdue 1\/3/);
    expect(purposeOf("stanford", c, s, () => true)).toBe("Return to the book drop");
  });
});
