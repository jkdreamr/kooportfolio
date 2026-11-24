import { describe, expect, it } from "vitest";
import {
  WORLDS,
  WORLD_IDS,
  validJourney,
  belongsToWorld,
} from "../src/game/core/worlds";
import {
  canWalk,
  destinationsInWorld,
  doorsInWorld,
  findPath,
} from "../src/game/core/world";
import { freshSave, parseSave } from "../src/shared/save";
import { runtime, useGame } from "../src/game/core/store";
import { activitySpots } from "../src/game/core/regionalActivities";
import { grassSites } from "../src/game/core/scenery";
import { HOME_PATH_FOOTPRINTS } from "../src/game/world/HomeWorldEnvironment";
import { KOREA_RIVER_FOOTPRINT } from "../src/game/world/KoreaRiverGround";
import { isOnKoreaLand, KOREA_MARKET } from "../src/game/core/koreaDistrict";
import {
  isKoreaLandmarkArea,
  KOREA_GARDEN_WALKS,
  KOREA_LANDMARK_DESTINATIONS,
  KOREA_LANDMARK_FOOTPRINTS,
  KOREA_LANDMARK_SOLIDS,
  KOREA_LANDMARKS,
  KOREA_MAIN_STREET_Z,
} from "../src/game/core/koreaLandmarks";
import { PHOTO_BOOTH_ORIGIN } from "../src/game/core/photoBoothLayout";
import { villageGardenPlots } from "../src/game/core/villageGardens";
import { labelsOverlap } from "../src/game/world/Labels";

describe("separate worlds", () => {
  it("reserves the mobile zoom area without blocking labels elsewhere", () => {
    const zoom = { x: 292, y: 164, w: 184, h: 66 };
    const booth = { x: 207, y: 194, w: 97, h: 58 };
    expect(labelsOverlap(booth, zoom)).toBe(true);
    expect(labelsOverlap({ ...booth, y: 237 }, zoom)).toBe(false);
    expect(labelsOverlap({ ...booth, x: 55 }, zoom)).toBe(false);
  });
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
    const cognition = doorsInWorld("korea").find(
      ({ id }) => id === "cognition",
    )!;
    const [x, z, halfWidth] = cognition.footprint;
    expect(canWalk(x + halfWidth, z, "home")).toBe(true);
    expect(canWalk(x + halfWidth, z, "korea")).toBe(false);
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
  it("keeps Korea's south-bank walk open behind the airport terminal", () => {
    for (let x = 49; x <= 68; x++) {
      expect(canWalk(x, 47, "korea"), `south bank x=${x}`).toBe(true);
    }
    expect(canWalk(58, 52, "korea")).toBe(false);
    expect(canWalk(58, 47, "home")).toBe(false);
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
  it("puts Korea's neighboring venues on a single walkable street", () => {
    const korea = destinationsInWorld("korea");
    const row = ["bukchon", "gwanghwamun", "theater", "cognition", "photo"].map(
      (id) => korea.find((place) => place.id === id)!,
    );
    const airport = korea.find(({ id }) => id === "airport")!;
    for (const { id, x, z } of row) {
      expect(Math.abs(z - KOREA_MAIN_STREET_Z), id).toBeLessThan(1);
      expect(canWalk(x, z, "korea"), id).toBe(true);
      const route = findPath([airport.x, airport.z], [x, z], "korea");
      expect(route.length, id).toBeGreaterThan(0);
      const [endX, endZ] = route.at(-1)!;
      expect(Math.hypot(endX - x, endZ - z), id).toBeLessThan(1);
    }
    for (let i = 1; i < row.length; i++) {
      expect(row[i].x - row[i - 1].x).toBeGreaterThan(0);
      expect(row[i].x - row[i - 1].x).toBeLessThan(15);
    }
    const homeCinema = doorsInWorld("home").find(({ id }) => id === "theater");
    expect(homeCinema?.footprint.slice(0, 2)).toEqual([-38, -39]);
  });
  it("routes a player from the photo booth corner to Korea's airport", () => {
    const [x, , z] = PHOTO_BOOTH_ORIGIN;
    const corner: [number, number] = [x + 0.65, z - 0.65];
    const airport = destinationsInWorld("korea").find(
      ({ id }) => id === "airport",
    )!;
    expect(canWalk(...corner, "korea")).toBe(true);
    const route = findPath(corner, [airport.x, airport.z], "korea");
    expect(route.length).toBeGreaterThan(1);
    const [endX, endZ] = route.at(-1)!;
    expect(Math.hypot(endX - airport.x, endZ - airport.z)).toBeLessThan(1);
    expect(route.every(([px, pz]) => canWalk(px, pz, "korea"))).toBe(true);
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
  it("clears gardens from Korea's district approaches", () => {
    const overlaps = ({ x, z }: { x: number; z: number }) =>
      isKoreaLandmarkArea(x, z, 2);
    expect(villageGardenPlots("korea").some(overlaps)).toBe(false);
  });
  it("keeps Korea's paved walks clear through the district", () => {
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
  });
  it("reclaims the empty coastal apron without changing other worlds", () => {
    for (const [x, z] of [
      [-69, 12],
      [51, -33],
      [0, 83],
    ]) {
      expect(isOnKoreaLand(x, z)).toBe(false);
      expect(canWalk(x, z, "korea")).toBe(false);
      expect(canWalk(x, z, "home")).toBe(true);
    }
    const plots = villageGardenPlots("korea");
    expect(plots.every(({ x, z }) => isOnKoreaLand(x, z, 1.8))).toBe(true);
    const beds = plots.filter(({ orchard }) => !orchard);
    expect(beds.length).toBeGreaterThan(0);
    expect(
      beds.every(({ x, z }) => x > -50 && x < -38 && z > 18 && z < 30),
    ).toBe(true);
  });
  it("keeps the western pond deck and the covered picnic deck open", () => {
    for (const [x, z] of [
      [-35.6, 36.8],
      [-35.6, 45],
      [38, 7],
      [37, 11],
    ]) {
      expect(canWalk(x, z, "korea"), `${x}, ${z}`).toBe(true);
    }
    expect(canWalk(31.55, 5.6, "korea")).toBe(false);
  });
  it("extends the photo booth street to every market stall and links the picnic deck", () => {
    const [photoX, , photoZ] = PHOTO_BOOTH_ORIGIN;
    for (const x of KOREA_MARKET.stalls) {
      expect(canWalk(x, KOREA_MARKET.z, "korea")).toBe(false);
      expect(canWalk(x, KOREA_MAIN_STREET_Z, "korea")).toBe(true);
      expect(
        findPath([photoX, photoZ + 2], [x, KOREA_MAIN_STREET_Z], "korea")
          .length,
      ).toBeGreaterThan(0);
    }
    const ramen = activitySpots.find(({ id }) => id === "ramen")!;
    const picnic = activitySpots.find(({ id }) => id === "picnic")!;
    const route = findPath([...ramen.p], [...picnic.p], "korea");
    expect(route.length).toBeGreaterThan(0);
    const [x, z] = route.at(-1)!;
    expect(Math.hypot(x - picnic.p[0], z - picnic.p[1])).toBeLessThan(1);
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
