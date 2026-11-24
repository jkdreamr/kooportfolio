// Persistence and movement must agree on the expanded island's coordinate range.
export const WORLD_BOUNDS = {
  minX: -68,
  maxX: 68,
  minZ: -56,
  maxZ: 56,
} as const;

export const WORLD_ELLIPSE = {
  radiusX: 69.5,
  radiusZ: 57.5,
  centerZ: -1,
} as const;
