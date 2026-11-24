// One source of truth for the shell, walking bounds, spawn, and physical exit.
export const ROOM = {
  width: 22,
  depth: 26,
  walkX: 10.2,
  minZ: -11.8,
  maxZ: 11.8,
  doorZ: 11.3,
  spawnZ: 9.5,
} as const;
