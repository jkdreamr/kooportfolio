import {
  buildCloudField,
  cloudDrift,
  cloudSpriteSteps,
  cloudPresence,
  CLOUD_LAYERS,
  createCloudLight,
  createCloudShade,
  CUMULUS_VARIANTS,
  makeGlowField,
  makeRayField,
  projectSky,
  sampleCloudLight,
  scopeScale,
  shadeCloud,
  shadeSea,
  SPRITE_SIZE,
  STREAK_VARIANTS,
  tintSprite,
  type CloudSprite,
  type Projected,
  type ScopeAim,
  type SkyCloud,
  type SpriteKind,
} from "../core/telescopeClouds";
import { wrapHour } from "../core/daylight";
import { exposeQa } from "../../stage/qa";

/**
 * The eyepiece's weather layer: one 2D canvas over the star chart that
 * draws the sun, its bloom, the glow on the horizon, three depth layers of
 * drifting cloud and the cloud sea below the horizon.
 *
 * Cost model: a cloud is painted (per-pixel lighting, `tintSprite`) into
 * its own small offscreen canvas only when the light changes, a few per
 * frame; a frame is then nothing but `drawImage` calls with a transform
 * (about 25 of them), with no allocation. Shapes are generated once per
 * page, one or two a frame, and kept for the next visit to the telescope.
 */

const RAD = Math.PI / 180;
const VIEW = 600;
const HALF = VIEW / 2;
/** Light is re-sampled when the eased hour has moved this far (15 s). */
const LIGHT_STEP = 1 / 240;
/** Drift redraws: clouds move a few hundredths of a pixel between them. */
const DRIFT_INTERVAL = 50;
/**
 * The cloud sea, far to near. A flat deck seen from above: each row sits
 * lower, larger and faster than the one behind, and a veil of horizon haze
 * is laid over the far rows before the next is drawn (aerial perspective).
 * `scale` 1 is 90 degrees of horizon per strip.
 */
const SEA_ROWS = [
  { altitude: 0.2, scale: 0.34, sprite: 0, offset: 0, veil: 0.4 },
  { altitude: -0.9, scale: 0.46, sprite: 1, offset: 31, veil: 0.32 },
  { altitude: -2.2, scale: 0.62, sprite: 0, offset: 67, veil: 0.25 },
  { altitude: -4.2, scale: 0.85, sprite: 1, offset: 11, veil: 0.18 },
  { altitude: -7.5, scale: 1.2, sprite: 0, offset: 53, veil: 0.14 },
  { altitude: -13, scale: 1.8, sprite: 1, offset: 89, veil: 0.1 },
  { altitude: -22, scale: 2.8, sprite: 0, offset: 23, veil: 0.06 },
  { altitude: -34, scale: 4.2, sprite: 1, offset: 71, veil: 0 },
] as const;
const SEA_SPAN = 90;
/** Strip widths a row drifts per day (whole, so the drift is periodic). */
const SEA_TURNS = 10;
const GLOW_SIZE = 192;
const BLOOM_SIZE = 128;
const DISC_SIZE = 64;
const RAY_SIZE = 192;
const VEIL_ROWS = 32;

/** Sprites fade out towards the edge of what the projection can show. */
function fade(forward: number) {
  const t = Math.max(0, Math.min(1, (forward - 0.2) / 0.3));
  return t * t * (3 - 2 * t);
}

type Layer = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  version: number;
};

// Page-lifetime caches: shapes and painted clouds survive closing the view.
const field: SkyCloud[] = buildCloudField();
const sprites: Record<SpriteKind, (CloudSprite | null)[]> = {
  cumulus: Array.from({ length: CUMULUS_VARIANTS }, () => null),
  streak: Array.from({ length: STREAK_VARIANTS }, () => null),
  sea: [null, null],
};
// Smallest first: the painter is warm by the time the big ones come.
const pendingSprites: [SpriteKind, number][] = [
  ...sprites.streak.map((_, i): [SpriteKind, number] => ["streak", i]),
  ...sprites.cumulus.map((_, i): [SpriteKind, number] => ["cumulus", i]),
  ...sprites.sea.map((_, i): [SpriteKind, number] => ["sea", i]),
];
const painted: (Layer | null)[] = field.map(() => null);
const seaPainted: (Layer | null)[] = sprites.sea.map(() => null);
const buffers: Partial<Record<SpriteKind, ImageData>> = {};
let glowField: Float32Array | null = null;
let bloomField: Float32Array | null = null;
let rayField: Float32Array | null = null;
/** Bumped on every relight, page-wide: a cloud painted for an earlier
 * visit (another hour) can never pass as current. */
let version = 0;

let painting: ReturnType<typeof cloudSpriteSteps> | null = null;
let spritesFresh = false;
/** Paint cloud shapes for up to `budget` ms; true once all are done. */
function paintSprites(budget: number) {
  if (!pendingSprites.length) return true;
  const started = performance.now();
  for (;;) {
    const [kind, index] = pendingSprites[0];
    painting ??= cloudSpriteSteps(kind, index + 1);
    const step = painting.next();
    if (step.done) {
      sprites[kind][index] = step.value;
      painting = null;
      pendingSprites.shift();
      spritesFresh = true;
      if (!pendingSprites.length) break;
    }
    const elapsed = performance.now() - started;
    if (elapsed >= budget) {
      scopeSkyStats.spriteMs += elapsed;
      if (elapsed > scopeSkyStats.spriteMax) scopeSkyStats.spriteMax = elapsed;
      return false;
    }
  }
  scopeSkyStats.spriteMs += performance.now() - started;
  return true;
}
type Idle = (run: (deadline: { timeRemaining(): number }) => void) => void;
let warming = false;
/**
 * Paint the cloud shapes ahead of time, in the browser's idle moments (the
 * visitor has walked up to the telescope but not opened it yet). Safe to
 * call at any time, any number of times.
 */
export function warmScopeSky() {
  if (warming || !pendingSprites.length || typeof window === "undefined") return;
  warming = true;
  const idle: Idle =
    (window as unknown as { requestIdleCallback?: Idle }).requestIdleCallback ??
    ((run) => window.setTimeout(() => run({ timeRemaining: () => 3 }), 50));
  const step = (deadline: { timeRemaining(): number }) => {
    warming = false;
    if (!paintSprites(Math.max(1, Math.min(4, deadline.timeRemaining() - 1))))
      warmScopeSky();
  };
  idle(step);
}

export const scopeSkyStats = {
  draws: 0,
  drawMs: 0,
  drawMax: 0,
  tints: 0,
  tintMs: 0,
  spriteMs: 0,
  spriteMax: 0,
  visible: 0,
  ready: false,
  /** The last 256 draw times (ms), a ring: QA takes medians from it. */
  samples: new Float32Array(256),
  sampleCount: 0,
  /** QA: pin the drift clock (seconds into the day), or null. */
  freeze: null as number | null,
  reset() {
    this.draws = 0;
    this.drawMs = 0;
    this.drawMax = 0;
    this.tints = 0;
    this.tintMs = 0;
    this.sampleCount = 0;
  },
};
exposeQa({ scopeSky: scopeSkyStats });

function makeLayer(width: number, height: number): Layer {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext("2d")!, version: -1 };
}
function bufferFor(kind: SpriteKind, layer: Layer) {
  return (buffers[kind] ??= layer.context.createImageData(
    SPRITE_SIZE[kind][0],
    SPRITE_SIZE[kind][1],
  ));
}

export class ScopeSky {
  private readonly context: CanvasRenderingContext2D;
  private pixels = 0;
  private aim: ScopeAim = { azimuth: 180, altitude: 50, zoom: 1 };
  /** Unwrapped azimuth, so parallax never jumps at north. */
  private pan = 180;
  private hour = Number.NaN;
  private target = 12;
  private readonly light = createCloudLight();
  private readonly shade = createCloudShade();
  private lit = false;
  private dirty = true;
  private frameId = 0;
  private lastDraw = 0;
  private lastFrame = 0;
  private reduced = false;
  private ready = false;
  private readonly visible = new Uint8Array(field.length);
  private readonly glow = makeLayer(GLOW_SIZE, GLOW_SIZE);
  private readonly bloom = makeLayer(BLOOM_SIZE, BLOOM_SIZE);
  private readonly disc = makeLayer(DISC_SIZE, DISC_SIZE);
  private readonly rays = makeLayer(RAY_SIZE, RAY_SIZE);
  private readonly rayPixels: ImageData;
  private readonly veil = makeLayer(4, VEIL_ROWS);
  private body = "#000";
  private readonly glowPixels: ImageData;
  private readonly bloomPixels: ImageData;
  private readonly discPixels: ImageData;
  private readonly veilPixels: ImageData;
  private readonly p0: Projected = { x: 0, y: 0, forward: 0 };
  private readonly p1: Projected = { x: 0, y: 0, forward: 0 };
  private readonly p2: Projected = { x: 0, y: 0, forward: 0 };
  private readonly tick = (now: number) => this.frame(now);
  onReady: (() => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext("2d")!;
    this.glowPixels = this.glow.context.createImageData(GLOW_SIZE, GLOW_SIZE);
    this.bloomPixels = this.bloom.context.createImageData(BLOOM_SIZE, BLOOM_SIZE);
    this.discPixels = this.disc.context.createImageData(DISC_SIZE, DISC_SIZE);
    this.veilPixels = this.veil.context.createImageData(4, VEIL_ROWS);
    this.rayPixels = this.rays.context.createImageData(RAY_SIZE, RAY_SIZE);
    rayField ??= makeRayField(RAY_SIZE, 404);
    glowField ??= makeGlowField(GLOW_SIZE, 2.2, 91);
    bloomField ??= makeGlowField(BLOOM_SIZE, 3, 57);
  }

  /** Backing size in device pixels (the caller caps the pixel ratio). */
  resize(pixels: number) {
    const size = Math.max(64, Math.round(pixels));
    if (size === this.pixels) return;
    this.pixels = size;
    this.canvas.width = size;
    this.canvas.height = size;
    this.dirty = true;
  }
  setReducedMotion(reduced: boolean) {
    this.reduced = reduced;
    this.dirty = true;
  }
  /** The village hour to show; eased, so 4 Hz clock posts never step. */
  setHour(hour: number) {
    this.target = wrapHour(hour);
    if (Number.isNaN(this.hour) || this.reduced) this.hour = this.target;
  }
  /** Aim the layer and draw at once, in step with the star chart. */
  setAim(aim: ScopeAim) {
    const delta = ((aim.azimuth - this.aim.azimuth + 540) % 360) - 180;
    this.pan += delta;
    this.aim = aim;
    this.dirty = true;
    if (this.frameId) this.draw(performance.now());
  }
  start() {
    if (!this.frameId) this.frameId = requestAnimationFrame(this.tick);
  }
  stop() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private frame(now: number) {
    this.frameId = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (Number.isNaN(this.hour)) this.hour = this.target;
    const gap = wrapHour(this.target - this.hour + 12) - 12;
    if (Math.abs(gap) > 1e-4)
      this.hour = wrapHour(this.hour + gap * (1 - Math.exp(-dt / 0.18)));
    const moved = Math.abs(wrapHour(this.hour - this.light.hour + 12) - 12);
    if (!this.lit || moved > LIGHT_STEP) this.relight();
    // A slow frame can afford a bigger slice: the eyepiece fills in within
    // a dozen frames whatever the frame rate.
    const slow = Math.min(40, dt * 200);
    this.work(Math.max(pendingSprites.length ? 4 : 2.5, slow));
    if (
      this.dirty ||
      (!this.reduced && now - this.lastDraw >= DRIFT_INTERVAL)
    )
      this.draw(now);
  }

  private relight() {
    const light = sampleCloudLight(this.hour, this.light);
    version++;
    this.lit = true;
    this.dirty = true;
    // Horizon glow: gold core to a rose fringe.
    {
      const data = this.glowPixels.data;
      const f = glowField!;
      const [cr, cg, cb] = light.glowCore;
      const [er, eg, eb] = light.glowEdge;
      for (let i = 0, j = 0; i < f.length; i++, j += 4) {
        const v = f[i];
        const k = v * v;
        data[j] = (er + (cr - er) * k) * 255;
        data[j + 1] = (eg + (cg - eg) * k) * 255;
        data[j + 2] = (eb + (cb - eb) * k) * 255;
        data[j + 3] = v * 255;
      }
      this.glow.context.putImageData(this.glowPixels, 0, 0);
    }
    {
      const data = this.bloomPixels.data;
      const f = bloomField!;
      const [r, g, b] = light.bloom;
      for (let i = 0, j = 0; i < f.length; i++, j += 4) {
        const v = f[i];
        data[j] = (r + (1 - r) * v * v) * 255;
        data[j + 1] = (g + (1 - g) * v * v) * 255;
        data[j + 2] = (b + (1 - b) * v * v) * 255;
        data[j + 3] = v * 255;
      }
      this.bloom.context.putImageData(this.bloomPixels, 0, 0);
    }
    if (light.glowAlpha > 0.003) {
      const data = this.rayPixels.data;
      const f = rayField!;
      const [r, g, b] = light.glowCore;
      for (let i = 0, j = 0; i < f.length; i++, j += 4) {
        data[j] = r * 255;
        data[j + 1] = g * 255;
        data[j + 2] = b * 255;
        data[j + 3] = f[i] * 255;
      }
      this.rays.context.putImageData(this.rayPixels, 0, 0);
    }
    {
      const data = this.discPixels.data;
      const c = (DISC_SIZE - 1) / 2;
      const [r, g, b] = light.disc;
      for (let y = 0, j = 0; y < DISC_SIZE; y++)
        for (let x = 0; x < DISC_SIZE; x++, j += 4) {
          const d = Math.hypot(x - c, y - c) / c;
          const edge = d >= 1 ? 0 : d <= 0.7 ? 1 : 1 - (d - 0.7) / 0.3;
          // Hot at the heart: towards a pale yellow.
          const heart = Math.max(0, 1 - d * d) * 0.7;
          data[j] = (r + (1 - r) * heart) * 255;
          data[j + 1] = (g + (0.97 - g) * heart) * 255;
          data[j + 2] = (b + (0.8 - b) * heart) * 255;
          data[j + 3] = edge * edge * (3 - 2 * edge) * 255;
        }
      this.disc.context.putImageData(this.discPixels, 0, 0);
    }
    {
      // Haze between sea rows: the horizon colour, feathered at its top.
      const data = this.veilPixels.data;
      for (let y = 0, j = 0; y < VEIL_ROWS; y++) {
        const t = Math.min(1, y / (VEIL_ROWS * 0.3));
        for (let x = 0; x < 4; x++, j += 4) {
          data[j] = light.horizon[0] * 255;
          data[j + 1] = light.horizon[1] * 255;
          data[j + 2] = light.horizon[2] * 255;
          data[j + 3] = t * t * (3 - 2 * t) * 255;
        }
      }
      this.veil.context.putImageData(this.veilPixels, 0, 0);
      const body = shadeSea(light, this.shade).under;
      const byte = (c: number) => Math.round(Math.max(0, Math.min(1, c)) * 255);
      // As the strips' own solid base is painted (billow at its mid value).
      const k = 1 - this.shade.billow * 0.5;
      this.body = `rgb(${byte(body[0] * k)},${byte(body[1] * k)},${byte(body[2] * k)})`;
    }
  }

  /** Background work inside `budget` ms: shapes first, then stale paint
   * (what is in view first). */
  private work(budget: number) {
    const started = performance.now();
    if (!paintSprites(budget)) return;
    if (spritesFresh) {
      spritesFresh = false;
      this.dirty = true;
    }
    for (let i = 0; i < seaPainted.length; i++)
      if ((seaPainted[i]?.version ?? -1) !== version) {
        if (this.paintSea(i)) this.dirty = true;
        if (performance.now() - started >= budget) return;
      }
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < field.length; i++) {
        if ((pass === 0) !== (this.visible[i] === 1)) continue;
        if ((painted[i]?.version ?? -1) === version) continue;
        if (this.paint(i) && pass === 0) this.dirty = true;
        if (performance.now() - started >= budget) return;
      }
  }

  private paint(index: number) {
    const cloud = field[index];
    const sprite = sprites[cloud.kind][cloud.variant];
    if (!sprite) return false;
    const started = performance.now();
    const layer = (painted[index] ??= makeLayer(sprite.width, sprite.height));
    const light = this.light;
    // Distance to the sun along the sky, and which side it stands on.
    const dAz = (light.sunAzimuth - cloud.azimuth - cloudDrift(cloud.layer, this.seconds())) * RAD;
    const a1 = cloud.altitude * RAD,
      a2 = light.sunAltitude * RAD;
    const cos = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
    const distance = Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
    const side = Math.max(-1, Math.min(1, Math.sin(dAz) * 3)) * (cloud.flip ? -1 : 1);
    const buffer = bufferFor(cloud.kind, layer);
    tintSprite(sprite, shadeCloud(light, cloud.lift, distance, this.shade), side, buffer.data);
    layer.context.putImageData(buffer, 0, 0);
    layer.version = version;
    scopeSkyStats.tints++;
    scopeSkyStats.tintMs += performance.now() - started;
    return true;
  }
  private paintSea(index: number) {
    const sprite = sprites.sea[index];
    if (!sprite) return false;
    const started = performance.now();
    const layer = (seaPainted[index] ??= makeLayer(sprite.width, sprite.height));
    const buffer = bufferFor("sea", layer);
    const dAz = (this.light.sunAzimuth - this.aim.azimuth) * RAD;
    const side = Math.max(-1, Math.min(1, Math.sin(dAz) * 3));
    tintSprite(sprite, shadeSea(this.light, this.shade), side, buffer.data);
    layer.context.putImageData(buffer, 0, 0);
    layer.version = version;
    scopeSkyStats.tints++;
    scopeSkyStats.tintMs += performance.now() - started;
    return true;
  }

  private seconds() {
    if (scopeSkyStats.freeze !== null) return scopeSkyStats.freeze;
    return this.reduced ? 0 : (Date.now() / 1000) % 86400;
  }

  /** Place a `width` x `height` degree sprite at a sky position: the local
   * linear map of the gnomonic projection there. False when out of view. */
  private place(
    azimuth: number,
    altitude: number,
    width: number,
    height: number,
    pixelsWide: number,
    pixelsHigh: number,
    flip: boolean,
  ) {
    const aim = this.aim;
    const p = projectSky(azimuth, altitude, aim, this.p0);
    if (p.forward < 0.2) return false;
    // Rigid: turned to the local horizontal, at the eyepiece's central
    // scale, so the gnomonic stretch near the rim never smears a cloud.
    const l = projectSky(azimuth - 0.5, altitude, aim, this.p1);
    const r = projectSky(azimuth + 0.5, altitude, aim, this.p2);
    // ...and, aimed low, only part of the way: a cloud's flat base stays
    // near level. Aimed high the sky wheels round the zenith, bases out.
    const length = Math.hypot(r.x - l.x, r.y - l.y) || 1;
    const level = Math.cos(aim.altitude * RAD);
    let dx = (r.x - l.x) / length + 2 * level * level,
      dy = (r.y - l.y) / length;
    const norm = Math.hypot(dx, dy);
    if (norm < 0.2) return false;
    dx /= norm;
    dy /= norm;
    const perDegree = scopeScale(aim.zoom) * RAD;
    const reach = 0.5 * (width + height) * perDegree;
    if (Math.abs(p.x) - reach > HALF || Math.abs(p.y) - reach > HALF) return false;
    const s = this.pixels / VIEW;
    const sx = (((flip ? -width : width) * perDegree) / pixelsWide) * s,
      sy = ((height * perDegree) / pixelsHigh) * s;
    this.context.setTransform(
      dx * sx,
      dy * sx,
      -dy * sy,
      dx * sy,
      p.x * s + this.pixels / 2,
      p.y * s + this.pixels / 2,
    );
    return true;
  }

  private draw(now: number) {
    const started = performance.now();
    const g = this.context;
    const size = this.pixels;
    if (!size) return;
    this.dirty = false;
    this.lastDraw = now;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.clearRect(0, 0, size, size);
    if (!this.lit) return;
    const light = this.light;
    const aim = this.aim;
    const seconds = this.seconds();

    // Glow on the horizon under the sun, the bloom, then the disc.
    if (light.glowAlpha > 0.003) {
      const altitude = Math.max(-2, Math.min(4, light.sunAltitude * 0.5));
      if (this.place(light.sunAzimuth, altitude, 150, 46, GLOW_SIZE, GLOW_SIZE, false)) {
        g.globalAlpha = light.glowAlpha * fade(this.p0.forward);
        g.drawImage(this.glow.canvas, -GLOW_SIZE / 2, -GLOW_SIZE / 2);
      }
    }
    if (light.glowAlpha > 0.003 && light.sunAltitude < 14) {
      // Crepuscular rays fanning up from the low sun.
      if (this.place(light.sunAzimuth, light.sunAltitude, 96, 96, RAY_SIZE, RAY_SIZE, false)) {
        g.globalAlpha =
          light.glowAlpha * 0.5 * Math.min(1, (14 - light.sunAltitude) / 6) * fade(this.p0.forward);
        g.drawImage(this.rays.canvas, -RAY_SIZE / 2, -RAY_SIZE / 2);
      }
    }
    if (light.bloomAlpha > 0.003) {
      // A wide soft bloom and a tight hot one round the disc.
      const wide = 34 + 18 * light.warmth;
      if (this.place(light.sunAzimuth, light.sunAltitude, wide, wide, BLOOM_SIZE, BLOOM_SIZE, false)) {
        const alpha = light.bloomAlpha * fade(this.p0.forward);
        g.globalAlpha = alpha * 0.7;
        g.drawImage(this.bloom.canvas, -BLOOM_SIZE / 2, -BLOOM_SIZE / 2);
        if (this.place(light.sunAzimuth, light.sunAltitude, 13, 13, BLOOM_SIZE, BLOOM_SIZE, false)) {
          g.globalAlpha = alpha;
          g.drawImage(this.bloom.canvas, -BLOOM_SIZE / 2, -BLOOM_SIZE / 2);
        }
      }
    }
    if (light.glowAlpha > 0.003) {
      // The hot streak of light along the horizon at the sun's foot.
      if (this.place(light.sunAzimuth, Math.max(0.4, Math.min(3, light.sunAltitude)), 46, 9, BLOOM_SIZE, BLOOM_SIZE, false)) {
        g.globalAlpha = light.glowAlpha * 0.85 * fade(this.p0.forward);
        g.drawImage(this.bloom.canvas, -BLOOM_SIZE / 2, -BLOOM_SIZE / 2);
      }
    }
    if (light.discAlpha > 0.003) {
      const squash = 0.88 + 0.12 * Math.max(0, Math.min(1, light.sunAltitude / 8));
      const wide = 4.4 + 1.6 * light.warmth;
      if (this.place(light.sunAzimuth, light.sunAltitude, wide, wide * squash, DISC_SIZE, DISC_SIZE, false)) {
        g.globalAlpha = light.discAlpha * fade(this.p0.forward);
        g.drawImage(this.disc.canvas, -DISC_SIZE / 2, -DISC_SIZE / 2);
      }
    }

    let shown = 0;
    let repaint = 3;
    for (let layer = 0; layer < 3; layer++) {
      if (layer === 1) this.drawSea(seconds);
      const { parallax } = CLOUD_LAYERS[layer];
      const drift = cloudDrift(layer, seconds);
      const slide = (parallax - 1) * (this.pan - 180);
      const rise = (parallax - 1) * (aim.altitude - 50);
      for (let i = 0; i < field.length; i++) {
        const cloud = field[i];
        if (cloud.layer !== layer) continue;
        const alpha = cloudPresence(cloud, light);
        const sprite = sprites[cloud.kind][cloud.variant];
        if (
          alpha < 0.004 ||
          !sprite ||
          !this.place(
            cloud.azimuth + drift - slide,
            Math.max(1, cloud.altitude - rise),
            cloud.width,
            cloud.height,
            sprite.width,
            sprite.height,
            cloud.flip,
          )
        ) {
          this.visible[i] = 0;
          continue;
        }
        this.visible[i] = 1;
        let layerCanvas = painted[i];
        if (!layerCanvas || (layerCanvas.version !== version && repaint > 0)) {
          if (this.paint(i)) repaint--;
          layerCanvas = painted[i];
        }
        if (!layerCanvas || layerCanvas.version < 0) continue;
        shown++;
        g.globalAlpha = alpha * fade(this.p0.forward);
        g.drawImage(layerCanvas.canvas, -sprite.width / 2, -sprite.height / 2);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    if (!this.ready && !pendingSprites.length && !spritesFresh) {
      this.ready = true;
      scopeSkyStats.ready = true;
      this.onReady?.();
    }
    const elapsed = performance.now() - started;
    scopeSkyStats.visible = shown;
    scopeSkyStats.samples[scopeSkyStats.sampleCount++ % 256] = elapsed;
    scopeSkyStats.draws++;
    scopeSkyStats.drawMs += elapsed;
    if (elapsed > scopeSkyStats.drawMax) scopeSkyStats.drawMax = elapsed;
  }

  /** The cloud sea under the horizon line, which the gnomonic eyepiece
   * keeps straight: rows of tops far to near, hazed by distance. */
  private drawSea(seconds: number) {
    const g = this.context;
    const aim = this.aim;
    const light = this.light;
    const s = this.pixels / VIEW;
    const half = this.pixels / 2;
    const scale = scopeScale(aim.zoom);
    if (aim.altitude - SEA_ROWS[0].altitude >= 85) return;
    if (scale * Math.tan((aim.altitude - SEA_ROWS[0].altitude - 3) * RAD) > HALF) return;
    // Eyepiece units per degree along the horizon.
    const perDegree = (scale * RAD) / Math.cos(aim.altitude * RAD);
    const [pixelsWide, pixelsHigh] = SPRITE_SIZE.sea;
    const turn = (SEA_TURNS * (seconds % 86400)) / 86400;
    g.fillStyle = this.body;
    for (let i = 0; i < SEA_ROWS.length; i++) {
      const row = SEA_ROWS[i];
      const layer = seaPainted[row.sprite];
      const below = aim.altitude - row.altitude;
      if (!layer || layer.version < 0 || below >= 85) break;
      const line = scale * Math.tan(below * RAD);
      const period = SEA_SPAN * row.scale;
      const span = period * perDegree;
      const high = (pixelsHigh * span) / pixelsWide;
      const top = line - high * 0.55;
      if (top > HALF) break;
      g.setTransform(s, 0, 0, s, half, half);
      g.globalAlpha = 1;
      const cycles = (this.pan * (1 + 0.03 * i) + row.offset) / period - turn;
      let x = -(cycles - Math.floor(cycles)) * span;
      while (x > -HALF) x -= span;
      for (; x < HALF; x += span) g.drawImage(layer.canvas, x, top, span + 0.6, high);
      const under = top + high - 0.5;
      if (under < HALF) g.fillRect(-HALF, under, VIEW, HALF - under);
      if (row.veil > 0) {
        const from = line - high * 0.12;
        if (from < HALF) {
          g.globalAlpha = row.veil;
          g.drawImage(this.veil.canvas, -HALF, from, VIEW, Math.max(HALF - from, high));
        }
      }
      // Low sun spilling over the far tops.
      if (i === 3 && light.glowAlpha > 0.003) {
        if (this.place(light.sunAzimuth, -2.5, 110, 22, GLOW_SIZE, GLOW_SIZE, false)) {
          g.globalAlpha = light.glowAlpha * 0.45 * fade(this.p0.forward);
          g.drawImage(this.glow.canvas, -GLOW_SIZE / 2, -GLOW_SIZE / 2);
        }
      }
    }
  }
}
