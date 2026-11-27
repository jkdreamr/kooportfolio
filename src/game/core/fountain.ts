import type { Tier } from "../../stage/contract";

/**
 * A basin fountain's water, as data (Fountain.tsx draws it). Heights and
 * radii are in the fountain's own frame: origin at the basin centre on the
 * ground, y up, world units.
 */
export type FountainSpec = {
  /** Top of the basin water / its radius. */
  basinY: number;
  basinRadius: number;
  /** Top of the raised bowl the jets and plume leave from / its radius. */
  bowlY: number;
  bowlRadius: number;
  /** Arcing jets from the bowl rim, evenly spaced from `jetAngle`. */
  jets: number;
  jetAngle: number;
  /** Where the jets land on the basin (radius) and how high they arc. */
  landRadius: number;
  jetApex: number;
  /** Height of the central plume above the bowl. */
  plumeHeight: number;
};

export const FOUNTAIN_KIND = { jet: 0, plume: 1, splash: 2, mist: 3 } as const;

/** Particles per stream at full ("high") strength. */
export const FOUNTAIN_LAYOUT = {
  perJet: 64,
  plume: 250,
  splashPerJet: 14,
  bowlSplash: 30,
  mist: 10,
} as const;
/** Share of the particles drawn per tier (a prefix of the rank-sorted list). */
export const FOUNTAIN_TIER_SHARE: Record<Tier, number> = {
  high: 1,
  medium: 0.6,
  low: 0.3,
};
/** Beyond this camera distance the fountain draws nothing (explore is 6-16). */
export const FOUNTAIN_FAR = 38;
/** The ripple overlay: one quad on the basin, one on the bowl. */
export const FOUNTAIN_RIPPLE_TRIS = 4;
/** Shader ring sources are a fixed-size loop. */
export const FOUNTAIN_MAX_JETS = 12;

export function fountainParticleTotal(jets: number) {
  const L = FOUNTAIN_LAYOUT;
  return jets * (L.perJet + L.splashPerJet) + L.plume + L.bowlSplash + L.mist;
}
export function fountainParticleCount(jets: number, tier: Tier) {
  return Math.ceil(fountainParticleTotal(jets) * FOUNTAIN_TIER_SHARE[tier]);
}
/** Triangles one fountain adds at `tier` (2 per particle quad + overlay). */
export function fountainTriangles(jets: number, tier: Tier) {
  return fountainParticleCount(jets, tier) * 2 + FOUNTAIN_RIPPLE_TRIS;
}

/** Deterministic 0..1 sequence (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The water clock wraps here (seconds). Every particle rate is a whole
 * number of cycles per wrap, so the wrap is seamless. */
export const FOUNTAIN_TIME_WRAP = 3600;
const wholeCycles = (rate: number) => Math.round(rate * FOUNTAIN_TIME_WRAP) / FOUNTAIN_TIME_WRAP;

/**
 * Per-particle instance data, rank-sorted so that any prefix (a tier's
 * share) is an even thinning of every stream. Two vec4s per particle:
 * a = (kind, angle, phase, rate /s); b = (r1, r2, r3, size). The vertex
 * shader derives every position from these and the time alone.
 */
export function fountainInstances(spec: FountainSpec, seed = 7) {
  const L = FOUNTAIN_LAYOUT;
  const rand = random(seed);
  const rows: { rank: number; a: number[]; b: number[] }[] = [];
  const push = (rank: number, a: number[], b: number[]) => {
    a[3] = wholeCycles(a[3]);
    rows.push({ rank, a, b });
  };
  const jets = Math.min(FOUNTAIN_MAX_JETS, spec.jets);
  for (let j = 0; j < jets; j++) {
    const angle = spec.jetAngle + (j / jets) * Math.PI * 2;
    for (let k = 0; k < L.perJet; k++)
      push(
        rand(),
        [
          FOUNTAIN_KIND.jet,
          angle + (rand() - 0.5) * 0.05,
          // An even stream along the arc, lightly jittered.
          (k + rand() * 0.6) / L.perJet,
          1.05 + rand() * 0.08,
        ],
        [rand(), rand(), rand(), 0.017 + rand() * 0.012],
      );
    for (let k = 0; k < L.splashPerJet; k++)
      push(
        rand(),
        [FOUNTAIN_KIND.splash, angle, rand(), 1.5 + rand() * 0.6],
        [rand(), rand(), rand() * 0.7, 0.011 + rand() * 0.008],
      );
  }
  for (let k = 0; k < L.plume; k++)
    push(
      rand(),
      [FOUNTAIN_KIND.plume, rand() * Math.PI * 2, rand(), 0.72 + rand() * 0.1],
      [rand(), rand(), rand(), 0.016 + rand() * 0.014],
    );
  // r3 > 0.78 marks a splash in the bowl (where the plume falls back).
  for (let k = 0; k < L.bowlSplash; k++)
    push(
      rand(),
      [FOUNTAIN_KIND.splash, rand() * Math.PI * 2, rand(), 1.6 + rand() * 0.5],
      [rand(), rand(), 0.8 + rand() * 0.2, 0.01 + rand() * 0.007],
    );
  // Mist is always drawn (rank < 0): a few large, faint, slow sprites.
  for (let k = 0; k < L.mist; k++)
    push(
      -1 + k / L.mist,
      [FOUNTAIN_KIND.mist, (k / L.mist) * Math.PI * 2, rand(), 0.08],
      [rand(), rand(), rand(), 0.34 + rand() * 0.22],
    );
  rows.sort((x, y) => x.rank - y.rank);
  const a = new Float32Array(rows.length * 4),
    b = new Float32Array(rows.length * 4);
  rows.forEach((row, i) => {
    a.set(row.a, i * 4);
    b.set(row.b, i * 4);
  });
  return { a, b, count: rows.length };
}

/** The jet path at s in 0..1 (what the vertex shader evaluates): radius from
 * the fountain axis and height. Constant horizontal speed: a real parabola. */
export function jetPoint(spec: FountainSpec, s: number) {
  return {
    radius: spec.bowlRadius + (spec.landRadius - spec.bowlRadius) * s,
    y:
      spec.bowlY +
      (spec.basinY - spec.bowlY) * s +
      4 * spec.jetApex * s * (1 - s),
  };
}
