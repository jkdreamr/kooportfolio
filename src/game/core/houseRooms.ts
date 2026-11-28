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

/** x of the wall between Kappa's front room and its Pong Room. */
const KAPPA_PONG_X = 2.6;
export const COGNITION_OFFICE_WALL = { x: -2.1, z: 9.6, width: 7.8, depth: 0.36 };
/** The Town Hall's long table with its benches (the village model sits on
 * it; Banner Rush is played from its foot). */
export const TOWN_HALL_TABLE = { x: 0, z: -5, width: 5.6, depth: 9.6 };
/** Its hearth against the west wall. */
export const TOWN_HALL_HEARTH = { x: -16.3, z: -4, width: 1.8, depth: 4.6 };
/** Its four round stone columns. */
export const TOWN_HALL_COLUMNS = [-8.5, 8.5].flatMap((x) =>
  [-9, 3].map((z) => ({ x, z, width: 1.6, depth: 1.6 })),
);

// Furnishings and collision share these exact footprints. Door openings are
// deliberately wide enough for both touch steering and the avatar's radius.
export const HOUSE_PARTITIONS: Record<string, readonly Partition[]> = {
  cognition: [COGNITION_OFFICE_WALL],
  townhall: [TOWN_HALL_TABLE, ...TOWN_HALL_COLUMNS, TOWN_HALL_HEARTH],
  stadium: STADIUM_SOLIDS,
  secret: [{ x: 0, z: -3, width: 4.8, depth: 3.1 }],
  kappa: [
    { x: -(innerEdge + 2) / 2, z: 1.2, width: innerEdge - 2, depth: 0.4 },
    { x: (innerEdge + 2) / 2, z: 1.2, width: innerEdge - 2, depth: 0.4 },
    // The Pong Room wall meets the Common Room wall on solid wall, just past
    // that doorway's right post (2.0-2.4), and runs to the cut-away front
    // edge clear of the exit arch (posts at x = +-1.7).
    { x: KAPPA_PONG_X, z: 2.6, width: 0.4, depth: 2.8 },
    {
      x: KAPPA_PONG_X,
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
/**
 * Low dividing walls that split the bigger halls into a front and a back
 * room, each with its own purpose. A divider runs along x at `z`; `runs` are
 * its solid stretches (it stops where furniture already stands), `doors` the
 * centres of its open archways (DIVIDER_DOOR clear) (drawn by scenes/life/rooms/dividers.ts).
 * Kept at the partitions' 1.44 m so the camera reads both rooms over it.
 */
export type RoomDivider = {
  z: number;
  doors: readonly number[];
  runs: readonly (readonly [number, number])[];
};
export const DIVIDER_DEPTH = 0.36;
/** The clear width of every archway: runs end exactly DIVIDER_DOOR / 2 either
 * side of a door's centre, and the arch posts stand on those ends. */
export const DIVIDER_DOOR = 3.2;
export const ROOM_DIVIDERS: Record<string, RoomDivider> = {
  office: { z: -5.25, doors: [-7, 7], runs: [[-16.6, -8.6], [-5.4, 5.4], [8.6, 17]] },
  music: { z: 6, doors: [-7, 7], runs: [[-16.6, -8.6], [-5.4, 5.4], [8.6, 17]] },
  writing: { z: -9.25, doors: [-7, 7], runs: [[-15.6, -8.6], [-5.4, 5.4], [8.6, 17]] },
  go: { z: 4.75, doors: [-7, 7], runs: [[-16.6, -8.6], [-5.4, 5.4], [8.6, 12.5], [13.1, 17]] },
  gym: { z: -6, doors: [-7, 7], runs: [[-16.6, -8.6], [-5.4, 5.4], [8.6, 15.2]] },
  boathouse: { z: 4.25, doors: [-7, 7], runs: [[-16.6, -8.6], [-5.4, 5.4], [8.6, 15.1]] },
  math: { z: 6.5, doors: [-7, 7], runs: [[-16.6, -8.6], [-5.4, 5.4], [8.6, 17]] },
};
const dividerWalls = ({ z, runs }: RoomDivider): Partition[] =>
  runs.map(([a, b]) => ({ x: (a + b) / 2, z, width: b - a, depth: DIVIDER_DEPTH }));
for (const [scene, divider] of Object.entries(ROOM_DIVIDERS))
  (HOUSE_PARTITIONS as Record<string, readonly Partition[]>)[scene] = [...(HOUSE_PARTITIONS[scene] ?? []), ...dividerWalls(divider)];

export const HOUSE_DOORS: Record<string, readonly RoomDoor[]> = {
  kappa: [
    { x: 0, z: 1.2, width: 4, axis: "x", label: "COMMON ROOM" },
    { x: KAPPA_PONG_X, z: 5.5, width: 3, axis: "z", label: "PONG ROOM" },
  ],
  kitchen: [
    { x: -8.65, z: 0.5, width: 2.9, axis: "x", label: "PANTRY" },
    { x: 8.65, z: 0.5, width: 2.9, axis: "x", label: "KITCHEN" },
    { x: -5.4, z: -6.5, width: 2.8, axis: "z", label: "PANTRY" },
  ],
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** The avatar's radius: every wall and footprint is padded by it. */
export const AVATAR_RADIUS = 0.34;

/**
 * Furniture footprints (scenes/life kits) for the room being walked, padded
 * by the avatar's radius. Registered by the room-life layer when a room's
 * kit mounts, so core stays free of the room builders.
 */
export type FloorSolid = { x: number; z: number; hw: number; hd: number; turn: number };
type Padded = { x: number; z: number; hw: number; hd: number; c: number; s: number };
let solidScene = "";
let solidBoxes: Padded[] = [];
export function setRoomSolids(scene: string, solids: readonly FloorSolid[] | null) {
  if (!solids) {
    if (solidScene === scene) {
      solidScene = "";
      solidBoxes = [];
    }
    return;
  }
  solidScene = scene;
  solidBoxes = solids.map((solid) => ({
    x: solid.x,
    z: solid.z,
    hw: solid.hw + AVATAR_RADIUS,
    hd: solid.hd + AVATAR_RADIUS,
    c: Math.cos(solid.turn),
    s: Math.sin(solid.turn),
  }));
}
/** How deep (x, z) is inside a padded footprint; <= 0 is outside. */
function depthIn(box: Padded, x: number, z: number) {
  const dx = x - box.x,
    dz = z - box.z;
  // Into the footprint's frame (kit placements turn by rotY(+turn)).
  const lx = dx * box.c - dz * box.s,
    lz = dx * box.s + dz * box.c;
  return Math.min(box.hw - Math.abs(lx), box.hd - Math.abs(lz));
}
function inWall(scene: string, x: number, z: number) {
  const walls = HOUSE_PARTITIONS[scene];
  if (!walls) return false;
  for (const wall of walls)
    if (
      Math.abs(x - wall.x) < wall.width / 2 + AVATAR_RADIUS &&
      Math.abs(z - wall.z) < wall.depth / 2 + AVATAR_RADIUS
    )
      return true;
  return false;
}
/** Whether (x, z) is inside a furniture footprint of `scene`. */
export function inFurniture(scene: string, x: number, z: number) {
  if (scene !== solidScene) return false;
  for (const box of solidBoxes) if (depthIn(box, x, z) > 1e-6) return true;
  return false;
}
/**
 * A step from (fx, fz) to (x, z) is blocked by a wall it would enter, or by
 * a footprint it would go deeper into: someone set down inside one (a seat,
 * a respawn) can always walk out, never further in.
 */
function stepBlocked(scene: string, fx: number, fz: number, x: number, z: number) {
  if (inWall(scene, x, z)) return true;
  if (scene !== solidScene) return false;
  for (const box of solidBoxes) {
    const next = depthIn(box, x, z);
    if (next > 1e-6 && next > depthIn(box, fx, fz) + 1e-9) return true;
  }
  return false;
}

export function moveInterior(
  scene: string,
  x: number,
  z: number,
  dx: number,
  dz: number,
): [number, number] {
  const room = roomFor(scene);
  // Substeps prevent a long frame/tap target from tunneling through a wall.
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.12),
  );
  for (let step = 0; step < steps; step++) {
    const nextX = clamp(x + dx / steps, -room.walkX, room.walkX);
    const nextZ = clamp(z + dz / steps, room.minZ, room.maxZ);
    if (!stepBlocked(scene, x, z, nextX, z)) x = nextX;
    if (!stepBlocked(scene, x, z, x, nextZ)) z = nextZ;
  }
  return [x, z];
}

/** The nearest free floor to a point inside a furniture footprint (within
 * 2.5 m), so tapping a sofa walks to its side instead of nowhere, and
 * standing up from a seat lands beside the coffee table, not in it. */
export function freeNear(scene: string, x: number, z: number): [number, number] | null {
  const room = roomFor(scene);
  for (let r = 0.25; r <= 2.5; r += 0.25)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const px = x + Math.sin(a) * r,
        pz = z + Math.cos(a) * r;
      if (Math.abs(px) > room.walkX || pz < room.minZ || pz > room.maxZ) continue;
      if (!inWall(scene, px, pz) && !inFurniture(scene, px, pz)) return [px, pz];
    }
  return null;
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
  let goal: [number, number] = [
    clamp(end[0], -room.walkX, room.walkX),
    clamp(end[1], room.minZ, room.maxZ),
  ];
  if (inWall(scene, goal[0], goal[1])) return [];
  if (inFurniture(scene, goal[0], goal[1])) {
    const free = freeNear(scene, goal[0], goal[1]);
    if (!free) return [];
    goal = free;
  }
  const reaches = (from: [number, number], to: [number, number]) => {
    const moved = moveInterior(scene, ...from, to[0] - from[0], to[1] - from[1]);
    return Math.hypot(moved[0] - to[0], moved[1] - to[1]) < 0.00001;
  };
  if (reaches(start, goal)) return [goal];

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
