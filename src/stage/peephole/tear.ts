/**
 * Tear geometry, pure and seeded. The paper shader samples a seam texture
 * built here, and mirrors `curl()` exactly; tests pin both.
 *
 * Frame: the seam runs through the hole centre `origin` along the pull axis
 * `dir`. s is the coordinate along dir, t across it (t = dot(p - origin, n),
 * n = dir rotated +90°). The torn edge is t = offset(s). Points with
 * t > offset(s) belong to flap +1, the rest to flap -1.
 */

export type V2 = { x: number; y: number };

/** Small, fast, deterministic PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise in [-1, 1] with a seeded lattice. */
export function noise1D(seed: number, size = 256) {
  const rand = mulberry32(seed);
  const lattice = new Float32Array(size);
  for (let i = 0; i < size; i++) lattice[i] = rand() * 2 - 1;
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = lattice[((i % size) + size) % size];
    const b = lattice[(((i + 1) % size) + size) % size];
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    return a + (b - a) * u;
  };
}

export type Seam = {
  origin: V2;
  dir: V2;
  normal: V2;
  /** Extent along dir (sMin < 0 < sMax) that reaches past every viewport edge. */
  sMin: number;
  sMax: number;
  /** Lateral offsets sampled uniformly over [sMin, sMax]. */
  offsets: Float32Array;
  /** Fibre roughness (0..1) per sample: how ragged the edge is there. */
  fray: Float32Array;
  /** Hole radius: the seam starts on the rim. */
  rim: number;
  seed: number;
};

export type SeamOptions = {
  origin: V2;
  /** Pull direction; normalised internally. */
  dir: V2;
  /** Paper extent: the seam reaches past [0,w]×[0,h] by `margin`. */
  width: number;
  height: number;
  rim: number;
  seed: number;
  /** Wander of the tear, px. */
  amplitude?: number;
  samples?: number;
  margin?: number;
};

/** Distance along dir from origin to the boundary of the rect (dir unit). */
export function rayToRect(o: V2, d: V2, w: number, h: number) {
  let best = Infinity;
  if (d.x > 1e-9) best = Math.min(best, (w - o.x) / d.x);
  if (d.x < -1e-9) best = Math.min(best, -o.x / d.x);
  if (d.y > 1e-9) best = Math.min(best, (h - o.y) / d.y);
  if (d.y < -1e-9) best = Math.min(best, -o.y / d.y);
  return Number.isFinite(best) ? Math.max(0, best) : 0;
}

export function buildSeam(o: SeamOptions): Seam {
  const len = Math.hypot(o.dir.x, o.dir.y) || 1;
  const dir = { x: o.dir.x / len, y: o.dir.y / len };
  const normal = { x: -dir.y, y: dir.x };
  const margin = o.margin ?? 48;
  const sMax = rayToRect(o.origin, dir, o.width, o.height) + margin;
  const sMin = -(rayToRect(o.origin, { x: -dir.x, y: -dir.y }, o.width, o.height) + margin);
  const n = o.samples ?? 1024;
  const amp = o.amplitude ?? 14;
  const offsets = new Float32Array(n);
  const fray = new Float32Array(n);
  const wander = noise1D(o.seed);
  const jag = noise1D(o.seed ^ 0x9e3779b9);
  const fibre = noise1D(o.seed ^ 0x85ebca6b);
  const rough = noise1D(o.seed ^ 0xc2b2ae35);
  for (let i = 0; i < n; i++) {
    const s = sMin + ((sMax - sMin) * i) / (n - 1);
    const a = Math.abs(s);
    // Leaving the rim the tear is pinned to the axis, then wanders freely.
    const pin = smooth01((a - o.rim) / (o.rim * 2.5 + 24));
    const big = wander(s / 170) * 0.62 + wander(s / 61 + 31.7) * 0.38;
    const mid = jag(s / 19) * 0.22;
    const tiny = fibre(s / 3.1) * 0.06;
    offsets[i] = a <= o.rim ? 0 : amp * pin * (big + mid + tiny);
    fray[i] = 0.45 + 0.55 * (rough(s / 47) * 0.5 + 0.5);
  }
  return { origin: o.origin, dir, normal, sMin, sMax, offsets, fray, rim: o.rim, seed: o.seed };
}

function smooth01(v: number) {
  const t = v < 0 ? 0 : v > 1 ? 1 : v;
  return t * t * (3 - 2 * t);
}

/** Seam-frame coordinates of a point. */
export function toSeamFrame(seam: Seam, p: V2) {
  const dx = p.x - seam.origin.x;
  const dy = p.y - seam.origin.y;
  return { s: dx * seam.dir.x + dy * seam.dir.y, t: dx * seam.normal.x + dy * seam.normal.y };
}

/** Linear interpolation of a per-sample array at s. */
export function sampleAt(seam: Seam, arr: Float32Array, s: number) {
  const n = arr.length;
  const f = ((s - seam.sMin) / (seam.sMax - seam.sMin)) * (n - 1);
  if (f <= 0) return arr[0];
  if (f >= n - 1) return arr[n - 1];
  const i = Math.floor(f);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}
export function seamOffset(seam: Seam, s: number) {
  return sampleAt(seam, seam.offsets, s);
}
/** Approximate signed distance to the torn edge (+ on flap +1). */
export function signedSeamDistance(seam: Seam, p: V2) {
  const { s, t } = toSeamFrame(seam, p);
  return t - seamOffset(seam, s);
}
export function flapOf(seam: Seam, p: V2): 1 | -1 {
  return signedSeamDistance(seam, p) >= 0 ? 1 : -1;
}

/**
 * The tear fronts: how far the seam has run each way. `progress` 0 = only the
 * rim, 1 = both ends past the paper. The trailing end (toward where the letter
 * came from, -s) runs a little ahead: that side carries the stress.
 */
export function tearFronts(seam: Seam, progress: number) {
  const p = clamp01(progress);
  const lead = easeOutCubic(clamp01(p * 1.12 - 0.06));
  const trail = easeOutCubic(clamp01(p * 1.12));
  return {
    back: -(seam.rim + (-seam.sMin - seam.rim) * trail),
    front: seam.rim + (seam.sMax - seam.rim) * lead,
  };
}
/** Preview crack fronts for crack 0..1 at pull length L (never reaches edges). */
export function crackFronts(seam: Seam, crack: number, L: number) {
  const c = clamp01(crack);
  return {
    back: -Math.min(-seam.sMin, seam.rim + c * 0.55 * L),
    front: Math.min(seam.sMax, seam.rim + c * 0.3 * L),
  };
}
/**
 * Half-width of the open gap at s, given fronts: zero at each front, widest
 * near the hole, scaled by `open` (px).
 */
export function gapHalfWidth(s: number, fronts: { back: number; front: number }, open: number) {
  if (s <= fronts.back || s >= fronts.front) return 0;
  const span = s < 0 ? -fronts.back : fronts.front;
  if (span <= 0) return 0;
  const u = Math.abs(s) / span; // 0 at hole → 1 at front
  return open * Math.sqrt(Math.max(0, 1 - u));
}

/**
 * Cylinder page curl. The flap is peeled starting at its torn edge: d is the
 * distance from the seam into the flap, `axis` the current fold line (d units)
 * and R the roll radius. Paper with d > axis still lies flat; paper with
 * d < axis has rolled around the cylinder and, past half a turn, lies upside
 * down on top travelling outward with the fold. Arc length is preserved.
 * Returns the new perpendicular coordinate, lift z (toward the viewer) and the
 * roll angle (> π/2 shows the back face).
 */
export function curl(d: number, axis: number, R: number) {
  if (d >= axis) return { u: d, z: 0, phi: 0 };
  const phi = (axis - d) / R;
  if (phi <= Math.PI) return { u: axis - R * Math.sin(phi), z: R * (1 - Math.cos(phi)), phi };
  return { u: axis + (axis - d - Math.PI * R), z: 2 * R, phi };
}
/** Fold position at which a flap reaching `dMax` from the seam is fully off a rect it spans. */
export function curlClearAxis(dMax: number, R: number) {
  return dMax + Math.PI * R + 2 * R;
}

export function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Bake the seam as an RGBA float array (offset, fray, 0, 1) for a 1D texture. */
export function seamTextureData(seam: Seam) {
  const n = seam.offsets.length;
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = seam.offsets[i];
    data[i * 4 + 1] = seam.fray[i];
    data[i * 4 + 3] = 1;
  }
  return data;
}
