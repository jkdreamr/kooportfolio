export type Vec = { x: number; y: number; z: number };
export type BallState = {
  p: Vec;
  v: Vec;
  scored: boolean;
  bounced: boolean;
  age: number;
  contacts?: { board: number; rim: number; floor: number; wall: number };
};
export type ShotStyle = "arc" | "lob";
export const HOOP = { x: 0, y: 3.05, z: -5 };
export const BALL_RADIUS = 0.23;
export const RIM_RADIUS = 0.53;
export const COURT_Y = 0.12;
// Shared by the mesh and collider, including the upper board edge.
export const BACKBOARD = {
  y: 4.15,
  z: -5.8,
  width: 2.65,
  height: 1.65,
  depth: 0.17,
};
export const PERFECT_RELEASE = 0.62;
const GRAVITY = 9.81;

export function launchBall(
  x: number,
  z: number,
  charge: number,
  aim = 0,
  hoop = HOOP,
  style: ShotStyle = "arc",
): BallState {
  const d = Math.max(1, Math.hypot(hoop.x - x, z - hoop.z));
  const h = hoop.y - 1.65;
  // Clear the near rim on short gathers, and keep the arrival slope steeper
  // than 45 degrees at midrange. Crossing the hoop center alone is not enough
  // clearance for a ball with volume.
  const elevation = Math.max(
    Math.PI * (style === "lob" ? 0.37 : 0.29),
    Math.atan2(2 * h + 1.6, Math.max(0.35, d - 0.5)),
    Math.atan((2 * h) / d + 1.05),
  );
  const base = Math.sqrt(
    (GRAVITY * d * d) /
      (2 *
        Math.cos(elevation) ** 2 *
        Math.max(0.15, d * Math.tan(elevation) - h)),
  );
  const speed =
    base * (1 + (Math.max(0, Math.min(1, charge)) - PERFECT_RELEASE) * 0.6);
  const angle = Math.atan2(hoop.x - x, hoop.z - z) + aim;
  return {
    p: { x, y: 1.65, z },
    v: {
      x: Math.sin(angle) * Math.cos(elevation) * speed,
      y: Math.sin(elevation) * speed,
      z: Math.cos(angle) * Math.cos(elevation) * speed,
    },
    scored: false,
    bounced: false,
    age: 0,
    contacts: { board: 0, rim: 0, floor: 0, wall: 0 },
  };
}

// Exact sphere/box sweep. Distance to a box is quadratic between crossings of
// its face planes; solving those intervals avoids the expanded-box corner gap.
function hitBoard(old: Vec, next: Vec, hoop: Vec) {
  const lo = {
    x: hoop.x - BACKBOARD.width / 2,
    y: BACKBOARD.y - BACKBOARD.height / 2,
    z: BACKBOARD.z - BACKBOARD.depth / 2,
  };
  const hi = {
    x: hoop.x + BACKBOARD.width / 2,
    y: BACKBOARD.y + BACKBOARD.height / 2,
    z: BACKBOARD.z + BACKBOARD.depth / 2,
  };
  const axes = ["x", "y", "z"] as const;
  const delta = { x: next.x - old.x, y: next.y - old.y, z: next.z - old.z };
  const breaks = [0, 1];
  for (const axis of axes) {
    if (
      Math.max(old[axis], next[axis]) < lo[axis] - BALL_RADIUS ||
      Math.min(old[axis], next[axis]) > hi[axis] + BALL_RADIUS
    )
      return null;
    if (Math.abs(delta[axis]) > 1e-9)
      for (const bound of [lo[axis], hi[axis]]) {
        const t = (bound - old[axis]) / delta[axis];
        if (t > 0 && t < 1) breaks.push(t);
      }
  }
  breaks.sort((a, b) => a - b);
  for (let i = 0; i < breaks.length - 1; i++) {
    const start = breaks[i],
      end = breaks[i + 1],
      middle = (start + end) / 2;
    let a = 0,
      b = 0,
      c = -(BALL_RADIUS ** 2);
    for (const axis of axes) {
      const p = old[axis] + delta[axis] * middle;
      if (p >= lo[axis] && p <= hi[axis]) continue;
      const offset = old[axis] - (p < lo[axis] ? lo[axis] : hi[axis]);
      a += delta[axis] ** 2;
      b += 2 * offset * delta[axis];
      c += offset ** 2;
    }
    let t = start;
    if (a * start ** 2 + b * start + c > 1e-10) {
      const discriminant = b * b - 4 * a * c;
      if (a < 1e-12 || discriminant < 0) continue;
      t = (-b - Math.sqrt(discriminant)) / (2 * a);
      if (t < start - 1e-9 || t > end + 1e-9) continue;
    }
    const normal = { x: 0, y: 0, z: 0 };
    for (const axis of axes) {
      const p = old[axis] + delta[axis] * t;
      normal[axis] = p - Math.max(lo[axis], Math.min(hi[axis], p));
    }
    const length = Math.hypot(normal.x, normal.y, normal.z);
    if (length < 1e-9) continue;
    for (const axis of axes) normal[axis] /= length;
    return { t, normal };
  }
  return null;
}

function integrate(ball: BallState, dt: number, hoop: Vec) {
  const b: BallState = {
    ...ball,
    p: { ...ball.p },
    v: { ...ball.v },
    age: ball.age + dt,
    contacts: { board: 0, rim: 0, floor: 0, wall: 0, ...ball.contacts },
  };
  const old = ball.p;
  b.p.x += b.v.x * dt;
  b.p.y += b.v.y * dt - 0.5 * GRAVITY * dt * dt;
  b.p.z += b.v.z * dt;
  b.v.y -= GRAVITY * dt;
  let score = false,
    collision = false;
  const board = hitBoard(old, b.p, hoop);
  if (board) {
    const n = board.normal;
    const dot = b.v.x * n.x + b.v.y * n.y + b.v.z * n.z;
    if (dot < 0) {
      b.p = {
        x: old.x + (b.p.x - old.x) * board.t + n.x * 0.001,
        y: old.y + (b.p.y - old.y) * board.t + n.y * 0.001,
        z: old.z + (b.p.z - old.z) * board.t + n.z * 0.001,
      };
      b.v.x -= 1.76 * dot * n.x;
      b.v.y -= 1.76 * dot * n.y;
      b.v.z -= 1.76 * dot * n.z;
      b.contacts!.board++;
      b.bounced = true;
      collision = true;
    }
  }
  // Closest point on a continuous torus, rather than separated rim beads.
  if (!b.scored) {
    const hx = b.p.x - hoop.x,
      hz = b.p.z - hoop.z,
      radial = Math.hypot(hx, hz);
    const rx = hoop.x + (radial > 0 ? hx / radial : 1) * RIM_RADIUS;
    const rz = hoop.z + (radial > 0 ? hz / radial : 0) * RIM_RADIUS;
    const dx = b.p.x - rx,
      dy = b.p.y - hoop.y,
      dz = b.p.z - rz;
    const dist = Math.hypot(dx, dy, dz),
      separation = BALL_RADIUS + 0.045;
    if (dist < separation && dist > 0.00001) {
      const nx = dx / dist,
        ny = dy / dist,
        nz = dz / dist;
      const dot = b.v.x * nx + b.v.y * ny + b.v.z * nz;
      b.p = {
        x: rx + nx * separation,
        y: hoop.y + ny * separation,
        z: rz + nz * separation,
      };
      if (dot < 0) {
        b.v.x -= 1.64 * dot * nx;
        b.v.y -= 1.64 * dot * ny;
        b.v.z -= 1.64 * dot * nz;
        b.contacts!.rim++;
        collision = true;
      }
    }
  }
  if (!b.scored && old.y > hoop.y && b.p.y <= hoop.y && b.v.y < 0) {
    const f = (old.y - hoop.y) / (old.y - b.p.y);
    const x = old.x + (b.p.x - old.x) * f,
      z = old.z + (b.p.z - old.z) * f;
    if (Math.hypot(x - hoop.x, z - hoop.z) < RIM_RADIUS - 0.045 - BALL_RADIUS) {
      b.scored = true;
      score = true;
    }
  }
  if (b.p.y < COURT_Y + BALL_RADIUS) {
    b.p.y = COURT_Y + BALL_RADIUS;
    if (b.v.y < -0.55) {
      b.v.y = -b.v.y * 0.7;
      b.contacts!.floor++;
      collision = b.v.y > 0.6 || collision;
    } else b.v.y = 0;
    const drag = Math.exp(-dt * 2.5);
    b.v.x *= drag;
    b.v.z *= drag;
    b.bounced = true;
  }
  if (Math.abs(b.p.x) > 6.7) {
    b.p.x = Math.sign(b.p.x) * 6.7;
    b.v.x = -Math.sign(b.p.x) * Math.abs(b.v.x) * 0.6;
    b.contacts!.wall++;
    collision = true;
  }
  if (b.p.z < -8.25 || b.p.z > 8.3) {
    b.p.z = Math.max(-8.25, Math.min(8.3, b.p.z));
    b.v.z = (b.p.z < 0 ? 1 : -1) * Math.abs(b.v.z) * 0.6;
    b.contacts!.wall++;
    collision = true;
  }
  return { ball: b, score, collision };
}

export function stepBall(
  ball: BallState,
  dt: number,
  hoop = HOOP,
): { ball: BallState; score: boolean; collision: boolean } {
  let result = { ball, score: false, collision: false };
  const count = Math.max(1, Math.ceil(Math.min(Math.max(dt, 0), 0.25) * 240));
  const step = Math.min(Math.max(dt, 0), 0.25) / count;
  for (let i = 0; i < count; i++) {
    const next = integrate(result.ball, step, hoop);
    result = {
      ball: next.ball,
      score: result.score || next.score,
      collision: result.collision || next.collision,
    };
  }
  return result;
}

export function shotValue(ball: BallState, distance: number) {
  const c = ball.contacts,
    base = distance >= 6.5 ? 3 : 2;
  if (c?.floor) return { points: base + 3, label: "Bounce" };
  if (c?.board) return { points: base + 2, label: "Bank" };
  if (!c?.rim && !c?.wall) return { points: base + 1, label: "Swish" };
  return { points: base, label: "Bucket" };
}

export const COURT_SPOTS = [
  { x: -3.5, z: 0.8, label: "Left wing" },
  { x: 0, z: 4.5, label: "Deep three" },
  { x: 3.5, z: 0.8, label: "Right wing" },
  { x: 0, z: -0.2, label: "Free throw" },
  { x: -4.5, z: -2, label: "Corner" },
] as const;
export function dailyCourtSeed(date = new Date()) {
  let seed = 2166136261;
  for (const c of date.toISOString().slice(0, 10))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return seed >>> 0;
}

/** Running totals for a timed session: points, makes, streaks. */
export type ShotTally = { points: number; makes: number; shots: number; streak: number; bestStreak: number };
export const freshTally = (): ShotTally => ({ points: 0, makes: 0, shots: 0, streak: 0, bestStreak: 0 });

/** One finished shot: a make adds its points and extends the streak; a miss resets it. */
export function tallyShot(t: ShotTally, made: boolean, points = 0): ShotTally {
  const streak = made ? t.streak + 1 : 0;
  return {
    points: t.points + (made ? Math.max(0, points) : 0),
    makes: t.makes + (made ? 1 : 0),
    shots: t.shots + 1,
    streak,
    bestStreak: Math.max(t.bestStreak, streak),
  };
}

/** The gold window on the power meter (the "Clean release"). */
export const PERFECT_CHARGE = 0.62;
export const isPerfectRelease = (charge: number) => Math.abs(charge - PERFECT_CHARGE) < 0.045;
