// Trim the unused northern apron; persistence, terrain and movement agree.
export const WORLD_BOUNDS = {
  minX: -83,
  maxX: 83,
  minZ: -55,
  maxZ: 100,
} as const;

export const WORLD_ELLIPSE = {
  radiusX: 84.5,
  radiusZ: 79.5,
  centerZ: 22,
} as const;
