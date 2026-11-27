/**
 * Seeded randomness for Banner Rush: mulberry32 (WS-E's `nextRandom`) and
 * FNV-1a. Integer arithmetic only, so every engine produces the same bits.
 */

/** One mulberry32 draw: [value in [0, 1), next state]. */
export function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Allocation-free stream: draws from `streams[i]` and advances it in place. */
export function draw(streams: Int32Array, i: number): number {
  const s = (streams[i] + 0x6d2b79f5) | 0;
  streams[i] = s;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [lo, hi] (inclusive) from a stream. */
export function drawInt(streams: Int32Array, i: number, lo: number, hi: number): number {
  return lo + Math.floor(draw(streams, i) * (hi - lo + 1));
}

/** Derives an independent stream seed from a match seed and a salt. */
export function deriveSeed(seed: number, salt: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(salt + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 16)) | 0;
}

export const FNV_OFFSET = 0x811c9dc5;
/** FNV-1a over a string (UTF-16 code units, low byte then high byte). */
export function fnv1aString(text: string, h = FNV_OFFSET): number {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h = Math.imul(h ^ (c & 255), 0x01000193);
    h = Math.imul(h ^ (c >>> 8), 0x01000193);
  }
  return h >>> 0;
}
/** FNV-1a over raw bytes. */
export function fnv1aBytes(bytes: Uint8Array, h = FNV_OFFSET): number {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
  return h >>> 0;
}
