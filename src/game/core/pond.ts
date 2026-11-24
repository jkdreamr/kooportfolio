export const POND = { x: -26, z: 42, radiusX: 6, radiusZ: 4 } as const;

// The old bed and water both ended at y=.22, producing triangular z-fighting.
// Give the water its own depth interval, above both the bed and the lawn.
export const POND_SURFACE = {
  bedY: 0.13,
  bedDepth: 0.12,
  waterY: 0.235,
  waterDepth: 0.04,
} as const;
