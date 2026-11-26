import * as THREE from "three";

/**
 * The one generated texture of the overhaul (ART_BIBLE "Texture" amendment):
 * 128², tileable, four independent channels, made on the CPU at first use and
 * shared by every material that wants painterly variation.
 *
 *  r – fine value-noise fbm (grain, roughness break-up)
 *  g – mid fbm (mottling, moss, damp patches)
 *  b – broad fbm (large warm/cool patches when sampled at a low scale)
 *  a – cellular F1 (stone flecks, pebble mottling, bark plates)
 *
 * Nothing is downloaded. RepeatWrapping + mipmaps; linear data (no colour
 * space), so it can drive roughness as well as albedo.
 */
export const NOISE_SIZE = 128;

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Periodic value noise: the lattice wraps every `period` cells. */
function valueNoise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const fx = smooth(x - xi),
    fy = smooth(y - yi);
  const wrap = (v: number) => ((v % period) + period) % period;
  const x0 = wrap(xi),
    x1 = wrap(xi + 1),
    y0 = wrap(yi),
    y1 = wrap(yi + 1);
  const a = hash(x0, y0, seed),
    b = hash(x1, y0, seed),
    c = hash(x0, y1, seed),
    d = hash(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(u: number, v: number, base: number, octaves: number, seed: number) {
  let sum = 0,
    amp = 0.5,
    norm = 0,
    period = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * period, v * period, period, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}
/** Periodic cellular noise (distance to the nearest jittered feature). */
function cellular(u: number, v: number, cells: number, seed: number) {
  const x = u * cells,
    y = v * cells;
  const xi = Math.floor(x),
    yi = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i,
        cy = yi + j;
      const wx = ((cx % cells) + cells) % cells,
        wy = ((cy % cells) + cells) % cells;
      const px = cx + hash(wx, wy, seed),
        py = cy + hash(wx, wy, seed + 9);
      best = Math.min(best, Math.hypot(px - x, py - y));
    }
  return Math.min(1, best);
}

/** Normalise a channel to roughly 0..1 with a centred mean (contrast stretch). */
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

export function buildNoiseData(size = NOISE_SIZE) {
  const n = size * size;
  const channels = [0, 1, 2, 3].map(() => new Float32Array(n));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        i = y * size + x;
      channels[0][i] = fbm(u, v, 16, 3, 11);
      channels[1][i] = fbm(u, v, 6, 4, 41);
      channels[2][i] = fbm(u, v, 2, 4, 73);
      channels[3][i] = cellular(u, v, 10, 97);
    }
  channels.forEach(stretch);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 4; c++)
      data[i * 4 + c] = Math.round(channels[c][i] * 255);
  return data;
}

let texture: THREE.DataTexture | null = null;
/** The shared noise texture (module-owned; never dispose it). */
export function noiseTexture() {
  if (texture) return texture;
  texture = new THREE.DataTexture(
    buildNoiseData(),
    NOISE_SIZE,
    NOISE_SIZE,
    THREE.RGBAFormat,
  );
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.name = "env-noise-128";
  texture.needsUpdate = true;
  return texture;
}
/** One uniform object shared by every material sampling the noise. */
export const noiseUniform = {
  get value() {
    return noiseTexture();
  },
};
