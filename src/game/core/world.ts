import { WORLD_BOUNDS, WORLD_ELLIPSE } from "../../shared/world-bounds";
import { forest } from "./scenery";
import { campusObstacles } from "./campus";
import { POND } from "./pond";

const villageDoors = [
  {
    id: "skate",
    name: "Skate park",
    x: -50,
    z: 63.8,
    anchor: [-50, 10, 50] as const,
    footprint: [-50, 50, 16, 12] as const,
  },
  {
    id: "theater",
    name: "Cinema",
    x: -38,
    z: -33.8,
    anchor: [-38, 9, -39] as const,
    footprint: [-38, -39, 5, 4] as const,
  },
  {
    id: "badminton",
    name: "Badminton",
    x: -42,
    z: -14.8,
    anchor: [-42, 7, -20] as const,
    footprint: [-42, -20, 5.5, 4.2] as const,
  },
  {
    id: "go",
    name: "Go",
    x: -42,
    z: 23.2,
    anchor: [-42, 7, 19] as const,
    footprint: [-42, 19, 3.6, 2.7] as const,
  },
  {
    id: "writing",
    name: "Writing",
    x: 0,
    z: -42.5,
    anchor: [0, 7.5, -46] as const,
    footprint: [0, -46, 3.6, 2.5] as const,
  },
  {
    id: "stadium",
    name: "49ers Stadium",
    x: 43,
    z: -16.5,
    anchor: [43, 8, -21] as const,
    footprint: [43, -21, 4, 3.5] as const,
  },
  {
    id: "boathouse",
    name: "Boathouse",
    x: -22,
    z: 8,
    anchor: [-22, 6.8, 5] as const,
    footprint: [-22, 5, 3.25, 2.1] as const,
  },
  {
    id: "basketball",
    name: "Court",
    x: 23,
    z: 7.2,
    anchor: [23, 4.3, 4] as const,
    footprint: [23, 4, 3.2, 2.5] as const,
  },
  {
    id: "office",
    name: "Study",
    x: 0,
    z: -19,
    anchor: [0, 8.1, -22] as const,
    footprint: [0, -22, 3.1, 2.1] as const,
  },
  {
    id: "kappa",
    name: "Kappa Sigma",
    x: -18,
    z: -10.5,
    anchor: [-18, 8.8, -14] as const,
    footprint: [-18, -14, 3.7, 2.7] as const,
  },
  {
    id: "cognition",
    name: "Cognition",
    x: 18,
    z: -10.5,
    anchor: [18, 7.6, -14] as const,
    footprint: [18, -14, 3.5, 2.6] as const,
  },
  {
    id: "kitchen",
    name: "Kitchen",
    x: -8,
    z: 14.9,
    anchor: [-8, 5.8, 12] as const,
    footprint: [-8, 12, 2.35, 1.95] as const,
  },
  {
    id: "gym",
    name: "Gym",
    x: 8,
    z: 20.3,
    anchor: [8, 6.2, 17] as const,
    footprint: [8, 17, 2.85, 2.5] as const,
  },
  {
    id: "music",
    name: "Beat Lab",
    x: -11,
    z: -22,
    anchor: [-11, 7, -25] as const,
    footprint: [-11, -25, 3.1, 2.1] as const,
  },
  {
    id: "math",
    name: "Math Lab",
    x: 11,
    z: -22,
    anchor: [11, 7, -25] as const,
    footprint: [11, -25, 3.1, 2.1] as const,
  },
] as const;
// Rendered massing, collision and the front step share the same transform.
const largerHouses = new Set<string>([
  "boathouse",
  "office",
  "kappa",
  "cognition",
  "kitchen",
  "gym",
  "music",
  "math",
]);
export const doors = villageDoors.map((door) => {
  const horizontal = largerHouses.has(door.id) ? 1.5 : 1;
  const vertical = horizontal > 1 ? 1.2 : 1;
  const [cx, cz, hx, hz] = door.footprint;
  return {
    ...door,
    z: cz + (door.z - cz) * horizontal,
    anchor: [cx, door.anchor[1] * vertical, cz] as const,
    footprint: [cx, cz, hx * horizontal, hz * horizontal] as const,
    scale: [horizontal, vertical, horizontal] as const,
  };
});
export const landmarks = [
  {
    id: "photo",
    name: "Photo booth",
    x: -6,
    z: -4.4,
    anchor: [-6, 4.2, -6.2] as const,
  },
  {
    id: "stargazing",
    name: "Telescope",
    x: -19,
    z: -30,
    anchor: [-19, 10, -38] as const,
  },
  {
    id: "bulletin",
    name: "Bulletin",
    x: 0,
    z: -4.6,
    anchor: [0, 4.6, -6.6] as const,
  },
  {
    id: "campus",
    name: "Stanford",
    x: 20,
    z: 20,
    anchor: [20, 16, 50] as const,
  },
  {
    id: "station",
    name: "Train station",
    x: -76,
    z: 12,
    anchor: [-76, 4, 12] as const,
  },
] as const;
export const destinations = [...doors, ...landmarks];
export type PlaceId = (typeof doors)[number]["id"];
export function isInterior(scene: string) {
  return doors.some((door) => door.id === scene && scene !== "basketball");
}
const obstacles: ReadonlyArray<readonly number[]> = [
  ...doors.map((door) => door.footprint),
  ...forest.map((tree) => [tree.x, tree.z, 0.4, 0.4]),
  ...campusObstacles,
  [POND.x, POND.z, POND.radiusX, POND.radiusZ],
  [0, -6.6, 2.1, 0.4],
  [0, 0, 1.5, 1.5],
  [-6, -6.2, 1.2, 0.8],
  [-19, -38, 6, 6],
];
export function canWalk(x: number, z: number) {
  if (
    x < WORLD_BOUNDS.minX ||
    x > WORLD_BOUNDS.maxX ||
    z < WORLD_BOUNDS.minZ ||
    z > WORLD_BOUNDS.maxZ ||
    (x / WORLD_ELLIPSE.radiusX) ** 2 +
      ((z - WORLD_ELLIPSE.centerZ) / WORLD_ELLIPSE.radiusZ) ** 2 >
      1
  )
    return false;
  return !obstacles.some(
    ([cx, cz, w, d]) =>
      Math.abs(x - cx) < w + 0.3 && Math.abs(z - cz) < d + 0.3,
  );
}
export function moveWorld(
  x: number,
  z: number,
  dx: number,
  dz: number,
): [number, number] {
  // Small substeps prevent tunnelling even after a long frame.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
  for (let i = 0; i < steps; i++) {
    if (canWalk(x + dx / steps, z)) x += dx / steps;
    if (canWalk(x, z + dz / steps)) z += dz / steps;
  }
  return [x, z];
}
export function findPath(
  start: [number, number],
  end: [number, number],
): [number, number][] {
  const grid = 0.6,
    key = (x: number, z: number) => `${x},${z}`;
  const sx = Math.round(start[0] / grid),
    sz = Math.round(start[1] / grid),
    ex = Math.round(end[0] / grid),
    ez = Math.round(end[1] / grid);
  const open = [{ x: sx, z: sz, cost: 0, f: 0 }],
    seen = new Map<string, number>(),
    parents = new Map<string, string>();
  seen.set(key(sx, sz), 0);
  for (let n = 0; n < 6000 && open.length; n++) {
    // Prefer progress toward the goal within the same A* contour. Otherwise
    // long district routes exhaust the search budget exploring a flat rectangle.
    open.sort((a, b) => a.f - b.f || b.cost - a.cost);
    const cur = open.shift()!,
      ck = key(cur.x, cur.z);
    if (Math.hypot(cur.x - ex, cur.z - ez) <= 1) {
      const out: [number, number][] = [[cur.x * grid, cur.z * grid]];
      let k = ck;
      while (parents.has(k)) {
        k = parents.get(k)!;
        const [x, z] = k.split(",").map(Number);
        out.unshift([x * grid, z * grid]);
      }
      return out.slice(1);
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = cur.x + dx,
        z = cur.z + dz,
        k = key(x, z),
        cost = cur.cost + 1;
      if (!canWalk(x * grid, z * grid) || (seen.get(k) ?? Infinity) <= cost)
        continue;
      seen.set(k, cost);
      parents.set(k, ck);
      open.push({ x, z, cost, f: cost + Math.abs(x - ex) + Math.abs(z - ez) });
    }
  }
  return [];
}
