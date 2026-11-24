import { ROOM } from "./room";

export type Partition = { x: number; z: number; width: number; depth: number };
export type RoomDoor = {
  x: number;
  z: number;
  width: number;
  axis: "x" | "z";
  label: string;
};

// Furnishings and collision share these exact footprints. Door openings are
// deliberately wide enough for both touch steering and the avatar's radius.
export const HOUSE_PARTITIONS: Record<string, readonly Partition[]> = {
  secret: [{ x: 0, z: -3, width: 4.8, depth: 3.1 }],
  kappa: [
    { x: -6.4, z: 1.2, width: 8.8, depth: 0.4 },
    { x: 6.4, z: 1.2, width: 8.8, depth: 0.4 },
    { x: 1.2, z: 2.6, width: 0.4, depth: 2.8 },
    { x: 1.2, z: 8.5, width: 0.4, depth: 3 },
  ],
  kitchen: [
    { x: -10.45, z: 0.5, width: 0.7, depth: 0.4 },
    { x: 0, z: 0.5, width: 14.4, depth: 0.4 },
    { x: 10.45, z: 0.5, width: 0.7, depth: 0.4 },
    { x: -5.4, z: -10.2, width: 0.4, depth: 4.6 },
    { x: -5.4, z: -2.3, width: 0.4, depth: 5.6 },
  ],
};
export const HOUSE_DOORS: Record<string, readonly RoomDoor[]> = {
  kappa: [
    { x: 0, z: 1.2, width: 4, axis: "x", label: "COMMON ROOM" },
    { x: 1.2, z: 5.5, width: 3, axis: "z", label: "PONG ROOM" },
  ],
  kitchen: [
    { x: -8.65, z: 0.5, width: 2.9, axis: "x", label: "PANTRY" },
    { x: 8.65, z: 0.5, width: 2.9, axis: "x", label: "KITCHEN" },
    { x: -5.4, z: -6.5, width: 2.8, axis: "z", label: "PANTRY" },
  ],
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export function moveInterior(
  scene: string,
  x: number,
  z: number,
  dx: number,
  dz: number,
): [number, number] {
  const walls = HOUSE_PARTITIONS[scene] ?? [];
  const blocked = (nextX: number, nextZ: number) =>
    walls.some(
      (wall) =>
        Math.abs(nextX - wall.x) < wall.width / 2 + 0.34 &&
        Math.abs(nextZ - wall.z) < wall.depth / 2 + 0.34,
    );
  // Substeps prevent a long frame/tap target from tunneling through a wall.
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.12),
  );
  for (let step = 0; step < steps; step++) {
    const nextX = clamp(x + dx / steps, -ROOM.walkX, ROOM.walkX);
    const nextZ = clamp(z + dz / steps, ROOM.minZ, ROOM.maxZ);
    if (!blocked(nextX, z)) x = nextX;
    if (!blocked(x, nextZ)) z = nextZ;
  }
  return [x, z];
}
