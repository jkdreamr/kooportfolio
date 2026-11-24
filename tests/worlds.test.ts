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
import { grassSites } from "../src/game/core/scenery";
import { HOME_PATH_FOOTPRINTS } from "../src/game/world/HomeWorldEnvironment";
import { KOREA_RIVER_FOOTPRINT } from "../src/game/world/KoreaRiverGround";
import {
  isKoreaLandmarkArea,
  KOREA_GARDEN_WALKS,
  KOREA_LANDMARK_DESTINATIONS,
  KOREA_LANDMARK_FOOTPRINTS,
  KOREA_LANDMARK_SOLIDS,
  KOREA_LANDMARKS,
} from "../src/game/core/koreaLandmarks";
import { villageGardenPlots } from "../src/game/core/villageGardens";

describe("separate worlds", () => {
  it.each([
    ["Home paths and sidewalks", HOME_PATH_FOOTPRINTS],
    ["the Han River", [KOREA_RIVER_FOOTPRINT]],
    [
      "the Korea landmarks and garden walks",
      [...KOREA_LANDMARK_FOOTPRINTS, ...KOREA_GARDEN_WALKS],
    ],
  ] as const)("keeps grass out of %s", (_name, footprints) => {
    const sites = grassSites([]);
    const protectedSite = ({ x, z }: (typeof sites)[number]) =>
      footprints.some(
        ([cx, cz, width, depth]) =>
          Math.abs(x - cx) <= width / 2 + 0.12 &&
          Math.abs(z - cz) <= depth / 2 + 0.12,
      );
    expect(sites.some(protectedSite)).toBe(true);
    expect(grassSites(footprints)).toEqual(
      sites.filter((site) => !protectedSite(site)),
    );
  });
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
  it("lists each Seoul landmark once and connects the airport to it", () => {
    const korea = destinationsInWorld("korea");
    const airport = korea.find(({ id }) => id === "airport")!;
    for (const { id, x, z } of KOREA_LANDMARK_DESTINATIONS) {
      expect(korea.filter((place) => place.id === id)).toHaveLength(1);
      expect(belongsToWorld(id, "home")).toBe(false);
      expect(belongsToWorld(id, "stanford")).toBe(false);
      const route = findPath([airport.x, airport.z], [x, z], "korea");
      expect(route.length, id).toBeGreaterThan(0);
      expect(
        route.every(([px, pz]) => canWalk(px, pz, "korea")),
        id,
      ).toBe(true);
    }
  });
  it("blocks the landmark buildings without blocking the Bukchon lane", () => {
    for (const [x, z] of KOREA_LANDMARK_SOLIDS) {
      expect(canWalk(x, z, "korea"), `${x}, ${z}`).toBe(false);
    }
    const [x, z] = KOREA_LANDMARKS.village.origin;
    for (let dx = -7; dx <= 7; dx += 0.5) {
      for (const dz of [-0.9, 0, 0.9]) {
        expect(canWalk(x + dx, z + dz, "korea"), `${dx}, ${dz}`).toBe(true);
      }
    }
  });
  it("clears gardens from landmark approaches in Korea only", () => {
    const overlaps = ({ x, z }: { x: number; z: number }) =>
      isKoreaLandmarkArea(x, z, 2);
    expect(villageGardenPlots("korea").some(overlaps)).toBe(false);
    expect(villageGardenPlots("home").some(overlaps)).toBe(true);
  });
  it("plants on both sides of the Korea garden walks without blocking them", () => {
    const plots = villageGardenPlots("korea");
    for (const [x, z, width, depth] of KOREA_GARDEN_WALKS) {
      const horizontal = width > depth;
      const [dx, dz] = horizontal ? [width / 2, 0] : [0, depth / 2];
      for (let i = -10; i <= 10; i++) {
        for (const across of [-0.5, 0, 0.5]) {
          const px = x + (dx * i) / 10 + (horizontal ? 0 : across);
          const pz = z + (dz * i) / 10 + (horizontal ? across : 0);
          expect(canWalk(px, pz, "korea"), `garden walk at ${px}, ${pz}`).toBe(
            true,
          );
        }
      }
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        expect(
          plots.filter(
            ({ x, z }) =>
              x > -47 &&
              x < -6 &&
              z > -33 &&
              z < 10 &&
              Math.sign(x + 23.5) === sx &&
              Math.sign(z + 14.4) === sz,
          ).length,
        ).toBeGreaterThan(4);
      }
    }
  });
  it("plants the west shore and connects its path to the picnic deck", () => {
    const plots = villageGardenPlots("korea");
    expect(
      plots.filter(
        ({ x, z, orchard }) => orchard && x < -58 && z >= 36 && z < 49,
      ).length,
    ).toBeGreaterThan(8);
    expect(
      plots.filter(
        ({ x, z, orchard }) => !orchard && x > -54 && x < -42 && z > 16 && z < 32,
      ).length,
    ).toBeGreaterThan(4);
    expect(findPath([-69, 12], [-44, 43], "korea").length).toBeGreaterThan(0);
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
