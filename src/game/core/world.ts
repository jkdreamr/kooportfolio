import { WORLD_BOUNDS } from "../../shared/world-bounds";
import { forest } from "./scenery";

export const doors = [
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
] as const;
export type PlaceId = (typeof doors)[number]["id"];
export function isInterior(scene: string) {
  return doors.some((door) => door.id === scene && scene !== "basketball");
}
const obstacles: ReadonlyArray<readonly number[]> = [
  ...doors.map((door) => door.footprint),
  ...forest.map((tree) => [tree.x, tree.z, 0.4, 0.4]),
  [0, 0, 1.5, 1.5],
];
export function canWalk(x: number, z: number) {
  if (
    x < WORLD_BOUNDS.minX ||
    x > WORLD_BOUNDS.maxX ||
    z < WORLD_BOUNDS.minZ ||
    z > WORLD_BOUNDS.maxZ ||
    (x / 49.5) ** 2 + ((z + 1) / 41.5) ** 2 > 1
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
    open.sort((a, b) => a.f - b.f);
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
