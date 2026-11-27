/**
 * Camera choreography for the reveal, pure (tuples only, no three): the peek
 * pose that frames the miniature village under the "o", and the control poses
 * of the flight through the opening into the gameplay follow pose.
 */
import type { CameraPose, Vec3 } from "../contract";

type V = [number, number, number];
const sub = (a: Vec3, b: Vec3): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): V => scale(a, 1 / (len(a) || 1));
const cross = (a: Vec3, b: Vec3): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp3 = (a: Vec3, b: Vec3, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Camera basis as three.js lookAt builds it (up = +Y). */
export function basis(forward: Vec3) {
  const f = norm(forward);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  return { f, r, u };
}
const forwardOf = (yaw: number, pitch: number): V => [
  Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  -Math.cos(yaw) * Math.cos(pitch),
];
const yawOf = (d: Vec3) => Math.atan2(d[0], -d[2]);
const pitchOf = (d: Vec3) => Math.asin(Math.max(-1, Math.min(1, norm(d)[1])));

/** World direction of the ray through NDC (nx, ny) for a camera looking along `forward`. */
export function rayThrough(forward: Vec3, nx: number, ny: number, fovDeg: number, aspect: number) {
  const { f, r, u } = basis(forward);
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return norm(add(add(f, scale(r, nx * t * aspect)), scale(u, ny * t)));
}

/**
 * The look target for a camera at `position` such that world point `subject`
 * lands on NDC (nx, ny). The returned target lies on the optical axis at the
 * subject's distance, so splining targets stays well-behaved.
 */
export function aimThrough(
  position: Vec3,
  subject: Vec3,
  nx: number,
  ny: number,
  fovDeg: number,
  aspect: number,
): V {
  const want = sub(subject, position);
  let yaw = yawOf(want);
  let pitch = pitchOf(want);
  for (let i = 0; i < 24; i++) {
    const got = rayThrough(forwardOf(yaw, pitch), nx, ny, fovDeg, aspect);
    yaw += angleDiff(yawOf(want), yawOf(got));
    pitch += pitchOf(want) - pitchOf(got);
    pitch = Math.max(-1.55, Math.min(1.55, pitch));
  }
  return add(position, scale(forwardOf(yaw, pitch), len(want)));
}
function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Project a world point to NDC for a pose (for tests and hole-follow maths). */
export function project(pose: CameraPose, p: Vec3, aspect: number) {
  const { f, r, u } = basis(sub(pose.target, pose.position));
  const d = sub(p, pose.position);
  const z = dot(d, f);
  const t = Math.tan((pose.fov * Math.PI) / 360);
  return { x: dot(d, r) / (z * t * aspect), y: dot(d, u) / (z * t), depth: z };
}

export type Viewport = { width: number; height: number };
/** CSS px (top-left origin) → NDC. */
export const toNdc = (x: number, y: number, vp: Viewport) => ({
  x: (x / vp.width) * 2 - 1,
  y: 1 - (y / vp.height) * 2,
});

export type PeekScene = {
  /** The miniature's centre (home island). */
  subject: Vec3;
  /** Direction the gameplay camera looks from (target → camera), any length. */
  approach: Vec3;
};

/** Peek lens and elevation: high above the island, a long lens for miniature. */
export const PEEK_FOV = 30;
export const PEEK_DISTANCE = 230;

/**
 * The pose looking down on the island, aimed so `subject` appears exactly in
 * the hole at screen point (hx, hy). Same azimuth as gameplay, steeper.
 */
export function peekPose(scene: PeekScene, hole: { x: number; y: number }, vp: Viewport): CameraPose {
  const flat = norm([scene.approach[0], 0, scene.approach[2]]);
  const elev = (58 * Math.PI) / 180;
  const dir: V = [flat[0] * Math.cos(elev), Math.sin(elev), flat[2] * Math.cos(elev)];
  const position = add(scene.subject, scale(dir, PEEK_DISTANCE));
  const ndc = toNdc(hole.x, hole.y, vp);
  const target = aimThrough(position, scene.subject, ndc.x, ndc.y, PEEK_FOV, vp.width / vp.height);
  return { position, target, fov: PEEK_FOV, roll: 0 };
}

/**
 * Control poses for the flight. `live` is the gameplay follow pose (last
 * control point; the rig blends into the moving live pose at the end).
 *  1. peek
 *  2. through the opening: forward along the ray under the hole, recentring
 *  3. a high, banked pass over the island
 *  4. a low glide over the roofs toward the player
 *  5. live
 */
export function flightPoses(peek: CameraPose, live: CameraPose, scene: PeekScene): CameraPose[] {
  const subject = scene.subject;
  const toSubject = sub(subject, peek.position);
  // 1 → 2: push 38% of the way to the subject, swinging the aim to centre.
  const throughPos = add(peek.position, scale(toSubject, 0.38));
  const throughTarget = lerp3(peek.target, subject, 0.7);
  const player = live.target;
  const liveOffset = sub(live.position, live.target);
  const liveDist = len(liveOffset);
  const flat = norm([liveOffset[0], 0, liveOffset[2]]);
  const side = norm(cross([0, 1, 0], flat));
  // 3: high over the island, offset to one side so the path arcs, not dives.
  const mid = lerp3(subject, player, 0.35);
  const highPos = add(
    add(live.position, scale(sub(mid, player), 0.9)),
    add([0, liveDist * 0.85, 0], add(scale(flat, liveDist * 0.35), scale(side, liveDist * 0.3))),
  );
  // 4: low over the roofs, closing on the follow direction from above it.
  const lowPos = add(live.position, add([0, liveDist * 0.22, 0], add(scale(flat, liveDist * 0.12), scale(side, liveDist * 0.09))));
  const lowTarget = lerp3(player, mid, 0.18);
  const bank = (3.5 * Math.PI) / 180;
  return [
    { ...peek, roll: 0 },
    { position: throughPos, target: throughTarget, fov: (peek.fov + 34) / 2 + 2, roll: 0 },
    { position: highPos, target: lerp3(subject, player, 0.6), fov: 28, roll: -bank },
    { position: lowPos, target: lowTarget, fov: (28 + live.fov) / 2, roll: -bank * 0.4 },
    { ...live, roll: live.roll ?? 0 },
  ];
}

/* ------------------------------------------------- transition timeline */

/** Seconds from the commit. */
export const TIMELINE = {
  seam: 0.45,
  curlStart: 0.18,
  curl: 0.9,
  cameraStart: 0.25,
} as const;

/* --------------------------------------------- clear path through props */

/** Footprint a flight must clear: [centre x, centre z, half x, half z, top y]. */
export type Obstacle = readonly [cx: number, cz: number, halfX: number, halfZ: number, topY: number];

/** Quintic smootherstep: zero velocity and acceleration at both ends. */
export function smootherstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Centripetal Catmull-Rom through `points` at parameter u ∈ [0, 1]
 * (uniform in control-point index, like three's CatmullRomCurve3.getPoint). */
export function catmullRom(points: readonly Vec3[], u: number): V {
  const n = points.length;
  if (n === 1) return [...points[0]] as V;
  const p = (n - 1) * Math.min(1, Math.max(0, u));
  let i = Math.floor(p);
  let w = p - i;
  if (i >= n - 1) {
    i = n - 2;
    w = 1;
  }
  const p1 = points[i];
  const p2 = points[i + 1];
  const p0: Vec3 = i > 0 ? points[i - 1] : sub(scale(p1, 2), p2);
  const p3: Vec3 = i + 2 < n ? points[i + 2] : sub(scale(p2, 2), p1);
  const d = (a: Vec3, b: Vec3) => Math.max(Math.sqrt(len(sub(a, b))), 1e-4);
  let dt0 = d(p0, p1);
  let dt1 = d(p1, p2);
  let dt2 = d(p2, p3);
  if (dt1 < 1e-4) dt1 = 1;
  if (dt0 < 1e-4) dt0 = dt1;
  if (dt2 < 1e-4) dt2 = dt1;
  const out: V = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    let t1 = (p1[k] - p0[k]) / dt0 - (p2[k] - p0[k]) / (dt0 + dt1) + (p2[k] - p1[k]) / dt1;
    let t2 = (p2[k] - p1[k]) / dt1 - (p3[k] - p1[k]) / (dt1 + dt2) + (p3[k] - p2[k]) / dt2;
    t1 *= dt1;
    t2 *= dt1;
    const c0 = p1[k];
    const c1 = t1;
    const c2 = -3 * p1[k] + 3 * p2[k] - 2 * t1 - t2;
    const c3 = 2 * p1[k] - 2 * p2[k] + t1 + t2;
    out[k] = c0 + w * (c1 + w * (c2 + w * c3));
  }
  return out;
}

/** Clearance kept round an obstacle's footprint and above its top. */
export const FLIGHT_MARGIN = 1.5;
export const FLIGHT_LIFT = 2.0;
export const FLIGHT_SAMPLES = 48;

/** Lowest height a camera at (x, z) may fly: obstacle tops + FLIGHT_LIFT
 * inside footprints grown by FLIGHT_MARGIN, else -Infinity. */
export function flightFloor(x: number, z: number, obstacles: readonly Obstacle[]) {
  let floor = -Infinity;
  for (const [cx, cz, hx, hz, top] of obstacles)
    if (Math.abs(x - cx) < hx + FLIGHT_MARGIN && Math.abs(z - cz) < hz + FLIGHT_MARGIN)
      floor = Math.max(floor, top + FLIGHT_LIFT);
  return floor;
}

/**
 * The flight resampled at FLIGHT_SAMPLES poses with every camera position
 * lifted clear of the obstacles, then the heights round the lift relaxed
 * with three passes of a 1-2-1 kernel (ends fixed, never lowered, never back
 * under the floor), so the camera
 * rises over a pergola instead of flying through its beams. Targets, fov
 * and roll are sampled at the same parameter.
 */
export function clearFlightPath(
  poses: readonly CameraPose[],
  obstacles: readonly Obstacle[],
  samples = FLIGHT_SAMPLES,
): CameraPose[] {
  const positions = poses.map((p) => p.position);
  const targets = poses.map((p) => p.target);
  const out: CameraPose[] = [];
  for (let s = 0; s < samples; s++) {
    const u = s / (samples - 1);
    const scaled = u * (poses.length - 1);
    const i = Math.min(poses.length - 2, Math.floor(scaled));
    const w = scaled - i;
    out.push({
      position: catmullRom(positions, u),
      target: catmullRom(targets, u),
      fov: poses[i].fov + (poses[i + 1].fov - poses[i].fov) * w,
      roll: (poses[i].roll ?? 0) + ((poses[i + 1].roll ?? 0) - (poses[i].roll ?? 0)) * w,
    });
  }
  if (!obstacles.length) return out;
  const floors = out.map((p) => flightFloor(p.position[0], p.position[2], obstacles));
  const lifted = out.map((p, i) => floors[i] > p.position[1]);
  if (!lifted.some(Boolean)) return out;
  const heights = out.map((p, i) => Math.max(p.position[1], floors[i]));
  // Relax only around the lift (a few samples either side), raise-only, so
  // the rest of the flight is exactly the designed one.
  const near = lifted.map((_, i) => lifted.slice(Math.max(0, i - 4), i + 5).some(Boolean));
  for (let pass = 0; pass < 3; pass++) {
    const prev = heights.slice();
    for (let i = 1; i < heights.length - 1; i++)
      if (near[i]) heights[i] = Math.max(floors[i], out[i].position[1], (prev[i - 1] + 2 * prev[i] + prev[i + 1]) / 4);
  }
  // The ends stay exactly where they were (the peek, the live pose).
  heights[0] = out[0].position[1];
  heights[heights.length - 1] = out[out.length - 1].position[1];
  return out.map((p, i) => ({ ...p, position: [p.position[0], heights[i], p.position[2]] }));
}

/* ------------------------------------------------- haze at the peek */

/** Fog for the peek: the island centre at distance d stays nearly clear. */
export function peekFog(d: number) {
  return { near: Math.max(1, d - 60), far: d + 420 };
}
/** Fog for this frame: peek haze blended into the gameplay values by w (0..1). */
export function blendFog(peek: { near: number; far: number }, live: { near: number; far: number }, w: number) {
  const k = Math.min(1, Math.max(0, w));
  return { near: peek.near + (live.near - peek.near) * k, far: peek.far + (live.far - peek.far) * k };
}
