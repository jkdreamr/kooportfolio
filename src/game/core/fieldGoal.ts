/**
 * Field goal ball flight (PLAN_GAMES §2.4). The physics runs in metres with
 * real numbers: uprights 5.64 m apart, crossbar 3.05 m, g = 9.8. Distance is
 * honest: a 43-yard attempt is 43 × 0.9144 m from the posts.
 *
 * The stadium's field is drawn smaller along its length than across it (the
 * room is 48 units long and a field is 120 yards), so the scene maps
 * "metres in front of the posts" to world z with `fieldZ`, which puts every
 * spot on the right painted yard line. Across (x) and up (y) one unit is one
 * metre, which is what the posts are drawn at.
 */
export const FIELD_GOAL = {
  /** World z of the goal posts (the end line). */
  goalZ: -23.3,
  /** World z of the goal line, where the painted "0" yard line is. */
  goalLineZ: -19.5,
  /** World units per yard along the field (the painted lines). */
  yardUnits: 0.38,
  /** Where the camera frames from when idle (the old fixed spot). */
  startZ: 14.2,
  crossbar: 3.05,
  halfWidth: 2.82,
  /** Upright height above the crossbar (drawn and simulated). */
  uprightHeight: 6,
  ballRadius: 0.13,
  postRadius: 0.085,
  gravity: 9.8,
  loft: 0.73,
  /** Ball height at the strike. */
  tee: 0.48,
  restitution: 0.55,
} as const;

export const YARD_M = 0.9144;
/** Metres in front of the posts for an attempt of `yards`. */
export const attemptMetres = (yards: number) => yards * YARD_M;
/** Yards of an attempt from its distance in metres (round trip with attemptMetres). */
export const attemptYards = (metres: number) => Math.round(metres / YARD_M);
/** World z of a point `metres` in front of the posts. The posts are 10 yards
 * behind the goal line, so a 43-yard attempt sits on the 33 (and its line of
 * scrimmage on the 26). */
export const fieldZ = (metres: number) =>
  FIELD_GOAL.goalLineZ + (metres / YARD_M - 10) * FIELD_GOAL.yardUnits;

export type KickSpot = {
  /** Lateral position (m): a hash at ±2.82 or the middle. */
  x: number;
  /** Distance in front of the posts (m). */
  d: number;
  /** Constant lateral acceleration from the wind (m/s²). */
  wind: number;
};
export type Kick = { angle: number; power: number; spot: KickSpot };
export type KickResult = "Good" | "Wide left" | "Wide right" | "Short" | "Doink" | "Blocked";

/** Launch speed (m/s) for power 0–1. */
export const kickSpeed = (power: number) => 14 + Math.max(0, Math.min(1, power)) * 12;

export type KickFlight = {
  result: KickResult;
  /** Hit an upright or the crossbar on the way ("doink"). */
  hit: "post" | "crossbar" | null;
  /** Samples every FLIGHT_STEP s: x, y, d (metres). */
  path: Float32Array;
  /** Seconds until the ball crosses the plane of the posts (or lands). */
  crossT: number;
  /** Ball position at the plane (x, y), when it got there. */
  plane: [number, number] | null;
};
export const FLIGHT_STEP = 1 / 60;
const SUB = 4;

/**
 * Flies a kick to the end: through, wide, short, or off an upright or the
 * crossbar (reflected with restitution 0.55; it still counts if it then
 * crosses the plane inside the posts: "doink and in"). Allocates one path.
 */
export function simulateKick(kick: Kick): KickFlight {
  const F = FIELD_GOAL;
  const speed = kickSpeed(kick.power),
    horiz = Math.cos(F.loft) * speed;
  let x = kick.spot.x,
    y = F.tee,
    d = kick.spot.d;
  let vx = Math.sin(kick.angle) * horiz,
    vy = Math.sin(F.loft) * speed,
    vd = -Math.cos(kick.angle) * horiz;
  const R = F.ballRadius + F.postRadius;
  const dt = FLIGHT_STEP / SUB;
  const samples: number[] = [x, y, d];
  let hit: KickFlight["hit"] = null;
  let result: KickResult | null = null;
  let plane: [number, number] | null = null;
  let crossT = 0;
  for (let i = 1; i < 60 * 8 * SUB && result === null; i++) {
    const pd = d;
    vx += kick.spot.wind * dt;
    vy -= F.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    d += vd * dt;
    // Uprights: vertical cylinders at x = ±halfWidth on the plane d = 0.
    if (y > F.crossbar - 0.05 && y < F.crossbar + F.uprightHeight)
      for (const px of [-F.halfWidth, F.halfWidth]) {
        const nx = x - px,
          nd = d;
        const dist = Math.hypot(nx, nd);
        if (dist < R && dist > 1e-6) {
          const ux = nx / dist,
            ud = nd / dist;
          const vn = vx * ux + vd * ud;
          if (vn < 0) {
            vx -= (1 + F.restitution) * vn * ux;
            vd -= (1 + F.restitution) * vn * ud;
          }
          x = px + ux * R;
          d = ud * R;
          hit = "post";
        }
      }
    // Crossbar: a horizontal cylinder along x at y = crossbar, d = 0.
    if (Math.abs(x) < F.halfWidth) {
      const ny = y - F.crossbar,
        nd = d;
      const dist = Math.hypot(ny, nd);
      if (dist < R && dist > 1e-6) {
        const uy = ny / dist,
          ud = nd / dist;
        const vn = vy * uy + vd * ud;
        if (vn < 0) {
          vy -= (1 + F.restitution) * vn * uy;
          vd -= (1 + F.restitution) * vn * ud;
        }
        y = F.crossbar + uy * R;
        d = ud * R;
        hit ??= "crossbar";
      }
    }
    if (pd > 0 && d <= 0 && !plane) {
      const f = pd / (pd - d);
      const cx = x - vx * dt * (1 - f),
        cy = y - vy * dt * (1 - f);
      plane = [cx, cy];
      crossT = (i - 1 + f) * dt;
      if (cy - F.ballRadius <= F.crossbar && Math.abs(cx) < F.halfWidth) result = "Short";
      else if (cx <= -F.halfWidth) result = "Wide left";
      else if (cx >= F.halfWidth) result = "Wide right";
      else result = cy > F.crossbar ? "Good" : "Short";
    }
    if (result === null && y <= F.ballRadius) {
      // Landed in front of the posts: short, or knocked back by the iron.
      result = hit ? "Doink" : "Short";
      crossT = i * dt;
    }
    if (i % SUB === 0) samples.push(x, y, d);
  }
  // Keep flying a little after the plane so the scene can follow it in.
  if (result !== null && plane) {
    for (let i = 0; i < 40 * SUB && y > F.ballRadius; i++) {
      vx += kick.spot.wind * dt;
      vy -= F.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      d += vd * dt;
      if (i % SUB === 0) samples.push(x, Math.max(F.ballRadius, y), d);
    }
  }
  return { result: result ?? "Short", hit, path: Float32Array.from(samples), crossT, plane };
}

/** Where the ball crosses the plane, or null if it never does (quick, no posts). */
export function planeCrossing(kick: Kick): [number, number] | null {
  const F = FIELD_GOAL;
  const speed = kickSpeed(kick.power),
    horiz = Math.cos(F.loft) * speed;
  const vd = Math.cos(kick.angle) * horiz;
  if (vd <= 0) return null;
  const t = kick.spot.d / vd;
  const x = kick.spot.x + Math.sin(kick.angle) * horiz * t + 0.5 * kick.spot.wind * t * t;
  const y = F.tee + Math.sin(F.loft) * speed * t - 0.5 * F.gravity * t * t;
  return [x, y];
}
