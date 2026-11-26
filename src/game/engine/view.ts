import * as THREE from "three";
import {
  TELEPHOTO_FOV,
  distanceToZoom,
  zoomToDistance,
} from "../../stage/contract";

/**
 * The two hub views as pure camera maths (no per-frame allocation).
 *
 * - diorama: the fixed three-quarter telephoto overview (fov 20) along
 *   ISLAND_CAMERA_OFFSET; its zoom is the old orthographic zoom.
 * - explore: a low third-person camera behind the player, on the same
 *   azimuth so movement input, click-to-walk and door prompts are unchanged.
 *
 * The blend between them is parametric (elevation, azimuth, target, fov and
 * log(distance·tan(fov/2)), i.e. the on-screen subject size), never a
 * position lerp: a position lerp between a far telephoto and a close wide
 * lens dolly-zooms and can dip under the ground.
 */
export interface ViewPose {
  /** Look-at point. */
  target: THREE.Vector3;
  /** Unit vector from the target to the camera. */
  direction: THREE.Vector3;
  distance: number;
  /** Vertical field of view, degrees. */
  fov: number;
}

export const makeViewPose = (): ViewPose => ({
  target: new THREE.Vector3(),
  direction: new THREE.Vector3(0, 0, 1),
  distance: 1,
  fov: TELEPHOTO_FOV,
});

export function copyViewPose(out: ViewPose, from: ViewPose) {
  out.target.copy(from.target);
  out.direction.copy(from.direction);
  out.distance = from.distance;
  out.fov = from.fov;
  return out;
}

/** Explore lens and boom (desktop / landscape). */
export const EXPLORE_FOV = 42;
/** Mobile portrait: wider lens, slightly longer boom. */
export const EXPLORE_FOV_PORTRAIT = 50;
export const EXPLORE_PORTRAIT_DISTANCE_SCALE = 1.1;
export const EXPLORE_ELEVATION = (12 * Math.PI) / 180;
/** Look point above the player's feet and its shift to screen-right, so the
 * character sits left of centre with the horizon in the upper third. */
export const EXPLORE_LOOK_HEIGHT = 1.4;
export const EXPLORE_LOOK_RIGHT = 0.8;
/** Boom safety limits. */
export const BOOM_MIN_DISTANCE = 3.5;
export const BOOM_MAX_ELEVATION = (30 * Math.PI) / 180;
/** Seconds for a full view toggle (reduced motion: 0.15). */
export const VIEW_BLEND_SECONDS = 0.9;
export const VIEW_BLEND_SECONDS_REDUCED = 0.15;

/** Lens and boom scale for a viewport. */
export function exploreLens(width: number, height: number) {
  const portrait = width < 700 && height > width;
  return portrait
    ? { fov: EXPLORE_FOV_PORTRAIT, distanceScale: EXPLORE_PORTRAIT_DISTANCE_SCALE }
    : { fov: EXPLORE_FOV, distanceScale: 1 };
}

/**
 * The diorama pose: exactly what `aimCamera` computes for a perspective
 * camera (target, normalised offset, zoomToDistance at the lens).
 */
export function dioramaPose(
  out: ViewPose,
  look: THREE.Vector3Like,
  offset: THREE.Vector3Like,
  zoom: number,
  viewportHeight: number,
  fov = TELEPHOTO_FOV,
) {
  out.target.set(look.x, look.y, look.z);
  out.direction.set(offset.x, offset.y, offset.z).normalize();
  out.distance = zoomToDistance(zoom, Math.max(1, viewportHeight), fov);
  out.fov = fov;
  return out;
}

/** Unit direction for an azimuth (atan2(x, z) of the horizontal offset) and
 * an elevation above the horizon. */
export function directionFor(
  out: THREE.Vector3,
  azimuth: number,
  elevation: number,
) {
  const flat = Math.cos(elevation);
  return out.set(
    Math.sin(azimuth) * flat,
    Math.sin(elevation),
    Math.cos(azimuth) * flat,
  );
}

export const azimuthOf = (offset: THREE.Vector3Like) =>
  Math.atan2(offset.x, offset.z);

/**
 * The explore pose behind `player` (feet position), looking along the
 * diorama azimuth of `offset`. `distance` is the boom length, `elevation`
 * the boom angle (EXPLORE_ELEVATION unless the boom is being kept clear).
 */
export function explorePose(
  out: ViewPose,
  player: THREE.Vector3Like,
  offset: THREE.Vector3Like,
  distance: number,
  fov: number,
  elevation = EXPLORE_ELEVATION,
) {
  const azimuth = azimuthOf(offset);
  // Screen-right of a camera looking along -direction (horizontal).
  const rightX = Math.cos(azimuth),
    rightZ = -Math.sin(azimuth);
  out.target.set(
    player.x + rightX * EXPLORE_LOOK_RIGHT,
    player.y + EXPLORE_LOOK_HEIGHT,
    player.z + rightZ * EXPLORE_LOOK_RIGHT,
  );
  directionFor(out.direction, azimuth, elevation);
  out.distance = distance;
  out.fov = fov;
  return out;
}

const halfTan = (fov: number) => Math.tan((fov * Math.PI) / 360);
const shortest = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Parametric mix of two poses. b = 0 returns `a` exactly (bit-identical),
 * b = 1 returns `b` exactly. In between: elevation, azimuth, target and fov
 * interpolate linearly and the framed height (distance·tan(fov/2)) log-
 * linearly, so on-screen subject size changes monotonically.
 */
export function mixView(out: ViewPose, a: ViewPose, b: ViewPose, t: number) {
  if (t <= 0) return copyViewPose(out, a);
  if (t >= 1) return copyViewPose(out, b);
  const elevationA = Math.asin(THREE.MathUtils.clamp(a.direction.y, -1, 1)),
    elevationB = Math.asin(THREE.MathUtils.clamp(b.direction.y, -1, 1));
  const azimuthA = Math.atan2(a.direction.x, a.direction.z),
    azimuthB = Math.atan2(b.direction.x, b.direction.z);
  const fov = a.fov + (b.fov - a.fov) * t;
  const sizeA = Math.log(a.distance * halfTan(a.fov)),
    sizeB = Math.log(b.distance * halfTan(b.fov));
  out.target.lerpVectors(a.target, b.target, t);
  directionFor(
    out.direction,
    azimuthA + shortest(azimuthA, azimuthB) * t,
    elevationA + (elevationB - elevationA) * t,
  );
  out.distance = Math.exp(sizeA + (sizeB - sizeA) * t) / halfTan(fov);
  out.fov = fov;
  return out;
}

/** Smootherstep, the blend curve of a view toggle. */
export function easeView(progress: number) {
  const x = Math.min(1, Math.max(0, progress));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Advance a toggle's raw progress (0 = diorama, 1 = explore) toward
 * `toward` (0 or 1). Toggling mid-blend just reverses from where it is.
 */
export function stepViewProgress(
  progress: number,
  toward: number,
  delta: number,
  seconds: number,
) {
  const step = delta / Math.max(1e-3, seconds);
  return toward > progress
    ? Math.min(toward, progress + step)
    : Math.max(toward, progress - step);
}

/** Boom samples per check (from near the target out to the camera). */
const BOOM_SAMPLES = 5;
/** Candidate boom fractions, longest first. */
const BOOM_STEPS = [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0] as const;
const boomDirection = new THREE.Vector3();

/**
 * Longest clear boom for the explore camera. `blocked(x, z, y)` reports a
 * solid (building footprint, raised relief) at a sample point. When the full
 * boom is blocked the camera comes closer (never under BOOM_MIN_DISTANCE)
 * and rises (up to BOOM_MAX_ELEVATION). Writes `out` and returns it.
 */
export function clearBoom(
  out: { distance: number; elevation: number },
  target: THREE.Vector3Like,
  azimuth: number,
  distance: number,
  blocked: (x: number, z: number, y: number) => boolean,
) {
  const span = Math.max(0, distance - BOOM_MIN_DISTANCE);
  for (let step = 0; step < BOOM_STEPS.length; step++) {
    const fraction = BOOM_STEPS[step];
    const length = BOOM_MIN_DISTANCE + span * fraction;
    const lift = span > 0 ? 1 - (length - BOOM_MIN_DISTANCE) / span : 0;
    const elevation =
      EXPLORE_ELEVATION + (BOOM_MAX_ELEVATION - EXPLORE_ELEVATION) * lift;
    directionFor(boomDirection, azimuth, elevation);
    let clear = true;
    for (let i = 1; i <= BOOM_SAMPLES && clear; i++) {
      const s = (length * i) / BOOM_SAMPLES;
      if (
        blocked(
          target.x + boomDirection.x * s,
          target.z + boomDirection.z * s,
          target.y + boomDirection.y * s,
        )
      )
        clear = false;
    }
    if (clear || fraction === 0) {
      out.distance = length;
      out.elevation = elevation;
      return out;
    }
  }
  return out;
}

/**
 * Write a pose to a perspective camera, recording the equivalent old ortho
 * zoom (`userData.viewZoom`) and distance so the marker, the engine and
 * `rig.readPose` keep working in either view.
 */
export function applyViewPose(
  camera: THREE.PerspectiveCamera,
  pose: ViewPose,
  viewportHeight: number,
) {
  const { target, direction, distance } = pose;
  camera.position.set(
    target.x + direction.x * distance,
    target.y + direction.y * distance,
    target.z + direction.z * distance,
  );
  camera.lookAt(target.x, target.y, target.z);
  camera.userData.viewZoom = distanceToZoom(
    distance,
    Math.max(1, viewportHeight),
    pose.fov,
  );
  camera.userData.viewDistance = distance;
  const near = Math.max(0.1, distance * 0.04);
  const far = distance + 700;
  if (camera.fov !== pose.fov || camera.near !== near || camera.far !== far) {
    camera.fov = pose.fov;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}
