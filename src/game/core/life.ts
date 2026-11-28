/**
 * World life (PLAN_GAMES §4.3/§4.4, cut down): ground flocks of songbirds
 * that notice the player, butterflies that flee them, and the shared slots
 * the sprite layer reads (feather bursts, carry beacons). Pure: no three.js,
 * no React. State lives in preallocated typed arrays; `stepFlocks` allocates
 * nothing, so it can run every frame.
 *
 * Flock states: feeding (peck and hop) → alert (heads up, frozen) when the
 * player is within ALERT_RADIUS → flying (fan out away from the player and
 * climb) when within SCATTER_RADIUS, or when the player runs within
 * RUN_RADIUS → circling overhead → landing at a feeding spot at least
 * RETURN_CLEARANCE from the player → feeding.
 */
import type { WorldId } from "./worlds";

export type LifeTier = "high" | "medium" | "low";

export const ALERT_RADIUS = 6;
export const SCATTER_RADIUS = 3.2;
export const RUN_RADIUS = 5;
export const RUN_SPEED = 3;
/** Away-heading fan when scattering (radians either side). */
export const SCATTER_FAN = (50 * Math.PI) / 180;
export const CLIMB_SPEED = 4.5;
export const CIRCLE_HEIGHT = 6.5;
export const RETURN_CLEARANCE = 12;
/** Seconds a scattered flock circles before it tries to come back. */
export const CIRCLE_MIN = 14;
export const CIRCLE_MAX = 22;
/** Birds feed within this radius of their spot. */
export const SPOT_RADIUS = 1.8;

export const FEEDING = 0,
  ALERT = 1,
  FLYING = 2,
  CIRCLING = 3,
  LANDING = 4;
export const FLOCK_STATE_NAMES = ["feeding", "alert", "flying", "circling", "landing"] as const;

/** Two feeding spots per world: open walkable ground (canWalk with clearance,
 * checked in tests/life.test.ts), away from doors. */
export const FLOCK_SPOTS: Readonly<Record<WorldId, readonly (readonly [number, number])[]>> = {
  home: [
    [7, -4],
    [-3, -11],
  ],
  korea: [
    [-8, 48],
    [-21, 33],
  ],
  stanford: [
    [-27, 33],
    [0, 49],
  ],
};

/** Birds per flock, sprites per kind. Low keeps a token flock and no
 * butterflies (bursts and beacons stay: they carry meaning). */
export const LIFE_COUNTS: Readonly<Record<LifeTier, { birds: number; butterflies: number; feathers: number }>> = {
  high: { birds: 7, butterflies: 36, feathers: 12 },
  medium: { birds: 4, butterflies: 18, feathers: 8 },
  low: { birds: 2, butterflies: 0, feathers: 6 },
};

export type Flocks = {
  world: WorldId;
  flocks: number;
  perFlock: number;
  /** Per flock. */
  state: Uint8Array;
  timer: Float32Array;
  spot: Uint8Array;
  /** Circle centre while airborne. */
  cx: Float32Array;
  cz: Float32Array;
  /** Per bird. */
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  heading: Float32Array;
  /** Hop/flight target. */
  tx: Float32Array;
  tz: Float32Array;
  /** Seconds to the next hop (feeding) or the bird's phase (airborne). */
  wait: Float32Array;
  /** 0..1 progress of the current hop; 1 when standing. */
  hop: Float32Array;
  hx: Float32Array;
  hz: Float32Array;
  /** Seeded LCG state (no Math.random: deterministic and testable). */
  seed: Uint32Array;
  /** Scatter events since the view last read them (flock index + 1 each). */
  scattered: number;
  /** Where the last scatter happened. */
  lastX: number;
  lastZ: number;
};

function rand(f: Flocks) {
  f.seed[0] = (Math.imul(f.seed[0], 1664525) + 1013904223) >>> 0;
  return f.seed[0] / 4294967296;
}

export function createFlocks(world: WorldId, perFlock: number, seed = 7): Flocks {
  const spots = FLOCK_SPOTS[world],
    flocks = spots.length,
    n = flocks * perFlock;
  const f: Flocks = {
    world,
    flocks,
    perFlock,
    state: new Uint8Array(flocks),
    timer: new Float32Array(flocks),
    spot: new Uint8Array(flocks),
    cx: new Float32Array(flocks),
    cz: new Float32Array(flocks),
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    heading: new Float32Array(n),
    tx: new Float32Array(n),
    tz: new Float32Array(n),
    wait: new Float32Array(n),
    hop: new Float32Array(n).fill(1),
    hx: new Float32Array(n),
    hz: new Float32Array(n),
    seed: new Uint32Array([seed >>> 0 || 1]),
    scattered: 0,
    lastX: 0,
    lastZ: 0,
  };
  for (let k = 0; k < flocks; k++) {
    f.spot[k] = k;
    for (let j = 0; j < perFlock; j++) {
      const i = k * perFlock + j,
        a = rand(f) * Math.PI * 2,
        r = Math.sqrt(rand(f)) * SPOT_RADIUS;
      f.x[i] = f.hx[i] = f.tx[i] = spots[k][0] + Math.cos(a) * r;
      f.z[i] = f.hz[i] = f.tz[i] = spots[k][1] + Math.sin(a) * r;
      f.heading[i] = rand(f) * Math.PI * 2;
      f.wait[i] = 0.5 + rand(f) * 2.5;
    }
  }
  return f;
}

/** Centre of a flock's birds (no allocation: writes into `out`). */
export function flockCentre(f: Flocks, k: number, out: { x: number; z: number }) {
  let x = 0,
    z = 0;
  for (let j = 0; j < f.perFlock; j++) {
    x += f.x[k * f.perFlock + j];
    z += f.z[k * f.perFlock + j];
  }
  out.x = x / f.perFlock;
  out.z = z / f.perFlock;
  return out;
}

const centre = { x: 0, z: 0 };

function scatter(f: Flocks, k: number, px: number, pz: number) {
  flockCentre(f, k, centre);
  const away = Math.atan2(centre.x - px, centre.z - pz);
  f.state[k] = FLYING;
  f.timer[k] = CIRCLE_MIN + rand(f) * (CIRCLE_MAX - CIRCLE_MIN);
  f.cx[k] = centre.x + Math.sin(away) * 9;
  f.cz[k] = centre.z + Math.cos(away) * 9;
  for (let j = 0; j < f.perFlock; j++) {
    const i = k * f.perFlock + j;
    // Headings fan within ±SCATTER_FAN of "away".
    f.heading[i] = away + (rand(f) * 2 - 1) * SCATTER_FAN;
    f.wait[i] = rand(f) * Math.PI * 2;
    f.hop[i] = 1;
  }
  f.scattered++;
  f.lastX = centre.x;
  f.lastZ = centre.z;
}

/** The feeding spot to land on: the flock's own spot when the player is far
 * enough from it, else any other that is, else -1 (keep circling). */
export function returnSpot(world: WorldId, own: number, px: number, pz: number) {
  const spots = FLOCK_SPOTS[world];
  const ok = (s: number) => Math.hypot(spots[s][0] - px, spots[s][1] - pz) >= RETURN_CLEARANCE;
  if (ok(own)) return own;
  for (let s = 0; s < spots.length; s++) if (s !== own && ok(s)) return s;
  return -1;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Advances every flock by `dt` seconds. `speed` is the player's ground speed.
 * Writes positions in place; returns nothing and allocates nothing.
 */
export function stepFlocks(f: Flocks, dt: number, px: number, pz: number, speed: number) {
  if (dt <= 0) return;
  const spots = FLOCK_SPOTS[f.world];
  for (let k = 0; k < f.flocks; k++) {
    const state = f.state[k];
    if (state === FEEDING || state === ALERT) {
      flockCentre(f, k, centre);
      const d = Math.hypot(centre.x - px, centre.z - pz);
      if (d < SCATTER_RADIUS || (d < RUN_RADIUS && speed > RUN_SPEED)) {
        scatter(f, k, px, pz);
        continue;
      }
      f.state[k] = d < ALERT_RADIUS ? ALERT : FEEDING;
    } else if (state === CIRCLING) {
      f.timer[k] -= dt;
      if (f.timer[k] <= 0) {
        const s = returnSpot(f.world, f.spot[k], px, pz);
        if (s < 0) f.timer[k] = 3;
        else {
          f.spot[k] = s;
          f.state[k] = LANDING;
          for (let j = 0; j < f.perFlock; j++) {
            const i = k * f.perFlock + j,
              a = rand(f) * Math.PI * 2,
              r = Math.sqrt(rand(f)) * SPOT_RADIUS;
            f.tx[i] = spots[s][0] + Math.cos(a) * r;
            f.tz[i] = spots[s][1] + Math.sin(a) * r;
          }
        }
      }
    }
    let landed = 0;
    for (let j = 0; j < f.perFlock; j++) {
      const i = k * f.perFlock + j,
        st = f.state[k];
      if (st === FEEDING || st === ALERT) {
        if (f.hop[i] < 1) {
          f.hop[i] = Math.min(1, f.hop[i] + dt / 0.22);
          f.x[i] = f.hx[i] + (f.tx[i] - f.hx[i]) * f.hop[i];
          f.z[i] = f.hz[i] + (f.tz[i] - f.hz[i]) * f.hop[i];
          f.y[i] = Math.sin(f.hop[i] * Math.PI) * 0.12;
        } else if (st === FEEDING) {
          f.wait[i] -= dt;
          if (f.wait[i] <= 0) {
            // Hop 0.2–0.5 in a random direction, staying near the spot.
            const a = rand(f) * Math.PI * 2,
              step = 0.2 + rand(f) * 0.3,
              sx = spots[f.spot[k]][0],
              sz = spots[f.spot[k]][1];
            let nx = f.x[i] + Math.sin(a) * step,
              nz = f.z[i] + Math.cos(a) * step;
            if (Math.hypot(nx - sx, nz - sz) > SPOT_RADIUS) {
              nx = f.x[i] + (sx - f.x[i]) * 0.25;
              nz = f.z[i] + (sz - f.z[i]) * 0.25;
            }
            f.hx[i] = f.x[i];
            f.hz[i] = f.z[i];
            f.tx[i] = nx;
            f.tz[i] = nz;
            f.heading[i] = Math.atan2(nx - f.x[i], nz - f.z[i]);
            f.hop[i] = 0;
            f.wait[i] = 1 + rand(f) * 2;
          }
          f.y[i] = 0;
        } else {
          // Alert: turn to watch the player.
          f.heading[i] += wrap(Math.atan2(px - f.x[i], pz - f.z[i]) - f.heading[i]) * Math.min(1, dt * 6);
          f.y[i] = 0;
        }
      } else if (st === FLYING || st === CIRCLING) {
        if (st === FLYING) {
          f.x[i] += Math.sin(f.heading[i]) * 5 * dt;
          f.z[i] += Math.cos(f.heading[i]) * 5 * dt;
          f.y[i] = Math.min(CIRCLE_HEIGHT, f.y[i] + CLIMB_SPEED * dt);
          if (f.y[i] >= CIRCLE_HEIGHT) landed++;
        } else {
          // Circle the centre, each bird on its own phase and radius.
          f.wait[i] += dt * 0.9;
          const r = 3 + (j % 3),
            ax = f.cx[k] + Math.cos(f.wait[i]) * r,
            az = f.cz[k] + Math.sin(f.wait[i]) * r;
          const want = Math.atan2(ax - f.x[i], az - f.z[i]);
          f.heading[i] += wrap(want - f.heading[i]) * Math.min(1, dt * 3);
          f.x[i] += Math.sin(f.heading[i]) * 4.5 * dt;
          f.z[i] += Math.cos(f.heading[i]) * 4.5 * dt;
          f.y[i] += (CIRCLE_HEIGHT + Math.sin(f.wait[i] * 1.7 + j) * 0.6 - f.y[i]) * Math.min(1, dt * 2);
        }
      } else {
        // Landing: glide to the target, descending.
        const dx = f.tx[i] - f.x[i],
          dz = f.tz[i] - f.z[i],
          d = Math.hypot(dx, dz);
        if (d < 0.15 && f.y[i] < 0.05) {
          f.x[i] = f.tx[i];
          f.z[i] = f.tz[i];
          f.y[i] = 0;
          landed++;
          continue;
        }
        const v = Math.min(d, 5 * dt);
        if (d > 1e-4) {
          f.x[i] += (dx / d) * v;
          f.z[i] += (dz / d) * v;
          f.heading[i] = Math.atan2(dx, dz);
        }
        f.y[i] = Math.max(0, Math.min(f.y[i] - 2.5 * dt, d * 0.6));
      }
    }
    if (f.state[k] === FLYING && landed === f.perFlock) f.state[k] = CIRCLING;
    else if (f.state[k] === LANDING && landed === f.perFlock) {
      f.state[k] = FEEDING;
      for (let j = 0; j < f.perFlock; j++) {
        const i = k * f.perFlock + j;
        f.hop[i] = 1;
        f.wait[i] = 0.5 + rand(f) * 2;
      }
    }
  }
}

/** Butterfly origins for a world: around the feeding spots and the given
 * extra places (gardens, lawns), seeded. `walk` rejects points inside
 * buildings. Returns [x, y, z] triples. */
export function butterflyOrigins(
  world: WorldId,
  count: number,
  extra: readonly (readonly [number, number])[],
  walk: (x: number, z: number) => boolean,
  seed = 11,
): Float32Array {
  const out = new Float32Array(count * 3);
  const anchors = [...FLOCK_SPOTS[world], ...extra];
  let s = seed >>> 0 || 1;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 40; tries++) {
    const a = anchors[n % anchors.length],
      ang = r() * Math.PI * 2,
      rad = 1.5 + r() * 5;
    const x = a[0] + Math.cos(ang) * rad,
      z = a[1] + Math.sin(ang) * rad;
    if (!walk(x, z)) continue;
    out[n * 3] = x;
    out[n * 3 + 1] = 0.5 + r() * 0.8;
    out[n * 3 + 2] = z;
    n++;
  }
  return out.subarray(0, n * 3);
}

/** Shared slots between game logic and the sprite layer (one per page). */
export const BURST_SLOTS = 2;
export const BEACON_SLOTS = 4;
export const lifeSignals = {
  /** Per burst slot: x, y, z, start time (life clock seconds; -1e3 = idle). */
  bursts: new Float32Array(BURST_SLOTS * 4).fill(-1e3),
  nextBurst: 0,
  /** Per beacon slot: x, y, z, on (0/1). */
  beacons: new Float32Array(BEACON_SLOTS * 4),
  /** The sprite layer's clock (seconds), advanced by the layer itself. */
  clock: 0,
};

/** Starts a feather burst at a point (round-robin over the slots). */
export function startBurst(x: number, y: number, z: number) {
  const k = lifeSignals.nextBurst;
  lifeSignals.nextBurst = (k + 1) % BURST_SLOTS;
  lifeSignals.bursts[k * 4] = x;
  lifeSignals.bursts[k * 4 + 1] = y;
  lifeSignals.bursts[k * 4 + 2] = z;
  lifeSignals.bursts[k * 4 + 3] = lifeSignals.clock;
}

/** Sets the carry beacons (at most BEACON_SLOTS; the rest switch off). */
export function setBeacons(points: readonly (readonly [number, number])[]) {
  const b = lifeSignals.beacons;
  for (let k = 0; k < BEACON_SLOTS; k++) {
    const p = points[k];
    b[k * 4] = p ? p[0] : 0;
    b[k * 4 + 1] = 0;
    b[k * 4 + 2] = p ? p[1] : 0;
    b[k * 4 + 3] = p ? 1 : 0;
  }
}
export const beaconsOn = () => {
  const out: [number, number][] = [];
  for (let k = 0; k < BEACON_SLOTS; k++)
    if (lifeSignals.beacons[k * 4 + 3] > 0) out.push([lifeSignals.beacons[k * 4], lifeSignals.beacons[k * 4 + 2]]);
  return out;
};
