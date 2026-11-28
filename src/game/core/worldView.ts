import { create } from "zustand";

export const MIN_WORLD_ZOOM = 0.8;
export const MAX_WORLD_ZOOM = 14;

/** Explore (walk) view: third-person camera behind the player. */
export const MIN_EXPLORE_DISTANCE = 6;
export const MAX_EXPLORE_DISTANCE = 16;
/** Measured at 1440×900: the character (with hat) spans ~16.3% of the
 * viewport height at 10 (target 14–18%). */
export const DEFAULT_EXPLORE_DISTANCE = 10;

export type WorldViewMode = "diorama" | "explore";

export interface WorldViewState {
  /** Diorama zoom (0.8–14, 1 = whole island). Kept while in explore. */
  zoom: number;
  /** The view the visitor chose. The camera only follows it when the scene
   * allows (hub, no travel/train/game mode/photo booth): see viewRuntime. */
  view: WorldViewMode;
  /** Explore boom length in world units (6–16). */
  exploreDistance: number;
  /** The view stored in the save when the game booted (null: none yet, a
   * first-time or pre-explore visitor). The flight landing reads it. */
  savedView: WorldViewMode | null;
}

export const useWorldView = create<WorldViewState>(() => ({
  zoom: 1,
  view: "diorama",
  exploreDistance: DEFAULT_EXPLORE_DISTANCE,
  savedView: null,
}));

/**
 * Non-reactive per-frame view state. Walker (Hub.tsx) is the only writer;
 * every other system reads it. blend: 0 = diorama pose, 1 = explore pose.
 * effective: the view the camera is heading to this frame.
 */
export const viewRuntime: { blend: number; effective: WorldViewMode } = {
  blend: 0,
  effective: "diorama",
};

export const clampExploreDistance = (distance: number) =>
  Number.isFinite(distance)
    ? Math.max(MIN_EXPLORE_DISTANCE, Math.min(MAX_EXPLORE_DISTANCE, distance))
    : DEFAULT_EXPLORE_DISTANCE;

export function fitIsland() {
  useWorldView.setState({ zoom: 1 });
}

export function zoomWorld(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  useWorldView.setState(({ zoom }) => ({
    zoom: Math.max(MIN_WORLD_ZOOM, Math.min(MAX_WORLD_ZOOM, zoom * factor)),
  }));
}

/** Explore dolly: factor > 1 moves the camera closer (same sense as zoom). */
export function dollyExplore(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  useWorldView.setState(({ exploreDistance }) => ({
    exploreDistance: clampExploreDistance(exploreDistance / factor),
  }));
}

export function setView(view: WorldViewMode) {
  if (view !== "diorama" && view !== "explore") return;
  if (useWorldView.getState().view === view) return;
  useWorldView.setState({ view });
}

export function toggleView() {
  setView(useWorldView.getState().view === "explore" ? "diorama" : "explore");
}

/**
 * Village-view look-around: yaw around the island (radians, 0 = the painted
 * three-quarter overview) and a small pitch nudge on top of its elevation.
 * Non-reactive and mutated in place; WorldZoomInput writes drags, Hub's
 * frame steps inertia and reads the pose. The walk view always uses the
 * unrotated heading, so its controls never change under the player.
 */
export const ORBIT_PITCH_MIN = -0.1;
export const ORBIT_PITCH_MAX = 0.14;
/** Radians per CSS pixel of horizontal drag (a full turn ≈ 1.6 widths of 1440). */
export const ORBIT_YAW_PER_PIXEL = 0.0028;
const ORBIT_PITCH_PER_PIXEL = 0.0018;
/** Keyboard turn rate, radians per second. */
export const ORBIT_KEY_SPEED = 1.5;
/** Inertia half-life feel: velocity decays by e^(-dt * friction). */
const ORBIT_FRICTION = 4.5;
const ORBIT_MAX_SPIN = 4;

export const orbit = {
  yaw: 0,
  pitch: 0,
  /** Spin left after a release, radians per second. */
  velocity: 0,
  dragging: false,
  /** Easing back to the painted overview ("Whole island"). */
  homing: false,
};

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clampPitch = (pitch: number) =>
  Math.max(ORBIT_PITCH_MIN, Math.min(ORBIT_PITCH_MAX, pitch));

/** A drag step in CSS pixels over `dt` seconds (dt 0: unknown). */
export function orbitDrag(dx: number, dy: number, dt: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  orbit.homing = false;
  const turn = -dx * ORBIT_YAW_PER_PIXEL;
  orbit.yaw = wrap(orbit.yaw + turn);
  orbit.pitch = clampPitch(orbit.pitch + dy * ORBIT_PITCH_PER_PIXEL);
  if (dt > 0) {
    const sample = Math.max(-ORBIT_MAX_SPIN, Math.min(ORBIT_MAX_SPIN, turn / dt));
    // Low-pass the release speed so one jittery sample cannot fling it.
    orbit.velocity = orbit.velocity * 0.5 + sample * 0.5;
  }
}

export function orbitGrab() {
  orbit.dragging = true;
  orbit.homing = false;
  orbit.velocity = 0;
}

/** Let go: keep spinning (unless reduced motion), or stop dead. */
export function orbitRelease(reduced: boolean, idleMs = 0) {
  orbit.dragging = false;
  // A pause before lifting the finger means "put it here", not "fling".
  if (reduced || idleMs > 90) orbit.velocity = 0;
}

/** Turn back to the painted overview (eased, or at once for reduced motion). */
export function orbitHome(reduced = false) {
  orbit.velocity = 0;
  orbit.dragging = false;
  if (reduced) {
    orbit.yaw = 0;
    orbit.pitch = 0;
    orbit.homing = false;
  } else orbit.homing = orbit.yaw !== 0 || orbit.pitch !== 0;
}

/** Drop the look-around at once (another controller owns the camera). */
export function orbitReset() {
  const moved = orbit.yaw !== 0 || orbit.pitch !== 0;
  orbit.yaw = orbit.pitch = orbit.velocity = 0;
  orbit.dragging = orbit.homing = false;
  return moved;
}

/** One frame: keys (-1..1, + turns the view right), inertia, homing. */
export function stepOrbit(dt: number, key: number, reduced: boolean) {
  if (key !== 0) {
    orbit.homing = false;
    orbit.velocity = 0;
    orbit.yaw = wrap(orbit.yaw - key * ORBIT_KEY_SPEED * dt);
    return;
  }
  if (orbit.homing) {
    const k = 1 - Math.exp(-dt * 5);
    orbit.yaw = wrap(orbit.yaw * (1 - k));
    orbit.pitch *= 1 - k;
    if (Math.abs(orbit.yaw) < 1e-4 && Math.abs(orbit.pitch) < 1e-4) {
      orbit.yaw = orbit.pitch = 0;
      orbit.homing = false;
    }
    return;
  }
  if (orbit.dragging || orbit.velocity === 0) return;
  if (reduced) {
    orbit.velocity = 0;
    return;
  }
  orbit.yaw = wrap(orbit.yaw + orbit.velocity * dt);
  orbit.velocity *= Math.exp(-dt * ORBIT_FRICTION);
  if (Math.abs(orbit.velocity) < 0.01) orbit.velocity = 0;
}
