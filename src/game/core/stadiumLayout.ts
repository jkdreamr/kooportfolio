// Matches the scene-specific roomFor("stadium") movement/door contract.
export const STADIUM = {
  width: 40,
  depth: 60,
  fieldWidth: 20,
  fieldDepth: 48,
  fieldZ: -0.5,
  doorZ: 28.3,
  spawnZ: 26.5,
} as const;

// Ground-level footprints of the opaque bleachers, suite tower and entry rails.
// The shared interior mover adds avatar clearance and slides along these edges.
export const STADIUM_SOLIDS = [
  { x: -13.25, z: -0.5, width: 5.5, depth: 47.4 },
  { x: 13.25, z: -0.5, width: 5.5, depth: 47.4 },
  { x: -17.2, z: -1, width: 2.8, depth: 46 },
  { x: 0, z: -26.6, width: 22, depth: 3.8 },
  { x: -8.3, z: 25.9, width: 9.6, depth: 2.4 },
  { x: 8.3, z: 25.9, width: 9.6, depth: 2.4 },
  { x: -8.3, z: 27.6, width: 11.6, depth: 0.3 },
  { x: 8.3, z: 27.6, width: 11.6, depth: 0.3 },
] as const;
