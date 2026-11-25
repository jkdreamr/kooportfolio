import { ShapeUtils, Vector2 } from "three";
import { HOME_ISLAND } from "./homeIsland";
import { KOREA_SHORE } from "./koreaDistrict";
import { STANFORD_RAIL_POINTS } from "../../shared/stanford-transport";
import {
  ISLAND_SCREEN_DOWN_GROUND,
  ISLAND_SCREEN_RIGHT,
  ISLAND_SCREEN_UP,
  projectRight,
  projectUp,
} from "./islandView";
import type { WorldId } from "./worlds";

// Pure, deterministic art data for the rock that hangs beneath each island.
// The playable land, rails, rivers and colliders are owned elsewhere: every
// piece here sits below the existing ground slabs or out in the open sky.

type V2 = readonly [number, number];
export type V3 = [number, number, number];

export type UndersideIslet = {
  /** Screen offset from the island's view centre, in world units at zoom 1. */
  screen: V2;
  topY: number;
  radius: number;
  depth: number;
  trees: number;
};
export type UndersideFall = {
  /** A point near the rim; the fall springs from the closest outline vertex. */
  at: V2;
  springY: number;
  length: number;
  width: number;
};
export type UndersideSpec = {
  world: WorldId;
  outline: V2[];
  topY: number;
  depth: number;
  /** Tip offset toward the camera, as a fraction of the mean radius. */
  tipShift: number;
  strata: readonly string[];
  turf: string;
  islets: readonly UndersideIslet[];
  falls: readonly UndersideFall[];
  seed: number;
};

/** Rings of the hanging bowl. Paired rings make chunky, undercut terraces:
 * the near-flat step hides from the raised camera, the next wall shows. */
export const UNDERSIDE_PROFILE = [
  { t: 0, f: 1, smooth: 0, jitter: 0, lod: 0 },
  { t: 0.025, f: 1.035, smooth: 2, jitter: 0.01, lod: 0 },
  { t: 0.075, f: 1, smooth: 4, jitter: 0.022, lod: 0 },
  { t: 0.09, f: 0.95, smooth: 6, jitter: 0.026, lod: 0 },
  { t: 0.2, f: 0.92, smooth: 10, jitter: 0.03, lod: 0 },
  { t: 0.215, f: 0.86, smooth: 14, jitter: 0.032, lod: 1 },
  { t: 0.34, f: 0.8, smooth: 20, jitter: 0.036, lod: 1 },
  { t: 0.355, f: 0.74, smooth: 26, jitter: 0.036, lod: 1 },
  { t: 0.49, f: 0.65, smooth: 34, jitter: 0.04, lod: 1 },
  { t: 0.505, f: 0.58, smooth: 42, jitter: 0.04, lod: 2 },
  { t: 0.64, f: 0.48, smooth: 52, jitter: 0.045, lod: 2 },
  { t: 0.655, f: 0.42, smooth: 60, jitter: 0.045, lod: 2 },
  { t: 0.79, f: 0.27, smooth: 70, jitter: 0.05, lod: 2 },
  { t: 0.9, f: 0.13, smooth: 80, jitter: 0.06, lod: 2 },
] as const;

/** Deterministic integer hash in [0, 1). No Math.random anywhere in the art. */
export function hash01(...values: number[]) {
  let h = 2166136261;
  for (const value of values) h = Math.imul(h ^ (value | 0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const signedArea = (points: readonly V2[]) =>
  points.reduce((sum, [x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    return sum + x * nz - nx * z;
  }, 0) / 2;

/** Counter-clockwise in (x, z), so the outward edge normal is (dz, -dx). */
function ccw(points: readonly V2[]): V2[] {
  const open =
    points.length > 1 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1]
      ? points.slice(0, -1)
      : [...points];
  return signedArea(open) < 0 ? open.reverse() : open;
}

/** Keep every original corner and distribute `count` samples by edge length. */
export function resampleOutline(points: readonly V2[], count: number): V2[] {
  const lengths = points.map(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    return Math.hypot(nx - x, nz - z);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  const ideal = lengths.map((length) => (length / total) * count);
  const segments = ideal.map((value) => Math.max(1, Math.floor(value)));
  let missing = count - segments.reduce((a, b) => a + b, 0);
  const order = ideal
    .map((value, i) => [value - Math.floor(value), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; missing > 0; k = (k + 1) % order.length, missing--)
    segments[order[k][1]]++;
  for (let k = order.length - 1; missing < 0; k = (k + order.length - 1) % order.length) {
    const i = order[k][1];
    if (segments[i] > 1) {
      segments[i]--;
      missing++;
    }
  }
  const out: V2[] = [];
  points.forEach(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    for (let s = 0; s < segments[i]; s++) {
      const t = s / segments[i];
      out.push([x + (nx - x) * t, z + (nz - z) * t]);
    }
  });
  return out;
}

/** Even arc-length samples of a smooth closed curve. */
export function resampleCurve(points: readonly V2[], count: number): V2[] {
  const lengths = points.map(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    return Math.hypot(nx - x, nz - z);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  const out: V2[] = [];
  let edge = 0,
    start = 0;
  for (let s = 0; s < count; s++) {
    const target = (s / count) * total;
    while (start + lengths[edge] < target) start += lengths[edge++];
    const [x, z] = points[edge];
    const [nx, nz] = points[(edge + 1) % points.length];
    const t = lengths[edge] ? (target - start) / lengths[edge] : 0;
    out.push([x + (nx - x) * t, z + (nz - z) * t]);
  }
  return out;
}

/** Mitred offset; positive grows a counter-clockwise outline. */
export function offsetOutline(points: readonly V2[], distance: number): V2[] {
  const n = points.length;
  const normal = (a: V2, b: V2): V2 => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  };
  return points.map((point, i) => {
    const a = normal(points[(i + n - 1) % n], point);
    const b = normal(point, points[(i + 1) % n]);
    const scale = distance / Math.max(0.35, 1 + a[0] * b[0] + a[1] * b[1]);
    return [point[0] + (a[0] + b[0]) * scale, point[1] + (a[1] + b[1]) * scale];
  });
}

/** Taubin smoothing: removes corners and notches without shrinking the loop. */
export function smoothOutline(points: readonly V2[], iterations: number): V2[] {
  let current = points.map(([x, z]) => [x, z] as [number, number]);
  const n = current.length;
  for (let k = 0; k < iterations * 2; k++) {
    const factor = k % 2 ? -0.53 : 0.5;
    current = current.map(([x, z], i) => {
      const [px, pz] = current[(i + n - 1) % n];
      const [nx, nz] = current[(i + 1) % n];
      return [
        x + factor * ((px + nx) / 2 - x),
        z + factor * ((pz + nz) / 2 - z),
      ];
    });
  }
  return current;
}

function centroid(points: readonly V2[]): V2 {
  let area = 0,
    cx = 0,
    cz = 0;
  points.forEach(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    const cross = x * nz - nx * z;
    area += cross;
    cx += (x + nx) * cross;
    cz += (z + nz) * cross;
  });
  return [cx / (3 * area), cz / (3 * area)];
}

const ellipse = (
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  count: number,
): V2[] =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz];
  });

const SPECS: Record<WorldId, UndersideSpec> = {
  home: {
    world: "home",
    // Tucked 0.3 above the base of the accepted coastal strata skirt.
    outline: ellipse(
      HOME_ISLAND.centerX,
      HOME_ISLAND.centerZ,
      HOME_ISLAND.radiusX + 1.7,
      HOME_ISLAND.radiusZ + 1.7,
      96,
    ),
    topY: -3.9,
    depth: 38,
    tipShift: 0.22,
    strata: ["#8b8466", "#67716e", "#9b8e74", "#55646a"],
    turf: "#6c8653",
    islets: [],
    falls: [],
    seed: 11,
  },
  korea: {
    world: "korea",
    outline: offsetOutline(resampleOutline(ccw(KOREA_SHORE), 128), -1),
    topY: -3,
    depth: 58,
    tipShift: 0.2,
    strata: ["#969b8d", "#737c77", "#a4a697", "#626d6b"],
    turf: "#7d9068",
    islets: [],
    falls: [],
    seed: 23,
  },
  stanford: {
    world: "stanford",
    // A rock shelf carries the coastal viaduct's piers, 2.4 beyond the rail.
    outline: resampleCurve(offsetOutline(ccw(STANFORD_RAIL_POINTS), 2.4), 128),
    topY: -3,
    depth: 48,
    tipShift: 0.2,
    strata: ["#b39169", "#8d6f50", "#c0a079", "#79604a"],
    turf: "#639343",
    islets: [],
    falls: [],
    seed: 37,
  },
};

export const undersideSpec = (world: WorldId) => SPECS[world];

export type RockMesh = { positions: number[]; colors: number[] };
export type UndersideRing = { points: V3[]; t: number };
export type UndersideModel = {
  spec: UndersideSpec;
  center: V2;
  radius: number;
  rings: UndersideRing[];
  apex: V3;
  rock: RockMesh;
};

function shade(hex: string, factor: number): V3 {
  const value = parseInt(hex.slice(1), 16);
  // sRGB hex to linear, so vertex colors match MeshStandardMaterial colors.
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [
    linear((value >> 16) & 255) * factor,
    linear((value >> 8) & 255) * factor,
    linear(value & 255) * factor,
  ];
}

function pushTriangle(
  mesh: RockMesh,
  a: V3,
  b: V3,
  c: V3,
  color: V3,
) {
  mesh.positions.push(...a, ...b, ...c);
  for (let i = 0; i < 3; i++) mesh.colors.push(...color);
}

/** Strip between an upper and a lower counter-clockwise ring; the lower ring may
 * have half the vertices (its vertex j sits under upper vertex 2j). */
function pushStrip(
  mesh: RockMesh,
  upper: V3[],
  lower: V3[],
  color: (i: number) => V3,
) {
  const n = upper.length;
  if (lower.length === n) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pushTriangle(mesh, upper[i], upper[j], lower[i], color(i * 2));
      pushTriangle(mesh, upper[j], lower[j], lower[i], color(i * 2 + 1));
    }
    return;
  }
  const m = lower.length;
  for (let j = 0; j < m; j++) {
    const a = upper[2 * j],
      b = upper[(2 * j + 1) % n],
      c = upper[(2 * j + 2) % n];
    const p = lower[j],
      q = lower[(j + 1) % m];
    pushTriangle(mesh, a, b, p, color(j * 3));
    pushTriangle(mesh, b, c, q, color(j * 3 + 1));
    pushTriangle(mesh, b, q, p, color(j * 3 + 2));
  }
}

const models = new Map<WorldId, UndersideModel>();

/** Built once per world and cached; the result is shared and must not be mutated. */
export function undersideModel(world: WorldId): UndersideModel {
  const cached = models.get(world);
  if (cached) return cached;
  const spec = SPECS[world];
  const base = spec.outline;
  const center = centroid(base);
  const radius =
    base.reduce((sum, [x, z]) => sum + Math.hypot(x - center[0], z - center[1]), 0) /
    base.length;
  const shift: V2 = [
    ISLAND_SCREEN_DOWN_GROUND[0] * spec.tipShift * radius,
    ISLAND_SCREEN_DOWN_GROUND[2] * spec.tipShift * radius,
  ];
  const rings: UndersideRing[] = UNDERSIDE_PROFILE.map((ring, k) => {
    let outline = smoothOutline(base, ring.smooth);
    for (let lod = 0; lod < ring.lod; lod++)
      outline = outline.filter((_, i) => i % 2 === 0);
    const pull = ring.t ** 1.5;
    const points = outline.map(([x, z], i): V3 => {
      const index = i << ring.lod;
      const jitter = (hash01(spec.seed, k, index) - 0.5) * 2 * ring.jitter;
      const scale = ring.f * (1 + jitter);
      const angle = Math.atan2(z - center[1], x - center[0]);
      const dip =
        k < 2
          ? (hash01(spec.seed, k, index, 7) - 0.5) * 0.3 * k
          : Math.sin(angle * 3 + k * 1.7) * 0.7 +
            (hash01(spec.seed, k, index, 9) - 0.5) * 0.8;
      return [
        center[0] + shift[0] * pull + (x - center[0]) * scale,
        spec.topY - ring.t * spec.depth + dip,
        center[1] + shift[1] * pull + (z - center[1]) * scale,
      ];
    });
    return { points, t: ring.t };
  });
  const apex: V3 = [
    center[0] + shift[0],
    spec.topY - spec.depth,
    center[1] + shift[1],
  ];

  const rock: RockMesh = { positions: [], colors: [] };
  // A cap closes the bowl beneath the ground slab, and for Stanford forms the
  // shelf under the viaduct. Triangulated once; flat, upward-facing.
  const top = rings[0].points;
  const cap = ShapeUtils.triangulateShape(
    top.map(([x, , z]) => new Vector2(x, z)),
    [],
  );
  for (const [a, b, c] of cap) {
    const [pa, pb, pc] = [top[a], top[b], top[c]];
    const ny = (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]);
    const tint = shade(spec.strata[0], 0.82 + hash01(spec.seed, a, b, c) * 0.08);
    if (ny >= 0) pushTriangle(rock, pa, pb, pc, tint);
    else pushTriangle(rock, pa, pc, pb, tint);
  }
  let wall = 0;
  for (let k = 0; k < rings.length; k++) {
    const upper = rings[k].points;
    const t = k + 1 < rings.length ? (rings[k].t + rings[k + 1].t) / 2 : 0.95;
    // Near-horizontal undercuts sit between paired rings; walls alternate strata.
    const undercut =
      k + 1 < rings.length &&
      UNDERSIDE_PROFILE[k + 1].t - UNDERSIDE_PROFILE[k].t < 0.02;
    const band = undercut ? wall : wall++;
    const hex = spec.strata[band % spec.strata.length];
    const depthShade = 1 - 0.3 * t;
    const color = (i: number) =>
      shade(hex, depthShade * (0.9 + hash01(spec.seed, k, i, 3) * 0.12));
    if (k + 1 < rings.length) pushStrip(rock, upper, rings[k + 1].points, color);
    else
      for (let i = 0; i < upper.length; i++)
        pushTriangle(rock, upper[i], upper[(i + 1) % upper.length], apex, color(i));
  }
  const model = { spec, center, radius, rings, apex, rock };
  models.set(world, model);
  return model;
}

/** Converts a screen-relative placement (from the island's view centre at y=0.7)
 * into world space at the given height. */
export function screenToWorld(
  view: V2,
  screen: V2,
  y: number,
): V3 {
  const [sx, sy] = screen;
  const horizontal = Math.hypot(ISLAND_SCREEN_UP[0], ISLAND_SCREEN_UP[2]);
  const toward = (ISLAND_SCREEN_UP[1] * (y - 0.7) - sy) / horizontal;
  return [
    view[0] + ISLAND_SCREEN_RIGHT[0] * sx + ISLAND_SCREEN_DOWN_GROUND[0] * toward,
    y,
    view[1] + ISLAND_SCREEN_RIGHT[2] * sx + ISLAND_SCREEN_DOWN_GROUND[2] * toward,
  ];
}

export type ScreenBounds = { left: number; right: number; top: number; bottom: number };

/** Screen extents (world units at zoom 1) of a point set around a view centre. */
export function screenBounds(points: Iterable<V3>, view: V2): ScreenBounds {
  const bounds = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const [x, y, z] of points) {
    const dx = x - view[0],
      dy = y - 0.7,
      dz = z - view[1];
    const sx = projectRight(dx, dy, dz),
      sy = projectUp(dx, dy, dz);
    bounds.left = Math.max(bounds.left, -sx);
    bounds.right = Math.max(bounds.right, sx);
    bounds.top = Math.max(bounds.top, sy);
    bounds.bottom = Math.max(bounds.bottom, -sy);
  }
  return bounds;
}

/** Every vertex of the hanging rock, for camera fitting and tests. */
export function* undersidePoints(world: WorldId): Generator<V3> {
  const model = undersideModel(world);
  for (const ring of model.rings) yield* ring.points;
  yield model.apex;
}

/** Room kept beneath the tip so it clears the bottom tool rail. */
export const UNDERSIDE_FRAME_MARGIN = 4;
const frames = new Map<WorldId, ScreenBounds>();

/** Cached screen extents of everything hanging beneath an island, with margin. */
export function undersideFrame(world: WorldId, view: V2): ScreenBounds {
  let frame = frames.get(world);
  if (!frame) {
    const bounds = screenBounds(undersidePoints(world), view);
    frame = { ...bounds, bottom: bounds.bottom + UNDERSIDE_FRAME_MARGIN };
    frames.set(world, frame);
  }
  return frame;
}
