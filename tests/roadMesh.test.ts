import { describe, expect, it } from "vitest";
import {
  boundaryEdges,
  buildRoadMesh,
  concaveCorners,
  crownAt,
  insideUnion,
  unionArea,
  unionGrid,
  type RoadPart,
  type RoadRect,
} from "../src/game/world/env/roadMesh";
import { clipRects, roadFootprints, ROAD_NETWORKS, KOREA_STREETS } from "../src/game/world/env/roads";
import { grassField } from "../src/game/world/env/placement";

const WORLDS = ["home", "stanford", "korea"] as const;

/** Projected (xz) area of a part's triangles, and whether all face up. */
function projected(p: RoadPart) {
  let area = 0,
    down = 0;
  const P = p.positions;
  for (let i = 0; i < p.indices.length; i += 3) {
    const [a, b, c] = [p.indices[i], p.indices[i + 1], p.indices[i + 2]].map((k) => k * 3);
    const ux = P[b] - P[a], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vz = P[c + 2] - P[a + 2];
    const ny = uz * vx - ux * vz;
    area += Math.abs(ny) / 2;
    if (ny < -1e-9) down++;
  }
  return { area, down };
}

describe("road union (B2)", () => {
  // A T-junction and a cross: the union's area equals inclusion-exclusion.
  const T: RoadRect[] = [
    [0, 0, 20, 3],
    [0, 6, 3, 12],
  ];
  it("merges a T-junction exactly (area within 0.5%)", () => {
    const g = unionGrid(T);
    const exact = 20 * 3 + 3 * 12 - 3 * 1.5;
    expect(Math.abs(unionArea(g) - exact) / exact).toBeLessThan(0.005);
  });
  it("finds the two junction corners and fillets them at 0.6 m", () => {
    const g = unionGrid(T);
    const corners = concaveCorners(g, boundaryEdges(g));
    expect(corners).toHaveLength(2);
    for (const c of corners) expect(c.r).toBeCloseTo(0.6, 5);
  });
  it("lays the surface once: no overlap, every face up", () => {
    const mesh = buildRoadMesh({ style: "lane", rects: T, y: 0.19, ground: 0.14 });
    const g = unionGrid(T);
    const corners = concaveCorners(g, boundaryEdges(g));
    const fillets = corners.reduce((a, c) => a + c.r * c.r * (1 - Math.PI / 4), 0);
    const a = projected(mesh.surface), b = projected(mesh.surfaceZ);
    expect(a.down + b.down).toBe(0);
    // Polygonal arc (6 segments) is a hair smaller than the true fillet.
    expect(Math.abs(a.area + b.area - (unionArea(g) + fillets))).toBeLessThan(0.01);
  });
  it("crowns 2 cm on the centre line and 0 at the edge", () => {
    const mesh = buildRoadMesh({ style: "lane", rects: T, y: 0.19, ground: 0.14, crown: 0.02 });
    const ys = mesh.surface.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(0.19, 5);
    expect(Math.max(...ys)).toBeCloseTo(0.21, 5);
    expect(crownAt(T, 0, 0)).toBe(1);
    expect(crownAt(T, 5, 1.5)).toBeCloseTo(0, 5);
  });
  it("never overlaps two kerb tops", () => {
    const mesh = buildRoadMesh({ style: "pavers", rects: T, y: 0.2, ground: 0.14 });
    const tops: [number, number, number, number][] = [];
    for (const p of [mesh.kerbX, mesh.kerbZ]) {
      for (let i = 0; i < p.positions.length; i += 12) {
        const xs = [0, 3, 6, 9].map((k) => p.positions[i + k]);
        const ys = [1, 4, 7, 10].map((k) => p.positions[i + k]);
        const zs = [2, 5, 8, 11].map((k) => p.positions[i + k]);
        // Straight tops only (flat, axis-aligned quads).
        if (Math.max(...ys) - Math.min(...ys) > 1e-6) continue;
        if (new Set(xs.map((v) => v.toFixed(4))).size !== 2 || new Set(zs.map((v) => v.toFixed(4))).size !== 2) continue;
        tops.push([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]);
      }
    }
    expect(tops.length).toBeGreaterThan(4);
    for (let i = 0; i < tops.length; i++)
      for (let j = i + 1; j < tops.length; j++) {
        const [a, b] = [tops[i], tops[j]];
        const ox = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
        const oz = Math.min(a[3], b[3]) - Math.max(a[2], b[2]);
        expect(ox > 1e-6 && oz > 1e-6).toBe(false);
      }
  });
  it("splits a walk where it crosses a street, edge to edge", () => {
    const parts = clipRects([[0, 0, 2, 20]], [[0, 0, 30, 3]]);
    expect(parts).toEqual([
      [0, -5.75, 2, 8.5],
      [0, 5.75, 2, 8.5],
    ]);
  });
});

describe("world roads (B2)", () => {
  for (const world of WORLDS) {
    it(`${world}: within 9,000 triangles`, () => {
      const total = ROAD_NETWORKS[world].reduce((n, net) => n + buildRoadMesh(net).triangles, 0);
      expect(total).toBeGreaterThan(500);
      expect(total).toBeLessThanOrEqual(9_000);
    });
    it(`${world}: grass stays 0.2 m clear of every road, fillet and apron`, () => {
      const roads = roadFootprints(world);
      const tufts = grassField(world, 25_000);
      const onRoad = tufts.filter(({ x, z }) => insideUnion(roads, x, z, 0.2));
      expect(onRoad).toEqual([]);
    });
  }
  it("korea: the setts and the asphalt streets never overlap", () => {
    const [setts] = ROAD_NETWORKS.korea;
    for (const [cx, cz, w, d] of setts.rects)
      for (const [kx, kz, kw, kd] of KOREA_STREETS) {
        const ox = (w + kw) / 2 - Math.abs(cx - kx);
        const oz = (d + kd) / 2 - Math.abs(cz - kz);
        expect(ox > 1e-6 && oz > 1e-6).toBe(false);
      }
  });
  it("korea: the spirit road runs only on the palace axis", () => {
    const [setts] = ROAD_NETWORKS.korea;
    expect(setts.centreRects?.length).toBe(1);
    const [cx] = setts.rects[setts.centreRects![0]];
    expect(cx).toBeCloseTo(-23.5, 5);
  });
});
