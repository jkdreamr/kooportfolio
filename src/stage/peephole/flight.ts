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
