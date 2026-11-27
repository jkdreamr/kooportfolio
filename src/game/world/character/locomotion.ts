/**
 * Procedural locomotion driver shared by the player, NPCs and the skate/journey
 * avatars. Pure maths, no Three/React: feed it a planar velocity (world units
 * per second, in the character's own scale-free units after dividing by the
 * avatar scale) and the facing, and it returns joint angles for one frame.
 *
 *   const gait = createGait(seed);
 *   stepGait(gait, dt, vx, vz, heading);   // every frame
 *   gait.pose.hipL …                       // radians / units, see Pose
 *
 * Walk: phase-driven stride with knee lift in swing, heel-to-toe ankle roll,
 * vertical bob that peaks at mid-stance, hip roll/yaw sway, counter-rotating
 * chest and opposite arm swing. Speed is smoothed so starting and stopping
 * ease in/out even when the mover itself is instantaneous; acceleration leans
 * the body, turning banks it into the curve and the head leads the turn.
 * Idle: breathing, slow weight shift onto one hip, occasional look-around and
 * blinks, deterministic per seed.
 */

export type Pose = {
  /** Root offsets (character space). */
  bob: number;
  sway: number;
  lean: number;
  bank: number;
  /** Pelvis roll/yaw. */
  hipRoll: number;
  hipYaw: number;
  /** Chest pitch/yaw/roll and breathing scale. */
  chestPitch: number;
  chestYaw: number;
  chestRoll: number;
  breath: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** Legs: thigh pitch (+forward), knee bend (+), ankle pitch. */
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  ankleL: number;
  ankleR: number;
  /** Arms: shoulder pitch (+forward), shoulder spread, elbow bend. */
  armL: number;
  armR: number;
  spreadL: number;
  spreadR: number;
  elbowL: number;
  elbowR: number;
  /** 1 = open, 0 = shut. */
  eyes: number;
  /** 0 idle … 1 full walk; useful for dust, sounds. */
  walk: number;
  /** Seated blend 0..1 (written by callers that seat a character). */
  seat: number;
  /** Mouth open 0..1 while speaking (written by callers, e.g. a villager
   * in conversation). */
  talk: number;
  /** Pointing while talking (> 0.5 shows the pointing hand). */
  point?: number;
};

export type Gait = {
  pose: Pose;
  speed: number;
  phase: number;
  heading: number;
  turn: number;
  accel: number;
  time: number;
  seed: number;
  lookTimer: number;
  lookYaw: number;
  lookPitch: number;
  blinkTimer: number;
  blink: number;
  initialised: boolean;
  /** Talking gesture blend (0..1). */
  gesture?: number;
};

const zeroPose = (): Pose => ({
  bob: 0,
  sway: 0,
  lean: 0,
  bank: 0,
  hipRoll: 0,
  hipYaw: 0,
  chestPitch: 0,
  chestYaw: 0,
  chestRoll: 0,
  breath: 1,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  hipL: 0,
  hipR: 0,
  kneeL: 0,
  kneeR: 0,
  ankleL: 0,
  ankleR: 0,
  armL: 0,
  armR: 0,
  spreadL: 0.08,
  spreadR: 0.08,
  elbowL: 0.2,
  elbowR: 0.2,
  eyes: 1,
  walk: 0,
  seat: 0,
  talk: 0,
});

/** Deterministic hash → [0,1). */
function rand(seed: number, n: number) {
  const x = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createGait(seed = 1): Gait {
  return {
    pose: zeroPose(),
    speed: 0,
    phase: rand(seed, 1) * Math.PI * 2,
    heading: 0,
    turn: 0,
    accel: 0,
    time: rand(seed, 2) * 40,
    seed,
    lookTimer: 1 + rand(seed, 3) * 3,
    lookYaw: 0,
    lookPitch: 0,
    blinkTimer: 1 + rand(seed, 4) * 3,
    blink: 0,
    initialised: false,
  };
}

const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Character-space walking speed where the stride reaches full amplitude. */
export const FULL_STRIDE_SPEED = 4.2;

/**
 * Advance the gait one frame.
 * @param vx,vz planar velocity in character units/s (world velocity / scale)
 * @param heading facing yaw (radians); used for turn banking
 */
export function stepGait(
  gait: Gait,
  dt: number,
  vx: number,
  vz: number,
  heading: number,
  options: {
    forceWalk?: boolean;
    still?: boolean;
    /** Speaking: hand gestures and small nods. */
    talking?: boolean;
    /** Head look-at target relative to the facing (radians), or null. */
    look?: { yaw: number; pitch: number } | null;
  } = {},
) {
  dt = Math.min(Math.max(dt, 0), 0.05);
  const p = gait.pose;
  gait.time += dt;
  let target = options.still ? 0 : Math.hypot(vx, vz);
  if (options.forceWalk && target < 1) target = FULL_STRIDE_SPEED * 0.8;
  if (!gait.initialised) {
    gait.heading = heading;
    gait.initialised = true;
  }
  // Smoothed speed: quicker to start than to stop, for a planted, weighty
  // deceleration rather than an instant freeze.
  const previous = gait.speed;
  gait.speed = damp(gait.speed, target, target > gait.speed ? 9 : 6, dt);
  const accel = dt > 0 ? (gait.speed - previous) / dt : 0;
  gait.accel = damp(gait.accel, clamp(accel, -20, 20), 6, dt);
  const turnRate = dt > 0 ? wrap(heading - gait.heading) / dt : 0;
  gait.heading = heading;
  gait.turn = damp(gait.turn, clamp(turnRate, -8, 8), 7, dt);

  const w = clamp(gait.speed / FULL_STRIDE_SPEED, 0, 1.25);
  const walk = Math.min(1, w);
  p.walk = walk;
  // Cadence: rises with speed but saturates (stylised jog, slight slide).
  const cadence = 1.15 + Math.min(gait.speed, 7) * 0.32; // cycles / s
  if (walk > 0.02) gait.phase += dt * cadence * Math.PI * 2;
  else
    // Settle the legs to a neutral phase when stopping.
    gait.phase = damp(
      gait.phase,
      Math.round(gait.phase / Math.PI) * Math.PI,
      4,
      dt,
    );
  const ph = gait.phase;
  const s = Math.sin(ph),
    c = Math.cos(ph);
  // Stride matched to the ground speed so planted feet do not slide: each
  // stance half-cycle sweeps the foot back by the distance the body moves.
  const LEG = 0.7;
  const match = Math.asin(clamp(gait.speed / (4 * cadence * LEG), 0, 0.85));
  const stride = walk > 0.02 ? Math.min(0.72, match * 1.05) * Math.min(1, walk * 4) : 0;

  // Legs: left uses phase, right half a cycle later.
  const leg = (sn: number, cs: number) => {
    const thigh = sn * stride;
    // Knee lifts in swing (thigh moving forward: cos > 0).
    const swing = Math.max(0, cs);
    const knee = walk * (0.08 + 1.05 * swing * swing) + 0.04;
    // Heel strike toes up, push-off toes down.
    const ankle =
      walk * (-0.45 * sn * Math.max(0, -cs) + 0.35 * swing * 0.6) -
      thigh * 0.35;
    return [thigh, knee, ankle] as const;
  };
  const [tl, kl, al] = leg(s, c);
  const [tr, kr, ar] = leg(-s, -c);

  // Idle life.
  const t = gait.time;
  const idle = 1 - walk;
  const breathe = Math.sin(t * 1.7 + gait.seed);
  const shift = Math.sin(t * 0.42 + gait.seed * 3.1);
  const weight = Math.sign(shift) * Math.pow(Math.abs(shift), 0.6);

  // Look around while idle; look ahead into turns while moving.
  gait.lookTimer -= dt;
  if (gait.lookTimer <= 0) {
    const n = Math.floor(t * 10);
    gait.lookTimer = 2.2 + rand(gait.seed, n) * 4;
    const glance = rand(gait.seed, n + 7);
    gait.lookYaw = glance < 0.35 ? 0 : (rand(gait.seed, n + 3) - 0.5) * 1.3;
    gait.lookPitch = (rand(gait.seed, n + 5) - 0.6) * 0.3;
  }
  gait.blinkTimer -= dt;
  if (gait.blinkTimer <= 0) {
    gait.blink = 0.14;
    gait.blinkTimer = 1.8 + rand(gait.seed, Math.floor(t * 7)) * 3.6;
  }
  gait.blink = Math.max(0, gait.blink - dt);
  p.eyes = gait.blink > 0 ? Math.abs(gait.blink - 0.07) / 0.07 : 1;

  const lean = clamp(0.07 * walk + gait.accel * 0.018, -0.12, 0.3);
  const bank = clamp(-gait.turn * gait.speed * 0.022, -0.28, 0.28);

  p.bob =
    walk * 0.055 * (Math.cos(2 * ph) * 0.5 + 0.5) -
    walk * 0.03 +
    idle * breathe * 0.006;
  p.sway = walk * 0.035 * s + idle * weight * 0.035;
  p.lean = damp(p.lean, lean, 10, dt);
  p.bank = damp(p.bank, bank, 8, dt);
  p.hipRoll = walk * 0.09 * s + idle * weight * 0.06;
  p.hipYaw = walk * 0.2 * s;
  p.chestYaw = -p.hipYaw * 0.75;
  p.chestRoll = -p.hipRoll * 0.6;
  p.chestPitch = idle * breathe * 0.012 + walk * 0.04;
  p.breath = 1 + idle * breathe * 0.025 + walk * 0.01 * Math.cos(2 * ph);

  const look = options.look;
  const talk = options.talking ? 1 : 0;
  gait.gesture = damp(gait.gesture ?? 0, talk, 3, dt);
  const g = gait.gesture;
  const nod = g * (Math.sin(t * 2.3) * 0.05 + Math.sin(t * 5.1) * 0.02);
  const lookYaw = look
    ? clamp(look.yaw, -1.05, 1.05)
    : idle * gait.lookYaw + walk * clamp(gait.turn * 0.12, -0.5, 0.5);
  const lookPitch = look ? clamp(look.pitch, -0.3, 0.35) : idle * gait.lookPitch;
  // Looking at someone turns the chest a little too.
  if (look) p.chestYaw += clamp(look.yaw, -1, 1) * 0.22 * idle;
  p.headYaw = damp(p.headYaw, lookYaw - p.chestYaw * 0.6, look ? 4 : 5, dt);
  p.headPitch = damp(
    p.headPitch,
    lookPitch - p.lean * 0.6 + walk * 0.04 * Math.cos(2 * ph) + nod,
    6,
    dt,
  );
  p.headRoll = -p.bank * 0.4 - p.hipRoll * 0.3 + g * Math.sin(t * 0.9) * 0.06;

  // Idle stance: weight on one leg, the other knee relaxed.
  p.hipL = tl + idle * 0.03;
  p.hipR = tr - idle * 0.03;
  p.kneeL = kl + idle * Math.max(0, -weight) * 0.22;
  p.kneeR = kr + idle * Math.max(0, weight) * 0.22;
  p.ankleL = al - idle * Math.max(0, -weight) * 0.1;
  p.ankleR = ar - idle * Math.max(0, weight) * 0.1;

  const armSwing = 0.75 * walk;
  p.armL = -s * armSwing + idle * Math.sin(t * 0.8 + 1) * 0.03;
  p.armR = s * armSwing + idle * Math.sin(t * 0.8) * 0.03;
  p.spreadL = 0.1 + walk * 0.05 + idle * breathe * 0.01;
  p.spreadR = 0.1 + walk * 0.05 + idle * breathe * 0.01;
  p.elbowL = 0.25 + walk * (0.35 + 0.35 * Math.max(0, -s));
  p.elbowR = 0.25 + walk * (0.35 + 0.35 * Math.max(0, s));
  if (g > 0.01) {
    // Talking: an open-handed gesture that rises and settles, sometimes
    // with both hands, between relaxed beats.
    const k = g * idle;
    const beat = Math.max(0, Math.sin(t * 1.3 + gait.seed)) ** 0.7;
    const both = Math.max(0, Math.sin(t * 0.55 + gait.seed * 2)) ** 2;
    p.armR = lerpN(p.armR, 0.55 + 0.25 * Math.sin(t * 2.7), k * beat);
    p.elbowR = lerpN(p.elbowR, 1.35 + 0.25 * Math.sin(t * 3.1), k * beat);
    p.spreadR = lerpN(p.spreadR, 0.28, k * beat);
    p.armL = lerpN(p.armL, 0.45 + 0.2 * Math.sin(t * 2.2 + 1), k * beat * both);
    p.elbowL = lerpN(p.elbowL, 1.25 + 0.2 * Math.sin(t * 2.9 + 2), k * beat * both);
    p.spreadL = lerpN(p.spreadL, 0.24, k * beat * both);
    // Now and then a beat becomes a point: arm forward, index out.
    const pt = k * beat * smoothN(0.35, 0.6, Math.sin(t * 0.41 + gait.seed * 3));
    p.armR = lerpN(p.armR, 0.95, pt);
    p.elbowR = lerpN(p.elbowR, 0.55, pt);
    p.spreadR = lerpN(p.spreadR, 0.12, pt);
    p.point = pt;
  } else p.point = 0;
  return p;
}

/** Fold a seated blend (0..1) into a pose: thighs forward, shins down. */
function smoothN(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function seatPose(p: Pose, seated: number) {
  if (seated <= 0) return p;
  const k = Math.min(1, seated);
  p.seat = k;
  const lerp = (a: number, b: number) => a + (b - a) * k;
  p.hipL = lerp(p.hipL, Math.PI / 2);
  p.hipR = lerp(p.hipR, Math.PI / 2);
  p.kneeL = lerp(p.kneeL, Math.PI / 2);
  p.kneeR = lerp(p.kneeR, Math.PI / 2);
  p.ankleL = lerp(p.ankleL, 0);
  p.ankleR = lerp(p.ankleR, 0);
  p.armL = lerp(p.armL, 0.55);
  p.armR = lerp(p.armR, 0.55);
  p.elbowL = lerp(p.elbowL, 0.9);
  p.elbowR = lerp(p.elbowR, 0.9);
  p.lean = lerp(p.lean, -0.04);
  p.bob = lerp(p.bob, 0);
  p.sway = lerp(p.sway, 0);
  return p;
}
