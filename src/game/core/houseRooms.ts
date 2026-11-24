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

export const COGNITION_OFFICE_WALL = { x: -2.1, z: 9.6, width: 7.8, depth: 0.36 };

// Furnishings and collision share these exact footprints. Door openings are
// deliberately wide enough for both touch steering and the avatar's radius.
export const HOUSE_PARTITIONS: Record<string, readonly Partition[]> = {
  cognition: [COGNITION_OFFICE_WALL],
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

// Floor taps and Exit use the same collision geometry as manual walking.
// A half-unit grid fits through every door; edges are checked by the mover,
// so a route can never cut diagonally through a partition or seating corner.
export function findInteriorPath(
  scene: string,
  start: [number, number],
  end: [number, number],
): [number, number][] {
  const room = roomFor(scene);
  const goal: [number, number] = [
    clamp(end[0], -room.walkX, room.walkX),
    clamp(end[1], room.minZ, room.maxZ),
  ];
  const reaches = (from: [number, number], to: [number, number]) => {
    const moved = moveInterior(scene, ...from, to[0] - from[0], to[1] - from[1]);
    return Math.hypot(moved[0] - to[0], moved[1] - to[1]) < 0.00001;
  };
  if (reaches(start, goal)) return [goal];
  if ((HOUSE_PARTITIONS[scene] ?? []).some((wall) =>
    Math.abs(goal[0] - wall.x) < wall.width / 2 + 0.34 &&
    Math.abs(goal[1] - wall.z) < wall.depth / 2 + 0.34,
  )) return [];

  const grid = 0.5;
  const queue: [number, number][] = [[0, 0]];
  const key = (x: number, z: number) => `${x},${z}`;
  const parents = new Map<string, [number, number] | null>([["0,0", null]]);
  const point = ([x, z]: [number, number]): [number, number] =>
    [start[0] + x * grid, start[1] + z * grid];
  for (let head = 0; head < queue.length && head < 12000; head++) {
    const node = queue[head];
    const from = point(node);
    if (Math.hypot(from[0] - goal[0], from[1] - goal[1]) <= grid && reaches(from, goal)) {
      const route: [number, number][] = [goal];
      let current: [number, number] | null = node;
      while (current && parents.get(key(...current))) {
        route.unshift(point(current));
        current = parents.get(key(...current))!;
      }
      return route;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next: [number, number] = [node[0] + dx, node[1] + dz];
      const nextKey = key(...next);
      if (parents.has(nextKey)) continue;
      const to = point(next);
      if (to[0] < -room.walkX || to[0] > room.walkX || to[1] < room.minZ || to[1] > room.maxZ || !reaches(from, to)) continue;
      parents.set(nextKey, node);
      queue.push(next);
    }
  }
  return [];
}
