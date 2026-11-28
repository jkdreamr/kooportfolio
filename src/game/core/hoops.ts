/**
 * Blacktop (PLAN_GAMES §2.1): the court rules, pure and seeded. One mutable
 * state object stepped at 60 Hz (`stepHoops`), so the scene, the QA hooks and
 * the tuning bots all run the very same game. Nothing here allocates per step
 * except the (rare) event records the scene drains.
 *
 * Coordinates: the court floor is (x, z), the hoop is at (0, −5), `d` is the
 * horizontal distance to it. The ball's 3D flight is scripted here (an arc to
 * the rim whose outcome is decided at release); the old free-physics module
 * (`basketball.ts`) stays for the shot-arc helpers and its own tests.
 */
import { RIVALS, rivalStep, newBrain, type RivalBrain, type RivalId } from "./hoopsRival";

export const HOOP_X = 0;
export const HOOP_Z = -5;
export const RIM_Y = 3.05;
export const COURT_BOUNDS = { minX: -6, maxX: 6, minZ: -5.6, maxZ: 7.7 } as const;
export const ZONE = { paint: 3.2, three: 6.5, logo: 9.5 } as const;

export const RUN = 4.8;
export const ACCEL = 30;
export const GATHER_SPEED = 2.2;
export const JUKE = { dist: 1.7, time: 0.22, cooldown: 0.9, bite: 1.8, root: 0.7 } as const;
export const DRIVE = { speed: 6.5, time: 0.5 } as const;
/** A drive this close to the rim dunks on its own. */
export const DUNK_REACH = 2.4;
export const STEAL = { window: 0.25, range: 1.2, miss: 0.45 } as const;
export const SHOT_CLOCK = 12;
export const GAME_TO = 15;
export const JUMP_AIR = 0.55;
export const BLOCK_WINDOW = 0.12;
export const PURE = 0.015;
/** How much the player's contest takes off a rival's make chance (plan: 0.45; the bots judge). */
export const RIVAL_CONTEST = 0.28;
export const CHECK_PAUSE = 1.9;
/** Seconds a made basket stays dead before the check. */
export const DEAD_BALL = 1.5;
/** Seconds after a shot resolves before a new ball is in hand (solo modes). */
export const RESPAWN = 0.45;
export const HOT_SECONDS = 60;
export const CHECK_SPOT = { x: 0, z: 2.0 } as const;

export type ShotType = "dunk" | "layup" | "jumper" | "three";
export type HoopsMode = "1v1" | "hot" | "shoot";

export const METER = {
  layup: { fill: 0.55, centre: 0.6 },
  jumper: { fill: 0.8, centre: 0.62 },
  three: { fill: 0.8, centre: 0.62 },
  dunk: { fill: 1, centre: 0 },
} as const;

export const dist = (x: number, z: number) => Math.hypot(x - HOOP_X, z - HOOP_Z);

/** Which shot one button makes, from where you are and how you move. */
export function shotType(d: number, speedToward: number, speed: number): ShotType {
  if (d <= 2.4 && speedToward >= 3.5) return "dunk";
  if (d <= 3.4 && speed >= 2) return "layup";
  if (d <= 1.8) return "layup"; // a putback under the rim
  return d >= ZONE.three ? "three" : "jumper";
}

export type GreenMods = { moving?: boolean; contest?: number; fire?: boolean; fade?: boolean };
/** Smoothstep 0..1 of `x` between `a` and `b`. */
const smooth = (a: number, b: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
/** Half-width of the green release window (charge units). Close shots get a
 *  much wider window, and every window narrows smoothly with distance. */
export function greenHalfWidth(type: ShotType, d: number, m: GreenMods = {}): number {
  let w =
    type === "layup"
      ? 0.2 - 0.08 * smooth(1, 3.4, d)
      : type === "three"
        ? 0.038 - 0.008 * smooth(ZONE.three, ZONE.logo, d)
        : 0.075 - 0.028 * smooth(ZONE.paint, ZONE.three, d);
  if (m.fade && type !== "layup") w *= 0.8;
  if (m.moving) w *= 0.85;
  if (m.contest) w *= 1 - 0.5 * Math.max(0, Math.min(1, m.contest));
  if (m.fire) w *= 1.25;
  return w;
}

/** Contest of a shot from the defender's gap: 1 in his face, 0 from 2.5 u. */
export function contest(gap: number, inAir: boolean, fade: boolean): number {
  let c = Math.max(0, Math.min(1, 1 - (gap - 0.9) / 1.6));
  if (!inAir) c *= 0.6;
  if (fade) c *= 0.4;
  return c;
}

/** The player's make chance for a jumper, three or layup released `err` off
 *  the centre of a green half-width `w`, contest `c`, from distance `d`. Both
 *  the green ceiling and the off-green base fall smoothly from the rim out
 *  (no cliff at the paint or the arc); a hand in the face costs most at
 *  the rim. */
export function makeChance(type: ShotType, err: number, w: number, c: number, d = type === "layup" ? 2 : type === "three" ? 7 : 5): number {
  const k = smooth(0.8, ZONE.three, d),
    far = smooth(ZONE.three, ZONE.logo + 1, d);
  const top = 0.98 - 0.1 * k - 0.06 * far;
  // At the rim a hand in the face matters more (the easy look is the open one).
  const hand = 0.55 + 0.25 * (1 - k);
  if (err <= w) return Math.max(0, top - hand * c);
  const base = 0.8 - 0.32 * k - 0.08 * far,
    slope = 2.5 + 3.5 * k;
  return Math.max(0, base - slope * (err - w)) * (1 - (0.6 + 0.2 * (1 - k)) * c);
}

/** What one press of Shoot would be right now, for the HUD (no allocation). */
export type ShotPreview = { type: ShotType; chance: number; contest: number; value: number; on: boolean };
export const freshPreview = (): ShotPreview => ({ type: "jumper", chance: 0, contest: 0, value: 2, on: false });
/** Typical human release error in seconds (the odds the HUD shows assume it). */
export const HUMAN_ERR = 0.05;
export function previewShot(g: Hoops, out: ShotPreview): ShotPreview {
  const a = g.p,
    b = g.ball;
  out.on = b.phase === "held" && b.holder === 0 && !(g.takeBack && dist(a.x, a.z) < ZONE.three);
  if (!out.on) return out;
  const d = dist(a.x, a.z),
    hx = (HOOP_X - a.x) / (d || 1),
    hz = (HOOP_Z - a.z) / (d || 1);
  const speed = Math.hypot(a.vx, a.vz),
    toward = a.vx * hx + a.vz * hz;
  const type: ShotType =
    a.gatherAt >= 0 ? a.gatherType : g.t < a.driveUntil && d <= ZONE.paint ? "dunk" : shotType(d, toward, speed);
  const def = g.r;
  const gap = solo(g) ? 99 : Math.hypot(def.x - a.x, def.z - a.z) - (RIVALS[g.rival].reach - 1.2);
  // He times his jump to the green, so assume a hand up.
  const c = solo(g) ? 0 : contest(gap, true, false);
  let chance = 1;
  if (type !== "dunk") {
    const w = greenHalfWidth(type, d, { moving: speed > 1, contest: c, fire: g.fire });
    const E = HUMAN_ERR / METER[type].fill;
    chance = 0;
    for (let i = 0; i < 8; i++) {
      const err = ((i + 0.5) / 8) * E;
      chance += err <= PURE * (1 - 0.5 * c) && type !== "layup" ? 1 : makeChance(type, err, w, c, d);
    }
    chance /= 8;
  }
  // A block risk the HUD should not hide.
  if (!solo(g) && contest(gap, true, false) >= 0.85) chance *= 1 - RIVALS[g.rival].block * (type === "dunk" ? 0.5 : 1);
  out.type = type;
  out.chance = chance;
  out.contest = c;
  out.value = (d >= ZONE.three ? 3 : 2) + (g.fire ? 1 : 0) + (d >= ZONE.logo ? 1 : 0);
  return out;
}

export type Actor = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Facing (unit), for poses. */
  fx: number;
  fz: number;
  jumpAt: number;
  rootedUntil: number;
  frozenUntil: number;
  cdUntil: number;
  dashUntil: number;
  dashVx: number;
  dashVz: number;
  /** Game time the shot gather began; −1 when not gathering. */
  gatherAt: number;
  gatherType: ShotType;
  gatherFade: boolean;
  /** Rival crossover: the ball is exposed until then. */
  exposedUntil: number;
  /** Last juke / drive start (poses). */
  dashAt: number;
  /** A bully drive until then: the defender gives ground instead. */
  bully: number;
  /** A drive at the rim until then (the player's drive into the paint dunks). */
  driveUntil: number;
};

export type BallPhase = "held" | "flight" | "loose" | "dead";
export type Ball = {
  phase: BallPhase;
  holder: 0 | 1;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Flight: time since release, total time to the rim, start and target. */
  t: number;
  T: number;
  x0: number;
  y0: number;
  z0: number;
  tx: number;
  tz: number;
  made: boolean;
  shooter: 0 | 1;
  kind: ShotType;
  value: number;
  label: string;
  pure: boolean;
  slam: boolean;
  /** Release time and whether a late block may still land. */
  tr: number;
  blockOpen: boolean;
  /** Offence after this ball resolves came from a rebound off the rim. */
  rimmed: boolean;
  /** Shot clock (or game clock) ran out while it flew. */
  buzzer: boolean;
  /** Game time the ball became dead / loose. */
  since: number;
  /** The release: contest, inside the green, a contested make's bonus point. */
  contest: number;
  green: boolean;
  andOne: boolean;
};

export type HoopsEvent = {
  k:
    | "make"
    | "miss"
    | "block"
    | "steal"
    | "stealMiss"
    | "bite"
    | "turnover"
    | "check"
    | "rebound"
    | "fire"
    | "heat"
    | "cool"
    | "over"
    | "release"
    | "takeBack"
    | "dunk"
    | "rim"
    | "juke"
    | "drive"
    | "gather"
    | "fake"
    | "jump";
  who: 0 | 1;
  v?: number;
  label?: string;
};

export type Hoops = {
  mode: HoopsMode;
  rival: RivalId;
  t: number;
  rng: number;
  p: Actor;
  r: Actor;
  ball: Ball;
  /** Who is on offence: 0 the player, 1 the rival. */
  offense: 0 | 1;
  score: [number, number];
  shotClock: number;
  takeBack: boolean;
  checkUntil: number;
  over: boolean;
  winner: -1 | 0 | 1;
  /** Player's makes in a row (heat), and On Fire. */
  heat: number;
  fire: boolean;
  /** Solo modes: points, the clock, shots, makes and streaks. */
  points: number;
  timeLeft: number;
  shots: number;
  makes: number;
  streak: number;
  bestStreak: number;
  /** Game time the last shot resolved (QA: "holding again within …"). */
  resolvedAt: number;
  prevShoot: boolean;
  /** The player's last movement input (fadeaway reads it). */
  mx: number;
  mz: number;
  brain: RivalBrain;
  events: HoopsEvent[];
  /** Holder position history for the rival's reaction delay. */
  histX: Float32Array;
  histZ: Float32Array;
  histI: number;
};

export type HoopsInput = {
  /** Movement on the floor, world axes, length ≤ 1. */
  mx: number;
  mz: number;
  /** Shoot held (press = start / jump, release = shot). */
  shoot: boolean;
  /** The second button pressed this step (juke, drive, steal). */
  move: boolean;
  /** Bots and QA: release at exactly this charge on this step. */
  charge?: number;
};

export const freshInput = (): HoopsInput => ({ mx: 0, mz: 0, shoot: false, move: false });

const actor = (x: number, z: number): Actor => ({
  x,
  z,
  vx: 0,
  vz: 0,
  fx: 0,
  fz: -1,
  jumpAt: -9,
  rootedUntil: -9,
  frozenUntil: -9,
  cdUntil: -9,
  dashUntil: -9,
  dashVx: 0,
  dashVz: 0,
  gatherAt: -1,
  gatherType: "jumper",
  gatherFade: false,
  exposedUntil: -9,
  dashAt: -9,
  bully: -9,
  driveUntil: -9,
});

/** Seeded 0..1 (xorshift32 on the state). */
export function rand(g: Hoops): number {
  let x = g.rng | 0 || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  g.rng = x;
  return (x >>> 0) / 4294967296;
}

export function newHoops(mode: HoopsMode = "1v1", rival: RivalId = "classmate", seed = 1): Hoops {
  const g: Hoops = {
    mode,
    rival,
    t: 0,
    rng: (seed * 2654435761) >>> 0 || 1,
    p: actor(CHECK_SPOT.x, CHECK_SPOT.z),
    r: actor(0, 0.6),
    ball: {
      phase: "held",
      holder: 0,
      x: 0,
      y: 1,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      t: 0,
      T: 1,
      x0: 0,
      y0: 0,
      z0: 0,
      tx: 0,
      tz: 0,
      made: false,
      shooter: 0,
      kind: "jumper",
      value: 2,
      label: "",
      pure: false,
      slam: false,
      tr: -9,
      blockOpen: false,
      rimmed: false,
      buzzer: false,
      since: 0,
      contest: 0,
      green: false,
      andOne: false,
    },
    offense: 0,
    score: [0, 0],
    shotClock: SHOT_CLOCK,
    takeBack: false,
    checkUntil: mode === "1v1" ? CHECK_PAUSE : 0,
    over: false,
    winner: -1,
    heat: 0,
    fire: false,
    points: 0,
    timeLeft: mode === "hot" ? HOT_SECONDS : 0,
    shots: 0,
    makes: 0,
    streak: 0,
    bestStreak: 0,
    resolvedAt: -9,
    prevShoot: false,
    mx: 0,
    mz: 0,
    brain: newBrain(),
    events: [],
    histX: new Float32Array(32),
    histZ: new Float32Array(32),
    histI: 0,
  };
  if (mode !== "1v1") parkRival(g);
  else check(g, 0, false);
  return g;
}

const solo = (g: Hoops) => g.mode !== "1v1";
function parkRival(g: Hoops) {
  g.r.x = 9;
  g.r.z = 9;
}

function emit(g: Hoops, k: HoopsEvent["k"], who: 0 | 1, v?: number, label?: string) {
  if (g.events.length < 64) g.events.push({ k, who, v, label });
}

export const actorOf = (g: Hoops, who: 0 | 1) => (who === 0 ? g.p : g.r);
export const holder = (g: Hoops) => (g.ball.phase === "held" ? actorOf(g, g.ball.holder) : null);
export const inAir = (g: Hoops, a: Actor) => g.t - a.jumpAt < JUMP_AIR;
export const jumpHeight = (g: Hoops, a: Actor) => {
  const u = (g.t - a.jumpAt) / JUMP_AIR;
  return u >= 0 && u < 1 ? Math.sin(u * Math.PI) * 0.75 : 0;
};
/** Gather progress 0..1 (the meter), or −1. */
export function charge(g: Hoops, a: Actor): number {
  if (a.gatherAt < 0) return -1;
  return Math.min(1, (g.t - a.gatherAt) / METER[a.gatherType].fill);
}

/** Loser's ball (or a turnover): ball to `who` at the top of the arc. */
export function check(g: Hoops, who: 0 | 1, announce = true) {
  g.offense = who;
  const o = actorOf(g, who),
    dfd = actorOf(g, who === 0 ? 1 : 0);
  o.x = CHECK_SPOT.x;
  o.z = CHECK_SPOT.z;
  dfd.x = 0;
  dfd.z = 0.8;
  for (const a of [o, dfd]) {
    a.vx = a.vz = 0;
    a.gatherAt = -1;
    a.dashUntil = -9;
    a.driveUntil = -9;
    a.fx = 0;
    a.fz = -1;
  }
  g.ball.phase = "held";
  g.ball.holder = who;
  g.shotClock = SHOT_CLOCK;
  g.takeBack = false;
  g.checkUntil = g.t + CHECK_PAUSE;
  g.brain.plan = 0;
  g.brain.possessionCrosses = 0;
  if (announce) emit(g, "check", who);
}

function give(g: Hoops, who: 0 | 1, rebound: boolean, rimmed: boolean) {
  const defensive = who !== g.offense;
  g.ball.phase = "held";
  g.ball.holder = who;
  if (defensive || !rimmed) g.shotClock = SHOT_CLOCK;
  else if (rimmed) g.shotClock = SHOT_CLOCK;
  g.offense = who;
  g.takeBack = !solo(g) && defensive;
  g.brain.plan = 0;
  g.brain.possessionCrosses = 0;
  if (rebound) emit(g, "rebound", who, defensive ? 1 : 0);
  if (g.takeBack) emit(g, "takeBack", who);
}

/* ------------------------------------------------------------ movement */

function moveActor(g: Hoops, a: Actor, mx: number, mz: number, top: number, dt: number) {
  const t = g.t;
  if (t < a.frozenUntil || t < a.rootedUntil || t < g.checkUntil) {
    a.vx = a.vz = 0;
    return;
  }
  let tx: number, tz: number;
  if (t - a.jumpAt < JUMP_AIR) {
    // In the air: no steering until he lands (bite on a fake and he's gone).
    a.vx *= 0.92;
    a.vz *= 0.92;
  } else if (t < a.dashUntil) {
    tx = a.dashVx;
    tz = a.dashVz;
    a.vx = tx;
    a.vz = tz;
  } else {
    const len = Math.hypot(mx, mz);
    const k = len > 1 ? 1 / len : 1;
    const speed = a.gatherAt >= 0 ? Math.min(top, GATHER_SPEED) : top;
    tx = mx * k * speed;
    tz = mz * k * speed;
    const dvx = tx - a.vx,
      dvz = tz - a.vz,
      dv = Math.hypot(dvx, dvz),
      max = ACCEL * dt;
    if (dv <= max) {
      a.vx = tx;
      a.vz = tz;
    } else {
      a.vx += (dvx / dv) * max;
      a.vz += (dvz / dv) * max;
    }
  }
  a.x = Math.max(COURT_BOUNDS.minX, Math.min(COURT_BOUNDS.maxX, a.x + a.vx * dt));
  a.z = Math.max(COURT_BOUNDS.minZ, Math.min(COURT_BOUNDS.maxZ, a.z + a.vz * dt));
  const sp = Math.hypot(a.vx, a.vz);
  if (sp > 0.3) {
    a.fx = a.vx / sp;
    a.fz = a.vz / sp;
  }
}

function separate(g: Hoops) {
  if (solo(g)) return;
  const p = g.p,
    r = g.r,
    dx = r.x - p.x,
    dz = r.z - p.z,
    d = Math.hypot(dx, dz),
    min = 0.75;
  if (d >= min || d < 1e-6) return;
  // The defender holds his ground: the ball handler gives 70% of the overlap
  // and loses his momentum into the body.
  const over = min - d;
  const kp = g.offense === 0 ? 0.7 : g.t < r.bully ? 0.75 : 0.3;
  const nx = dx / d,
    nz = dz / d;
  p.x -= nx * over * kp;
  p.z -= nz * over * kp;
  r.x += nx * over * (1 - kp);
  r.z += nz * over * (1 - kp);
  const o = g.offense === 0 ? p : r,
    s = g.offense === 0 ? 1 : -1;
  const into = (o.vx * nx + o.vz * nz) * s;
  if (into > 0 && !(o === r && g.t < r.bully)) {
    o.vx -= nx * s * into;
    o.vz -= nz * s * into;
    if (g.t < o.dashUntil) o.dashUntil = g.t;
  }
}

/** Juke (lateral) or drive (toward the hoop) by actor `who`. */
export function dash(g: Hoops, who: 0 | 1, mx: number, mz: number) {
  const a = actorOf(g, who);
  if (g.t < a.cdUntil || g.t < g.checkUntil || a.gatherAt >= 0) return;
  const hx = HOOP_X - a.x,
    hz = HOOP_Z - a.z,
    hd = Math.hypot(hx, hz) || 1;
  const ux = hx / hd,
    uz = hz / hd;
  const len = Math.hypot(mx, mz);
  const toward = len > 0.2 ? (mx * ux + mz * uz) / len : 0;
  a.cdUntil = g.t + JUKE.cooldown;
  a.dashAt = g.t;
  if (toward > 0.5) {
    a.dashVx = (mx / len) * DRIVE.speed;
    a.dashVz = (mz / len) * DRIVE.speed;
    a.dashUntil = g.t + DRIVE.time;
    a.driveUntil = a.dashUntil + 0.15;
    emit(g, "drive", who);
    return;
  }
  // Lateral: the side the stick points to, else away from the defender.
  const def = actorOf(g, who === 0 ? 1 : 0);
  let side = len > 0.2 ? Math.sign(mx * -uz + mz * ux) : 0;
  if (!side) side = Math.sign((def.x - a.x) * uz - (def.z - a.z) * ux) || 1;
  const sx = -uz * side,
    sz = ux * side,
    speed = JUKE.dist / JUKE.time;
  a.dashVx = sx * speed;
  a.dashVz = sz * speed;
  a.dashUntil = g.t + JUKE.time;
  emit(g, "juke", who);
  if (who === 1) a.exposedUntil = g.t + STEAL.window;
  // The defender bites?
  const gap = Math.hypot(def.x - a.x, def.z - a.z);
  if (!solo(g) && gap <= JUKE.bite && g.ball.phase === "held" && g.ball.holder === who) {
    const chance = who === 0 ? RIVALS[g.rival].bite : g.brain.playerBite;
    if (rand(g) < chance) {
      def.rootedUntil = g.t + JUKE.root;
      g.brain.bitAt = g.t;
      emit(g, "bite", who);
    }
  }
}

/** A steal try by `who` on the holder. */
export function steal(g: Hoops, who: 0 | 1) {
  const a = actorOf(g, who),
    h = holder(g);
  if (!h || g.ball.holder === who || g.t < a.frozenUntil || g.t < g.checkUntil) return;
  const gap = Math.hypot(h.x - a.x, h.z - a.z);
  if (gap <= STEAL.range && g.t < h.exposedUntil) {
    h.gatherAt = -1;
    give(g, who, false, false);
    emit(g, "steal", who);
  } else {
    a.frozenUntil = g.t + STEAL.miss;
    emit(g, "stealMiss", who);
  }
}

export function jump(g: Hoops, who: 0 | 1) {
  const a = actorOf(g, who);
  if (inAir(g, a) || g.t < a.frozenUntil) return;
  a.jumpAt = g.t;
  emit(g, "jump", who);
  // A late block on a shot already in the air.
  const b = g.ball;
  if (b.phase === "flight" && b.blockOpen && b.shooter !== who) tryBlock(g, who);
}

/* --------------------------------------------------------------- shots */

/** Starts a shot: a dunk goes at once, anything else gathers the meter. */
export function startShot(g: Hoops, who: 0 | 1) {
  const a = actorOf(g, who);
  if (g.ball.phase !== "held" || g.ball.holder !== who || a.gatherAt >= 0 || g.t < g.checkUntil) return;
  if (g.t < a.rootedUntil || g.t < a.frozenUntil) return;
  const d = dist(a.x, a.z);
  if (g.takeBack && d < ZONE.three) {
    emit(g, "takeBack", who);
    return;
  }
  const hx = (HOOP_X - a.x) / (d || 1),
    hz = (HOOP_Z - a.z) / (d || 1);
  const speed = Math.hypot(a.vx, a.vz),
    toward = a.vx * hx + a.vz * hz;
  const type = shotType(d, toward, speed);
  if (type === "dunk") {
    release(g, who, 0, "dunk");
    return;
  }
  a.gatherAt = g.t;
  a.gatherType = type;
  a.gatherFade = false;
  emit(g, "gather", who);
}


/** Releases `who`'s shot at charge `power` (0..1; ignored for a dunk). */
export function release(g: Hoops, who: 0 | 1, power: number, force?: ShotType) {
  const a = actorOf(g, who),
    def = actorOf(g, who === 0 ? 1 : 0);
  const type: ShotType = force ?? a.gatherType;
  const d = dist(a.x, a.z);
  const b = g.ball;
  const hx = (HOOP_X - a.x) / (d || 1),
    hz = (HOOP_Z - a.z) / (d || 1);
  const fade =
    type !== "dunk" && type !== "layup" && (who === 0 ? g.mx * hx + g.mz * hz < -0.5 : a.gatherFade);
  const rawGap = solo(g) ? 99 : Math.hypot(def.x - a.x, def.z - a.z);
  const reachBonus = who === 0 ? RIVALS[g.rival].reach - 1.2 : 0;
  const c = solo(g) ? 0 : contest(rawGap - reachBonus, inAir(g, def), fade);
  const moving = Math.hypot(a.vx, a.vz) > 1;
  const p01 = Math.max(0, Math.min(1, power));
  const err = type === "dunk" ? 0 : Math.abs(p01 - METER[type].centre);
  const fire = who === 0 && g.fire;
  const w = type === "dunk" ? 1 : greenHalfWidth(type, d, { moving, contest: c, fire, fade });
  // Tuning (the bots judge): a hand in the face shrinks the pure core too.
  const pure = who === 0 && (type === "jumper" || type === "three") && err <= PURE * (1 - 0.5 * c);
  let chance: number;
  if (who === 0) chance = type === "dunk" ? 1 : pure ? 1 : makeChance(type, err, w, c, d);
  else {
    const R = RIVALS[g.rival];
    const open = type === "three" ? R.three : type === "jumper" ? R.mid : type === "dunk" ? Math.min(0.95, R.layup * 1.15) : R.layup;
    chance = open * (1 - RIVAL_CONTEST * c);
  }
  a.gatherAt = -1;
  g.shots += who === 0 ? 1 : 0;
  b.phase = "flight";
  b.shooter = who;
  b.kind = type;
  b.t = 0;
  b.tr = g.t;
  b.pure = pure;
  b.slam = type === "dunk" && (fire || g.t - g.brain.bitAt < 1.2);
  b.made = rand(g) < chance;
  b.buzzer = false;
  b.rimmed = false;
  b.contest = c;
  b.green = type === "dunk" || err <= w;
  // A contested make at close range draws the (arcade) foul: one more point.
  b.andOne = who === 0 && b.made && c >= 0.6 && (type === "layup" || type === "dunk");
  a.driveUntil = -9;
  b.x0 = a.x + hx * 0.3;
  b.z0 = a.z + hz * 0.3;
  b.y0 = type === "dunk" ? 2.9 : 2.25 + jumpHeight(g, a);
  b.T = type === "dunk" ? 0.32 : type === "layup" ? 0.55 : 0.72 + 0.05 * d;
  if (b.made) {
    b.tx = HOOP_X;
    b.tz = HOOP_Z;
  } else {
    // Off the front or side of the rim, never an air ball from a green release.
    const ang = Math.atan2(a.x - HOOP_X, a.z - HOOP_Z) + (rand(g) - 0.5) * 2.2;
    b.tx = HOOP_X + Math.sin(ang) * 0.5;
    b.tz = HOOP_Z + Math.cos(ang) * 0.5;
  }
  let value = d >= ZONE.three ? 3 : 2;
  let label = type === "dunk" ? (b.slam ? "Slam" : "Dunk") : type === "layup" ? "Layup" : pure ? "Pure" : value === 3 ? "Three" : "Bucket";
  if (who === 0) {
    if (fire) value += 1;
    if (d >= ZONE.logo) {
      value += 1;
      label = "From the logo";
    }
    if (fade && type !== "three") label = "Fadeaway";
  }
  b.value = value;
  b.label = p01 >= 1 && type !== "dunk" ? "Late" : label;
  emit(g, type === "dunk" ? "dunk" : "release", who, err, b.label);
  // Blocks: a defender already up counts now; one who jumps late may still.
  b.blockOpen = false;
  if (!solo(g)) {
    if (g.t - def.jumpAt <= BLOCK_WINDOW) tryBlock(g, who === 0 ? 1 : 0);
    else b.blockOpen = true;
    // The Legend's chase-down: a layup that beat him, from behind.
    if (b.phase === "flight" && who === 0 && type === "layup" && RIVALS[g.rival].chase > 0) {
      const behind = dist(def.x, def.z) > d + 0.4 && rawGap < 2.6;
      if (behind && rand(g) < RIVALS[g.rival].chase) {
        def.jumpAt = g.t;
        blocked(g, 1);
      }
    }
  }
}

function blocked(g: Hoops, who: 0 | 1) {
  const b = g.ball;
  const s = actorOf(g, b.shooter);
  b.phase = "loose";
  b.blockOpen = false;
  b.x = s.x;
  b.z = s.z;
  b.y = 2.6;
  const ang = rand(g) * Math.PI * 2;
  b.vx = Math.sin(ang) * 3;
  b.vz = Math.cos(ang) * 3;
  b.vy = 1.5;
  b.since = g.t;
  b.rimmed = false;
  if (b.shooter === 0) {
    g.heat = 0;
    if (g.fire) emit(g, "cool", 0);
    g.fire = false;
    g.streak = 0;
  }
  emit(g, "block", who);
}

/** Defender `who` tries to block the ball in flight (once per shot). */
export function tryBlock(g: Hoops, who: 0 | 1) {
  const b = g.ball;
  if (b.phase !== "flight" || b.shooter === who) return;
  b.blockOpen = false;
  if (b.pure || b.slam) return;
  const a = actorOf(g, who),
    s = actorOf(g, b.shooter);
  const dtj = Math.abs(a.jumpAt - b.tr);
  if (dtj > BLOCK_WINDOW) return;
  const gap = Math.hypot(a.x - s.x, a.z - s.z);
  let hit: boolean;
  if (who === 0) hit = gap <= 1.3 && (dtj <= 0.06 || rand(g) < 0.35);
  else {
    const R = RIVALS[g.rival];
    hit = contest(gap - (R.reach - 1.2), true, false) >= 0.85 && rand(g) < R.block;
  }
  if (hit) blocked(g, who);
}

/* ---------------------------------------------------------- resolution */

function scored(g: Hoops) {
  const b = g.ball;
  const who = b.shooter;
  let value = b.value;
  if (b.buzzer && who === 0) value += 2;
  if (b.andOne) value += 1;
  if (g.mode === "hot" && g.timeLeft <= 10) value *= 2;
  if (who === 0) {
    g.makes++;
    g.streak++;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    g.heat++;
    if (g.heat === 2) emit(g, "heat", 0);
    if (g.heat === 3 && !g.fire) {
      g.fire = true;
      emit(g, "fire", 0);
    }
  }
  if (g.mode === "1v1") g.score[who] += value;
  else g.points += value;
  emit(g, "make", who, value, b.buzzer && who === 0 ? "At the buzzer" : b.andOne ? "And one" : b.label);
  b.phase = "dead";
  b.since = g.t;
  b.x = HOOP_X;
  b.z = HOOP_Z;
  b.y = RIM_Y - 0.1;
  b.vx = b.vz = 0;
  b.vy = -2.5;
  g.resolvedAt = g.t;
  if (g.mode === "1v1" && g.score[who] >= GAME_TO) {
    g.over = true;
    g.winner = who;
    emit(g, "over", who);
  }
}

function missed(g: Hoops) {
  const b = g.ball;
  if (b.shooter === 0) {
    g.streak = 0;
    g.heat = 0;
    if (g.fire) emit(g, "cool", 0);
    g.fire = false;
  }
  b.phase = "loose";
  b.rimmed = true;
  b.x = b.tx;
  b.z = b.tz;
  b.y = RIM_Y + 0.1;
  const ox = b.tx - HOOP_X,
    oz = b.tz - HOOP_Z,
    o = Math.hypot(ox, oz) || 1;
  const sp = 1.6 + rand(g) * 2.4;
  b.vx = (ox / o) * sp + (rand(g) - 0.5);
  b.vz = (oz / o) * sp + (rand(g) - 0.5);
  b.vy = 1.5 + rand(g) * 2;
  b.since = g.t;
  g.resolvedAt = g.t;
  emit(g, "rim", b.shooter);
  emit(g, "miss", b.shooter, 0, b.label);
}

function stepBall(g: Hoops, dt: number) {
  const b = g.ball;
  if (b.phase === "held") {
    const h = actorOf(g, b.holder);
    b.x = h.x + h.fx * 0.45;
    b.z = h.z + h.fz * 0.45;
    b.y = 1;
    return;
  }
  if (b.phase === "flight") {
    b.t += dt;
    if (b.blockOpen && b.t > BLOCK_WINDOW) b.blockOpen = false;
    const u = Math.min(1, b.t / b.T);
    const ty = RIM_Y + 0.05;
    const apex = b.kind === "dunk" ? 0.25 : b.kind === "layup" ? 0.7 : 1.3 + 0.1 * Math.hypot(b.x0 - b.tx, b.z0 - b.tz);
    b.x = b.x0 + (b.tx - b.x0) * u;
    b.z = b.z0 + (b.tz - b.z0) * u;
    b.y = b.y0 + (ty - b.y0) * u + 4 * apex * u * (1 - u);
    if (u >= 1) {
      if (b.made) scored(g);
      else missed(g);
    }
    return;
  }
  // Loose or dead: a simple bouncing ball.
  b.vy -= 9.81 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  if (b.y < 0.35) {
    b.y = 0.35;
    b.vy = Math.abs(b.vy) > 1 ? -b.vy * 0.62 : 0;
    const drag = Math.exp(-dt * 2);
    b.vx *= drag;
    b.vz *= drag;
  }
  if (b.x < COURT_BOUNDS.minX || b.x > COURT_BOUNDS.maxX) {
    b.x = Math.max(COURT_BOUNDS.minX, Math.min(COURT_BOUNDS.maxX, b.x));
    b.vx = -b.vx * 0.5;
  }
  if (b.z < COURT_BOUNDS.minZ || b.z > COURT_BOUNDS.maxZ) {
    b.z = Math.max(COURT_BOUNDS.minZ, Math.min(COURT_BOUNDS.maxZ, b.z));
    b.vz = -b.vz * 0.5;
  }
  if (b.phase === "dead") {
    if (g.t - b.since >= (solo(g) ? RESPAWN : DEAD_BALL) && !g.over) {
      if (solo(g)) give(g, 0, false, false);
      else check(g, b.shooter === 0 ? 1 : 0);
    }
    return;
  }
  // Loose: solo modes hand a new ball back; 1v1 is a rebound battle.
  if (solo(g)) {
    if (g.t - b.since >= RESPAWN) give(g, 0, false, false);
    return;
  }
  const first = rand(g) < 0.5 ? 0 : 1;
  for (let k = 0; k < 2; k++) {
    const who = (k === 0 ? first : 1 - first) as 0 | 1;
    const a = actorOf(g, who);
    const reach = 2.4 + jumpHeight(g, a);
    if (b.y < reach && Math.hypot(b.x - a.x, b.z - a.z) < 0.9) {
      give(g, who, true, b.rimmed);
      return;
    }
  }
}

/** One fixed 60 Hz step of the whole court. */
export function stepHoops(g: Hoops, input: HoopsInput, dt = 1 / 60) {
  g.events.length = 0;
  if (g.over) return;
  g.t += dt;
  const p = g.p;
  g.mx = input.mx;
  g.mz = input.mz;
  const pressed = input.shoot && !g.prevShoot,
    releasedKey = !input.shoot && g.prevShoot;
  g.prevShoot = input.shoot;
  const b = g.ball;
  const has = b.phase === "held" && b.holder === 0;
  if (has) {
    if (input.move) dash(g, 0, input.mx, input.mz);
    if (input.charge !== undefined) {
      if (p.gatherAt < 0) startShot(g, 0);
      if (p.gatherAt >= 0) release(g, 0, input.charge);
    } else {
      if (pressed) startShot(g, 0);
      if (p.gatherAt >= 0) {
        const c = charge(g, p);
        if (releasedKey || c >= 1) release(g, 0, c);
      }
    }
  } else if (!solo(g)) {
    if (pressed) jump(g, 0);
    if (input.move) steal(g, 0);
  }
  moveActor(g, p, input.mx, input.mz, RUN, dt);
  // A drive carries on while you keep attacking the rim, and one that reaches
  // the paint with the ball finishes with a dunk by itself.
  if (b.phase === "held" && b.holder === 0 && p.gatherAt < 0 && g.t < p.driveUntil) {
    const pd = dist(p.x, p.z) || 1;
    if ((p.vx * (HOOP_X - p.x) + p.vz * (HOOP_Z - p.z)) / pd >= 3.5) p.driveUntil = Math.max(p.driveUntil, g.t + 0.15);
    if (!g.takeBack && pd <= DUNK_REACH && g.t >= p.rootedUntil) release(g, 0, 0, "dunk");
  }
  if (!solo(g)) {
    g.histX[g.histI] = b.phase === "held" ? actorOf(g, b.holder).x : b.x;
    g.histZ[g.histI] = b.phase === "held" ? actorOf(g, b.holder).z : b.z;
    g.histI = (g.histI + 1) % g.histX.length;
    rivalStep(g, dt);
    separate(g);
  }
  stepBall(g, dt);
  // Clocks.
  if (g.mode === "hot") {
    g.timeLeft = Math.max(0, g.timeLeft - dt);
    if (g.timeLeft <= 0) {
      if (b.phase === "flight") b.buzzer = true;
      else if (!g.over) {
        g.over = true;
        g.winner = 0;
        emit(g, "over", 0);
      }
    }
  } else if (g.mode === "1v1" && g.t >= g.checkUntil && !g.over) {
    if (b.phase === "held" || b.phase === "flight") g.shotClock = Math.max(0, g.shotClock - dt);
    if (g.shotClock <= 0) {
      if (b.phase === "flight") b.buzzer = true;
      else if (b.phase === "held") {
        emit(g, "turnover", b.holder);
        const h = actorOf(g, b.holder);
        h.gatherAt = -1;
        check(g, b.holder === 0 ? 1 : 0);
      }
    }
  }
  // Take it back: the arc clears the flag.
  if (g.takeBack && b.phase === "held" && dist(actorOf(g, b.holder).x, actorOf(g, b.holder).z) >= ZONE.three) g.takeBack = false;
}

/** Holder position `delay` seconds ago (the rival's reaction). */
export function delayedHolder(g: Hoops, delay: number): [number, number] {
  const n = g.histX.length;
  const back = Math.max(1, Math.min(n - 1, Math.round(delay * 60)));
  const i = (g.histI - back + n * 2) % n;
  return [g.histX[i], g.histZ[i]];
}
export { moveActor };
