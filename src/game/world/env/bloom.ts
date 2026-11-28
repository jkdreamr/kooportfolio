/**
 * Meadow blossom in the grass (PLAN_GAMES §4.5): which tufts flower. Pure.
 *
 * A low-frequency mask marks meadow patches (about a sixth of the lawn);
 * inside a patch 30% of tufts bloom. A blooming tuft keeps its instance in
 * the existing grass batch: its instance colour is the bloom colour offset
 * by BLOOM_OFFSET, which the grass shader reads as "flower tips above 62% of
 * the blade" (0 new draws, 0 new triangles, the same program).
 */
export const BLOOM_OFFSET = 2;
export const BLOOM_SHARE = 0.3;
/** Mask threshold: ~17% of the plane is meadow. */
const PATCH_LEVEL = 0.5;

/** 0..1 meadow strength; patches are where it is above PATCH_LEVEL. */
export function meadowMask(x: number, z: number, seed = 0) {
  const a = Math.sin(x * 0.11 + 1.3 + seed) * Math.sin(z * 0.13 - 0.7 + seed * 0.5);
  const b = Math.sin((x + z) * 0.071 + 2 + seed) * Math.sin((x - z) * 0.053 - 1.1);
  return 0.5 + 0.38 * a + 0.24 * b;
}
export const inMeadow = (x: number, z: number, seed = 0) => meadowMask(x, z, seed) > PATCH_LEVEL + 0.22;

const hash = (x: number, z: number) => {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** -1 for an ordinary tuft, else the index of its bloom colour. */
export function bloomPick(x: number, z: number, colours: number, seed = 0): number {
  if (!inMeadow(x, z, seed)) return -1;
  const h = hash(x, z);
  return h < BLOOM_SHARE ? Math.floor((h / BLOOM_SHARE) * colours) % colours : -1;
}
