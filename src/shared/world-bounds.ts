// Persistence and movement must agree on the expanded island's coordinate range.
export const WORLD_BOUNDS = {
  minX: -68,
  maxX: 68,
  minZ: -58,
  maxZ: 82,
} as const;

export const WORLD_ELLIPSE = {
  radiusX: 69.5,
  radiusZ: 72.5,
  centerZ: 12,
} as const;
