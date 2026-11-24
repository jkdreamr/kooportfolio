import { describe, expect, it } from "vitest";
import {
  WORLDS,
  WORLD_IDS,
  validJourney,
  belongsToWorld,
} from "../src/game/core/worlds";
import { canWalk, destinationsInWorld, findPath } from "../src/game/core/world";
import { freshSave, parseSave } from "../src/shared/save";
import { runtime, useGame } from "../src/game/core/store";
import { activitySpots } from "../src/game/core/regionalActivities";

describe("separate worlds", () => {
  it.each(activitySpots)("keeps $id reachable in $world", ({ world, p }) => {
    expect(canWalk(...p, world)).toBe(true);
    const route = findPath([0, 5], [...p], world);
    expect(route.length).toBeGreaterThan(0);
    expect(route.every(([x, z]) => canWalk(x, z, world))).toBe(true);
  });
  it("places every requested room in its region without cross-world ghost buildings", () => {
    expect(belongsToWorld("office", "home")).toBe(true);
    expect(belongsToWorld("kappa", "stanford")).toBe(true);
    expect(belongsToWorld("cognition", "korea")).toBe(true);
    expect(belongsToWorld("cognition", "home")).toBe(false);
    expect(belongsToWorld("theater", "korea")).toBe(true);
    expect(belongsToWorld("theater", "home")).toBe(true);
    // The Home grocer now occupies x=18; the west lab edge remains Home lawn.
    expect(canWalk(15, -14, "home")).toBe(true);
    expect(canWalk(15, -14, "korea")).toBe(false);
    expect(WORLDS.home.timeZone).toBe(WORLDS.stanford.timeZone);
    expect(WORLDS.korea.timeZone).toBe("Asia/Seoul");
  });
  it.each(WORLD_IDS)(
    "keeps every %s destination, telescope and transport approach reachable",
    (world) => {
      for (const place of destinationsInWorld(world)) {
        expect(canWalk(place.x, place.z, world), place.id).toBe(true);
        const route = findPath([0, 5], [place.x, place.z], world);
        expect(route.length, place.id).toBeGreaterThan(0);
        expect(
          route.every(([x, z]) => canWalk(x, z, world)),
          place.id,
        ).toBe(true);
      }
    },
  );
  it("blocks Han River water and rails, not the walkable bridge", () => {
    expect(canWalk(45, 26, "korea")).toBe(false);
    expect(canWalk(45, 41, "korea")).toBe(false);
    expect(canWalk(45, 30.38, "korea")).toBe(false);
    for (let x = 26; x <= 64; x++)
      expect(canWalk(x, 34, "korea"), `bridge x=${x}`).toBe(true);
    expect(canWalk(45, 26, "home")).toBe(true);
  });
  it("requires a plane for Korea and car/train for domestic travel", () => {
    expect(validJourney("home", "stanford", "train")).toBe(true);
    expect(validJourney("stanford", "home", "car")).toBe(true);
    expect(validJourney("home", "stanford", "plane")).toBe(false);
    expect(validJourney("korea", "home", "train")).toBe(false);
    expect(validJourney("stanford", "korea", "car")).toBe(false);
    expect(validJourney("home", "korea", "plane")).toBe(true);
  });
  it("migrates old saves without losing coins, memories or progress", () => {
    const original = { ...freshSave(), coins: 79, memories: ["hoover-key"] };
    const legacy = { ...original, world: undefined };
    expect(parseSave(JSON.stringify(legacy))).toEqual(original);
    expect(() =>
      parseSave(JSON.stringify({ ...original, world: "unknown" })),
    ).toThrow();
  });
  it("resets movement at valid arrivals, preserves progress, and reloads the region", () => {
    useGame.setState({
      world: "home",
      scene: "hub",
      save: { ...freshSave(), coins: 79 },
    });
    runtime.x = 0;
    runtime.z = 5;
    useGame.getState().travel("korea", "train");
    expect(useGame.getState().world).toBe("home");
    runtime.path = [[2, 2]];
    runtime.target = [1, 1];
    useGame.getState().travel("stanford", "train");
    expect(useGame.getState().world).toBe("stanford");
    expect([runtime.x, runtime.z]).toEqual([-73, 22]);
    expect(canWalk(runtime.x, runtime.z, "stanford")).toBe(true);
    expect(runtime.path).toEqual([]);
    expect(runtime.target).toBe(null);
    useGame.getState().travel("korea", "plane");
    expect([runtime.x, runtime.z]).toEqual([58, 61]);
    const save = parseSave(JSON.stringify(useGame.getState().save));
    expect(save.world).toBe("korea");
    expect(save.coins).toBe(79);
  });
});
