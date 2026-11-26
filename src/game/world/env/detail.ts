import * as THREE from "three";
import { registerWarmup, useStage, type Tier } from "../../../stage/contract";
import { hash, smooth } from "./noise";
import { nextSlice, sliceBudget } from "./slice";

/**
 * Procedural surface detail (PLAN2 §1.2): one `DataArrayTexture` of 8
 * tileable layers made on the CPU, sampled triplanar by every sculpted
 * material in place of the single shared noise (same three fetches).
 *
 * Channels (linear bytes): R albedo value, G height, B roughness, A mask.
 * R and B are centred on 0.5 per layer, so a layer never shifts a material's
 * mean colour or roughness; G only feeds the derivative bump.
 *
 * Layer index = `SURFACE_KIND_INDEX` in Surface.ts. Layer 0 ("plain") is
 * exactly today's painted fbm grain, so untagged materials look as before.
 *
 * Size: 176² on high/medium (8 layers × 176² × 4 B = 0.99 MB, 1.32 MB with
 * mips; 256² would be 2.8 MB, over the 1.4 MB budget), 64² on low. Made in
 * ≤12 ms slices during warmup; until it lands the texture holds a neutral
 * grey (no detail), never an unbound sampler, so programs never change.
 */
export const DETAIL_LAYERS = 8;
export const DETAIL_SIZE_HIGH = 176;
export const DETAIL_SIZE_LOW = 64;

/* ----------------------------------------------------------------- noise */

/** Lattice hashes per (period, seed), so noise lookups are table reads. */
const lattices = new Map<number, Float32Array>();
function lattice(px: number, py: number, seed: number) {
  const key = (seed * 1024 + px) * 1024 + py;
  let table = lattices.get(key);
  if (!table) {
    table = new Float32Array(px * py);
    for (let y = 0; y < py; y++) for (let x = 0; x < px; x++) table[y * px + x] = hash(x, y, seed);
    lattices.set(key, table);
  }
  return table;
}

/** Periodic value noise with separate x / y lattice periods (the same
 * values as noise.ts's valueNoise when px = py). */
function vnoise(x: number, y: number, px: number, py: number, seed: number) {
  const table = lattice(px, py, seed);
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const fx = smooth(x - xi),
    fy = smooth(y - yi);
  const x0 = ((xi % px) + px) % px,
    x1 = x0 + 1 === px ? 0 : x0 + 1,
    y0 = (((yi % py) + py) % py) * px,
    y1 = (y0 + px) % (px * py);
  const a = table[y0 + x0],
    b = table[y0 + x1],
    c = table[y1 + x0],
    d = table[y1 + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Periodic fbm; with bx = by it is noise.ts's fbm, value for value. */
function fbm2(u: number, v: number, bx: number, by: number, octaves: number, seed: number) {
  let sum = 0,
    amp = 0.5,
    norm = 0,
    px = bx,
    py = by;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u * px, v * py, px, py, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

/** Periodic Voronoi: nearest (f1) and second (f2) feature distance and the
 * nearest cell's hash. `block` blends euclidean (0) toward chebyshev (1)
 * distance, which squares the cells off into blocks. */
const cell = { f1: 0, f2: 0, id: 0 };
const features = new Map<number, Float32Array>();
function featureTable(cx: number, cy: number, seed: number) {
  const key = (seed * 1024 + cx) * 1024 + cy;
  let table = features.get(key);
  if (!table) {
    table = new Float32Array(cx * cy * 3);
    for (let y = 0; y < cy; y++)
      for (let x = 0; x < cx; x++) {
        const i = (y * cx + x) * 3;
        table[i] = hash(x, y, seed);
        table[i + 1] = hash(x, y, seed + 9);
        table[i + 2] = hash(x, y, seed + 31);
      }
    features.set(key, table);
  }
  return table;
}
function voronoi(u: number, v: number, cx: number, cy: number, seed: number, block = 0, jitter = 0.8) {
  const table = featureTable(cx, cy, seed);
  const x = u * cx,
    y = v * cy;
  const xi = Math.floor(x),
    yi = Math.floor(y);
  let f1 = 9,
    f2 = 9,
    id = 0;
  const lo = (1 - jitter) / 2;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = xi + i,
        gy = yi + j;
      const k = ((((gy % cy) + cy) % cy) * cx + (((gx % cx) + cx) % cx)) * 3;
      const dx = Math.abs(gx + lo + table[k] * jitter - x),
        dy = Math.abs(gy + lo + table[k + 1] * jitter - y);
      const d = Math.sqrt(dx * dx + dy * dy) * (1 - block) + (dx > dy ? dx : dy) * block;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = table[k + 2];
      } else if (d < f2) f2 = d;
    }
  cell.f1 = f1;
  cell.f2 = f2;
  cell.id = id;
  return cell;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const step = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- layers */

type Texel = (u: number, v: number, out: Float32Array) => void;
/** Layer art. Each writes R albedo, G height, B roughness, A mask (0..1). */
const LAYERS: Texel[] = [
  // 0 plain: the original painted grain (noise.ts r/g channels, stretched
  // separately in `finish`), so untagged materials are unchanged.
  (u, v, o) => {
    o[0] = fbm2(u, v, 16, 16, 3, 11);
    o[1] = fbm2(u, v, 6, 6, 4, 41);
    o[2] = 0;
    o[3] = 0;
  },
  // 1 wood: 8:1 grain along u, four boards per tile with seams, butt joints
  // and the odd knot.
  (u, v, o) => {
    const boards = 4;
    const bv = v * boards,
      board = Math.floor(bv),
      across = bv - board;
    const bh = hash(board, 3, 211);
    const warp = fbm2(u, v, 2, 4, 2, 223) - 0.5;
    const grain = fbm2(u, v + warp * 0.03, 3, 24, 3, 227);
    const fine = vnoise(u * 8, (v + warp * 0.02) * 96, 8, 96, 229);
    const seam = 1 - step(0.0, 0.07, Math.min(across, 1 - across));
    const joint = (u + bh) % 1;
    const butt = 1 - step(0.0, 0.012, Math.min(joint, 1 - joint));
    // One knot per board at a hashed spot, stretched along the grain.
    const ku = (hash(board, 7, 233) + 0.5) % 1,
      kv = 0.3 + hash(board, 11, 239) * 0.4;
    let du = Math.abs(u - ku);
    du = Math.min(du, 1 - du);
    const kd = Math.hypot(du * 9, (across - kv) * 2.2);
    const knot = hash(board, 13, 241) < 0.6 ? 1 - step(0.05, 0.18, kd) : 0;
    const ring = knot > 0 ? 0.5 + 0.5 * Math.sin(kd * 90) : 0.5;
    const gaps = Math.max(seam, butt);
    o[0] = 0.55 + (grain - 0.5) * 0.85 + (fine - 0.5) * 0.25 + (bh - 0.5) * 0.18 - gaps * 0.5 - knot * (0.3 + ring * 0.15);
    o[1] = 0.66 + (grain - 0.5) * 0.22 + (fine - 0.5) * 0.12 - gaps * 0.6 - knot * 0.12;
    o[2] = 0.5 + (grain - 0.5) * 0.35 + gaps * 0.35 - knot * 0.1;
    o[3] = gaps;
  },
  // 2 stone: squared-off cellular blocks with mortar, a bevel and chips.
  (u, v, o) => {
    const c = voronoi(u, v, 3, 4, 301, 0.65, 0.55);
    const edge = c.f2 - c.f1,
      id = c.id;
    const mortar = 1 - step(0.025, 0.07, edge);
    const bevel = step(0.03, 0.2, edge);
    const fine = fbm2(u, v, 12, 12, 3, 307);
    const chip = step(0.66, 0.74, fbm2(u, v, 20, 20, 2, 311)) * (1 - step(0.06, 0.3, edge));
    o[0] = 0.55 + (id - 0.5) * 0.35 + (fine - 0.5) * 0.4 - mortar * 0.45 - chip * 0.18;
    o[1] = bevel * (0.72 + (fine - 0.5) * 0.25) - chip * 0.3;
    o[2] = 0.52 + (fine - 0.5) * 0.25 + mortar * 0.3 + chip * 0.1;
    o[3] = mortar;
  },
  // 3 shingle: overlapping rows of scalloped tiles, half-offset per row.
  (u, v, o) => {
    const rows = 8,
      cols = 6;
    const rv = v * rows,
      row = Math.floor(rv),
      y = rv - row;
    const local = (shift: number) => {
      const cu = u * cols + shift;
      const col = Math.floor(cu);
      return { x: cu - col - 0.5, col };
    };
    const own = local((row % 2) * 0.5);
    // Rounded lower lip of this row's tile: lowest at its centre.
    const lip = 1 - 0.38 * (1 - Math.sqrt(Math.max(0, 1 - 4 * own.x * own.x)));
    let t: number, x: number, col: number, r: number, shade: number;
    if (y <= lip) {
      t = y / lip;
      x = own.x;
      col = own.col;
      r = row;
      shade = 0;
    } else {
      const next = local(((row + 1) % 2) * 0.5);
      t = (y - lip) * 0.6;
      x = next.x;
      col = next.col;
      r = row + 1;
      shade = 1 - step(0, 0.22, y - lip);
    }
    const tile = hash(((col % cols) + cols) % cols, ((r % rows) + rows) % rows, 401);
    const gap = step(0.44, 0.5, Math.abs(x));
    const fine = fbm2(u, v, 16, 16, 2, 409);
    o[0] = 0.56 + (tile - 0.5) * 0.3 + (fine - 0.5) * 0.25 - shade * 0.45 - gap * 0.3 + t * 0.08;
    o[1] = 0.2 + t * 0.7 - gap * 0.25;
    o[2] = 0.5 + (fine - 0.5) * 0.3 + shade * 0.2 + (tile - 0.5) * 0.15;
    o[3] = Math.max(shade, gap);
  },
  // 4 plaster: broad trowel mottling with soft, warped strokes.
  (u, v, o) => {
    const warp = fbm2(u, v, 3, 3, 2, 503) - 0.5;
    const broad = fbm2(u + warp * 0.2, v - warp * 0.2, 3, 3, 3, 509);
    const strokes = fbm2(u + warp * 0.35, v + warp * 0.1, 4, 10, 3, 521);
    const pits = 1 - step(0.0, 0.06, voronoi(u, v, 22, 22, 523).f1);
    o[0] = 0.5 + (broad - 0.5) * 0.55 + (strokes - 0.5) * 0.25 - pits * 0.12;
    o[1] = 0.5 + (strokes - 0.5) * 0.45 + (broad - 0.5) * 0.15 - pits * 0.3;
    o[2] = 0.5 + (strokes - 0.5) * 0.4 - (broad - 0.5) * 0.2;
    o[3] = pits;
  },
  // 5 ground: soil mottling and flecks; blade strokes are splatted on top in
  // `groundStrokes`.
  (u, v, o) => {
    const soil = fbm2(u, v, 5, 5, 4, 601);
    const fleck = 1 - step(0.0, 0.11, voronoi(u, v, 18, 18, 607).f1);
    o[0] = 0.5 + (soil - 0.5) * 0.45 - fleck * 0.3;
    o[1] = 0.35 + (soil - 0.5) * 0.2 - fleck * 0.15;
    o[2] = 0.56 + (soil - 0.5) * 0.15 + fleck * 0.1;
    o[3] = 0;
  },
  // 6 bark: vertical plates (cells 5:1.5 tall) split by deep furrows.
  (u, v, o) => {
    const c = voronoi(u, v, 6, 2, 701, 0.25, 0.7);
    const edge = c.f2 - c.f1;
    const furrow = 1 - step(0.02, 0.14, edge);
    const fibre = fbm2(u, v, 12, 2, 3, 709);
    o[0] = 0.55 + (fibre - 0.5) * 0.45 + (c.id - 0.5) * 0.2 - furrow * 0.5;
    o[1] = (1 - furrow) * (0.55 + (fibre - 0.5) * 0.35) + step(0.05, 0.35, edge) * 0.2;
    o[2] = 0.55 + furrow * 0.3 + (fibre - 0.5) * 0.15;
    o[3] = furrow;
  },
  // 7 metal: brushed streaks along u, faint and fine.
  (u, v, o) => {
    const brush = fbm2(u, v, 2, 64, 2, 801);
    const fine = vnoise(u * 4, v * 160, 4, 160, 809);
    const smudge = fbm2(u, v, 3, 3, 3, 811);
    o[0] = 0.5 + (brush - 0.5) * 0.25 + (smudge - 0.5) * 0.2;
    o[1] = 0.5 + (fine - 0.5) * 0.25;
    o[2] = 0.5 + (brush - 0.5) * 0.45 + (fine - 0.5) * 0.25 + (smudge - 0.5) * 0.35;
    o[3] = 0;
  },
];

/** Short grass blades on the "ground" layer: bright, raised strokes. */
function groundStrokes(size: number, r: Float32Array, g: Float32Array, b: Float32Array, a: Float32Array) {
  const count = Math.round(size * size * 0.035);
  for (let s = 0; s < count; s++) {
    const x0 = hash(s, 1, 613) * size,
      y0 = hash(s, 2, 613) * size;
    const angle = -Math.PI / 2 + (hash(s, 3, 613) - 0.5) * 2.2;
    const length = size * (0.008 + hash(s, 4, 613) * 0.02);
    const lift = 0.5 + hash(s, 5, 613) * 0.5;
    const steps = Math.max(2, Math.ceil(length));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = Math.round(x0 + Math.cos(angle) * length * t),
        y = Math.round(y0 + Math.sin(angle) * length * t);
      const i = (((y % size) + size) % size) * size + (((x % size) + size) % size);
      const w = lift * (0.55 + 0.45 * t);
      r[i] = Math.max(r[i], 0.55 + 0.4 * w);
      g[i] = Math.max(g[i], 0.45 + 0.5 * w * t);
      b[i] = Math.min(b[i], 0.5 - 0.2 * w);
      a[i] = Math.max(a[i], w);
    }
  }
}

function stretch(values: Float32Array) {
  let min = Infinity,
    max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(1e-6, max - min);
  for (let i = 0; i < values.length; i++) values[i] = (values[i] - min) / span;
}
function centre(values: Float32Array) {
  let sum = 0;
  for (const v of values) sum += v;
  const shift = 0.5 - sum / values.length;
  for (let i = 0; i < values.length; i++) values[i] = clamp01(values[i] + shift);
}

/** Bytes for one layer (size² × RGBA). Sliced through `budget` when given. */
export async function buildDetailLayer(
  layer: number,
  size: number,
  pause?: () => Promise<void> | void,
): Promise<Uint8Array> {
  const n = size * size;
  const ch = [0, 1, 2, 3].map(() => new Float32Array(n));
  const texel = LAYERS[layer];
  const out = new Float32Array(4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      texel(x / size, y / size, out);
      const i = y * size + x;
      ch[0][i] = out[0];
      ch[1][i] = out[1];
      ch[2][i] = out[2];
      ch[3][i] = out[3];
    }
    if (pause) await pause();
  }
  if (layer === 0) {
    // Today's grain: g·0.65 + r·0.35 of the separately stretched channels,
    // driving albedo, height and roughness alike.
    stretch(ch[0]);
    stretch(ch[1]);
    for (let i = 0; i < n; i++) {
      const grain = ch[1][i] * 0.65 + ch[0][i] * 0.35;
      ch[0][i] = ch[1][i] = ch[2][i] = grain;
    }
  } else {
    if (layer === 5) groundStrokes(size, ch[0], ch[1], ch[2], ch[3]);
    centre(ch[0]);
    centre(ch[2]);
  }
  const bytes = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 4; c++) bytes[i * 4 + c] = Math.round(clamp01(ch[c][i]) * 255);
  return bytes;
}

/* --------------------------------------------------------------- texture */

let texture: THREE.DataArrayTexture | null = null;
let chosenSize = 0;
let job: Promise<void> | null = null;
/** Generation time (ms of CPU, summed over slices) and the longest slice. */
export const detailStats = { cpuMs: 0, longestSliceMs: 0, size: 0, ready: false };

export const detailSizeForTier = (tier: Tier | null) =>
  tier === "low" ? DETAIL_SIZE_LOW : DETAIL_SIZE_HIGH;

/** The shared detail array (module-owned; never dispose it). */
export function detailTexture(tier: Tier | null = useStage.getState().tier) {
  if (texture) return texture;
  chosenSize = detailSizeForTier(tier);
  const data = new Uint8Array(chosenSize * chosenSize * 4 * DETAIL_LAYERS);
  // Neutral until generated: mid value, flat height, mid roughness.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = 128;
    data[i + 3] = 0;
  }
  texture = new THREE.DataArrayTexture(data, chosenSize, chosenSize, DETAIL_LAYERS);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.name = `env-surface-detail-${chosenSize}`;
  texture.needsUpdate = true;
  job = fill(texture, chosenSize);
  return texture;
}

/** One uniform object shared by every sculpted material. */
export const detailUniform = {
  get value() {
    return detailTexture();
  },
};

/** Start (or join) the layer bake; resolves once the layers are uploaded. */
export function generateDetail(tier?: Tier | null) {
  if (!job) detailTexture(tier ?? useStage.getState().tier);
  return job!;
}

/** Fill the layers in ≤12 ms slices, then upload once. */
function fill(target: THREE.DataArrayTexture, size: number) {
  return (async () => {
    const budget = sliceBudget(12);
    let sliceStart = performance.now();
    const pause = async () => {
      if (!budget.over()) return;
      const spent = performance.now() - sliceStart;
      detailStats.cpuMs += spent;
      detailStats.longestSliceMs = Math.max(detailStats.longestSliceMs, spent);
      await nextSlice();
      budget.reset();
      sliceStart = performance.now();
    };
    const data = target.image.data as Uint8Array;
    const layerBytes = size * size * 4;
    for (let layer = 0; layer < DETAIL_LAYERS; layer++) {
      const bytes = await buildDetailLayer(layer, size, pause);
      data.set(bytes, layer * layerBytes);
      await pause();
    }
    const spent = performance.now() - sliceStart;
    detailStats.cpuMs += spent;
    detailStats.longestSliceMs = Math.max(detailStats.longestSliceMs, spent);
    detailStats.size = size;
    detailStats.ready = true;
    target.needsUpdate = true;
  })();
}

// Bake the layers during the hidden warmup, before the first presented frame.
registerWarmup({
  id: "env-surface-detail",
  priority: 11,
  run: ({ tier }) => generateDetail(tier),
});
