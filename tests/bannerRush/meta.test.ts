import { describe, expect, it } from "vitest";
import { applyRibbons, dailyConfig, dailyScore, freshProfile, ownedCards, parseProfile, ribbonDelta, stampsFor, tierFor, unlockedBy } from "../../src/game/core/bannerRush/meta";
import { validDeck } from "../../src/game/core/bannerRush/cards";

describe("Banner Rush meta", () => {
  it("T-M1 parseProfile repairs anything and never throws", () => {
    expect(parseProfile(JSON.stringify(freshProfile()))).toEqual(freshProfile());
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const junk = (d: number): unknown => {
      const r = rnd();
      if (d > 3 || r < 0.2) return [null, 1, "x", true, -5, 1e9, NaN][Math.floor(rnd() * 7)];
      if (r < 0.6) return Object.fromEntries(["ribbons", "decks", "daily", "settings", "wins", "tutorialDone", "x"].map((k) => [k, junk(d + 1)]));
      return Array.from({ length: Math.floor(rnd() * 9) }, () => junk(d + 1));
    };
    for (let i = 0; i < 500; i++) {
      const p = parseProfile(JSON.stringify(junk(0)));
      expect(p.ribbons).toBeGreaterThanOrEqual(0);
      p.decks.forEach((d) => expect(validDeck(d)).toBe(true));
    }
    expect(parseProfile("{not json").v).toBe(1);
    expect(parseProfile(JSON.stringify({ daily: [{ day: "2026-11-28", bestScore: 5 }] })).daily).toEqual([]);
  });
  it("T-M2 Ribbons, floors at Ground gates, tiers and three-loss relief", () => {
    expect(ribbonDelta("win", 3, "sprout")).toBe(36);
    expect(ribbonDelta("loss", 0, "maxed")).toBe(-22);
    expect(applyRibbons(5, 5, -10).ribbons).toBe(0);
    expect(applyRibbons(305, 320, -22).ribbons).toBe(300);
    expect(tierFor(100)).toBe("sprout");
    expect(tierFor(450)).toBe("captain");
    expect(tierFor(450, 3)).toBe("villager");
  });
  it("T-M3 unlocks from wins", () => {
    expect(ownedCards(0)).toHaveLength(11);
    expect(ownedCards(15)).toHaveLength(17);
    expect(unlockedBy(0, 1)).toBe("kites");
    expect(unlockedBy(1, 2)).toBeNull();
  });
  it("T-M4 daily config is stable per day and varies across days; score bounds", () => {
    expect(dailyConfig(20500)).toEqual(dailyConfig(20500));
    const seeds = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(dailyConfig(20500 + i).deck)));
    expect(seeds.size).toBeGreaterThan(25);
    for (let i = 0; i < 30; i++) expect(validDeck(dailyConfig(20500 + i).deck)).toBe(true);
    expect(dailyScore(0, 3, 0, false, 200)).toBe(0);
    expect(dailyScore(3, 0, 10400, true, 100)).toBe(3000 + 520 + 200);
  });
  it("T-M5 stampsFor returns each of the three ids when earned", () => {
    const a = freshProfile();
    const b = { ...a, wins: 1, bestRibbons: 330, ribbons: 330 };
    expect(stampsFor(a, b, { won: true, banners: 3, daily: false }).sort()).toEqual(["home.banner", "home.ground", "home.keep"]);
    expect(stampsFor(b, { ...b, wins: 2 }, { won: true, banners: 1, daily: false })).toEqual([]);
  });
});
