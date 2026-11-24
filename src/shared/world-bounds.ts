// Persistence and movement must agree on the expanded island's coordinate range.
export const WORLD_BOUNDS = {
  minX: -83,
  maxX: 83,
  minZ: -76,
  maxZ: 100,
} as const;

export const WORLD_ELLIPSE = {
  radiusX: 84.5,
  radiusZ: 89.5,
  centerZ: 12,
} as const;
