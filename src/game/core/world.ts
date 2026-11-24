import { WORLD_BOUNDS } from "../../shared/world-bounds";
import { ISLAND_RAIL } from "./islandRail";
import { forest, koreaForest } from "./scenery";
import {
  KOREA_LANDMARK_DESTINATIONS,
  KOREA_LANDMARK_SOLIDS,
  KOREA_STREET_BUILDINGS,
} from "./koreaLandmarks";
import { campusObstacles } from "./campus";
import { POND } from "./pond";
import {
  PHOTO_BOOTH_ENTRY,
  PHOTO_BOOTH_OBSTACLES,
  PHOTO_BOOTH_ORIGIN,
} from "./photoBoothLayout";
import { belongsToWorld, type WorldId } from "./worlds";
import { HOME_COMMUNITY_OBSTACLES } from "../world/CommunityScenery";
import { villageGardenSolids } from "./villageGardens";
import { HOME_GARDEN_OBSTACLES } from "./homeGardens";
import { HOME_DESTINATION_CENTERS } from "./homeLayout";
import { HOME_AIRPORT_GATE, islandForWorld } from "./homeIsland";
import { journeyGate } from "./journey";
import { railForWorld } from "./islandRail";
import { STANFORD_BUILDINGS, isStanfordTownSpace } from "./stanfordLayout";
import {
  KOREA_WATER_OBSTACLES,
  KOREA_BRIDGE_RAILS,
} from "../world/HanRiverBridge";
import {
  KOREA_PARK_OBSTACLES,
  KOREA_PARK_TREES,
} from "../world/KoreaWorldEnvironment";

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
  const [oldX, oldZ, hx, hz] = door.footprint;
  const [cx, cz] = STANFORD_BUILDINGS[
    door.id as keyof typeof STANFORD_BUILDINGS
  ] ?? [oldX, oldZ];
  const rotation = door.id === "skate" ? Math.PI : 0;
  return {
    ...door,
    x: cx + (door.x - oldX) * horizontal,
    z: cz + (door.z - oldZ) * horizontal * (rotation ? -1 : 1),
    anchor: [cx, door.anchor[1] * vertical, cz] as const,
    footprint: [cx, cz, hx * horizontal, hz * horizontal] as const,
    scale: [horizontal, vertical, horizontal] as const,
    rotation,
  };
});
export const landmarks = [
  ...KOREA_LANDMARK_DESTINATIONS,
  {
    id: "airport",
    name: "Airport",
    x: 58,
    z: 61,
    anchor: [58, 8, 52] as const,
  },
  {
    id: "bridge",
    name: "Han River",
    x: 26,
    z: 34,
    anchor: [45, 10, 34] as const,
  },
  {
    id: "photo",
    name: "Photo booth",
    x: PHOTO_BOOTH_ENTRY[0],
    z: PHOTO_BOOTH_ENTRY[1],
    anchor: [PHOTO_BOOTH_ORIGIN[0], 4.2, PHOTO_BOOTH_ORIGIN[2]] as const,
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
    z: ISLAND_RAIL.station[1],
    anchor: [-76, 4, ISLAND_RAIL.station[1]] as const,
  },
] as const;
const koreaDoors = doors
  .filter((door) => belongsToWorld(door.id, "korea"))
  .map((door) => {
    if (door.id !== "theater" && door.id !== "cognition") return door;
    const [x, z] = KOREA_STREET_BUILDINGS[door.id];
    const [, originalZ, halfWidth, halfDepth] = door.footprint;
    return {
      ...door,
      x,
      z: z + (door.z - originalZ),
      anchor: [x, door.anchor[1], z] as const,
      footprint: [x, z, halfWidth, halfDepth] as const,
    };
  });
export const doorsInWorld = (world: WorldId) =>
  world === "korea"
    ? koreaDoors
    : doors
        .filter((door) => belongsToWorld(door.id, world))
        .map((door) => {
          const center = world === "home" && HOME_DESTINATION_CENTERS[door.id];
          if (!center) return door;
          const [x, z] = center;
          const dx = x - door.footprint[0],
            dz = z - door.footprint[1];
          return {
            ...door,
            x: door.x + dx,
            z: door.z + dz,
            anchor: [x, door.anchor[1], z] as const,
            footprint: [x, z, door.footprint[2], door.footprint[3]] as const,
          };
        });
export const destinationsInWorld = (world: WorldId) => [
  ...doorsInWorld(world),
  ...landmarks
    .filter((place) => belongsToWorld(place.id, world))
    .map((place) => {
      if (world !== "home") return place;
      if (place.id === "airport") {
        const [x, z] = HOME_AIRPORT_GATE;
        return { ...place, x, z, anchor: [x, 8, z - 9] as const };
      }
      if (place.id === "station") {
        const [x, z] = journeyGate("train", world);
        return {
          ...place,
          x,
          z,
          anchor: [railForWorld(world).station[0], 4, z] as const,
        };
      }
      return place;
    }),
];
export type PlaceId = (typeof doors)[number]["id"];
export function isInterior(scene: string) {
  return (
    scene === "secret" ||
    doors.some((door) => door.id === scene && scene !== "basketball")
  );
}
const sharedObstacles: ReadonlyArray<readonly number[]> = [
  [POND.x, POND.z, POND.radiusX, POND.radiusZ],
  [0, -6.6, 2.1, 0.4],
  [0, 0, 1.5, 1.5],
  [-19, -38, 6, 6],
  [58, 52, 9, 7],
];
const obstaclesFor = (world?: WorldId): ReadonlyArray<readonly number[]> => [
  ...(world === "home"
    ? [
        ...sharedObstacles.slice(1, 4),
        [HOME_AIRPORT_GATE[0], HOME_AIRPORT_GATE[1] - 9, 5, 3.8],
      ]
    : sharedObstacles),
  ...(world === "home" ? [] : world === "korea" ? koreaForest : forest)
    .filter(({ x, z }) => world !== "stanford" || !isStanfordTownSpace(x, z, 3))
    .map((tree) => [tree.x, tree.z, 0.4, 0.4]),
  ...(world ? villageGardenSolids(world) : []),
  ...(world ? doorsInWorld(world) : doors).map((door) => door.footprint),
  ...(world === undefined || world === "stanford" ? campusObstacles : []),
  ...(world === undefined || world === "korea" ? PHOTO_BOOTH_OBSTACLES : []),
  ...(world === "korea"
    ? [
        ...KOREA_WATER_OBSTACLES,
        ...KOREA_BRIDGE_RAILS,
        ...KOREA_PARK_OBSTACLES,
        ...KOREA_LANDMARK_SOLIDS,
        ...KOREA_PARK_TREES.map(({ p }) => [p[0], p[2], 0.4, 0.4]),
      ]
    : []),
  ...(world === "home"
    ? [...HOME_COMMUNITY_OBSTACLES, ...HOME_GARDEN_OBSTACLES]
    : []),
];
const regionalObstacles = {
  home: obstaclesFor("home"),
  stanford: obstaclesFor("stanford"),
  korea: obstaclesFor("korea"),
  all: obstaclesFor(),
};
export function canWalk(x: number, z: number, world?: WorldId) {
  const island = islandForWorld(world);
  if (
    x < WORLD_BOUNDS.minX ||
    x > WORLD_BOUNDS.maxX ||
    z < WORLD_BOUNDS.minZ ||
    z > WORLD_BOUNDS.maxZ ||
    ((x - island.centerX) / island.radiusX) ** 2 +
      ((z - island.centerZ) / island.radiusZ) ** 2 >
      1
  )
    return false;
  return !regionalObstacles[world ?? "all"].some(
    ([cx, cz, w, d]) =>
      Math.abs(x - cx) < w + 0.3 && Math.abs(z - cz) < d + 0.3,
  );
}
export function moveWorld(
  x: number,
  z: number,
  dx: number,
  dz: number,
  world?: WorldId,
): [number, number] {
  // Small substeps prevent tunnelling even after a long frame.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
  for (let i = 0; i < steps; i++) {
    if (canWalk(x + dx / steps, z, world)) x += dx / steps;
    if (canWalk(x, z + dz / steps, world)) z += dz / steps;
  }
  return [x, z];
}
export function findPath(
  start: [number, number],
  end: [number, number],
  world?: WorldId,
): [number, number][] {
  const grid = 0.6,
    key = (x: number, z: number) => `${x},${z}`;
  const sx = Math.round(start[0] / grid),
    sz = Math.round(start[1] / grid),
    ex = Math.round(end[0] / grid),
    ez = Math.round(end[1] / grid);
  type Node = { x: number; z: number; cost: number; f: number };
  const open: Node[] = [],
    seen = new Map<string, number>(),
    parents = new Map<string, string>();
  const before = (a: Node, b: Node) =>
    a.f < b.f || (a.f === b.f && a.cost > b.cost);
  const push = (node: Node) => {
    let index = open.push(node) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!before(open[index], open[parent])) break;
      [open[index], open[parent]] = [open[parent], open[index]];
      index = parent;
    }
  };
  const pop = () => {
    const node = open[0],
      last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1,
          right = left + 1;
        if (left >= open.length) break;
        const next =
          right < open.length && before(open[right], open[left]) ? right : left;
        if (!before(open[next], open[index])) break;
        [open[next], open[index]] = [open[index], open[next]];
        index = next;
      }
    }
    return node;
  };
  push({ x: sx, z: sz, cost: 0, f: 0 });
  seen.set(key(sx, sz), 0);
  for (let n = 0; n < 24000 && open.length; n++) {
    // Prefer progress toward the goal within the same A* contour. Otherwise
    // long district routes exhaust the search budget exploring a flat rectangle.
    // A heap keeps longer river/airport detours cheap instead of re-sorting
    // the whole frontier on every step and freezing the main thread.
    const cur = pop(),
      ck = key(cur.x, cur.z);
    if (cur.cost !== seen.get(ck)) continue;
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
      if (
        !canWalk(x * grid, z * grid, world) ||
        (seen.get(k) ?? Infinity) <= cost
      )
        continue;
      seen.set(k, cost);
      parents.set(k, ck);
      push({ x, z, cost, f: cost + Math.abs(x - ex) + Math.abs(z - ez) });
    }
  }
  return [];
}
