import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import {
  hash01,
  undersideClouds,
  undersideFalls,
  undersideModel,
  undersidePoints,
  undersideSpec,
  type V2,
  type V3,
} from "../src/game/core/islandUnderside";
import {
  islandCenter,
  islandViewShift,
  islandZoom,
  ISLAND_CAMERA_OFFSET,
} from "../src/game/core/islandCamera";
import { ISLAND_SCREEN_DOWN_GROUND } from "../src/game/core/islandView";
import { HOME_RAIL_POINTS, HOME_SHORE } from "../src/game/core/homeIsland";
import { KOREA_COAST, isOnKoreaLand } from "../src/game/core/koreaDistrict";
import { distanceToPolygon, insidePolygon } from "../src/game/core/coast";
import { journeyPose } from "../src/game/core/journey";
import { railPose } from "../src/game/core/islandRail";
import { STANFORD_RAIL_POINTS } from "../src/shared/stanford-transport";
import { onStanfordLand } from "../src/shared/stanford-ground";

const WORLDS = ["home", "korea", "stanford"] as const;

function inside([x, , z]: readonly number[], ring: readonly V3[] | readonly V2[]) {
  let hit = false;
  const points = ring.map((p) => (p.length === 3 ? [p[0], p[2]] : p));
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[j],
      [bx, bz] = points[i];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      hit = !hit;
  }
  return hit;
}
function outlineDistance([x, , z]: readonly number[], ring: readonly V3[]) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, , az] = ring[i],
      [bx, , bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
function overview(width: number, height: number, world: (typeof WORLDS)[number]) {
  const [x, z] = islandCenter(world);
  const [sx, sy, sz] = islandViewShift(world);
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 350);
  camera.position.set(x + sx + ISLAND_CAMERA_OFFSET[0], sy + ISLAND_CAMERA_OFFSET[1], z + sz + ISLAND_CAMERA_OFFSET[2]);
  camera.lookAt(x + sx, sy + 0.7, z + sz);
  camera.zoom = islandZoom(width, height, world);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

describe("floating-island undersides", () => {
  it("is deterministic procedural art without randomness or NaN", () => {
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(1, 2, 4));
    const source = readFileSync("src/game/core/islandUnderside.ts", "utf8");
    expect(source).not.toContain("Math.random");
    for (const world of WORLDS) {
      const { rock } = undersideModel(world);
      expect(rock.positions.every(Number.isFinite)).toBe(true);
      expect(rock.colors.every((c) => c >= 0 && c <= 1)).toBe(true);
      expect(undersideFalls(world).positions.every(Number.isFinite)).toBe(true);
    }
  });

  it.each(WORLDS)("keeps %s within the triangle budget", (world) => {
    const rock = undersideModel(world).rock.positions.length / 9;
    const falls = undersideFalls(world).indices.length / 3;
    expect(rock).toBeLessThan(5000);
    expect(falls).toBeLessThan(200);
    expect(undersideClouds(world).length).toBeLessThanOrEqual(40);
  });

  it("gives every island its own silhouette and rock language", () => {
    const home = undersideSpec("home"),
      korea = undersideSpec("korea"),
      stanford = undersideSpec("stanford");
    // Home: a rounded single bowl with soft strata.
    expect(home.bottom).toBe("point");
    expect(home.spires).toHaveLength(0);
    expect(home.isletShape).toBe("bowl");
    expect(home.cleave).toBeLessThan(0.3);
    // Korea: cleaved granite breaking into a range of hanging spires.
    expect(korea.spires.length).toBeGreaterThanOrEqual(5);
    expect(korea.cleave).toBeGreaterThan(0.7);
    expect(korea.isletShape).toBe("spire");
    // Stanford: broad, flat, horizontal mesa strata.
    expect(stanford.bottom).toBe("flat");
    expect(stanford.dip).toBe(0);
    expect(stanford.isletShape).toBe("mesa");
    const flatness = (world: "home" | "stanford") => {
      const m = undersideModel(world);
      return (m.spec.topY - m.apex[1]) / m.radius;
    };
    expect(flatness("stanford")).toBeLessThan(flatness("home"));
    expect(new Set([home, korea, stanford].map((s) => s.strata.join())).size).toBe(3);
    expect(new Set([home, korea, stanford].map((s) => s.islets.map((i) => i.prop).join())).size).toBe(3);
    expect(korea.islets.some((i) => i.prop === "jeongja")).toBe(true);
    expect(korea.islets.some((i) => i.prop === "cairns")).toBe(true);
    expect(stanford.islets.some((i) => i.prop === "arcade")).toBe(true);
    expect(home.islets.some((i) => i.prop === "shed")).toBe(true);
    expect(stanford.islets.flatMap((i) => i.trees.map((t) => t.species))).toEqual(
      expect.arrayContaining(["redwood", "palm"]),
    );
    // Stanford's falls are wide sheets; Korea's are thin and tall.
    expect(Math.min(...stanford.falls.map((f) => f.width))).toBeGreaterThan(4);
    expect(Math.max(...korea.falls.map((f) => f.width))).toBeLessThan(1.5);
    expect(Math.max(...korea.falls.map((f) => f.length / f.width))).toBeGreaterThan(30);
  });

  it.each(WORLDS)("shares the overview centre with the %s camera", (world) => {
    expect(undersideSpec(world).view).toEqual(islandCenter(world));
  });

  it("tucks the top ring under the land and carries Stanford's viaduct", () => {
    // Home: a rock ledge under the trestle, between the lawn and 1.3 beyond
    // the rail, so every pier has ground to stand on.
    const home = undersideModel("home").rings[0].points;
    for (const [x, , z] of home) {
      expect(insidePolygon(x, z, HOME_SHORE), `${x},${z}`).toBe(false);
      expect(insidePolygon(x, z, HOME_RAIL_POINTS), `${x},${z}`).toBe(false);
      expect(distanceToPolygon(x, z, HOME_RAIL_POINTS)).toBeGreaterThan(0.7);
      expect(distanceToPolygon(x, z, HOME_RAIL_POINTS)).toBeLessThan(1.3);
    }
    for (const [x, z] of HOME_RAIL_POINTS) expect(inside([x, 0, z], home)).toBe(true);
    // Korea: tucked inside the rounded ground slab, outside the walking shore.
    for (const [x, , z] of undersideModel("korea").rings[0].points) {
      expect(insidePolygon(x, z, KOREA_COAST), `${x},${z}`).toBe(true);
      expect(distanceToPolygon(x, z, KOREA_COAST), `${x},${z}`).toBeGreaterThan(0.4);
      expect(isOnKoreaLand(x, z), `${x},${z}`).toBe(false);
    }
    const shelf = undersideModel("stanford").rings[0].points;
    for (const [x, z] of STANFORD_RAIL_POINTS) {
      expect(inside([x, 0, z], shelf)).toBe(true);
      expect(outlineDistance([x, 0, z], shelf)).toBeGreaterThan(1.9);
    }
  });

  it.each(WORLDS)("hangs %s rock entirely below its ground slab", (world) => {
    const { spec } = undersideModel(world);
    expect(spec.topY).toBeLessThanOrEqual(-3);
    const m = undersideModel(world);
    for (const ring of m.rings) for (const [, y] of ring.points) expect(y).toBeLessThanOrEqual(spec.topY + 0.5);
    for (const spire of m.spires) for (const ring of spire) for (const [, y] of ring) expect(y).toBeLessThan(spec.topY);
    for (const { p, s } of undersideClouds(world))
      for (const [, y] of undersidePoints(world)) expect(p[1] + s[1]).toBeLessThan(y);
  });

  it.each(WORLDS)("faces every %s body facet outward and closes it", (world) => {
    const m = undersideModel(world);
    let outward = 0,
      sides = 0,
      volume = 0;
    const p = m.rock.positions;
    for (let t = 0; t < m.bodyTriangles; t++) {
      const a = new Vector3().fromArray(p, t * 9),
        b = new Vector3().fromArray(p, t * 9 + 3),
        c = new Vector3().fromArray(p, t * 9 + 6);
      volume += a.dot(b.clone().cross(c)) / 6;
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.lengthSq() < 1e-10) continue;
      normal.normalize();
      const centre = a.clone().add(b).add(c).divideScalar(3);
      if (Math.abs(centre.y - m.spec.topY) < 1e-6 && normal.y > 0.99) continue; // cap
      const radial = new Vector3(centre.x - m.apex[0], 0, centre.z - m.apex[2]);
      sides++;
      if (normal.dot(radial) > 0 || normal.y < -0.9) outward++;
    }
    // Closed and outward-wound: positive enclosed volume of the right size.
    // Cleavage ridges may turn a few facets sideways, never the whole skin.
    expect(volume).toBeGreaterThan(Math.PI * m.radius ** 2 * (m.spec.topY - m.apex[1]) * 0.2);
    expect(outward / sides).toBeGreaterThan(0.9);
  });

  it("buries every Korean spire root inside the granite body", () => {
    const m = undersideModel("korea");
    for (const spire of m.spires) {
      const rootY = spire[0][0][1];
      const below = m.rings.find((ring) => Math.max(...ring.points.map((q) => q[1])) < rootY - 0.5)!;
      for (const point of spire[0]) expect(inside(point, below.points)).toBe(true);
      expect(spire[spire.length - 1][0][1]).toBeLessThan(m.apex[1]);
    }
  });

  it.each(WORLDS)("floats %s islets clear of land, rock, rails and flight", (world) => {
    const m = undersideModel(world);
    const top = m.rings[0].points;
    for (const [n, islet] of m.islets.entries()) {
      const label = `${world} islet ${n}`;
      expect(inside(islet.top, top), label).toBe(false);
      expect(outlineDistance(islet.top, top), label).toBeGreaterThan(islet.radius + 2);
      // No rock vertex intrudes on the islet's own cylinder of air.
      for (const [x, y, z] of undersidePoints(world)) {
        const own = m.isletRings[n].some((ring) => ring.some((q) => q[0] === x && q[1] === y && q[2] === z));
        if (own || y > islet.top[1] + 6 || y < islet.top[1] - islet.depth - 2) continue;
        expect(Math.hypot(x - islet.top[0], z - islet.top[2]), label).toBeGreaterThan(islet.radius * 1.15);
      }
      for (const [k, other] of m.islets.entries())
        if (k !== n)
          expect(Math.hypot(other.top[0] - islet.top[0], other.top[2] - islet.top[2]), label).toBeGreaterThan(islet.radius + other.radius + 3);
      for (let p = 0; p <= 1; p += 0.0025) {
        const plane = journeyPose("plane", p, world);
        const dy = plane.y - Math.min(Math.max(plane.y, islet.top[1] - islet.depth), islet.top[1] + 9);
        expect(Math.hypot(plane.x - islet.top[0], plane.z - islet.top[2], dy), label).toBeGreaterThan(islet.radius + 8);
      }
      if (world !== "korea" && islet.top[1] > -8)
        for (let t = 0; t < 1; t += 0.002) {
          const rail = railPose(t, 0, world);
          expect(Math.hypot(rail.x - islet.top[0], rail.z - islet.top[2]), label).toBeGreaterThan(islet.radius + 3);
        }
      if (world === "stanford") expect(onStanfordLand(islet.top[0], islet.top[2])).toBe(false);
    }
  });

  it.each(WORLDS)("springs %s falls on camera-facing cliffs, clear of the rock", (world) => {
    const m = undersideModel(world);
    const falls = undersideFalls(world);
    expect(falls.springs).toHaveLength(m.spec.falls.length);
    for (const spring of falls.springs) {
      expect(spring.normal[0] * ISLAND_SCREEN_DOWN_GROUND[0] + spring.normal[1] * ISLAND_SCREEN_DOWN_GROUND[2]).toBeGreaterThan(0.2);
      // Below the spring, the ribbon's centreline stays outside every nearby rock vertex.
      const [px, py, pz] = spring.point;
      let reach = 0;
      for (const ring of m.rings)
        for (const [x, y, z] of ring.points) {
          const along = (x - px) * spring.tangent[0] + (z - pz) * spring.tangent[1];
          if (y < py - 0.5 && Math.abs(along) < spring.width)
            reach = Math.max(reach, (x - px) * spring.normal[0] + (z - pz) * spring.normal[1]);
        }
      const ribbon = falls.positions;
      let furthest = -Infinity;
      for (let i = 0; i < ribbon.length; i += 3)
        if (Math.hypot(ribbon[i] - px, ribbon[i + 2] - pz) < 40 && ribbon[i + 1] < py - 4)
          furthest = Math.max(furthest, (ribbon[i] - px) * spring.normal[0] + (ribbon[i + 2] - pz) * spring.normal[1]);
      expect(furthest).toBeGreaterThan(reach);
    }
  });

  it.each([
    [1280, 800],
    [1440, 900],
    [390, 844],
    [844, 390],
  ])("frames all three undersides and their islets at %s × %s", (width, height) => {
    for (const world of WORLDS) {
      const camera = overview(width, height, world);
      for (const point of undersidePoints(world)) {
        const p = new Vector3(...point).project(camera);
        expect(Math.abs(p.x), `${world} ${point}`).toBeLessThan(0.97);
        expect(Math.abs(p.y), `${world} ${point}`).toBeLessThan(0.92);
        expect(Math.abs(p.z)).toBeLessThan(1);
      }
      for (const islet of undersideModel(world).islets)
        for (const tree of islet.trees) {
          const p = new Vector3(islet.top[0], islet.top[1] + 9 * tree.size, islet.top[2]).project(camera);
          expect(Math.abs(p.x), `${world} tree`).toBeLessThan(0.97);
          expect(Math.abs(p.y), `${world} tree`).toBeLessThan(0.92);
        }
    }
  });
});
