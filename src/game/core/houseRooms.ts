import { roomFor } from "./room";
import { STADIUM_SOLIDS } from "./stadiumLayout";

const hall = roomFor("kappa");
const innerEdge = hall.width / 2 - 0.2;

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
  stadium: STADIUM_SOLIDS,
  secret: [{ x: 0, z: -3, width: 4.8, depth: 3.1 }],
  kappa: [
    { x: -(innerEdge + 2) / 2, z: 1.2, width: innerEdge - 2, depth: 0.4 },
    { x: (innerEdge + 2) / 2, z: 1.2, width: innerEdge - 2, depth: 0.4 },
    { x: 1.2, z: 2.6, width: 0.4, depth: 2.8 },
    {
      x: 1.2,
      z: (7 + hall.depth / 2) / 2,
      width: 0.4,
      depth: hall.depth / 2 - 7,
    },
  ],
  kitchen: [
    { x: -(innerEdge + 10.1) / 2, z: 0.5, width: innerEdge - 10.1, depth: 0.4 },
    { x: 0, z: 0.5, width: 14.4, depth: 0.4 },
    { x: (innerEdge + 10.1) / 2, z: 0.5, width: innerEdge - 10.1, depth: 0.4 },
    {
      x: -5.4,
      z: -(hall.depth / 2 + 7.9) / 2,
      width: 0.4,
      depth: hall.depth / 2 - 7.9,
    },
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
  const room = roomFor(scene);
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
    const nextX = clamp(x + dx / steps, -room.walkX, room.walkX);
    const nextZ = clamp(z + dz / steps, room.minZ, room.maxZ);
    if (!blocked(nextX, z)) x = nextX;
    if (!blocked(x, nextZ)) z = nextZ;
  }
  return [x, z];
}
