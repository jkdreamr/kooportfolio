import { sampleDaylight, sampleSkyPalette, wrapHour, type Rgb } from "./daylight";

/**
 * The telescope's weather: the village sky magnified. Everything here is
 * pure and seeded (no DOM, no clock, no Math.random), so the eyepiece never
 * flickers and the tests can pin it down:
 *
 *  - `villageSun(hour)`: where the village's sun stands at a game hour. The
 *    village keys its sky to the hour (sunset colours at 18:00 whatever the
 *    season), so the eyepiece's scenery sun follows the same clock: up at
 *    06:00, on the horizon at 18:30. Stars and the Moon stay astronomical.
 *  - `scopeSkyColor`: the village's three-stop gradient (horizon, mid,
 *    zenith) by altitude.
 *  - `sampleCloudLight` / `shadeCloud` / `shadeSea`: cloud colours for an
 *    hour, continuous through day, golden hour, sunset, blue hour and night.
 *  - `buildCloudField`: the seeded clouds on three depth layers.
 *  - `makeCloudSprite` / `tintSprite`: cloud shapes as shading fields and
 *    their per-pixel lighting, painted once and cached by the view.
 */

const RAD = Math.PI / 180;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Smoothstep; also runs downhill when a > b. */
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

/** Mulberry32, as the village clouds use. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the sun

const SUN_LATITUDE = 37.43 * RAD;
const SUN_DECLINATION = 12 * RAD;
/** Village solar noon, and the half day: sunrise 06:00, sunset 18:30. */
export const SUN_NOON = 12.25;
export const SUN_HALF_DAY = 6.25;
const SUN_SET_ANGLE = Math.acos(
  -Math.tan(SUN_LATITUDE) * Math.tan(SUN_DECLINATION),
);

export type SkyPoint = {
  azimuth: number;
  altitude: number;
  east: number;
  north: number;
  up: number;
};

/**
 * The village sun at a game hour (azimuth north = 0, east = 90; degrees).
 * A real diurnal circle at the village's latitude, timed so the sun meets
 * the horizon when the village sky says sunrise and sunset. Continuous over
 * the whole day, midnight included.
 */
export function villageSun(hour: number, out?: SkyPoint): SkyPoint {
  const dh = wrapHour(hour - SUN_NOON + 12) - 12;
  const side = dh < 0 ? -1 : 1;
  const a = Math.abs(dh);
  const angle =
    a <= SUN_HALF_DAY
      ? (a / SUN_HALF_DAY) * SUN_SET_ANGLE
      : SUN_SET_ANGLE +
        ((a - SUN_HALF_DAY) / (12 - SUN_HALF_DAY)) * (Math.PI - SUN_SET_ANGLE);
  const ha = side * angle;
  const east = -Math.cos(SUN_DECLINATION) * Math.sin(ha);
  const north =
    Math.sin(SUN_DECLINATION) * Math.cos(SUN_LATITUDE) -
    Math.cos(SUN_DECLINATION) * Math.cos(ha) * Math.sin(SUN_LATITUDE);
  const up =
    Math.sin(SUN_DECLINATION) * Math.sin(SUN_LATITUDE) +
    Math.cos(SUN_DECLINATION) * Math.cos(ha) * Math.cos(SUN_LATITUDE);
  const point = out ?? { azimuth: 0, altitude: 0, east: 0, north: 0, up: 0 };
  point.east = east;
  point.north = north;
  point.up = up;
  point.azimuth = ((Math.atan2(east, north) / RAD) % 360 + 360) % 360;
  point.altitude = Math.asin(Math.max(-1, Math.min(1, up))) / RAD;
  return point;
}

// ---------------------------------------------------------------- the sky

type SkyStops = Pick<ReturnType<typeof sampleSkyPalette>, "zenith" | "mid" | "horizon">;
const EYEPIECE_NIGHT: Rgb = [0.024, 0.05, 0.1];
/** Altitude of the village sky's `mid` stop, and of its full zenith. */
export const SKY_MID_ALTITUDE = 35;
export const SKY_ZENITH_ALTITUDE = SKY_MID_ALTITUDE / 0.45;

/**
 * Sky colour at `altitude` through the eyepiece: the village's three stops
 * (TimeOfDayLighting: horizon -> mid at 35 degrees -> zenith, mixed in
 * linear light), then darkened towards telescope-black as the stars come
 * out (`stars` 0..1), as the eyepiece always did.
 */
export function scopeSkyColor(palette: SkyStops, stars: number, altitude: number): Rgb {
  const y = clamp01(altitude / SKY_ZENITH_ALTITUDE);
  const low = smooth(0, 0.45, y);
  const high = smooth(0.45, 1, y);
  const dark = 0.55 * stars;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const h = toLinear(palette.horizon[i]);
    const m = toLinear(palette.mid[i]);
    const z = toLinear(palette.zenith[i]);
    const lower = h + (m - h) * low;
    const c = toSrgb(lower + (z - lower) * high);
    out[i] = c + (EYEPIECE_NIGHT[i] - c) * dark;
  }
  return out as unknown as Rgb;
}

// ------------------------------------------------------------- projection

export type ScopeAim = { azimuth: number; altitude: number; zoom: number };
export type Projected = { x: number; y: number; forward: number };
/** Eyepiece units per unit tangent: the same gnomonic scale as the stars. */
export const scopeScale = (zoom: number) => 300 / Math.tan((35 * RAD) / zoom);

/**
 * Gnomonic projection of a sky direction into eyepiece units (600 across,
 * y down), exactly as `projectStar` places the stars, but allocation-free
 * and unclipped: `forward` <= 0 means behind the eyepiece.
 */
export function projectSky(
  azimuth: number,
  altitude: number,
  aim: ScopeAim,
  out: Projected,
): Projected {
  const az = azimuth * RAD,
    alt = altitude * RAD;
  const east = Math.cos(alt) * Math.sin(az),
    north = Math.cos(alt) * Math.cos(az),
    up = Math.sin(alt);
  const a = aim.azimuth * RAD,
    b = aim.altitude * RAD;
  const forward =
    east * Math.cos(b) * Math.sin(a) +
    north * Math.cos(b) * Math.cos(a) +
    up * Math.sin(b);
  out.forward = forward;
  if (forward <= 1e-4) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const scale = scopeScale(aim.zoom);
  out.x = ((east * Math.cos(a) - north * Math.sin(a)) / forward) * scale;
  out.y =
    (-(
      -east * Math.sin(b) * Math.sin(a) -
      north * Math.sin(b) * Math.cos(a) +
      up * Math.cos(b)
    ) /
      forward) *
    scale;
  return out;
}

// ---------------------------------------------------------- cloud lighting

type Vec3 = [number, number, number];
const mix3 = (out: Vec3, a: Readonly<Vec3> | Rgb, b: Readonly<Vec3> | Rgb, t: number) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
};

/** Low-sun light by effective sun altitude (degrees): cream, gold, amber,
 * coral, rose, then the mauve of the last afterglow. */
const WARM_RAMP: readonly (readonly [number, number, number, number])[] = [
  [-16, 0.4, 0.3, 0.5],
  [-10, 0.7, 0.4, 0.56],
  [-6, 0.93, 0.47, 0.5],
  [-2, 1.0, 0.57, 0.43],
  [2, 1.0, 0.71, 0.44],
  [7, 1.0, 0.84, 0.6],
  [14, 1.0, 0.94, 0.82],
  [26, 1.0, 0.985, 0.95],
];
export function warmLight(effectiveAltitude: number, out: Vec3): Vec3 {
  const ramp = WARM_RAMP;
  const e = effectiveAltitude;
  if (e <= ramp[0][0]) {
    out[0] = ramp[0][1];
    out[1] = ramp[0][2];
    out[2] = ramp[0][3];
    return out;
  }
  for (let i = 1; i < ramp.length; i++) {
    if (e <= ramp[i][0]) {
      const from = ramp[i - 1],
        to = ramp[i];
      const t = smooth(from[0], to[0], e);
      out[0] = from[1] + (to[1] - from[1]) * t;
      out[1] = from[2] + (to[2] - from[2]) * t;
      out[2] = from[3] + (to[3] - from[3]) * t;
      return out;
    }
  }
  const last = ramp[ramp.length - 1];
  out[0] = last[1];
  out[1] = last[2];
  out[2] = last[3];
  return out;
}

/** What an hour does to the clouds. Colours are sRGB 0..1. */
export type CloudLight = {
  hour: number;
  sunAzimuth: number;
  sunAltitude: number;
  /** The village sky's night factor. */
  night: number;
  /** 0 by day .. 1 with the sun low: sunlit cloud turns from white to gold. */
  warmth: number;
  /** 0 .. 1 as the sun reaches the horizon: light moves to the undersides. */
  under: number;
  /** 1 by day .. 0 at night: how much of the day's cloud is still there. */
  cover: number;
  dayTop: Vec3;
  dayUnder: Vec3;
  /** Unlit cloud at dusk: the cool violet of the tops. */
  shadow: Vec3;
  /** Moonlit cloud. */
  moon: Vec3;
  horizon: Vec3;
  /** Crepuscular glow on the horizon under the sun: core, fringe, strength. */
  glowCore: Vec3;
  glowEdge: Vec3;
  glowAlpha: number;
  /** Bloom around the sun, and the disc. */
  bloom: Vec3;
  bloomAlpha: number;
  disc: Vec3;
  discAlpha: number;
};
const vec = (): Vec3 => [0, 0, 0];
export function createCloudLight(): CloudLight {
  return {
    hour: 0,
    sunAzimuth: 0,
    sunAltitude: 0,
    night: 0,
    warmth: 0,
    under: 0,
    cover: 1,
    dayTop: vec(),
    dayUnder: vec(),
    shadow: vec(),
    moon: vec(),
    horizon: vec(),
    glowCore: vec(),
    glowEdge: vec(),
    glowAlpha: 0,
    bloom: vec(),
    bloomAlpha: 0,
    disc: vec(),
    discAlpha: 0,
  };
}
const WHITE: Vec3 = [1, 1, 1];
const DISC_LOW: Vec3 = [1, 0.64, 0.3];
const sunScratch: SkyPoint = { azimuth: 0, altitude: 0, east: 0, north: 0, up: 0 };
const warmScratch = vec();

/** Cloud light for a game hour. Continuous in `hour` (no keys of its own:
 * the village palette and the sun's altitude drive everything). */
export function sampleCloudLight(hour: number, out = createCloudLight()): CloudLight {
  const sun = villageSun(hour, sunScratch);
  const s = sun.altitude;
  const palette = sampleSkyPalette(hour);
  const night = sampleDaylight(hour).night;
  out.hour = wrapHour(hour);
  out.sunAzimuth = sun.azimuth;
  out.sunAltitude = s;
  out.night = night;
  out.warmth = smooth(30, 6, s);
  out.under = smooth(10, 0, s);
  out.cover = 1 - smooth(0.45, 1, night);
  // Sunlit cloud by day: white, a breath of the sun's own colour.
  mix3(out.dayTop, WHITE, palette.sun, 0.18);
  // Its shadowed underside: the mid sky, lifted towards white.
  mix3(out.dayUnder, palette.mid, WHITE, 0.4);
  out.dayUnder[0] *= 0.9;
  out.dayUnder[1] *= 0.9;
  out.dayUnder[2] *= 0.92;
  mix3(out.shadow, palette.zenith, palette.mid, 0.42);
  // Moonlight: the unlit colour lifted by the moonlit sky tint.
  out.moon[0] = Math.min(1, out.shadow[0] + palette.sky[0] * 0.4);
  out.moon[1] = Math.min(1, out.shadow[1] + palette.sky[1] * 0.42);
  out.moon[2] = Math.min(1, out.shadow[2] + palette.sky[2] * 0.44);
  out.horizon[0] = palette.horizon[0];
  out.horizon[1] = palette.horizon[1];
  out.horizon[2] = palette.horizon[2];
  warmLight(s + 8, out.glowCore);
  out.glowCore[2] *= 0.82;
  warmLight(s - 4, out.glowEdge);
  out.glowAlpha = smooth(26, 5, s) * smooth(-17, -5, s) * 0.95;
  mix3(out.bloom, WHITE, warmLight(s + 8, warmScratch), 0.6);
  out.bloomAlpha = smooth(-9, -1, s) * 0.9;
  // The disc is the village sun's own colour (cream by day, orange at
  // sunset), deepening as it meets the horizon.
  mix3(out.disc, palette.sun, DISC_LOW, smooth(9, -2, s));
  out.discAlpha = smooth(-7, -2.5, s);
  return out;
}

/** One cloud's colours. `top` and `under` are the ends of its top-to-base
 * gradient; `rim` is added on thin, sun-facing edges. */
export type CloudShade = {
  top: Vec3;
  under: Vec3;
  rim: Vec3;
  rimAmount: number;
  /** Side relief: sun-facing flanks brighten by this much. */
  relief: number;
  /** How deep the creases between billows go (0 flat .. ~0.2). */
  billow: number;
  /** How far up the cloud the base colour reaches: 0 by day (white with a
   * grey base), 1 when lit from below (the whole belly glows). */
  spread: number;
};
export const createCloudShade = (): CloudShade => ({
  top: vec(),
  under: vec(),
  rim: vec(),
  rimAmount: 0,
  relief: 0,
  billow: 0,
  spread: 0,
});
const topScratch = vec(),
  underScratch = vec();

/** How long after sunset a cloud at `lift` (0 low .. 1 high) keeps the
 * sun: low cloud goes dark first, high cloud holds the pink. */
export function afterglow(sunAltitude: number, lift: number) {
  const start = -2 - 8 * lift;
  return smooth(start - 6, start, sunAltitude);
}

/**
 * Colours for a cloud `lift` high (0 low .. 1 high) and `sunDistance`
 * degrees of arc from the sun. By day white over blue-grey; at golden hour
 * gold flanks over mauve; at sunset the light comes from below, so the
 * undersides run gold to pink and the tops fall to violet; then moonlit.
 */
export function shadeCloud(
  light: CloudLight,
  lift: number,
  sunDistance: number,
  out: CloudShade,
): CloudShade {
  const s = light.sunAltitude;
  const lit = afterglow(s, lift);
  // Pinker and later-looking the further round the sky from the sun.
  const e = s + 3 * lift - 5 * (sunDistance / 180);
  const warmTop = warmLight(e + 3, topScratch);
  const warmUnder = warmLight(e, underScratch);
  const n = light.night;
  for (let i = 0; i < 3; i++) {
    const sunlit = light.dayTop[i] + (warmTop[i] - light.dayTop[i]) * light.warmth * 0.9;
    const top = sunlit + (light.shadow[i] - sunlit) * light.under * 0.92;
    out.top[i] = top + (light.moon[i] - top) * n;
    const shade =
      light.dayUnder[i] + (light.shadow[i] * 0.92 - light.dayUnder[i]) * light.warmth;
    const under = shade + (warmUnder[i] - shade) * light.under * lit;
    out.under[i] = under + (light.shadow[i] * 0.9 - under) * n * 0.6;
    out.rim[i] = warmTop[i] + (1 - warmTop[i]) * 0.35;
  }
  const near = smooth(80, 8, sunDistance);
  out.rimAmount = lit * (1 - n) * near * (0.18 + 0.3 * light.warmth);
  out.relief = 0.07 + 0.11 * light.warmth * (1 - n) * lit;
  out.billow = 0.16 - 0.06 * n;
  out.spread = light.under * lit;
  return out;
}

/**
 * Colours for the cloud sea under the horizon. We look down on it: the
 * tops catch the sun, the bodies sit in shade. Distance haze is the view's
 * (a veil of the horizon colour between rows), not baked in here.
 */
export function shadeSea(light: CloudLight, out: CloudShade): CloudShade {
  const s = light.sunAltitude;
  const lit = afterglow(s, 0.1);
  const warm = warmLight(s + 2, topScratch);
  const n = light.night;
  for (let i = 0; i < 3; i++) {
    const sunlit = light.dayTop[i] + (warm[i] - light.dayTop[i]) * light.warmth;
    const body =
      light.dayUnder[i] + (light.shadow[i] * 0.95 - light.dayUnder[i]) * light.warmth;
    const top = body + (sunlit - body) * (0.12 + 0.88 * lit);
    out.top[i] = top + (light.moon[i] - top) * n;
    out.under[i] = body;
    out.rim[i] = warm[i] + (1 - warm[i]) * 0.3;
  }
  out.rimAmount = 0;
  out.relief = 0.06 + 0.1 * light.warmth * (1 - n);
  out.billow = 0.14;
  out.spread = 0;
  return out;
}

// -------------------------------------------------------------- the field

export type CloudKind = "cumulus" | "streak";
export type SkyCloud = {
  /** 0 far (low on the horizon), 1 middle, 2 near (high, large). */
  layer: 0 | 1 | 2;
  kind: CloudKind;
  /** Which sprite of its kind. */
  variant: number;
  azimuth: number;
  altitude: number;
  /** Angular size, degrees of arc. */
  width: number;
  height: number;
  flip: boolean;
  /** 0 low .. 1 high, for how long it holds the sunset. */
  lift: number;
  opacity: number;
  /** What is left of it at night, 0 (gone) .. ~0.4 (a moonlit wisp). */
  wisp: number;
};
/**
 * Depth layers. `turns` is the drift in whole turns of the sky per day, so
 * the drift is periodic and a pure function of the time of day; `parallax`
 * is how much faster than the stars the layer slides as the eyepiece pans.
 */
export const CLOUD_LAYERS = [
  { turns: 4, parallax: 1 },
  { turns: 7, parallax: 1.07 },
  { turns: 12, parallax: 1.16 },
] as const;
export const CUMULUS_VARIANTS = 5;
export const STREAK_VARIANTS = 4;

/** Degrees a layer has drifted `seconds` into the day. */
export function cloudDrift(layer: number, seconds: number) {
  return ((CLOUD_LAYERS[layer].turns * 360 * (seconds % 86400)) / 86400) % 360;
}

/** The seeded sky: where every cloud sits, back to front. */
export function buildCloudField(seed = 1836): SkyCloud[] {
  const rand = seeded(seed);
  const clouds: SkyCloud[] = [];
  const ring = (
    layer: 0 | 1 | 2,
    kind: CloudKind,
    count: number,
    altitude: [number, number],
    width: [number, number],
    aspect: [number, number],
    opacity: number,
    wispChance: number,
  ) => {
    const offset = rand();
    for (let i = 0; i < count; i++) {
      const w = width[0] + rand() * (width[1] - width[0]);
      const alt = altitude[0] + rand() * (altitude[1] - altitude[0]);
      const wisp = rand() < wispChance ? 0.3 + rand() * 0.2 : 0;
      clouds.push({
        layer,
        kind,
        variant: Math.floor(
          rand() * (kind === "cumulus" ? CUMULUS_VARIANTS : STREAK_VARIANTS),
        ),
        // Stratified round the sky: no clumps, no empty quarter.
        azimuth: (((i + offset + (rand() - 0.5) * 0.7) / count) * 360 + 360) % 360,
        altitude: alt,
        width: w,
        height: w * (aspect[0] + rand() * (aspect[1] - aspect[0])),
        flip: rand() < 0.5,
        lift: clamp01(alt / 60),
        opacity,
        wisp,
      });
    }
  };
  // Far: long bars low over the horizon (what the sun sets through), and
  // small distant cumulus.
  ring(0, "streak", 14, [2.5, 11], [28, 46], [0.17, 0.23], 0.9, 0.25);
  ring(0, "cumulus", 7, [5, 12], [13, 20], [0.46, 0.54], 0.94, 0);
  // Middle: cumulus and altostratus.
  ring(1, "streak", 8, [15, 42], [32, 50], [0.19, 0.25], 0.85, 0.45);
  ring(1, "cumulus", 9, [17, 39], [22, 36], [0.46, 0.54], 0.96, 0);
  // Near: a few big cumulus and high cirrus.
  ring(2, "streak", 5, [44, 64], [38, 54], [0.2, 0.26], 0.72, 0.6);
  ring(2, "cumulus", 6, [36, 62], [36, 54], [0.46, 0.54], 0.96, 0);
  return clouds;
}

/** A cloud's opacity for the hour: full by day, thinning to its wisp (or
 * to nothing) at night, so the stars keep the sky. */
export function cloudPresence(cloud: Pick<SkyCloud, "opacity" | "wisp">, light: CloudLight) {
  return cloud.opacity * (cloud.wisp + (1 - cloud.wisp) * light.cover);
}

// ------------------------------------------------------------- the sprites

/**
 * A cloud shape as shading fields, one byte per pixel each:
 *  `alpha`; `depth` below the cloud's top (0 top .. 255 base); `facing`
 *  (128 flat, >128 faces right); `thick` (0 at a thin edge .. 255 in the
 *  body); `lobe` (the billows: 255 on a puff's crown, low in the creases).
 */
export type CloudSprite = {
  width: number;
  height: number;
  alpha: Uint8Array;
  depth: Uint8Array;
  facing: Uint8Array;
  thick: Uint8Array;
  lobe: Uint8Array;
};
export type SpriteKind = CloudKind | "sea";
export const SPRITE_SIZE: Record<SpriteKind, readonly [number, number]> = {
  cumulus: [256, 128],
  streak: [256, 64],
  sea: [768, 48],
};

/** A seeded value-noise lattice; `sampleLattice` reads it bilinearly
 * (smoothed), tiling in x when `wrap`. Far cheaper than hashing a pixel. */
type Lattice = { grid: Float32Array; columns: number; rows: number };
function lattice(columns: number, rows: number, rand: () => number): Lattice {
  const grid = new Float32Array(columns * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return { grid, columns, rows };
}
function sampleLattice(l: Lattice, x: number, y: number, wrap: boolean) {
  const { grid, columns } = l;
  const ix = x | 0;
  let iy = y | 0;
  if (iy > l.rows - 2) iy = l.rows - 2;
  const fx = x - ix;
  let fy = y - iy;
  if (fy > 1) fy = 1;
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy);
  const x0 = wrap ? ix % columns : ix > columns - 2 ? columns - 2 : ix;
  const x1 = wrap ? (x0 + 1) % columns : x0 + 1;
  const r0 = iy * columns,
    r1 = r0 + columns;
  const a = grid[r0 + x0],
    b = grid[r0 + x1],
    c = grid[r1 + x0],
    d = grid[r1 + x1];
  return a + (b - a) * ux + (c - a + (a - b + d - c) * ux) * uy;
}

/** Add a soft puff to `field`, and its crown (lit from above) to `lobe`. */
function splat(
  field: Float32Array,
  lobe: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  weight: number,
  wrap: boolean,
) {
  const y0 = Math.max(0, Math.floor(cy - ry)),
    y1 = Math.min(h - 1, Math.ceil(cy + ry));
  const x0 = Math.floor(cx - rx),
    x1 = Math.ceil(cx + rx);
  const crown = cy - ry * 0.28;
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry;
    const dy2 = dy * dy;
    if (dy2 >= 1) continue;
    const ly = (y - crown) / ry;
    for (let x = x0; x <= x1; x++) {
      let xx = x;
      if (wrap) xx = x < 0 ? x + w : x >= w ? x - w : x;
      else if (x < 0 || x >= w) continue;
      const dx = (x - cx) / rx;
      const q = dx * dx + dy2;
      if (q >= 1) continue;
      const f = 1 - q;
      const i = y * w + xx;
      field[i] += weight * f * f;
      // The crown fades to nothing at the puff's edge: creases are soft.
      const l = (1 - (dx * dx + ly * ly) * 0.8) * f * (2 - f);
      if (l > lobe[i]) lobe[i] = l;
    }
  }
}

/** Paint a cloud's shading fields. Deterministic in (kind, seed). */
export function makeCloudSprite(kind: SpriteKind, seed: number): CloudSprite {
  const steps = cloudSpriteSteps(kind, seed);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** `makeCloudSprite` in slices (it yields every few rows), so a view can
 * spread the painting over frames and never hold one up. */
export function* cloudSpriteSteps(
  kind: SpriteKind,
  seed: number,
): Generator<undefined, CloudSprite> {
  const [w, h] = SPRITE_SIZE[kind];
  const rand = seeded(seed * 7919 + (kind === "cumulus" ? 11 : kind === "streak" ? 23 : 37));
  const field = new Float32Array(w * h);
  const lobes = new Float32Array(w * h);
  const sea = kind === "sea";

  if (kind === "cumulus") {
    const base = h * 0.78;
    // Domes, shoulders either side, then small billows round the crowns.
    const domes: [number, number, number][] = [];
    const nd = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < nd; i++) {
      const r = h * (0.24 + 0.13 * rand());
      const x = w * (0.32 + (0.36 * (i + rand())) / nd);
      domes.push([x, base - r * 0.78, r]);
      splat(field, lobes, w, h, x, base - r * 0.78, r * 1.1, r, 0.95, false);
    }
    const ns = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < ns; i++) {
      // Smaller towards the ends: the cloud tapers, it does not end in a ball.
      const t = (i + rand()) / ns;
      const r = h * (0.08 + (0.1 + 0.07 * rand()) * Math.sin(Math.PI * t) ** 0.7);
      const x = w * (0.15 + 0.7 * t);
      splat(field, lobes, w, h, x, base - r * 0.72, r * 1.5, r, 0.85, false);
    }
    // A low, broad body: nothing hangs off the sides as a loose ball.
    splat(field, lobes, w, h, w * 0.5, base - h * 0.13, w * 0.36, h * 0.2, 0.55, false);
    const nb = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < nb; i++) {
      const dome = domes[Math.floor(rand() * domes.length)];
      const angle = (rand() - 0.5) * 1.8;
      const r = dome[2] * (0.34 + 0.2 * rand());
      const out = 0.62 + 0.16 * rand();
      splat(
        field,
        lobes,
        w,
        h,
        dome[0] + Math.sin(angle) * dome[2] * out * 1.1,
        dome[1] - Math.cos(angle) * dome[2] * out * 0.85,
        r,
        r,
        0.8,
        false,
      );
    }
    yield;
  } else if (kind === "streak") {
    // A long lens of cloud, and a few softer strands laid along it.
    const slope = (rand() - 0.5) * 0.08;
    splat(field, lobes, w, h, w * 0.5, h * 0.5, w * 0.37, h * 0.2, 0.5, false);
    const strands = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < strands; k++) {
      const y0 = h * (0.34 + 0.32 * rand());
      const from = 0.13 + 0.25 * rand(),
        to = 0.87 - 0.25 * rand();
      const n = 4 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5 + (rand() - 0.5) * 0.5) / n;
        const x = w * (from + (to - from) * t);
        const y = y0 + (x - w / 2) * slope;
        splat(field, lobes, w, h, x, y, w * (0.1 + 0.07 * rand()), h * (0.13 + 0.09 * rand()), 0.42, false);
      }
    }
    yield;
  } else {
    // Cloud sea: a rolling line of tops, tiling in x, with the odd tower.
    const n = 40;
    for (let i = 0; i < n; i++) {
      const tower = rand() < 0.16;
      const r = h * (tower ? 0.36 + 0.1 * rand() : 0.2 + 0.16 * rand());
      const x = ((i + rand()) / n) * w;
      const y = h * (0.6 + 0.1 * rand()) - (tower ? r * 0.35 : 0);
      splat(field, lobes, w, h, x, y, r * (1.25 + 0.9 * rand()), r, 0.9, true);
      if (i % 10 === 9) yield;
    }
  }

  // Erode with noise (billowed edges), then the kind's own envelope.
  const coarse = kind === "streak" ? 20 : 24;
  const fine = 8;
  const stretch = kind === "streak" ? 3.5 : 1;
  const cw = Math.round(w / (coarse * stretch)),
    fw = Math.round(w / (fine * stretch));
  const erosion: Erosion = {
    w,
    h,
    kind,
    n1: lattice(cw + 2, Math.ceil(h / coarse) + 2, rand),
    n2: lattice(fw + 2, Math.ceil(h / fine) + 2, rand),
    sx1: sea ? cw / w : 1 / (coarse * stretch),
    sx2: sea ? fw / w : 1 / (fine * stretch),
    coarse,
    fine,
    soft: kind === "streak" ? 0.55 : 0.22,
    grit: kind === "streak" ? 0.14 : sea ? 0.1 : 0.2,
    ends: new Float32Array(w),
  };
  for (let x = 0; x < w; x++)
    erosion.ends[x] = kind === "streak" ? Math.sin((Math.PI * x) / (w - 1)) ** 0.7 : 1;
  for (let y = 0; y < h; y += ROWS) {
    erodeRows(field, erosion, y, Math.min(h, y + ROWS));
    yield;
  }

  const alpha = new Uint8Array(w * h),
    depth = new Uint8Array(w * h),
    facing = new Uint8Array(w * h),
    thick = new Uint8Array(w * h),
    lobe = new Uint8Array(w * h);
  const sprite: CloudSprite = { width: w, height: h, alpha, depth, facing, thick, lobe };
  for (let y = 0; y < h; y += ROWS) {
    channelRows(field, lobes, sprite, kind, y, Math.min(h, y + ROWS));
    yield;
  }
  depthField(sprite, kind);
  return sprite;
}

/** Rows painted between yields. */
const ROWS = 16;
type Erosion = {
  w: number;
  h: number;
  kind: SpriteKind;
  n1: Lattice;
  n2: Lattice;
  sx1: number;
  sx2: number;
  coarse: number;
  fine: number;
  soft: number;
  grit: number;
  ends: Float32Array;
};
function erodeRows(field: Float32Array, e: Erosion, from: number, to: number) {
  const { w, h, kind, n1, n2, sx1, sx2, soft, grit, ends } = e;
  const sea = kind === "sea";
  for (let y = from; y < to; y++) {
    const rowFade = sea
      ? smooth(0, 6, y)
      : kind === "cumulus"
        ? smooth(h * 0.84, h * 0.74, y)
        : 1;
    const solid = sea ? 1.6 * smooth(h * 0.62, h * 0.86, y) : 0;
    const yEdge = Math.min(y, h - 1 - y) * 1.6;
    const y1 = y / e.coarse,
      y2 = y / e.fine;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const raw = field[i];
      if (raw <= 0 && !sea) continue;
      let d =
        (raw * (1 - soft + 2 * soft * sampleLattice(n1, x * sx1, y1, sea)) -
          grit * sampleLattice(n2, x * sx2, y2, sea)) *
        rowFade *
        ends[x];
      if (sea) {
        if (d < solid) d = solid;
      } else {
        // Nothing may touch the sprite's edge.
        let edge = x < w - 1 - x ? x : w - 1 - x;
        if (yEdge < edge) edge = yEdge;
        if (edge < 10) d *= smooth(0, 10, edge);
      }
      field[i] = d > 0 ? d : 0;
    }
  }
}
function channelRows(
  field: Float32Array,
  lobes: Float32Array,
  sprite: CloudSprite,
  kind: SpriteKind,
  from: number,
  to: number,
) {
  const { width: w, height: h, alpha, facing, thick, lobe } = sprite;
  const sea = kind === "sea";
  const lo = kind === "streak" ? 0.06 : sea ? 0.3 : 0.24;
  const hi = kind === "streak" ? 0.9 : sea ? 0.62 : 0.72;
  const maxAlpha = kind === "streak" ? 0.9 : sea ? 1 : 0.97;
  for (let y = from; y < to; y++) {
    // The sea's solid body carries no relief: only its tops are modelled.
    const relief = sea ? 1 - smooth(h * 0.5, h * 0.74, y) : 1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = field[i];
      if (d <= 0) {
        facing[i] = 128;
        continue;
      }
      const xl = sea ? (x + w - 2) % w : x < 2 ? 0 : x - 2;
      const xr = sea ? (x + 2) % w : x > w - 3 ? w - 1 : x + 2;
      let nx = (field[y * w + xl] - field[y * w + xr]) * 2;
      nx = nx < -1 ? -1 : nx > 1 ? 1 : nx;
      alpha[i] = Math.round(smooth(lo, hi, d) * maxAlpha * 255);
      facing[i] = Math.round(128 + 127 * nx * relief);
      thick[i] = Math.round(clamp01((d - lo) / 1.1) * 255);
      lobe[i] = Math.round((0.5 + (clamp01(lobes[i]) - 0.5) * relief) * 255);
    }
  }
}
/** Depth below the top: how much cloud lies above each pixel. */
function depthField(sprite: CloudSprite, kind: SpriteKind) {
  const { width: w, height: h, alpha, depth } = sprite;
  if (kind === "sea") {
    // Depth below the envelope of the tops (their crowns, smoothed), so the
    // creases between billows fall into shade instead of catching the sun.
    const top = new Float32Array(w),
      crown = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h - 1 && alpha[y * w + x] < 128) y++;
      top[x] = y;
    }
    const reach = 9;
    for (let x = 0; x < w; x++) {
      let best = h;
      for (let k = -reach; k <= reach; k++) {
        const t = top[(x + k + w) % w];
        if (t < best) best = t;
      }
      crown[x] = best;
    }
    const range = h * 0.36;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -6; k <= 6; k++) sum += crown[(x + k + w) % w];
      const start = sum / 13;
      for (let y = 0; y < h; y++)
        depth[y * w + x] = Math.round(clamp01((y - start) / range) * 255);
    }
    return;
  }
  let deepest = 1e-3;
  const column = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y < h; y++) sum += alpha[y * w + x];
    column[x] = sum;
    if (sum > deepest) deepest = sum;
  }
  const own = kind === "streak" ? 0.85 : 0.45;
  for (let x = 0; x < w; x++) {
    const total = own * column[x] + (1 - own) * deepest;
    let above = 0;
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      above += alpha[i] * 0.5;
      depth[i] = Math.round(clamp01(above / total) * 255);
      above += alpha[i] * 0.5;
    }
  }
}

/**
 * Light a sprite into RGBA (`out`, 4 bytes per pixel, straight alpha).
 * `side` is +1 with the sun to the cloud's right, -1 to its left (and
 * anything between when it stands behind or ahead).
 */
export function tintSprite(
  sprite: CloudSprite,
  shade: CloudShade,
  side: number,
  out: Uint8ClampedArray,
) {
  const { alpha, depth, facing, thick, lobe } = sprite;
  const tr = shade.top[0] * 255,
    tg = shade.top[1] * 255,
    tb = shade.top[2] * 255;
  const ur = shade.under[0] * 255 - tr,
    ug = shade.under[1] * 255 - tg,
    ub = shade.under[2] * 255 - tb;
  const rr = shade.rim[0] * 255,
    rg = shade.rim[1] * 255,
    rb = shade.rim[2] * 255;
  const relief = (shade.relief * side) / 127;
  const rimAmount = shade.rimAmount;
  const billow = shade.billow / 255;
  const floor = 1 - shade.billow;
  const spread = shade.spread;
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    const a = alpha[i];
    out[j + 3] = a;
    if (a === 0) continue;
    const v = depth[i] / 255;
    const day = v * v * (3 - 2 * v);
    const d = day + (v * (2 - v) - day) * spread;
    const face = (facing[i] - 128) * relief;
    const thin = 1 - thick[i] / 255;
    const rim = rimAmount * thin * thin * (1 + face * 4);
    const gain = (1 + face) * (floor + lobe[i] * billow);
    out[j] = (tr + ur * d) * gain + rr * rim;
    out[j + 1] = (tg + ug * d) * gain + rg * rim;
    out[j + 2] = (tb + ub * d) * gain + rb * rim;
  }
}

function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** A soft radial falloff table for glows: 1 at the centre, 0 at the rim,
 * with half a level of seeded dither so the long ramps never band. */
export function makeGlowField(size: number, power: number, seed: number): Float32Array {
  const field = new Float32Array(size * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c;
      const f = r >= 1 ? 0 : (1 - r * r) ** power;
      field[y * size + x] = f > 0 ? f + (hash2(x, y, seed) - 0.5) / 255 : 0;
    }
  return field;
}

/**
 * Crepuscular rays as an alpha field: soft shafts fanning from the centre,
 * fading with distance, a little stronger upwards. Seeded and static.
 */
export function makeRayField(size: number, seed: number): Float32Array {
  const field = new Float32Array(size * size);
  const c = (size - 1) / 2;
  const rand = seeded(seed);
  const spokes = 96;
  const strength = new Float32Array(spokes);
  for (let i = 0; i < spokes; i++) strength[i] = rand() ** 2.2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c,
        dy = (y - c) / c;
      const r = Math.hypot(dx, dy);
      if (r >= 1 || r < 0.02) continue;
      const turn = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) * spokes;
      const i0 = Math.floor(turn),
        t = turn - i0;
      const u = t * t * (3 - 2 * t);
      const shaft =
        strength[i0 % spokes] + (strength[(i0 + 1) % spokes] - strength[i0 % spokes]) * u;
      const up = 0.55 + 0.45 * Math.max(0, -dy / r);
      field[y * size + x] = shaft * up * (1 - r) ** 1.5 * Math.min(1, r * 8);
    }
  return field;
}
