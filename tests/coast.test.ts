import { describe, expect, it } from "vitest";
import {
  arcLengthTable,
  distanceToPolygon,
  insidePolygon,
  lobedLoop,
  loopCentroid,
  minCurveRadius,
  poseOnLoop,
  resampleLoop,
  signedArea,
  signedDistanceToPolygon,
  starShapedAbout,
  type P2,
} from "../src/game/core/coast";
import {
  HOME_ISLAND,
  HOME_LOBES,
  HOME_RAIL_POINTS,
  HOME_SHORE,
  HOME_SHORE_CLEARANCE,
  isHomeEllipse,
  isHomeLand,
} from "../src/game/core/homeIsland";
import { KOREA_COAST, KOREA_SHORE } from "../src/game/core/koreaDistrict";
import {
  STANFORD_COAST,
  STANFORD_MESA,
  STANFORD_SHORE,
} from "../src/shared/stanford-ground";
import { STANFORD_RAIL_POINTS } from "../src/shared/stanford-transport";
import {
  TERRAIN,
  terrainHeightAt,
  terrainTierLoop,
} from "../src/game/core/terrain";
import {
  canWalk,
  destinationsInWorld,
  doorsInWorld,
} from "../src/game/core/world";
import { activitySpots } from "../src/game/core/regionalActivities";
import { HOME_ANIMALS, animalPose } from "../src/game/core/wildlife";
import { HOME_NPC_WALKS } from "../src/game/core/homeLayout";
import { HOME_COMMUNITY_OBSTACLES } from "../src/game/world/CommunityScenery";
import {
  HOME_GARDEN_FOOTPRINTS,
  HOME_GARDEN_OBSTACLES,
} from "../src/game/core/homeGardens";
import { HOME_PATH_FOOTPRINTS } from "../src/game/world/HomeWorldEnvironment";
import { journeyPose } from "../src/game/core/journey";
import { railForWorld, railPose } from "../src/game/core/islandRail";
import { WORLD_IDS } from "../src/game/core/worlds";

const crossings = (loop: readonly P2[]) => {
  const n = loop.length;
  const side = (a: P2, b: P2, c: P2) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  let count = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = loop[i],
        b = loop[(i + 1) % n],
        c = loop[j],
        d = loop[(j + 1) % n];
      if (side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b))
        count++;
    }
  return count;
};
const corners = ([x, z, w, d]: readonly number[]): P2[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz): P2 => [x + sx * w, z + sz * d]));
const halved = ([x, z, w, d]: readonly number[]) => [x, z, w / 2, d / 2];

describe("coast geometry", () => {
  const square: P2[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];
  it("measures containment and distance on a known square", () => {
    expect(insidePolygon(2, 2, square)).toBe(true);
    expect(insidePolygon(5, 2, square)).toBe(false);
    expect(distanceToPolygon(2, 2, square)).toBeCloseTo(2);
    expect(distanceToPolygon(6, 2, square)).toBeCloseTo(2);
    expect(signedDistanceToPolygon(6, 6, square)).toBeCloseTo(
      -Math.hypot(2, 2),
    );
    expect(signedArea(square)).toBeCloseTo(16);
    expect(loopCentroid(square)).toEqual([2, 2]);
  });
  it("travels a loop at constant speed and closes without a jump", () => {
    const table = arcLengthTable(square);
    expect(table.length).toBeCloseTo(16);
    expect(poseOnLoop(table, 0)).toMatchObject({ x: 0, z: 0 });
    expect(poseOnLoop(table, 0.125)).toMatchObject({ x: 2, z: 0 });
    expect(poseOnLoop(table, 1.25).x).toBeCloseTo(4);
    expect(poseOnLoop(table, 0.25, 0.125)).toMatchObject({ x: 2, z: 0 });
    // Heading is atan2(dx, dz): +x first, then +z.
    expect(poseOnLoop(table, 0.1).heading).toBeCloseTo(Math.PI / 2);
    expect(poseOnLoop(table, 0.3).heading).toBeCloseTo(0);
    const even = resampleLoop(square, 16);
    expect(even).toHaveLength(16);
    expect(even[1]).toEqual([1, 0]);
  });
  it("keeps a lobed loop star-shaped about its centre", () => {
    const loop = lobedLoop({ centerX: 3, centerZ: -2 }, 10, 6, HOME_LOBES, 180);
    expect(starShapedAbout(loop, [3, -2])).toBe(true);
    expect(crossings(loop)).toBe(0);
    expect(starShapedAbout([...square, [2, 1]], [2, 3.9])).toBe(false);
  });
});

describe("Home's organic shore", () => {
  const { centerX, centerZ } = HOME_ISLAND;
  it("is a simple loop with real headlands and coves around the old ellipse", () => {
    expect(HOME_SHORE).toHaveLength(256);
    expect(crossings(HOME_SHORE)).toBe(0);
    expect(starShapedAbout(HOME_SHORE, [centerX, centerZ])).toBe(true);
    expect(starShapedAbout(HOME_SHORE, loopCentroid(HOME_SHORE))).toBe(true);
    const scales = HOME_SHORE.map(([x, z]) =>
      Math.hypot((x - centerX) / 42, (z - centerZ) / 32),
    );
    expect(Math.max(...scales)).toBeGreaterThan(1.15);
    expect(Math.min(...scales)).toBeLessThan(0.85);
    expect(HOME_LOBES.filter(({ amp }) => amp >= 0.09)).toHaveLength(5);
    expect(HOME_LOBES.filter(({ amp }) => amp <= -0.1)).toHaveLength(2);
    // Local maxima and minima of the drawn loop: no silhouette of an ellipse.
    let headlands = 0,
      coves = 0;
    scales.forEach((s, i) => {
      const before = scales[(i + 255) % 256],
        after = scales[(i + 1) % 256];
      if (s > before && s >= after && s > 1.06) headlands++;
      if (s < before && s <= after && s < 0.94) coves++;
    });
    expect(headlands).toBeGreaterThanOrEqual(4);
    expect(coves).toBeGreaterThanOrEqual(2);
  });

  it("keeps every building, garden, path, route and transport pad on the lawn", () => {
    const anchors: [string, P2][] = [];
    const add = (name: string, points: readonly P2[]) =>
      points.forEach((point) => anchors.push([name, point]));
    HOME_COMMUNITY_OBSTACLES.forEach((box) => add("community", corners(box)));
    HOME_GARDEN_OBSTACLES.forEach((box) => add("garden solid", corners(box)));
    HOME_GARDEN_FOOTPRINTS.forEach((box) =>
      add("garden", corners(halved(box))),
    );
    HOME_PATH_FOOTPRINTS.forEach((box) => add("path", corners(halved(box))));
    for (const door of doorsInWorld("home")) {
      add(`door ${door.id}`, corners(door.footprint));
      add(`door ${door.id}`, [[door.x, door.z]]);
    }
    for (const place of destinationsInWorld("home"))
      add(`place ${place.id}`, [[place.x, place.z]]);
    for (const spot of activitySpots.filter(({ world }) => world === "home"))
      add("activity", [[spot.p[0], spot.p[1]]]);
    for (const [id, route] of Object.entries(HOME_NPC_WALKS))
      add(`route ${id}`, route as P2[]);
    for (const animal of HOME_ANIMALS)
      for (let t = 0; t < 120; t += 0.5) {
        const p = animalPose(animal, t);
        add(`animal ${animal.kind}`, [[p.x, p.z]]);
      }
    add("telescope hill", corners([-19, -38, 6, 6]));
    add("terminal", corners([27, -21, 5.5, 5.5]));
    add("apron", corners([27, -8, 6, 6.5]));
    expect(anchors.length).toBeGreaterThan(400);
    for (const [name, [x, z]] of anchors) {
      expect(
        signedDistanceToPolygon(x, z, HOME_SHORE),
        `${name} at ${x},${z}`,
      ).toBeGreaterThanOrEqual(1.2);
      expect(isHomeLand(x, z, 1), `${name} at ${x},${z}`).toBe(true);
    }
  });

  it("answers isHomeLand exactly like the polygon it draws", () => {
    let mismatches = 0;
    for (let x = -60; x <= 48; x += 1.1)
      for (let z = -58; z <= 24; z += 1.1) {
        const inside = insidePolygon(x, z, HOME_SHORE);
        const edge = distanceToPolygon(x, z, HOME_SHORE);
        for (const margin of [0, HOME_SHORE_CLEARANCE, 1, 2.5])
          if (isHomeLand(x, z, margin) !== (inside && edge >= margin))
            mismatches++;
      }
    expect(mismatches).toBe(0);
  });

  it("only ever removes walkable ground: no walking onto a headland", () => {
    let walkable = 0,
      coveCells = 0;
    for (let x = -50; x <= 38; x += 0.5)
      for (let z = -52; z <= 16; z += 0.5) {
        if (!isHomeEllipse(x, z) && !insidePolygon(x, z, HOME_SHORE)) continue;
        const inEllipse = isHomeEllipse(x, z);
        if (canWalk(x, z, "home")) {
          walkable++;
          expect(inEllipse, `${x},${z}`).toBe(true);
          expect(
            signedDistanceToPolygon(x, z, HOME_SHORE),
            `${x},${z}`,
          ).toBeGreaterThanOrEqual(HOME_SHORE_CLEARANCE - 1e-9);
        } else if (inEllipse && !insidePolygon(x, z, HOME_SHORE)) coveCells++;
      }
    expect(walkable).toBeGreaterThan(10500);
    expect(coveCells).toBeGreaterThan(400);
    // A headland beyond the ellipse and a cove inside it.
    expect(insidePolygon(-33, -48, HOME_SHORE)).toBe(true);
    expect(canWalk(-33, -48, "home")).toBe(false);
    expect(isHomeEllipse(11, -44)).toBe(true);
    expect(canWalk(11, -44, "home")).toBe(false);
  });

  it("leaves no walkable pocket cut off behind a cove", () => {
    // Flood the 0.5 grid from the village square: every walkable cell that is
    // not sealed inside a fenced bed must still be reachable on foot.
    const step = 0.5;
    const key = (i: number, j: number) => i * 1000 + j;
    const walk = (i: number, j: number) => canWalk(i * step, j * step, "home");
    const seen = new Set<number>([key(0, 10)]);
    const queue: [number, number][] = [[0, 10]];
    expect(walk(0, 10)).toBe(true);
    while (queue.length) {
      const [i, j] = queue.pop()!;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = key(i + di, j + dj);
        if (seen.has(next) || !walk(i + di, j + dj)) continue;
        seen.add(next);
        queue.push([i + di, j + dj]);
      }
    }
    let walkable = 0;
    const stranded: string[] = [];
    for (let i = -110; i <= 90; i++)
      for (let j = -110; j <= 40; j++)
        if (walk(i, j)) {
          walkable++;
          // Within 3 of the shore is where a cove could pinch a strip off.
          if (
            !seen.has(key(i, j)) &&
            distanceToPolygon(i * step, j * step, HOME_SHORE) < 3
          )
            stranded.push(`${i * step},${j * step}`);
        }
    expect(stranded).toEqual([]);
    expect(seen.size / walkable).toBeGreaterThan(0.995);
  });

  it("runs the railway outside the shore on gentle curves from the west station", () => {
    expect(HOME_RAIL_POINTS[0][1]).toBeCloseTo(centerZ, 6);
    expect(HOME_RAIL_POINTS[0][0]).toBeLessThan(centerX - 42);
    expect(crossings(HOME_RAIL_POINTS)).toBe(0);
    expect(minCurveRadius(HOME_RAIL_POINTS, 4)).toBeGreaterThanOrEqual(8);
    const gaps = HOME_RAIL_POINTS.map(([x, z]) => {
      expect(insidePolygon(x, z, HOME_SHORE), `${x},${z}`).toBe(false);
      return distanceToPolygon(x, z, HOME_SHORE);
    });
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1.5);
    // The deepest cove is crossed on a trestle, well clear of the lawn.
    expect(Math.max(...gaps)).toBeGreaterThan(5.5);
    expect(Math.max(...gaps)).toBeLessThan(8);
    const rail = railForWorld("home");
    expect(rail.station).toEqual([HOME_RAIL_POINTS[0][0] + 10.5, centerZ]);
    expect(canWalk(rail.station[0] + 3, rail.station[1], "home")).toBe(true);
    const start = railPose(0, 0, "home");
    expect(start.x).toBeCloseTo(HOME_RAIL_POINTS[0][0]);
    expect(start.z).toBeCloseTo(centerZ);
    // Northbound first, as before: the station's platform faces the same way.
    expect(Math.abs(start.heading)).toBeGreaterThan(Math.PI * 0.9);
  });
});

describe("render-only outer coasts", () => {
  it.each([
    ["Korea", KOREA_SHORE, KOREA_COAST, 2],
    ["Stanford", STANFORD_SHORE, STANFORD_COAST, 0.2],
  ] as const)(
    "%s keeps its walking shore inside the drawn coast",
    (_, shore, coast, margin) => {
      expect(coast).toHaveLength(256);
      expect(signedArea(coast)).toBeGreaterThan(0);
      expect(crossings(coast)).toBe(0);
      for (const [x, z] of resampleLoop(shore as readonly P2[], 900))
        expect(
          signedDistanceToPolygon(x, z, coast),
          `${x},${z}`,
        ).toBeGreaterThanOrEqual(margin);
    },
  );
  it("rounds Korea's slab into headlands and bays", () => {
    // No straight run longer than a street block survives on the outer coast.
    expect(minCurveRadius(KOREA_COAST, 3)).toBeGreaterThan(3);
    const reach = resampleLoop(KOREA_COAST, 256).map(([x, z]) =>
      distanceToPolygon(x, z, KOREA_SHORE),
    );
    expect(Math.min(...reach)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...reach)).toBeGreaterThan(9);
    expect(Math.max(...reach)).toBeLessThan(16);
  });
  it("keeps Stanford's lawn clear of the viaduct and its shelf outside the rail", () => {
    expect(starShapedAbout(STANFORD_COAST, loopCentroid(STANFORD_COAST))).toBe(
      true,
    );
    for (const [x, z] of STANFORD_COAST) {
      expect(insidePolygon(x, z, STANFORD_RAIL_POINTS), `${x},${z}`).toBe(true);
      expect(
        distanceToPolygon(x, z, STANFORD_RAIL_POINTS),
        `${x},${z}`,
      ).toBeGreaterThanOrEqual(1.4);
    }
    expect(crossings(STANFORD_MESA)).toBe(0);
    expect(signedArea(STANFORD_MESA)).toBeGreaterThan(0);
    for (const [x, z] of STANFORD_RAIL_POINTS)
      expect(
        signedDistanceToPolygon(x, z, STANFORD_MESA),
        `${x},${z}`,
      ).toBeGreaterThanOrEqual(2);
  });
});

describe("relief nobody can walk onto", () => {
  it.each(WORLD_IDS)("%s: walkable ground is flat", (world) => {
    let walkable = 0;
    let raised = 0;
    for (let x = -66; x <= 82; x += 0.6)
      for (let z = -56; z <= 86; z += 0.6)
        if (canWalk(x, z, world)) {
          walkable++;
          if (terrainHeightAt(x, z, world) !== 0) raised++;
        }
    expect(raised).toBe(0);
    expect(walkable).toBeGreaterThan(6000);
  });

  it.each(WORLD_IDS)(
    "%s: every feature keeps clear of doors, places, routes and walkable ground",
    (world) => {
      const features = TERRAIN[world];
      expect(features.length).toBeGreaterThanOrEqual(3);
      const places: P2[] = [
        ...destinationsInWorld(world).map(({ x, z }): P2 => [x, z]),
        ...doorsInWorld(world).flatMap(({ footprint }) => corners(footprint)),
        ...activitySpots
          .filter((spot) => spot.world === world)
          .map(({ p }): P2 => [p[0], p[1]]),
        ...(world === "home"
          ? [
              ...Object.values(HOME_NPC_WALKS).flat(),
              ...HOME_PATH_FOOTPRINTS.flatMap((box) => corners(halved(box))),
            ].map(([x, z]): P2 => [x, z])
          : []),
      ];
      for (const feature of features) {
        expect(crossings(feature.outline), feature.id).toBe(0);
        expect(signedArea(feature.outline), feature.id).toBeGreaterThan(0);
        expect(feature.tiers[0].scale).toBe(1);
        feature.tiers.forEach((tier, i) => {
          if (!i) return;
          expect(tier.scale, feature.id).toBeLessThan(
            feature.tiers[i - 1].scale,
          );
          expect(tier.y, feature.id).toBeGreaterThan(feature.tiers[i - 1].y);
        });
        expect(feature.height).toBe(feature.tiers[feature.tiers.length - 1].y);
        expect(feature.baseY).toBeLessThan(feature.tiers[0].y);
        expect(
          insidePolygon(feature.focus[0], feature.focus[1], feature.outline),
          feature.id,
        ).toBe(true);
        for (const [x, z] of places)
          expect(
            insidePolygon(x, z, feature.outline)
              ? 0
              : distanceToPolygon(x, z, feature.outline),
            `${feature.id} near ${x},${z}`,
          ).toBeGreaterThanOrEqual(1);
        // The avatar's own 0.3 reach never touches a wall.
        for (const [x, z] of resampleLoop(feature.outline, 96))
          for (const [dx, dz] of [
            [0, 0],
            [0.35, 0],
            [-0.35, 0],
            [0, 0.35],
            [0, -0.35],
          ])
            expect(
              canWalk(x + dx, z + dz, world),
              `${feature.id} ${x},${z}`,
            ).toBe(false);
        for (const tree of feature.trees) {
          expect(
            insidePolygon(tree.p[0], tree.p[2], feature.outline),
            feature.id,
          ).toBe(true);
          expect(tree.p[1]).toBeLessThanOrEqual(feature.height + 1e-9);
        }
        const top = terrainTierLoop(feature, feature.tiers.length - 1);
        const [tx, tz] = loopCentroid(top);
        // A taller neighbour may stand on a low shoulder, never the reverse.
        if (insidePolygon(tx, tz, top))
          expect(
            Math.abs(terrainHeightAt(tx, tz, world)),
            feature.id,
          ).toBeGreaterThanOrEqual(Math.abs(feature.height));
      }
    },
  );

  it("keeps Home's relief on the drawn land and its shelves under the trestle", () => {
    for (const feature of TERRAIN.home)
      for (const [x, z] of resampleLoop(feature.outline, 96)) {
        const shore = signedDistanceToPolygon(x, z, HOME_SHORE);
        if (feature.kind === "shelf") {
          expect(feature.height).toBeLessThan(0);
          expect(shore, `${feature.id} ${x},${z}`).toBeLessThanOrEqual(-0.2);
          expect(insidePolygon(x, z, HOME_RAIL_POINTS), feature.id).toBe(true);
          expect(
            distanceToPolygon(x, z, HOME_RAIL_POINTS),
            feature.id,
          ).toBeGreaterThanOrEqual(1);
        } else {
          expect(shore, `${feature.id} ${x},${z}`).toBeGreaterThanOrEqual(0.35);
          expect(isHomeEllipse(x, z), `${feature.id} ${x},${z}`).toBe(false);
        }
      }
    expect(TERRAIN.home.filter(({ kind }) => kind === "shelf").length).toBe(5);
    expect(Math.max(...TERRAIN.home.map(({ height }) => height))).toBe(4);
  });

  it("stands Korea's and Stanford's relief outside the shore, on drawn rock", () => {
    for (const feature of TERRAIN.korea)
      for (const [x, z] of resampleLoop(feature.outline, 96)) {
        expect(insidePolygon(x, z, KOREA_SHORE), feature.id).toBe(false);
        expect(
          distanceToPolygon(x, z, KOREA_SHORE),
          feature.id,
        ).toBeGreaterThanOrEqual(0.7);
        expect(
          signedDistanceToPolygon(x, z, KOREA_COAST),
          `${feature.id} ${x},${z}`,
        ).toBeGreaterThanOrEqual(0.5);
      }
    for (const feature of TERRAIN.stanford)
      for (const [x, z] of resampleLoop(feature.outline, 96)) {
        expect(insidePolygon(x, z, STANFORD_SHORE), feature.id).toBe(false);
        expect(
          distanceToPolygon(x, z, STANFORD_SHORE),
          feature.id,
        ).toBeGreaterThanOrEqual(0.6);
        // Either on the lawn's verge inside the rail, or on the shelf beyond.
        const onVerge = insidePolygon(x, z, STANFORD_RAIL_POINTS);
        expect(
          signedDistanceToPolygon(
            x,
            z,
            onVerge ? STANFORD_COAST : STANFORD_MESA,
          ),
          `${feature.id} ${x},${z}`,
        ).toBeGreaterThanOrEqual(0.4);
        expect(
          distanceToPolygon(x, z, STANFORD_RAIL_POINTS),
          `${feature.id} ${x},${z}`,
        ).toBeGreaterThanOrEqual(2.2);
      }
  });

  it.each(WORLD_IDS)(
    "%s: nothing rises under the jet's low taxi, climb and approach",
    (world) => {
      for (let p = 0; p <= 1; p += 0.0005) {
        const jet = journeyPose("plane", p, world) as {
          x: number;
          y: number;
          z: number;
          heading: number;
        };
        if (jet.y > 7.5) continue;
        if (Math.round(p * 2000) % 4 === 0)
          for (const feature of TERRAIN[world])
            for (const tree of feature.trees)
              expect(
                Math.hypot(tree.p[0] - jet.x, tree.p[2] - jet.z),
                `${feature.id} tree`,
              ).toBeGreaterThan(7);
        // Wing tips reach 4.25 either side of the fuselage.
        for (let across = -5; across <= 5; across += 1) {
          const x = jet.x + Math.cos(jet.heading) * across,
            z = jet.z - Math.sin(jet.heading) * across;
          expect(
            terrainHeightAt(x, z, world),
            `${world} ${x.toFixed(1)},${z.toFixed(1)} at jet height ${jet.y.toFixed(2)}`,
          ).toBeLessThanOrEqual(Math.max(0.3, jet.y - 1.8));
        }
      }
    },
  );

  it.each(["home", "stanford"] as const)(
    "%s: the train's loading gauge is clear of every hill and tree",
    (world) => {
      for (let step = 0; step < 720; step++) {
        const { x, z } = railPose(step / 720, 0, world);
        for (const feature of TERRAIN[world]) {
          if (feature.height < 0.5) continue;
          expect(
            insidePolygon(x, z, feature.outline)
              ? 0
              : distanceToPolygon(x, z, feature.outline),
            `${feature.id} at ${x},${z}`,
          ).toBeGreaterThanOrEqual(1.9);
          for (const tree of feature.trees)
            expect(
              Math.hypot(tree.p[0] - x, tree.p[2] - z),
              feature.id,
            ).toBeGreaterThan(3.2);
        }
      }
    },
  );

  it("keeps south-east relief low so it never hides the town behind it", () => {
    // The overview camera looks along (-70, -95): a feature hides the ground
    // up to 1.39 x its height behind it. Anything in front of walkable land
    // stays at or below 1.6; taller relief stands on the far rims.
    for (const world of WORLD_IDS)
      for (const feature of TERRAIN[world]) {
        if (feature.height <= 1.6) continue;
        let hides = 0;
        for (const [x, z] of resampleLoop(feature.outline, 48))
          for (let k = 0.5; k <= feature.height * 1.39; k += 0.5)
            if (canWalk(x - 0.593 * k, z - 0.805 * k, world)) hides++;
        expect(hides, feature.id).toBe(0);
      }
  });
});
