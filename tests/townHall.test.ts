import { describe, expect, it } from "vitest";
import { canWalk, destinationsInWorld, doorsInWorld, findPath } from "../src/game/core/world";
import { belongsToWorld } from "../src/game/core/worlds";
import { isHomeLand } from "../src/game/core/homeIsland";
import { TERRAIN } from "../src/game/core/terrain";
import { insidePolygon } from "../src/game/core/coast";
import { HOME_COMMUNITY_OBSTACLES } from "../src/game/world/CommunityScenery";
import { HOME_FLOWER_BEDS, HOME_GARDEN_TREES } from "../src/game/core/homeGardens";
import { villageGardenSolids } from "../src/game/core/villageGardens";
import { HOME_ROAD_RECTS } from "../src/game/world/env/homePaths";
import { roomStories, TOWN_HALL_STORY } from "../src/content/room-stories";
import { TOWN_HALL_TOPIC, topicsFor } from "../src/game/core/npcTopics";
import { CORE_COLOR, coreIntensity, TOWN_HALL_DOOR, TOWN_HALL_FOOTPRINT } from "../src/game/core/townHall";
import {
  geometryTriangles,
  pieceTriangles,
  townHallCoreGeometry,
  townHallPieces,
  townHallRounds,
  yawPitch,
} from "../src/game/world/townHallArt";
import { chamferBoxGeometry } from "../src/game/world/chamferBox";
import * as THREE from "three";

const [cx, cz, hx, hz] = TOWN_HALL_FOOTPRINT;
const gapTo = ([x, z, w, d]: readonly number[]) =>
  Math.hypot(Math.max(0, Math.abs(x - cx) - w - hx), Math.max(0, Math.abs(z - cz) - d - hz));

describe("Town Hall site", () => {
  it("is a Home place with a door", () => {
    expect(belongsToWorld("townhall", "home")).toBe(true);
    expect(belongsToWorld("townhall", "stanford")).toBe(false);
    expect(belongsToWorld("townhall", "korea")).toBe(false);
    const door = doorsInWorld("home").find((d) => d.id === "townhall")!;
    expect(door.name).toBe("Town Hall");
    expect([door.x, door.z]).toEqual([...TOWN_HALL_DOOR]);
    expect(destinationsInWorld("home").some((d) => d.id === "townhall")).toBe(true);
  });
  it("sits on the lawn, off the terrain features", () => {
    for (let x = cx - hx; x <= cx + hx; x += 0.5)
      for (let z = cz - hz; z <= cz + hz; z += 0.5) {
        expect(isHomeLand(x, z, 1), `${x},${z}`).toBe(true);
        expect(TERRAIN.home.some((f) => insidePolygon(x, z, f.outline)), `${x},${z}`).toBe(false);
      }
  });
  it("keeps 3 m from every other building, bed and collider", () => {
    for (const d of doorsInWorld("home")) if (d.id !== "townhall") expect(gapTo(d.footprint), d.id).toBeGreaterThanOrEqual(3);
    for (const o of [...HOME_COMMUNITY_OBSTACLES, ...HOME_FLOWER_BEDS.map(([x, z, w, d]) => [x, z, w / 2, d / 2])])
      expect(gapTo(o), String(o)).toBeGreaterThanOrEqual(3);
    // The telescope platform's collider.
    expect(gapTo([-19, -38, 6, 6])).toBeGreaterThanOrEqual(3);
    // Trees keep their crowns clear of the eaves.
    for (const [x, z] of HOME_GARDEN_TREES) expect(gapTo([x, z, 0.36, 0.36]), `${x},${z}`).toBeGreaterThanOrEqual(1.8);
    for (const t of villageGardenSolids("home")) expect(gapTo(t), String(t)).toBeGreaterThanOrEqual(1.8);
  });
  it("faces the rear lane, with a walkable approach from the high street", () => {
    const [x, z] = TOWN_HALL_DOOR;
    expect(z).toBeGreaterThan(cz + hz);
    expect(canWalk(x, z, "home")).toBe(true);
    expect(HOME_ROAD_RECTS.some(([rx, rz, w, d]) => Math.abs(x - rx) <= w / 2 && Math.abs(z - rz) <= d / 2)).toBe(true);
    for (const from of ["writing", "go", "station"]) {
      const start = destinationsInWorld("home").find((d) => d.id === from)!;
      const path = findPath([start.x, start.z], [x, z], "home");
      expect(path.length, from).toBeGreaterThan(0);
      expect(Math.hypot(path.at(-1)![0] - x, path.at(-1)![1] - z)).toBeLessThan(1.2);
    }
  });
});

describe("Town Hall art", () => {
  it("stays inside its allowance: ≤ 6,500 triangles", () => {
    const box = geometryTriangles(chamferBoxGeometry(0.08));
    const pieces = townHallPieces("#285c43");
    const kit = Object.values(pieces).reduce((n, list) => n + pieceTriangles(list, box), 0);
    const rounds = townHallRounds().reduce((n, r) => n + geometryTriangles(r.geometry), 0);
    const core = geometryTriangles(townHallCoreGeometry());
    expect(kit + rounds + core).toBeLessThanOrEqual(6500);
  });
  it("hangs the banners in the visitor's colour", () => {
    const banners = townHallPieces("#123456").paint.filter((p) => p.c === "#123456");
    expect(banners.length).toBe(6);
  });
  it("is no stepped or crenellated mass: one wall radius, one cone", () => {
    const stone = townHallPieces("#285c43").stone;
    // Wall blocks share one radius (no tiers). Blocks are the 1.5 m+ pieces.
    const radii = stone
      .filter((p) => p.s[1] > 2)
      .map((p) => Math.round(Math.hypot(p.p[0], p.p[2] - (cz - TOWN_HALL_FOOTPRINT[1] - 0.5)) * 10) / 10);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.2);
  });
  it("turns then dips a piece", () => {
    const v = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...yawPitch(Math.PI / 2, 0.3)));
    expect(v.x).toBeCloseTo(Math.cos(0.3));
    expect(v.y).toBeCloseTo(-Math.sin(0.3));
  });
  it("breathes its core: 1.6 by day, 3.0 at night, ±12 % over 4 s", () => {
    expect(CORE_COLOR).toBe("#ffd27a");
    expect(coreIntensity(0, 0)).toBeCloseTo(1.6);
    expect(coreIntensity(1, 0)).toBeCloseTo(3.0);
    expect(coreIntensity(0, 1)).toBeCloseTo(1.6 * 1.12);
    expect(coreIntensity(1, 3)).toBeCloseTo(3.0 * 0.88);
    expect(coreIntensity(0, 4)).toBeCloseTo(1.6);
  });
});

describe("Town Hall words", () => {
  it("the plaque reads exactly as written", () => {
    expect(roomStories.townhall).toBe(TOWN_HALL_STORY);
    expect(TOWN_HALL_STORY.text).toBe(
      "Josh played Clash of Clans at a very high level: maxed out at Town Hall 18, and at one point top 6 in the US. He hasn't played in a while.",
    );
  });
  it("the go regular can be asked about it", () => {
    expect(topicsFor("go-regular")).toContain(TOWN_HALL_TOPIC);
  });
});

describe("plaque wrapping", async () => {
  const { wrapWords } = await import("../src/game/world/Plaque");
  it("wraps greedily by measured width and keeps every word", () => {
    const measure = (s: string) => s.length;
    const lines = wrapWords(TOWN_HALL_STORY.text, 30, measure);
    expect(lines.every((l) => l.length <= 30 || !l.includes(" "))).toBe(true);
    expect(lines.join(" ")).toBe(TOWN_HALL_STORY.text);
    expect(wrapWords("", 10, measure)).toEqual([]);
    expect(wrapWords("supercalifragilistic word", 5, measure)).toEqual(["supercalifragilistic", "word"]);
  });
});

describe("Town Hall interior", async () => {
  const { findInteriorPath, moveInterior, TOWN_HALL_TABLE } = await import("../src/game/core/houseRooms");
  const { roomFor } = await import("../src/game/core/room");
  it("walks from the door round the table, the columns and the hearth", () => {
    const room = roomFor("townhall");
    const spot: [number, number] = [0, TOWN_HALL_TABLE.z + TOWN_HALL_TABLE.depth / 2 + 1.6];
    for (const end of [spot, [0, -16] as [number, number], [-14, -4] as [number, number], [0, room.doorZ] as [number, number]]) {
      const route = findInteriorPath("townhall", [0, room.spawnZ], end);
      expect(route.length, String(end)).toBeGreaterThan(0);
      expect(Math.hypot(route.at(-1)![0] - end[0], route.at(-1)![1] - end[1])).toBeLessThan(0.6);
    }
    // The table is solid.
    const [, z] = moveInterior("townhall", 0, spot[1], 0, -6);
    expect(z).toBeGreaterThan(TOWN_HALL_TABLE.z + TOWN_HALL_TABLE.depth / 2);
  });
});
