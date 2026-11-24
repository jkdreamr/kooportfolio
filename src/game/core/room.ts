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

// Furnishings and avatars keep their original scale. These are genuinely larger
// walkable halls, not a scaled-down miniature of the old room.
const HALL = {
  width: 34,
  depth: 40,
  walkX: 16.2,
  minZ: -18.8,
  maxZ: 18.8,
  doorZ: 18.3,
  spawnZ: 16.5,
} as const;

const STADIUM = {
  width: 40,
  depth: 60,
  walkX: 19,
  minZ: -28.8,
  maxZ: 28.8,
  doorZ: 28.3,
  spawnZ: 26.5,
} as const;

export type RoomLayout = { [K in keyof typeof ROOM]: number };

export function roomFor(scene: string): RoomLayout {
  if (scene === "stadium") return STADIUM;
  // The hidden tower vault is deliberately intimate, rather than a sports hall.
  return scene === "secret" ? ROOM : HALL;
}
