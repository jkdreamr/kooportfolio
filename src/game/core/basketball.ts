export type Vec = { x: number; y: number; z: number };
export type BallState = {
  p: Vec;
  v: Vec;
  scored: boolean;
  bounced: boolean;
  age: number;
};
export const HOOP = { x: 0, y: 3.05, z: -5 };
export const BALL_RADIUS = 0.23;
export function launchBall(
  x: number,
  z: number,
  charge: number,
  aim = 0,
): BallState {
  const d = Math.max(2, Math.hypot(x, z - HOOP.z)),
    elevation = Math.PI * 0.29,
    h = HOOP.y - 1.65;
  const base = Math.sqrt(
    (9.81 * d * d) /
      (2 * Math.cos(elevation) ** 2 * (d * Math.tan(elevation) - h)),
  );
  const speed = base * (0.72 + Math.max(0, Math.min(1, charge)) * 0.46),
    angle = Math.atan2(-x, HOOP.z - z) + aim;
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
  };
}
export function stepBall(
  ball: BallState,
  dt: number,
): { ball: BallState; score: boolean; collision: boolean } {
  const b = { ...ball, p: { ...ball.p }, v: { ...ball.v }, age: ball.age + dt },
    old = ball.p;
  b.v.y -= 9.81 * dt;
  b.p.x += b.v.x * dt;
  b.p.y += b.v.y * dt;
  b.p.z += b.v.z * dt;
  let score = false,
    collision = false;
  if (!b.scored && old.y > HOOP.y && b.p.y <= HOOP.y && b.v.y < 0) {
    const f = (old.y - HOOP.y) / (old.y - b.p.y),
      x = old.x + (b.p.x - old.x) * f,
      z = old.z + (b.p.z - old.z) * f;
    if (Math.hypot(x - HOOP.x, z - HOOP.z) < 0.34) {
      b.scored = true;
      score = true;
    }
  }
  // Solid backboard and the small iron segments of a circular rim.
  if (
    b.p.z < -5.42 &&
    old.z >= -5.42 &&
    b.p.y > 3.4 &&
    b.p.y < 4.85 &&
    Math.abs(b.p.x) < 1.4
  ) {
    b.p.z = -5.42;
    b.v.z = Math.abs(b.v.z) * 0.72;
    b.bounced = true;
    collision = true;
  }
  if (!b.scored)
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2,
        rx = Math.sin(a) * 0.53,
        rz = HOOP.z + Math.cos(a) * 0.53;
      const dx = b.p.x - rx,
        dy = b.p.y - HOOP.y,
        dz = b.p.z - rz,
        dist = Math.hypot(dx, dy, dz);
      if (dist < BALL_RADIUS + 0.045 && dist > 0.001) {
        const nx = dx / dist,
          ny = dy / dist,
          nz = dz / dist,
          dot = b.v.x * nx + b.v.y * ny + b.v.z * nz;
        if (dot < 0) {
          b.v.x -= 1.65 * dot * nx;
          b.v.y -= 1.65 * dot * ny;
          b.v.z -= 1.65 * dot * nz;
          b.p.x = rx + nx * 0.28;
          b.p.y = HOOP.y + ny * 0.28;
          b.p.z = rz + nz * 0.28;
          collision = true;
        }
      }
    }
  if (b.p.y < BALL_RADIUS) {
    b.p.y = BALL_RADIUS;
    b.v.y = Math.abs(b.v.y) * 0.66;
    b.v.x *= 0.8;
    b.v.z *= 0.8;
    b.bounced = true;
    if (Math.abs(b.v.y) > 0.6) collision = true;
  }
  if (Math.abs(b.p.x) > 6.7) {
    b.p.x = Math.sign(b.p.x) * 6.7;
    b.v.x *= -0.6;
    collision = true;
  }
  if (b.p.z < -7.2 || b.p.z > 8.5) {
    b.p.z = Math.max(-7.2, Math.min(8.5, b.p.z));
    b.v.z *= -0.6;
    collision = true;
  }
  return { ball: b, score, collision };
}
