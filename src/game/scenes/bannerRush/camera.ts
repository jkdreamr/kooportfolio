/**
 * The fixed Banner Rush camera (§1.2): fit the arena into the safe rectangle,
 * and project between tiles and CSS pixels. Pure (three.js maths only), so
 * it is unit-tested; scratch objects live at module scope (no allocation in
 * screenToTile / tileToScreen).
 */
import * as THREE from "three";

/** 1 tile = 0.5 m. */
export const ARENA_SCALE = 0.5;
export const FOV = 32;
export type Layout = "phone" | "tablet" | "wide";
export type Insets = { top: number; bottom: number; left: number; right: number };
export type CameraFit = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
  /** Arena box on screen (CSS px). */
  box: { x0: number; x1: number; y0: number; y1: number };
  distanceTiles: number;
  aimZ: number;
};

export function layoutFor(width: number, height: number): Layout {
  const aspect = width / height;
  if (aspect >= 0.85) return "wide";
  return width < 600 ? "phone" : "tablet";
}

/** Safe insets of §1.2 (without env(safe-area-inset-*), which the caller adds). */
export function safeInsets(width: number, height: number): Insets {
  const layout = layoutFor(width, height);
  if (layout === "phone") {
    const small = width <= 360 && height <= 700;
    return { top: small ? 64 : 78, bottom: small ? 168 : 214, left: 2, right: 2 };
  }
  if (layout === "tablet") return { top: 84, bottom: 230, left: 60, right: 60 };
  if (height < 480) {
    const side = Math.max(24, (width - height * 0.62) / 2);
    return { top: 44, bottom: 100, left: side, right: side };
  }
  const side = Math.max(24, (width - height * 0.62) / 2);
  return { top: 64, bottom: 150, left: side, right: side };
}

const cam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 5000);
const v = new THREE.Vector3();
const probes: [number, number, number][] = [
  [-8.4, 0, -14.6],
  [8.4, 0, -14.6],
  [-8.4, 0, 14.6],
  [8.4, 0, 14.6],
  [-6.5, 3.6, -6.5],
  [6.5, 3.6, -6.5],
  [0, 5.4, -11],
];
export const PROBES: readonly (readonly [number, number, number])[] = probes;

function place(pitch: number, dist: number, aimZ: number, aspect: number) {
  cam.aspect = aspect;
  cam.fov = FOV;
  cam.position.set(0, Math.sin(pitch) * dist, aimZ + Math.cos(pitch) * dist);
  cam.lookAt(0, 0, aimZ);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
}

const box = { x0: 0, x1: 0, y0: 0, y1: 0 };
function measure(w: number, h: number) {
  box.x0 = 1e9;
  box.x1 = -1e9;
  box.y0 = 1e9;
  box.y1 = -1e9;
  for (const p of probes) {
    v.set(p[0], p[1], p[2]).project(cam);
    if (v.z > 1) return false;
    const sx = ((v.x + 1) / 2) * w,
      sy = ((1 - v.y) / 2) * h;
    if (sx < box.x0) box.x0 = sx;
    if (sx > box.x1) box.x1 = sx;
    if (sy < box.y0) box.y0 = sy;
    if (sy > box.y1) box.y1 = sy;
  }
  return true;
}
const fits = (w: number, h: number, safe: Insets) =>
  measure(w, h) && box.x0 >= safe.left && box.x1 <= w - safe.right && box.y0 >= safe.top && box.y1 <= h - safe.bottom;

/** Largest projected arena inside the safe rectangle (§1.2). Tiles in, metres out. */
export function fitCamera(width: number, height: number, safe: Insets = safeInsets(width, height)): CameraFit {
  const aspect = width / height;
  const pitch = THREE.MathUtils.degToRad(aspect >= 1.2 ? 56 : 58);
  let best: { dist: number; aimZ: number; area: number } | null = null;
  for (let aimZ = -3; aimZ <= 4 + 1e-9; aimZ += 0.125) {
    let lo = 15,
      hi = 400;
    place(pitch, hi, aimZ, aspect);
    if (!fits(width, height, safe)) continue;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      place(pitch, mid, aimZ, aspect);
      if (fits(width, height, safe)) hi = mid;
      else lo = mid;
    }
    place(pitch, hi, aimZ, aspect);
    measure(width, height);
    const area = (box.x1 - box.x0) * (box.y1 - box.y0);
    if (!best || area > best.area) best = { dist: hi, aimZ, area };
  }
  const dist = best?.dist ?? 80,
    aimZ = best?.aimZ ?? 0;
  place(pitch, dist, aimZ, aspect);
  measure(width, height);
  const s = ARENA_SCALE;
  return {
    position: [cam.position.x * s, cam.position.y * s, cam.position.z * s],
    target: [0, 0, aimZ * s],
    fov: FOV,
    near: 0.5,
    far: 120,
    box: { ...box },
    distanceTiles: dist,
    aimZ,
  };
}

/* ---------------------------------------------------------- projection */

/** The live pose used by screenToTile / tileToScreen (stage-local, metres). */
const pose = new THREE.PerspectiveCamera(FOV, 1, 0.5, 120);
const viewport = { w: 1, h: 1, left: 0, top: 0 };
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
export const tileOut = { x: 0.5, y: 0.5, ok: false };
export const screenOut = { x: 0.5, y: 0.5 };

/** Sets the fitted pose (call after each fit; never during a scripted move). */
export function setPose(fit: CameraFit, w: number, h: number, left = 0, top = 0) {
  pose.aspect = w / h;
  pose.fov = fit.fov;
  pose.near = fit.near;
  pose.far = fit.far;
  pose.position.set(fit.position[0], fit.position[1], fit.position[2]);
  pose.lookAt(fit.target[0], fit.target[1], fit.target[2]);
  pose.updateMatrixWorld();
  pose.updateProjectionMatrix();
  viewport.w = w;
  viewport.h = h;
  viewport.left = left;
  viewport.top = top;
}

/** Client pixel → tile (floats); writes tileOut. */
export function screenToTile(clientX: number, clientY: number) {
  ndc.set(((clientX - viewport.left) / viewport.w) * 2 - 1, -((clientY - viewport.top) / viewport.h) * 2 + 1);
  ray.setFromCamera(ndc, pose);
  tileOut.ok = !!ray.ray.intersectPlane(plane, hit);
  tileOut.x = hit.x / ARENA_SCALE + 8;
  tileOut.y = hit.z / ARENA_SCALE + 14;
  return tileOut;
}

/** Tile (and height in tiles) → client pixel; writes screenOut. */
export function tileToScreen(x: number, y: number, heightTiles = 0) {
  v.set((x - 8) * ARENA_SCALE, heightTiles * ARENA_SCALE, (y - 14) * ARENA_SCALE).project(pose);
  screenOut.x = viewport.left + ((v.x + 1) / 2) * viewport.w;
  screenOut.y = viewport.top + ((1 - v.y) / 2) * viewport.h;
  return screenOut;
}

/** Size of one tile in CSS px at (x, y) (horizontal). */
export function tilePixels(x: number, y: number) {
  const a = tileToScreen(x - 0.5, y).x;
  return tileToScreen(x + 0.5, y).x - a;
}
