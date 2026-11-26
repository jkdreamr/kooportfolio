import {
  hash01,
  insidePolygon,
  loopNormals,
  offsetLoop,
  resampleLoop,
  signedDistanceToPolygon,
  smoothLoop,
  type P2,
} from "../../core/coast";
import { HOME_RAIL_POINTS, HOME_SHORE, isHomeLand } from "../../core/homeIsland";
import { isOnKoreaLand, KOREA_COAST, KOREA_SHORE } from "../../core/koreaDistrict";
import { STANFORD_WALKS } from "../../core/stanfordLayout";
import {
  KOREA_APRON_Y,
  TERRAIN,
  terrainHeightAt,
  terrainTierLoop,
} from "../../core/terrain";
import { STANFORD_RAIL_POINTS } from "../../../shared/stanford-transport";
import { canWalk, doorsInWorld } from "../../core/world";
import type { WorldId } from "../../core/worlds";
import { POND } from "../../core/pond";
import { campus } from "../../core/campus";
import {
  onStanfordLand,
  STANFORD_COAST,
  STANFORD_SHORE,
} from "../../../shared/stanford-ground";
import { HOME_PATH_FOOTPRINTS } from "./homePaths";
import { KOREA_PAVING_FOOTPRINTS } from "../KoreaWorldEnvironment";

/**
 * Pure placement for the environment layer: grass tufts, granite rocks, lakes
 * and shoreline detail. Deterministic (position-hashed), computed once per
 * world. Invariants (tests/envPlacement.test.ts):
 *  - nothing solid (rocks, lake lips, pebbles taller than an ankle) stands on
 *    walkable ground or near a doorway;
 *  - grass is never drawn on paths, paving or within a doorway's approach.
 */

type Rect = readonly [x: number, z: number, width: number, depth: number];

export const LAND: Record<WorldId, (x: number, z: number, margin?: number) => boolean> = {
  home: (x, z, m = 0) => isHomeLand(x, z, m),
  korea: (x, z, m = 0) => isOnKoreaLand(x, z, m),
  stanford: (x, z, m = 0) => onStanfordLand(x, z, m),
};
/** The walkable lawn's edge, counter-clockwise (x, z). */
export const SHORE: Record<WorldId, readonly P2[]> = {
  home: HOME_SHORE,
  korea: KOREA_SHORE,
  stanford: STANFORD_SHORE,
};
/** The drawn coast (the island's outer edge). */
export const COAST: Record<WorldId, readonly P2[]> = {
  home: HOME_SHORE,
  korea: KOREA_COAST,
  stanford: STANFORD_COAST,
};

const STANFORD_ROADS: Rect[] = STANFORD_WALKS.map(([x, z, w, d]) => [x, z, w, d]);
// The campus district's quad is paved; it is placed rotated by π at `campus`.
const CAMPUS_RECT: Rect = [campus.x, campus.z - 4, 44, 50];
export const PAVED: Record<WorldId, readonly Rect[]> = {
  home: HOME_PATH_FOOTPRINTS,
  // The Han's channel (and the bridge over it) is never lawn.
  korea: [...KOREA_PAVING_FOOTPRINTS, [25, 33, 76, 24]],
  stanford: [...STANFORD_ROADS, CAMPUS_RECT],
};

const inRect = (x: number, z: number, [cx, cz, w, d]: Rect, pad: number) =>
  Math.abs(x - cx) <= w / 2 + pad && Math.abs(z - cz) <= d / 2 + pad;
const rectGap = (x: number, z: number, [cx, cz, w, d]: Rect) =>
  Math.hypot(
    Math.max(0, Math.abs(x - cx) - w / 2),
    Math.max(0, Math.abs(z - cz) - d / 2),
  );

/** Rects bucketed on a coarse grid; each bucket also holds rects within
 * `reach` of it, so a query sees every rect it could be near. */
function rectGrid(rects: readonly Rect[], reach: number, cell = 4) {
  const buckets = new Map<number, Rect[]>();
  const key = (i: number, j: number) => i * 4096 + j;
  for (const rect of rects) {
    const [cx, cz, w, d] = rect;
    const i0 = Math.floor((cx - w / 2 - reach) / cell),
      i1 = Math.floor((cx + w / 2 + reach) / cell),
      j0 = Math.floor((cz - d / 2 - reach) / cell),
      j1 = Math.floor((cz + d / 2 + reach) / cell);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        const list = buckets.get(k);
        if (list) list.push(rect);
        else buckets.set(k, [rect]);
      }
  }
  const empty: Rect[] = [];
  return (x: number, z: number) =>
    buckets.get(key(Math.floor(x / cell), Math.floor(z / cell))) ?? empty;
}

/** Float-safe hash in [0, 1) (core hash01 truncates its inputs to integers). */
export function fhash(x: number, z: number, seed: number) {
  return hash01(Math.round(x * 1000), Math.round(z * 1000), seed);
}
/** True where any relief feature's footprint lies (its ground is not y=0). */
function reliefTest(world: WorldId) {
  const features = TERRAIN[world].map((f) => ({ f, ...bounds(f.outline) }));
  return (x: number, z: number) =>
    features.some(
      ({ f, minX, maxX, minZ, maxZ }) =>
        x >= minX && x <= maxX && z >= minZ && z <= maxZ && insidePolygon(x, z, f.outline),
    );
}

/** Signed distance to a loop (positive inside), sampled on a grid once and
 * read back bilinearly: exact enough for dressing, ~100× cheaper per query. */
export function distanceGrid(full: readonly P2[], cell = 0.8, pad = 4) {
  const loop = full.length > 240 ? resampleLoop(full, 240) : full;
  const b = bounds(loop);
  const x0 = b.minX - pad,
    z0 = b.minZ - pad;
  const nx = Math.ceil((b.maxX - b.minX + pad * 2) / cell) + 1,
    nz = Math.ceil((b.maxZ - b.minZ + pad * 2) / cell) + 1;
  const values = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++)
      values[j * nx + i] = signedDistanceToPolygon(x0 + i * cell, z0 + j * cell, loop);
  return (x: number, z: number) => {
    const u = (x - x0) / cell,
      v = (z - z0) / cell;
    if (u < 0 || v < 0 || u >= nx - 1 || v >= nz - 1) return -pad;
    const i = Math.floor(u),
      j = Math.floor(v),
      fu = u - i,
      fv = v - j;
    const a = values[j * nx + i],
      b2 = values[j * nx + i + 1],
      c = values[(j + 1) * nx + i],
      d = values[(j + 1) * nx + i + 1];
    return a + (b2 - a) * fu + (c - a) * fv + (a - b2 - c + d) * fu * fv;
  };
}

/** Smooth value noise for clumping (world units / scale). */
function clump(x: number, z: number, scale: number, seed: number) {
  const u = x / scale,
    v = z / scale;
  const xi = Math.floor(u),
    zi = Math.floor(v);
  const fx = u - xi,
    fz = v - zi;
  const sx = fx * fx * (3 - 2 * fx),
    sz = fz * fz * (3 - 2 * fz);
  const a = hash01(xi, zi, seed),
    b = hash01(xi + 1, zi, seed),
    c = hash01(xi, zi + 1, seed),
    d = hash01(xi + 1, zi + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function bounds(loop: readonly P2[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [x, z] of loop) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

/* ------------------------------------------------------------------ water */

export type Lake = {
  id: string;
  /** Water outline (x, z), counter-clockwise, and its surface height. */
  outline: readonly P2[];
  y: number;
  /** Floor under the water (the shelf cap) for depth tint. */
  floorY: number;
  kind: "lake" | "pond" | "river";
};

/** Home's lowered cove shelves hold lakes: a granite lip retains each. */
const HOME_LAKE_SHELVES = [
  "home-south-east-notch-shelf",
  "home-north-east-cove-shelf",
  "home-north-notch-shelf",
  "home-north-west-cove-shelf",
];
export const LAKE_LIP_INSET = 0.55;
/** The outer edge of a lake's granite lip: 0.5 out along the loop normals
 * (no corner amplification, unlike a mitred offset). */
export function lipLoop(outline: readonly P2[], width = 0.5): P2[] {
  const normals = loopNormals(outline);
  return outline.map(([x, z], i): P2 => [x + normals[i][0] * width, z + normals[i][1] * width]);
}
const lakeCache = new Map<WorldId, Lake[]>();
export function lakesFor(world: WorldId): Lake[] {
  const cached = lakeCache.get(world);
  if (cached) return cached;
  const lakes: Lake[] = [];
  lakeCache.set(world, lakes);
  if (world === "home")
    for (const feature of TERRAIN.home) {
      if (feature.kind !== "shelf" || !HOME_LAKE_SHELVES.includes(feature.id)) continue;
      const top = feature.tiers.length - 1;
      const loop = resampleLoop(terrainTierLoop(feature, top), 96);
      // Pull any stretch that comes near the walkable lawn back toward the
      // shelf's focus, so the lip (0.5 outside the water) never reaches it.
      const [fx, fz] = feature.focus;
      const outline = offsetLoop(loop, -LAKE_LIP_INSET).map(([x, z]): P2 => {
        let px = x,
          pz = z;
        for (let k = 0; k < 40; k++) {
          const d = Math.hypot(px - fx, pz - fz);
          const ox = px + ((px - fx) / (d || 1)) * 0.75,
            oz = pz + ((pz - fz) / (d || 1)) * 0.75;
          if (!touchesWalkable(ox, oz, 0.3, "home") && !touchesWalkable(px, pz, 0.3, "home")) break;
          px -= ((px - fx) / (d || 1)) * 0.25;
          pz -= ((pz - fz) / (d || 1)) * 0.25;
        }
        return [px, pz];
      });
      let water = smoothLoop(outline, 2);
      for (let pass = 0; pass < 40; pass++) {
        const lip = lipLoop(water);
        let moved = false;
        water = water.map(([x, z], i): P2 => {
          if (!canWalk(lip[i][0], lip[i][1], "home") && !canWalk(x, z, "home")) return [x, z];
          moved = true;
          const d = Math.hypot(x - fx, z - fz) || 1;
          return [x - ((x - fx) / d) * 0.3, z - ((z - fz) / d) * 0.3];
        });
        if (!moved) break;
      }
      lakes.push({
        id: feature.id,
        outline: water,
        y: feature.tiers[top].y + 0.32,
        floorY: feature.tiers[top].y,
        kind: "lake",
      });
    }
  return lakes;
}
/** Pond ellipse (Korea & Stanford share Landscape's pond). */
export const pondFor = (world: WorldId) => (world === "home" ? null : POND);

/* ------------------------------------------------------------------ grass */

export type GrassTuft = {
  x: number;
  z: number;
  /** Ground height under the tuft. */
  y: number;
  scale: number;
  angle: number;
  /** 0..1 colour pick (dry ↔ lush) and tall-reed flag. */
  shade: number;
  reed: boolean;
};

const doorAvoid = (world: WorldId) =>
  doorsInWorld(world).map(({ x, z }) => [x, z] as const);

/** Grass tufts for a world, ranked so that any prefix is an even thinning. */
const grassCache = new Map<WorldId, GrassTuft[]>();
export function grassField(world: WorldId, max: number): GrassTuft[] {
  let all = grassCache.get(world);
  if (!all) grassCache.set(world, (all = placeGrass(world)));
  return all.slice(0, max);
}
function placeGrass(world: WorldId): GrassTuft[] {
  const shore = distanceGrid(SHORE[world]);
  const relief = reliefTest(world);
  const paved = rectGrid(PAVED[world], 2.6);
  const doors = doorAvoid(world);
  const { minX, maxX, minZ, maxZ } = bounds(SHORE[world]);
  const spacing = world === "korea" ? 0.5 : 0.42;
  const out: (GrassTuft & { rank: number })[] = [];
  const pond = pondFor(world);
  for (let gx = minX; gx <= maxX; gx += spacing)
    for (let gz = minZ; gz <= maxZ; gz += spacing) {
      const x = gx + (fhash(gx, gz, 11) - 0.5) * spacing * 0.9,
        z = gz + (fhash(gx, gz, 23) - 0.5) * spacing * 0.9;
      const shoreGap = shore(x, z);
      if (shoreGap < 0.3) continue;
      if (relief(x, z)) continue;
      const near = paved(x, z);
      if (near.some((rect) => inRect(x, z, rect, 0.12))) continue;
      if (doors.some(([dx, dz]) => Math.hypot(x - dx, z - dz) < 1.6)) continue;
      if (pond && ((x - pond.x) / (pond.radiusX + 0.3)) ** 2 + ((z - pond.z) / (pond.radiusZ + 0.3)) ** 2 < 1) continue;
      const walk = canWalk(x, z, world);
      // Off the walkable lawn only along the shore verge (not under solids).
      if (!walk && shoreGap > 1.6) continue;
      // Clumps: lush near path edges, building skirts and the shore; sparse
      // in the middle of open lawns so the ground still reads.
      let edge = 2.5;
      for (const rect of near)
        if (rect[2] * rect[3] > 2) edge = Math.min(edge, rectGap(x, z, rect));
      const edgeBoost = Math.max(0, 1 - edge / 1.6) * 0.55 + (walk ? 0 : 0.45) + Math.max(0, 1 - shoreGap / 2.2) * 0.35;
      const field = clump(x, z, 5.5, 7) * 0.7 + clump(x, z, 1.7, 9) * 0.3;
      const keep = Math.min(1, 0.08 + 1.6 * Math.max(0, field - 0.45) * 2 + edgeBoost * 0.8);
      if (fhash(x, z, 31) > keep) continue;
      out.push({
        x,
        z,
        y: 0.14,
        scale: 0.75 + fhash(x, z, 41) * 0.6 + edgeBoost * 0.45,
        angle: fhash(x, z, 43) * Math.PI * 2,
        shade: fhash(x, z, 47) * 0.6 + clump(x, z, 9, 3) * 0.4,
        reed: false,
        rank: fhash(x, z, 53),
      });
    }
  out.sort((a, b) => a.rank - b.rank);
  return out;
}

/* ------------------------------------------------------------------ rocks */

export type RockPiece = {
  x: number;
  y: number;
  z: number;
  /** Footprint radius (world) and height scale. */
  size: number;
  height: number;
  angle: number;
  variant: 0 | 1 | 2 | 3;
  tone: number;
};

/** True when a rock of radius `r` at (x, z) touches walkable ground. */
export function touchesWalkable(x: number, z: number, r: number, world: WorldId) {
  if (canWalk(x, z, world)) return true;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (canWalk(x + Math.cos(a) * r, z + Math.sin(a) * r, world)) return true;
  }
  return false;
}

export function rockField(world: WorldId): RockPiece[] {
  const rocks: RockPiece[] = [];
  const doors = doorAvoid(world);
  const add = (piece: RockPiece) => {
    if (touchesWalkable(piece.x, piece.z, piece.size * 0.8, world)) return;
    if (doors.some(([dx, dz]) => Math.hypot(piece.x - dx, piece.z - dz) < 2.5)) return;
    rocks.push(piece);
  };
  // Along the coast, just beyond the walking edge: clustered outcrops with
  // gaps, never a continuous wall.
  const coast = resampleLoop(COAST[world], world === "home" ? 260 : 300);
  const normals = loopNormals(coast);
  coast.forEach(([cx, cz], i) => {
    const group = clump(cx, cz, 7, 61);
    if (group < 0.52) return;
    const [nx, nz] = normals[i];
    const count = 1 + Math.floor(hash01(i, 3, world.length) * 2.2);
    for (let k = 0; k < count; k++) {
      const size = 0.45 + hash01(i, k, 5) * 0.9 * group;
      const out = world === "home" ? 0.15 + size * 0.5 : 0.1 + hash01(i, k, 7) * 0.6;
      const along = (hash01(i, k, 9) - 0.5) * 1.2;
      const x = cx + nx * out - nz * along,
        z = cz + nz * out + nx * along;
      const ground = world === "home" ? -0.25 - hash01(i, k, 13) * 0.35 : world === "stanford" ? -0.34 : 0.14;
      add({
        x,
        y: ground,
        z,
        size,
        height: 0.6 + hash01(i, k, 17) * 0.7,
        angle: Math.atan2(nz, nx) + (hash01(i, k, 19) - 0.5) * 0.8,
        variant: (Math.floor(hash01(i, k, 23) * 4) as 0 | 1 | 2 | 3),
        tone: hash01(i, k, 29),
      });
    }
  });
  // Lake rims: granite steps leaning into the water.
  for (const lake of lakesFor(world)) {
    const loop = resampleLoop(lake.outline, 70);
    const normals = loopNormals(loop);
    loop.forEach(([lx, lz], i) => {
      if (clump(lx, lz, 4, 67) < 0.45) return;
      const [nx, nz] = normals[i];
      const size = 0.55 + hash01(i, 31, 3) * 0.9;
      add({
        x: lx + nx * 0.25,
        y: lake.floorY + 0.05,
        z: lz + nz * 0.25,
        size,
        height: 0.9 + hash01(i, 37, 3) * 0.8,
        angle: Math.atan2(nz, nx),
        variant: (Math.floor(hash01(i, 41, 3) * 4) as 0 | 1 | 2 | 3),
        tone: hash01(i, 43, 3),
      });
    });
  }
  // Korea: granite boulders along the foot of both Han embankments.
  if (world === "korea")
    for (let x = -10; x < 61; x += 1.7) {
      for (const [z, side] of [
        [22.6, 1],
        [43.4, -1],
      ] as const) {
        if (clump(x, z, 5, 71) < 0.4) continue;
        const size = 0.5 + hash01(x, z, 3) * 0.8;
        add({
          x: x + (hash01(x, z, 5) - 0.5),
          y: -2.55,
          z: z + side * size * 0.45,
          size,
          height: 0.8 + hash01(x, z, 7) * 0.7,
          angle: hash01(x, z, 9) * Math.PI,
          variant: (Math.floor(hash01(x, z, 11) * 4) as 0 | 1 | 2 | 3),
          tone: hash01(x, z, 13),
        });
      }
    }
  return rocks;
}

/* --------------------------------------------------------- shoreline kit */

export type ShorePiece = {
  kind: "pebble" | "lily" | "reed";
  x: number;
  y: number;
  z: number;
  size: number;
  angle: number;
  tone: number;
};

/** Pebbles, reeds and lily pads around lakes and the pond. */
export function shoreField(world: WorldId): ShorePiece[] {
  const out: ShorePiece[] = [];
  const edges: { loop: P2[]; y: number; floorY: number }[] = lakesFor(world).map((lake) => ({
    loop: resampleLoop(lake.outline, 140),
    y: lake.y,
    floorY: lake.floorY,
  }));
  const pond = pondFor(world);
  if (pond)
    edges.push({
      loop: Array.from({ length: 90 }, (_, i): P2 => {
        const a = (i / 90) * Math.PI * 2;
        return [pond.x + Math.cos(a) * pond.radiusX, pond.z + Math.sin(a) * pond.radiusZ];
      }),
      y: 0.255,
      floorY: 0.13,
    });
  for (const { loop, y, floorY } of edges) {
    const normals = loopNormals(loop);
    loop.forEach(([x, z], i) => {
      const [nx, nz] = normals[i];
      // Reed beds in clumps on the water's edge.
      if (clump(x, z, 3, 83) > 0.55)
        for (let k = 0; k < 3; k++) {
          const px = x - nx * (0.1 + hash01(i, k, 1) * 0.5) + (hash01(i, k, 2) - 0.5) * 0.4,
            pz = z - nz * (0.1 + hash01(i, k, 1) * 0.5) + (hash01(i, k, 3) - 0.5) * 0.4;
          out.push({ kind: "reed", x: px, y: y - 0.05, z: pz, size: 0.8 + hash01(i, k, 4) * 0.7, angle: hash01(i, k, 5) * 6.28, tone: hash01(i, k, 6) });
        }
      // Pebbles on the water's edge (under the surface or just at it).
      if (hash01(i, 7, 7) < 0.55)
        out.push({ kind: "pebble", x: x - nx * 0.15, y: Math.max(floorY, y - 0.12), z: z - nz * 0.15, size: 0.12 + hash01(i, 8, 8) * 0.18, angle: hash01(i, 9, 9) * 6.28, tone: hash01(i, 10, 10) });
      // Lily pads drift a little way in, in small rafts.
      if (clump(x, z, 2.5, 89) > 0.62) {
        const inward = 0.8 + hash01(i, 11, 11) * 1.6;
        for (let k = 0; k < 3; k++) {
          const px = x - nx * (inward + k * 0.35) + (hash01(i, k, 12) - 0.5) * 0.6,
            pz = z - nz * (inward + k * 0.35) + (hash01(i, k, 13) - 0.5) * 0.6;
          out.push({ kind: "lily", x: px, y: y + 0.012, z: pz, size: 0.22 + hash01(i, k, 14) * 0.18, angle: hash01(i, k, 15) * 6.28, tone: hash01(i, k, 16) });
        }
      }
    });
  }
  return out;
}

/* ----------------------------------------------------------------- groves */

export type GroveTree = {
  p: readonly [number, number, number];
  size: number;
  variant: number;
  species?: "oak" | "pine" | "redwood" | "palm";
};

const minDistanceToLoop = (x: number, z: number, loop: readonly P2[]) => {
  let best = Infinity;
  for (const [px, pz] of loop) best = Math.min(best, (px - x) ** 2 + (pz - z) ** 2);
  return Math.sqrt(best);
};

/**
 * Extra trees on land nobody walks on, so each island reads as a wooded
 * place from the overview: Korea's red pines along the granite apron, Home's
 * autumn groves round its cove lakes, Stanford's oaks and redwoods out on the
 * golden verge. Trunks keep 2.4 m from the walkable lawn (canopies may hang
 * over it, as the existing forest's do) and well clear of rails and doors.
 */
export function groveField(world: WorldId): GroveTree[] {
  const trees: GroveTree[] = [];
  const doors = doorAvoid(world);
  const rails: readonly P2[] =
    world === "home" ? HOME_RAIL_POINTS : world === "stanford" ? STANFORD_RAIL_POINTS : [];
  const ok = (x: number, z: number, clear = 2.4) =>
    !touchesWalkable(x, z, clear, world) &&
    !doors.some(([dx, dz]) => Math.hypot(x - dx, z - dz) < 5) &&
    (!rails.length || minDistanceToLoop(x, z, rails) > 3.2) &&
    !trees.some(({ p }) => Math.hypot(p[0] - x, p[2] - z) < 2.6);
  if (world === "korea") {
    const coast = resampleLoop(KOREA_COAST, 220);
    const normals = loopNormals(coast);
    coast.forEach(([cx, cz], i) => {
      if (clump(cx, cz, 9, 101) < 0.42) return;
      const [nx, nz] = normals[i];
      for (const inset of [1.6, 3.4]) {
        const x = cx - nx * inset + (fhash(cx, cz, inset) - 0.5),
          z = cz - nz * inset + (fhash(cz, cx, inset) - 0.5);
        if (z > 20 && z < 46 && x > -14 && x < 64) continue; // the Han's cut
        if (terrainHeightAt(x, z, world) !== 0 || !ok(x, z, 1.6)) continue;
        if (LAND.korea(x, z, 0)) continue; // apron only (outside the streets)
        const maple = fhash(x, z, 7) < 0.22;
        trees.push({
          p: [x, KOREA_APRON_Y, z],
          size: 0.75 + fhash(x, z, 9) * 0.45,
          variant: maple ? 1 + Math.floor(fhash(x, z, 11) * 2) : 0,
          species: maple ? undefined : "pine",
        });
      }
    });
  }
  if (world === "home")
    for (const lake of lakesFor(world)) {
      const feature = TERRAIN.home.find((f) => f.id === lake.id)!;
      const shelf = terrainTierLoop(feature, feature.tiers.length - 1);
      const loop = resampleLoop(lipLoop(lake.outline, 1.6), 40);
      loop.forEach(([x, z], i) => {
        if (clump(x, z, 5, 103) < 0.4) return;
        if (!insidePolygon(x, z, shelf)) return;
        if (!ok(x, z, 1.2)) return;
        trees.push({
          p: [x, lake.floorY, z],
          size: 0.7 + fhash(x, z, 13) * 0.4,
          variant: i % 3,
        });
      });
    }
  if (world === "stanford") {
    const coast = resampleLoop(STANFORD_COAST, 200);
    const normals = loopNormals(coast);
    coast.forEach(([cx, cz], i) => {
      if (clump(cx, cz, 10, 107) < 0.5) return;
      const [nx, nz] = normals[i];
      const x = cx - nx * 1.4,
        z = cz - nz * 1.4;
      if (terrainHeightAt(x, z, world) !== 0 || !ok(x, z, 1.4)) return;
      const pick = fhash(x, z, 17);
      trees.push({
        p: [x, -0.34, z],
        size: 0.7 + fhash(x, z, 19) * 0.35,
        variant: i % 3,
        species: pick < 0.45 ? "oak" : pick < 0.7 ? "redwood" : undefined,
      });
    });
  }
  return trees;
}
