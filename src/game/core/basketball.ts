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
  const elevation = Math.PI * (style === "lob" ? 0.37 : 0.29);
  const h = hoop.y - 1.65;
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

// Swept sphere against an expanded board box: endpoints alone miss high/fast shots.
function hitBoard(old: Vec, next: Vec, hoop: Vec) {
  const lo = {
    x: hoop.x - BACKBOARD.width / 2 - BALL_RADIUS,
    y: BACKBOARD.y - BACKBOARD.height / 2 - BALL_RADIUS,
    z: BACKBOARD.z - BACKBOARD.depth / 2 - BALL_RADIUS,
  };
  const hi = {
    x: hoop.x + BACKBOARD.width / 2 + BALL_RADIUS,
    y: BACKBOARD.y + BACKBOARD.height / 2 + BALL_RADIUS,
    z: BACKBOARD.z + BACKBOARD.depth / 2 + BALL_RADIUS,
  };
  let enter = 0,
    exit = 1;
  let normal: Vec = { x: 0, y: 0, z: 0 };
  for (const axis of ["x", "y", "z"] as const) {
    const d = next[axis] - old[axis];
    if (Math.abs(d) < 1e-9) {
      if (old[axis] < lo[axis] || old[axis] > hi[axis]) return null;
    } else {
      const a = (lo[axis] - old[axis]) / d,
        b = (hi[axis] - old[axis]) / d;
      const near = Math.min(a, b),
        far = Math.max(a, b);
      if (near >= enter) {
        enter = near;
        normal = { x: 0, y: 0, z: 0 };
        normal[axis] = d > 0 ? -1 : 1;
      }
      exit = Math.min(exit, far);
      if (enter > exit) return null;
    }
  }
  return enter >= 0 &&
    enter <= 1 &&
    Math.hypot(normal.x, normal.y, normal.z) > 0
    ? { t: enter, normal }
    : null;
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
