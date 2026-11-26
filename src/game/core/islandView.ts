// The fixed three-quarter overview direction, shared by the camera fit and by
// world art that must read from it. Plain numbers: no Three.js objects to mutate.
export const ISLAND_CAMERA_OFFSET = [70, 85, 95] as const;

const length = Math.hypot(...ISLAND_CAMERA_OFFSET);
const direction = ISLAND_CAMERA_OFFSET.map((value) => value / length);
const flat = Math.hypot(direction[0], direction[2]);
/** Screen-right, in world space (horizontal). */
export const ISLAND_SCREEN_RIGHT = [
  direction[2] / flat,
  0,
  -direction[0] / flat,
] as const;
/** Screen-up, in world space (the camera's up vector). */
export const ISLAND_SCREEN_UP = [
  direction[1] * ISLAND_SCREEN_RIGHT[2] - direction[2] * ISLAND_SCREEN_RIGHT[1],
  direction[2] * ISLAND_SCREEN_RIGHT[0] - direction[0] * ISLAND_SCREEN_RIGHT[2],
  direction[0] * ISLAND_SCREEN_RIGHT[1] - direction[1] * ISLAND_SCREEN_RIGHT[0],
] as const;
/** Horizontal unit vector that moves a ground point straight down the screen. */
export const ISLAND_SCREEN_DOWN_GROUND = [
  -ISLAND_SCREEN_UP[0] / Math.hypot(ISLAND_SCREEN_UP[0], ISLAND_SCREEN_UP[2]),
  0,
  -ISLAND_SCREEN_UP[2] / Math.hypot(ISLAND_SCREEN_UP[0], ISLAND_SCREEN_UP[2]),
] as const;

/** Orthographic screen offsets (world units at zoom 1) of a world-space vector. */
export const projectRight = (x: number, y: number, z: number) =>
  x * ISLAND_SCREEN_RIGHT[0] + y * ISLAND_SCREEN_RIGHT[1] + z * ISLAND_SCREEN_RIGHT[2];
export const projectUp = (x: number, y: number, z: number) =>
  x * ISLAND_SCREEN_UP[0] + y * ISLAND_SCREEN_UP[1] + z * ISLAND_SCREEN_UP[2];
