import { ShapeUtils, Vector2 } from "three";
import { HOME_ISLAND } from "./homeIsland";
import { KOREA_SHORE } from "./koreaDistrict";
import {
  STANFORD_RAIL_POINTS,
  STANFORD_RAIL_PROFILE,
} from "../../shared/stanford-transport";
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
// One shared ring/strip builder; each world brings its own silhouette, rock
// language, islets and falls (see docs/ART_BIBLE.md, "Floating islands").

export type V2 = readonly [number, number];
export type V3 = [number, number, number];

export type ProfileRing = {
  /** Depth fraction below topY. */
  t: number;
  /** Outline scale about the centroid. */
  f: number;
  /** Taubin iterations applied to the outline at this depth. */
  smooth: number;
  /** Radial jitter, as a fraction of the local radius. */
  jitter: number;
  /** Halve the vertex count this many times (changes only across undercuts). */
  lod: number;
};
export type Spire = {
  /** Left-to-right position across the camera-facing bottom rim, 0 to 1:
   * spires hang where the raised camera can see them, below the near edge. */
  at: number;
  /** How far from the body's axis toward that rim vertex, 0 to 1. */
  reach: number;
  /** Depth fraction of the body at which the spire's root is buried. */
  rootT: number;
  length: number;
  radius: number;
  sides: number;
};
export type IsletShape = "bowl" | "spire" | "mesa";
export type IsletProp = "none" | "shed" | "jeongja" | "cairns" | "arcade";
export type IsletTree = {
  species: "oak" | "pine" | "redwood" | "palm";
  size: number;
  /** Offset from the islet's top centre, as a fraction of its radius. */
  at: V2;
};
export type UndersideIslet = {
  /** Screen offset from the island's view centre, in world units at zoom 1. */
  screen: V2;
  topY: number;
  radius: number;
  depth: number;
  cap: string;
  trees: readonly IsletTree[];
  prop: IsletProp;
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
  /** The overview camera's look-at point; islandCamera.islandCenter agrees. */
  view: V2;
  outline: V2[];
  topY: number;
  depth: number;
  /** Tip offset toward the camera, as a fraction of the mean radius. */
  tipShift: number;
  profile: readonly ProfileRing[];
  bottom: "point" | "flat";
  /** Share of radial jitter held constant down each column: vertical cleavage. */
  cleave: number;
  /** Strata waviness and per-vertex height noise. */
  dip: number;
  yJitter: number;
  strata: readonly string[];
  /** Darkening of the strata from the top of the rock to its tip. */
  darken: number;
  /** Colour of the flat cap: hidden under slabs, Stanford's viaduct shelf. */
  shelf: string;
  spires: readonly Spire[];
  isletShape: IsletShape;
  islets: readonly UndersideIslet[];
  /** Distance outward from the outline at which falls leave the cliff. */
  springOffset: number;
  falls: readonly UndersideFall[];
  seed: number;
};

/** Deterministic integer hash in [0, 1): the art never draws random numbers. */
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


/** Paired rings per band: a near-flat undercut (hidden from the raised camera)
 * then the next visible wall. `shape` maps depth fraction to outline scale. */
function bandedProfile(
  shape: (t: number) => number,
  bands: readonly number[],
  step: number,
  jitter: readonly [number, number],
  lodAt: readonly [number, number],
  smoothing: number,
): ProfileRing[] {
  const rings: ProfileRing[] = [
    { t: 0, f: 1, smooth: 0, jitter: 0, lod: 0 },
    { t: 0.025, f: 1.035, smooth: 2, jitter: jitter[0] * 0.4, lod: 0 },
  ];
  for (const band of bands) {
    const f = shape(band);
    const j = jitter[0] + (jitter[1] - jitter[0]) * band;
    const smooth = Math.round(3 + band * smoothing);
    rings.push({
      t: band,
      f: f + step / 2,
      smooth,
      jitter: j,
      lod: rings[rings.length - 1].lod,
    });
    rings.push({
      t: band + 0.012,
      f: f - step / 2,
      smooth: smooth + 2,
      jitter: j,
      lod: band >= lodAt[1] ? 2 : band >= lodAt[0] ? 1 : 0,
    });
  }
  return rings;
}

const HOME_VIEW: V2 = [HOME_ISLAND.centerX, HOME_ISLAND.centerZ];
const KOREA_VIEW: V2 = [7, 16];
const STANFORD_VIEW: V2 = [
  STANFORD_RAIL_PROFILE.centerX,
  STANFORD_RAIL_PROFILE.centerZ,
];

const SPECS: Record<WorldId, UndersideSpec> = {
  // Cozy hand-built village: a rounded warm-earth bowl of soft layered strata.
  home: {
    world: "home",
    view: HOME_VIEW,
    // Tucked 0.3 above the base of the accepted coastal strata skirt.
    outline: ellipse(
      HOME_ISLAND.centerX,
      HOME_ISLAND.centerZ,
      HOME_ISLAND.radiusX + 1.7,
      HOME_ISLAND.radiusZ + 1.7,
      96,
    ),
    topY: -3.9,
    depth: 36,
    tipShift: 0.2,
    profile: bandedProfile(
      (t) => (1 - t * t) ** 0.55,
      [0.09, 0.2, 0.32, 0.44, 0.56, 0.68, 0.79, 0.88, 0.95],
      0.028,
      [0.016, 0.04],
      [0.3, 0.6],
      40,
    ),
    bottom: "point",
    cleave: 0.15,
    dip: 0.45,
    yJitter: 0.35,
    strata: ["#a98a62", "#8b6d4f", "#b9996f", "#7c624b", "#9e7d5a", "#6f5a47"],
    darken: 0.32,
    shelf: "#7f6a50",
    spires: [],
    isletShape: "bowl",
    islets: [
      {
        screen: [-41, -15],
        topY: -1.2,
        radius: 4.8,
        depth: 9,
        cap: "#6c8653",
        trees: [{ species: "oak", size: 0.62, at: [0.35, -0.45] }],
        prop: "shed",
      },
      {
        screen: [-29, -33],
        topY: -14,
        radius: 4,
        depth: 8,
        cap: "#6c8653",
        trees: [{ species: "oak", size: 0.55, at: [0.1, -0.2] }],
        prop: "none",
      },
      {
        screen: [40, -30],
        topY: -6.5,
        radius: 5.2,
        depth: 10,
        cap: "#6f8a55",
        trees: [
          { species: "oak", size: 0.7, at: [-0.3, -0.25] },
          { species: "oak", size: 0.5, at: [0.45, 0.3] },
        ],
        prop: "none",
      },
      {
        screen: [24, -42],
        topY: -12.5,
        radius: 3.2,
        depth: 7,
        cap: "#6c8653",
        trees: [{ species: "oak", size: 0.45, at: [0, 0] }],
        prop: "none",
      },
    ],
    springOffset: 0.95,
    falls: [
      { at: [25, 6], springY: -1.4, length: 22, width: 2 },
      { at: [-1, 15.5], springY: -1.4, length: 26, width: 2.4 },
    ],
    seed: 11,
  },
  // Korean granite peaks turned upside down: pale, cleaved, several spires.
  korea: {
    world: "korea",
    view: KOREA_VIEW,
    outline: offsetOutline(resampleOutline(ccw(KOREA_SHORE), 128), -1),
    topY: -3,
    depth: 26,
    tipShift: 0.12,
    profile: bandedProfile(
      (t) => 1 - 0.46 * t,
      [0.1, 0.24, 0.4, 0.58, 0.78, 0.95],
      0.07,
      [0.03, 0.07],
      [0.35, 0.7],
      60,
    ),
    bottom: "flat",
    cleave: 0.85,
    dip: 0.25,
    yJitter: 0.5,
    strata: ["#cfcdc1", "#adb0a5", "#dcd9cb", "#999e95"],
    darken: 0.22,
    shelf: "#9fa497",
    // A hanging range: the tallest peaks near the middle of the silhouette.
    spires: [
      { at: 0.02, reach: 0.85, rootT: 0.55, length: 26, radius: 6, sides: 5 },
      { at: 0.18, reach: 0.8, rootT: 0.55, length: 37, radius: 7.5, sides: 6 },
      { at: 0.35, reach: 0.7, rootT: 0.55, length: 29, radius: 7, sides: 6 },
      { at: 0.52, reach: 0.62, rootT: 0.55, length: 44, radius: 10, sides: 7 },
      { at: 0.68, reach: 0.72, rootT: 0.55, length: 32, radius: 8, sides: 6 },
      { at: 0.84, reach: 0.8, rootT: 0.55, length: 39, radius: 8, sides: 7 },
      { at: 0.98, reach: 0.85, rootT: 0.55, length: 27, radius: 6, sides: 5 },
      { at: 0.45, reach: 0.2, rootT: 0.55, length: 28, radius: 9, sides: 6 },
    ],
    isletShape: "spire",
    islets: [
      {
        screen: [-53, -22],
        topY: -5,
        radius: 6.5,
        depth: 15,
        cap: "#7d9068",
        trees: [{ species: "pine", size: 0.55, at: [-0.55, 0.45] }],
        prop: "jeongja",
      },
      {
        screen: [60, -40],
        topY: -18,
        radius: 5,
        depth: 14,
        cap: "#748a62",
        trees: [
          { species: "pine", size: 0.7, at: [-0.2, -0.2] },
          { species: "pine", size: 0.5, at: [0.45, 0.35] },
        ],
        prop: "none",
      },
      {
        screen: [-37, -54],
        topY: -27,
        radius: 4.2,
        depth: 12,
        cap: "#8c9a78",
        trees: [],
        prop: "cairns",
      },
      {
        screen: [52, -55],
        topY: -24,
        radius: 3,
        depth: 10,
        cap: "#7d9068",
        trees: [{ species: "pine", size: 0.42, at: [0, 0] }],
        prop: "none",
      },
    ],
    springOffset: 1.15,
    falls: [
      { at: [71.5, 33], springY: -1.4, length: 46, width: 1.45 },
      { at: [-23, 53.5], springY: -1.4, length: 24, width: 1.15 },
    ],
    seed: 23,
  },
  // California foothill bluff: broad, flat sandstone mesa in horizontal bands.
  stanford: {
    world: "stanford",
    view: STANFORD_VIEW,
    // A rock shelf carries the coastal viaduct's piers, 2.4 beyond the rail.
    outline: resampleCurve(offsetOutline(ccw(STANFORD_RAIL_POINTS), 2.4), 128),
    topY: -3,
    depth: 30,
    tipShift: 0.06,
    profile: [
      { t: 0, f: 1, smooth: 0, jitter: 0, lod: 0 },
      { t: 0.03, f: 1.025, smooth: 1, jitter: 0.006, lod: 0 },
      { t: 0.2, f: 1.015, smooth: 2, jitter: 0.012, lod: 0 },
      { t: 0.212, f: 0.92, smooth: 4, jitter: 0.016, lod: 0 },
      { t: 0.41, f: 0.91, smooth: 6, jitter: 0.018, lod: 0 },
      { t: 0.422, f: 0.8, smooth: 10, jitter: 0.02, lod: 1 },
      { t: 0.6, f: 0.79, smooth: 14, jitter: 0.022, lod: 1 },
      { t: 0.612, f: 0.66, smooth: 18, jitter: 0.024, lod: 1 },
      { t: 0.78, f: 0.645, smooth: 22, jitter: 0.026, lod: 1 },
      { t: 0.792, f: 0.5, smooth: 26, jitter: 0.03, lod: 2 },
      { t: 0.93, f: 0.485, smooth: 30, jitter: 0.03, lod: 2 },
    ],
    bottom: "flat",
    cleave: 0.55,
    dip: 0,
    yJitter: 0.1,
    strata: ["#dcc79c", "#c9974f", "#e2cfa6", "#ad6440", "#d0b07c", "#97573a"],
    darken: 0.16,
    shelf: "#a8875c",
    spires: [],
    isletShape: "mesa",
    islets: [
      {
        screen: [-60, -29],
        topY: -6,
        radius: 5.2,
        depth: 7,
        cap: "#639343",
        trees: [
          { species: "redwood", size: 0.78, at: [-0.25, -0.2] },
          { species: "redwood", size: 0.6, at: [0.4, 0.3] },
        ],
        prop: "none",
      },
      {
        screen: [52, -41],
        topY: -8,
        radius: 4.6,
        depth: 6,
        cap: "#6a9446",
        trees: [
          { species: "palm", size: 0.6, at: [-0.3, 0] },
          { species: "palm", size: 0.48, at: [0.4, 0.35] },
        ],
        prop: "none",
      },
      {
        screen: [-73, -18],
        topY: -4,
        radius: 4.2,
        depth: 5.5,
        cap: "#c9a65a",
        trees: [],
        prop: "none",
      },
      {
        screen: [-34, -42],
        topY: -14,
        radius: 5,
        depth: 6.5,
        cap: "#7c9a52",
        trees: [],
        prop: "arcade",
      },
    ],
    springOffset: 0.1,
    falls: [
      { at: [77, 58], springY: -3.05, length: 20, width: 6 },
      { at: [25, 82.4], springY: -3.05, length: 24, width: 7.5 },
      { at: [-30, 84.5], springY: -3.05, length: 17, width: 5.5 },
    ],
    seed: 37,
  },
};

export const undersideSpec = (world: WorldId) => SPECS[world];

export type RockMesh = { positions: number[]; colors: number[] };
export type UndersideRing = { points: V3[]; t: number };
export type IsletPlacement = UndersideIslet & { top: V3 };
export type UndersideModel = {
  spec: UndersideSpec;
  center: V2;
  radius: number;
  rings: UndersideRing[];
  /** Lowest point of the body (apex, or the flat bottom's centre). */
  apex: V3;
  /** Every spire's vertices, ring by ring. */
  spires: V3[][][];
  islets: IsletPlacement[];
  isletRings: V3[][][];
  rock: RockMesh;
  /** Triangles of the cap and hanging body; spires and islets follow. */
  bodyTriangles: number;
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

function pushTriangle(mesh: RockMesh, a: V3, b: V3, c: V3, color: V3) {
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

/** Fan from a ring to a single point; `down` faces the fan downward. */
function pushFan(
  mesh: RockMesh,
  ring: V3[],
  point: V3,
  down: boolean,
  color: (i: number) => V3,
) {
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    if (down) pushTriangle(mesh, ring[i], ring[j], point, color(i));
    else pushTriangle(mesh, ring[j], ring[i], point, color(i));
  }
}

/** Converts a screen-relative placement (from a view centre at y=0.7) into
 * world space at the given height. */
export function screenToWorld(view: V2, screen: V2, y: number): V3 {
  const [sx, sy] = screen;
  const horizontal = Math.hypot(ISLAND_SCREEN_UP[0], ISLAND_SCREEN_UP[2]);
  const toward = (ISLAND_SCREEN_UP[1] * (y - 0.7) - sy) / horizontal;
  return [
    view[0] + ISLAND_SCREEN_RIGHT[0] * sx + ISLAND_SCREEN_DOWN_GROUND[0] * toward,
    y,
    view[1] + ISLAND_SCREEN_RIGHT[2] * sx + ISLAND_SCREEN_DOWN_GROUND[2] * toward,
  ];
}

type IsletRing = { f: number; y: number; band: number };
/** Rings (scale, height in units of depth or absolute, strata band) per style.
 * Band -2 is the turf cap, -1 the turf edge, 0+ the strata. */
function isletRings(shape: IsletShape, depth: number): {
  sides: number;
  rings: IsletRing[];
  bottom: "point" | "flat";
  cleave: number;
  jitter: number;
} {
  if (shape === "spire")
    return {
      sides: 7,
      cleave: 0.9,
      jitter: 0.22,
      bottom: "point",
      rings: [
        { f: 0.96, y: 0, band: -2 },
        { f: 1, y: -0.3, band: -1 },
        { f: 1.05, y: -0.6, band: 0 },
        { f: 0.84, y: -0.24 * depth, band: 1 },
        { f: 0.6, y: -0.48 * depth, band: 2 },
        { f: 0.36, y: -0.72 * depth, band: 3 },
        { f: 0.15, y: -0.9 * depth, band: 4 },
      ],
    };
  if (shape === "mesa")
    return {
      sides: 9,
      cleave: 0.5,
      jitter: 0.08,
      bottom: "flat",
      rings: [
        { f: 0.97, y: 0, band: -2 },
        { f: 1, y: -0.25, band: -1 },
        { f: 1.04, y: -0.5, band: 0 },
        { f: 1.03, y: -0.33 * depth, band: 1 },
        { f: 0.87, y: -0.34 * depth, band: 1 },
        { f: 0.86, y: -0.64 * depth, band: 2 },
        { f: 0.7, y: -0.65 * depth, band: 2 },
        { f: 0.69, y: -0.9 * depth, band: 3 },
      ],
    };
  return {
    sides: 10,
    cleave: 0.2,
    jitter: 0.07,
    bottom: "point",
    rings: [
      { f: 0.97, y: 0, band: -2 },
      { f: 1, y: -0.3, band: -1 },
      { f: 1.06, y: -0.65, band: 0 },
      { f: 0.95, y: -0.28 * depth, band: 1 },
      { f: 0.76, y: -0.52 * depth, band: 2 },
      { f: 0.46, y: -0.76 * depth, band: 3 },
      { f: 0.2, y: -0.92 * depth, band: 4 },
    ],
  };
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
    base.reduce(
      (sum, [x, z]) => sum + Math.hypot(x - center[0], z - center[1]),
      0,
    ) / base.length;
  const shift: V2 = [
    ISLAND_SCREEN_DOWN_GROUND[0] * spec.tipShift * radius,
    ISLAND_SCREEN_DOWN_GROUND[2] * spec.tipShift * radius,
  ];
  const axis = (t: number): V2 => {
    const pull = Math.min(1, t) ** 1.5;
    return [center[0] + shift[0] * pull, center[1] + shift[1] * pull];
  };
  const signed = (...values: number[]) => hash01(spec.seed, ...values) * 2 - 1;
  const rings: UndersideRing[] = spec.profile.map((ring, k) => {
    let outline = smoothOutline(base, ring.smooth);
    for (let lod = 0; lod < ring.lod; lod++)
      outline = outline.filter((_, i) => i % 2 === 0);
    const [ax, az] = axis(ring.t);
    const points = outline.map(([x, z], i): V3 => {
      const index = i << ring.lod;
      const jitter =
        ring.jitter *
        (spec.cleave * signed(index, 1) +
          (1 - spec.cleave) * signed(k, index, 2));
      const scale = ring.f * (1 + jitter);
      const angle = Math.atan2(z - center[1], x - center[0]);
      const dip =
        k < 2
          ? signed(k, index, 7) * 0.12 * k
          : Math.sin(angle * 3 + k * 1.7) * spec.dip +
            signed(k, index, 9) * spec.yJitter;
      return [
        ax + (x - center[0]) * scale,
        spec.topY - ring.t * spec.depth + dip,
        az + (z - center[1]) * scale,
      ];
    });
    return { points, t: ring.t };
  });
  const lastT = spec.profile[spec.profile.length - 1].t;
  const bottomT = spec.bottom === "point" ? 1 : lastT + 0.03;
  const [apexX, apexZ] = axis(bottomT);
  const apex: V3 = [apexX, spec.topY - bottomT * spec.depth, apexZ];

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
    const ny =
      (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]);
    const tint = shade(spec.shelf, 0.92 + hash01(spec.seed, a, b, c) * 0.1);
    if (ny >= 0) pushTriangle(rock, pa, pb, pc, tint);
    else pushTriangle(rock, pa, pc, pb, tint);
  }
  const strataColor = (band: number, t: number, ...key: number[]) =>
    shade(
      spec.strata[((band % spec.strata.length) + spec.strata.length) % spec.strata.length],
      (1 - spec.darken * Math.min(1, t)) * (0.9 + hash01(spec.seed, ...key) * 0.12),
    );
  let wall = 0;
  for (let k = 0; k < rings.length; k++) {
    const upper = rings[k].points;
    const t =
      k + 1 < rings.length ? (rings[k].t + rings[k + 1].t) / 2 : bottomT;
    const undercut =
      k + 1 < rings.length &&
      spec.profile[k + 1].t - spec.profile[k].t < 0.02;
    const band = undercut ? wall : wall++;
    const color = (i: number) => strataColor(band, t, k, i, 3);
    if (k + 1 < rings.length) pushStrip(rock, upper, rings[k + 1].points, color);
    else pushFan(rock, upper, apex, true, color);
  }

  const bodyTriangles = rock.positions.length / 9;
  // Korea: craggy spires buried in the body and hanging well below it,
  // spread across the bottom rim the camera faces, ordered left to right.
  const facingRim = rings[rings.length - 1].points
    .filter(
      ([x, , z]) =>
        (x - apex[0]) * ISLAND_SCREEN_DOWN_GROUND[0] +
          (z - apex[2]) * ISLAND_SCREEN_DOWN_GROUND[2] >
        -0.15 * Math.hypot(x - apex[0], z - apex[2]),
    )
    .sort((a, b) => projectRight(a[0], 0, a[2]) - projectRight(b[0], 0, b[2]));
  const spires = spec.spires.map((spire, s) => {
    const [axisX, axisZ] = axis(spire.rootT);
    const target = facingRim[
      Math.min(facingRim.length - 1, Math.round(spire.at * (facingRim.length - 1)))
    ];
    const ax = axisX + (target[0] - axisX) * spire.reach,
      az = axisZ + (target[2] - axisZ) * spire.reach;
    const levels = [0, 0.16, 0.36, 0.58, 0.78, 0.92];
    const widths = [1, 0.88, 0.68, 0.46, 0.25, 0.1];
    const turn = hash01(spec.seed, s, 40) * Math.PI * 2;
    const lean: V2 = [signed(s, 41) * 0.12, signed(s, 42) * 0.12];
    const rootY = spec.topY - spire.rootT * spec.depth;
    const spireRings = levels.map((u, level) =>
      Array.from({ length: spire.sides }, (_, i): V3 => {
        const a = turn + (i / spire.sides) * Math.PI * 2;
        const r =
          spire.radius *
          widths[level] *
          (1 + 0.3 * signed(s, i, 43) + 0.06 * signed(s, i, level, 44));
        return [
          ax + lean[0] * u * spire.length + Math.cos(a) * r,
          rootY - u * spire.length + signed(s, i, level, 45) * 0.4 * (level > 0 ? 1 : 0),
          az + lean[1] * u * spire.length + Math.sin(a) * r,
        ];
      }),
    );
    const tip: V3 = [
      ax + lean[0] * spire.length,
      rootY - spire.length,
      az + lean[1] * spire.length,
    ];
    const rootCenter: V3 = [ax, rootY + 0.5, az];
    pushFan(rock, spireRings[0], rootCenter, false, (i) => strataColor(0, 0.5, s, i, 46));
    for (let level = 0; level + 1 < spireRings.length; level++)
      pushStrip(rock, spireRings[level], spireRings[level + 1], (i) =>
        strataColor(level + s, 0.55 + levels[level] * 0.45, s, level, i, 47),
      );
    pushFan(rock, spireRings[spireRings.length - 1], tip, true, (i) =>
      strataColor(s + 1, 1, s, i, 48),
    );
    return [...spireRings, [tip]];
  });

  // Satellite islets: same rock language at small scale, turf or flower caps.
  const islets = spec.islets.map((islet) => ({
    ...islet,
    top: screenToWorld(spec.view, islet.screen, islet.topY),
  }));
  const isletMeshes = islets.map((islet, n) => {
    const { sides, rings: shapeRings, bottom, cleave, jitter } = isletRings(
      spec.isletShape,
      islet.depth,
    );
    const [cx, cy, cz] = islet.top;
    const turn = hash01(spec.seed, n, 60) * Math.PI;
    const rings3 = shapeRings.map((ring, level) =>
      Array.from({ length: sides }, (_, i): V3 => {
        const a = turn + (i / sides) * Math.PI * 2;
        const r =
          islet.radius *
          ring.f *
          (1 +
            (level < 2 ? 0.35 : 1) *
              jitter *
              (cleave * signed(n, i, 61) + (1 - cleave) * signed(n, i, level, 62)));
        return [
          cx + Math.cos(a) * r,
          cy + ring.y + (level > 2 ? signed(n, i, level, 63) * 0.2 : 0),
          cz + Math.sin(a) * r,
        ];
      }),
    );
    const capHex = islet.cap;
    const colorFor = (band: number, level: number) => (i: number) =>
      band === -2
        ? shade(capHex, 0.94 + hash01(spec.seed, n, level, i, 64) * 0.1)
        : band === -1
          ? shade(capHex, 0.78 + hash01(spec.seed, n, level, i, 65) * 0.08)
          : // Mesa islets keep bold bands; bowls and spires stay one rock.
            strataColor(
              spec.isletShape === "mesa" ? band + n : n + (band % 2) * 2,
              0.15 + band * 0.18,
              n,
              level,
              i,
              66,
            );
    pushFan(rock, rings3[0], [cx, cy + (spec.isletShape === "mesa" ? 0.04 : 0.22), cz], false, colorFor(-2, 0));
    for (let level = 0; level + 1 < rings3.length; level++)
      pushStrip(rock, rings3[level], rings3[level + 1], colorFor(shapeRings[level].band, level));
    const tip: V3 = [cx, cy - (bottom === "point" ? islet.depth : 0.93 * islet.depth), cz];
    pushFan(rock, rings3[rings3.length - 1], tip, true, colorFor(4, 9));
    return [...rings3, [tip]];
  });

  const model = {
    spec,
    center,
    radius,
    rings,
    apex,
    spires,
    islets,
    isletRings: isletMeshes,
    rock,
    bodyTriangles,
  };
  models.set(world, model);
  return model;
}

export type ScreenBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

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

/** Every vertex of the hanging rock and its islets, for camera fit and tests. */
export function* undersidePoints(world: WorldId): Generator<V3> {
  const model = undersideModel(world);
  for (const ring of model.rings) yield* ring.points;
  yield model.apex;
  for (const spire of model.spires) for (const ring of spire) yield* ring;
  for (const islet of model.isletRings) for (const ring of islet) yield* ring;
}

/** Room kept beneath the lowest rock so it clears the bottom tool rail. */
export const UNDERSIDE_FRAME_MARGIN = 4;
const frames = new Map<WorldId, ScreenBounds>();

/** Cached screen extents of everything hanging beneath an island, with margin. */
export function undersideFrame(world: WorldId): ScreenBounds {
  let frame = frames.get(world);
  if (!frame) {
    const bounds = screenBounds(undersidePoints(world), SPECS[world].view);
    frame = { ...bounds, bottom: bounds.bottom + UNDERSIDE_FRAME_MARGIN };
    frames.set(world, frame);
  }
  return frame;
}

export type FallSpring = { point: V3; normal: V2; tangent: V2; width: number };
export type FallMesh = {
  positions: number[];
  /** u across the ribbon (0 to 1), v down it in world units. */
  uvs: number[];
  fades: number[];
  indices: number[];
  springs: FallSpring[];
};
const fallMeshes = new Map<WorldId, FallMesh>();

/** Ribbons that leave the cliff, arc clear of every ledge below the spring, then
 * fall and fade into mist. One merged mesh per world. */
export function undersideFalls(world: WorldId): FallMesh {
  const cached = fallMeshes.get(world);
  if (cached) return cached;
  const model = undersideModel(world);
  const { spec } = model;
  const outline = spec.outline;
  const n = outline.length;
  const mesh: FallMesh = {
    positions: [],
    uvs: [],
    fades: [],
    indices: [],
    springs: [],
  };
  for (const fall of spec.falls) {
    let index = 0;
    outline.forEach(([x, z], i) => {
      const [bx, bz] = outline[index];
      if (Math.hypot(x - fall.at[0], z - fall.at[1]) < Math.hypot(bx - fall.at[0], bz - fall.at[1]))
        index = i;
    });
    const [px, pz] = outline[index];
    const [ax, az] = outline[(index + n - 1) % n];
    const [cx, cz] = outline[(index + 1) % n];
    const length = Math.hypot(cx - ax, cz - az) || 1;
    const tangent: V2 = [(cx - ax) / length, (cz - az) / length];
    const normal: V2 = [tangent[1], -tangent[0]];
    // Furthest rock, along the outward normal, anywhere beside the ribbon.
    let clearance = spec.springOffset;
    for (const ring of model.rings)
      for (const [x, y, z] of ring.points) {
        const along = (x - px) * tangent[0] + (z - pz) * tangent[1];
        if (y < fall.springY && Math.abs(along) < fall.width * 1.6 + 2)
          clearance = Math.max(clearance, (x - px) * normal[0] + (z - pz) * normal[1]);
      }
    clearance += 0.7;
    const reach = Math.max(
      1.6,
      fall.springY - (spec.topY - 0.03 * spec.depth) - 0.4,
    );
    const steps = 12;
    const samples: { y: number; out: number; width: number; fade: number }[] = [];
    for (let s = 0; s <= steps; s++) {
      const drop = (s / steps) * fall.length;
      const x = Math.min(1, drop / reach);
      samples.push({
        y: fall.springY - drop,
        out:
          spec.springOffset +
          (clearance - spec.springOffset) * (1 - (1 - x) ** 2) +
          drop * 0.025,
        width: fall.width * (1 + 0.3 * (s / steps)),
        fade: s === 0 ? 0.8 : 1,
      });
    }
    // Mist: the sheet widens and dissolves rather than ending in a hard edge.
    const last = samples[samples.length - 1];
    [0.6, 0.25, 0].forEach((fade, k) =>
      samples.push({
        y: last.y - (k + 1) * fall.length * 0.08,
        out: last.out + (k + 1) * 0.25,
        width: last.width * (1.25 + k * 0.25),
        fade,
      }),
    );
    const base = mesh.positions.length / 3;
    let v = 0;
    samples.forEach((sample, s) => {
      if (s) v += Math.hypot(samples[s - 1].y - sample.y, samples[s - 1].out - sample.out);
      for (const side of [-1, 1]) {
        mesh.positions.push(
          px + normal[0] * sample.out + tangent[0] * side * sample.width * 0.5,
          sample.y,
          pz + normal[1] * sample.out + tangent[1] * side * sample.width * 0.5,
        );
        mesh.uvs.push(side < 0 ? 0 : 1, v);
        mesh.fades.push(sample.fade);
      }
      if (s) {
        const a = base + (s - 1) * 2;
        mesh.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    mesh.springs.push({
      point: [px + normal[0] * spec.springOffset, fall.springY, pz + normal[1] * spec.springOffset],
      normal,
      tangent,
      width: fall.width,
    });
  }
  fallMeshes.set(world, mesh);
  return mesh;
}

/** A static low-poly cloud deck, always below the lowest rock: a depth cue. */
export function undersideClouds(world: WorldId): { p: V3; s: V3 }[] {
  const model = undersideModel(world);
  let lowest = 0;
  for (const [, y] of undersidePoints(world)) lowest = Math.min(lowest, y);
  // Lower corners of the landscape frame, and below the island in portrait.
  const clusters: readonly (readonly [number, number])[] = [
    [-70, -46],
    [74, -50],
    [-96, -24],
    [100, -30],
    [-24, -80],
    [30, -96],
    [-112, -52],
    [116, -6],
  ];
  return clusters.flatMap(([sx, sy], c) => {
    const y = lowest - 9 - hash01(model.spec.seed, c, 80) * 10;
    const center = screenToWorld(model.spec.view, [sx, sy], y);
    return Array.from({ length: 4 }, (_, k): { p: V3; s: V3 } => {
      const size = 5.5 - k * 0.9 + hash01(model.spec.seed, c, k, 81) * 1.5;
      return {
        p: [
          center[0] + (k - 1.5) * 4.2 * ISLAND_SCREEN_RIGHT[0] + (hash01(model.spec.seed, c, k, 82) - 0.5) * 4,
          y + (k % 2) * 0.9,
          center[2] + (k - 1.5) * 4.2 * ISLAND_SCREEN_RIGHT[2] + (hash01(model.spec.seed, c, k, 83) - 0.5) * 4,
        ],
        s: [size * 1.5, size * 0.55, size],
      };
    });
  });
}
