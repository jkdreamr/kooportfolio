import { afterEach, describe, expect, it } from "vitest";
import { HOUSE_PARTITIONS, findInteriorPath, freeNear, inFurniture, moveInterior, setRoomSolids } from "../src/game/core/houseRooms";
import { DEFAULT_REACH } from "../src/game/core/interactables";
import { roomFor } from "../src/game/core/room";
import { ROOM_LIFE, buildRoomLife } from "../src/game/scenes/life/rooms";
import { roomDressingSolids } from "../src/game/scenes/RoomDressing";

/** What RoomLife registers for a room: its kit plus the older dressing. */
const solidsOf = (id: string) => [...buildRoomLife(id)!.solids, ...roomDressingSolids(sceneOf(id))];

const sceneOf = (roomId: string) => (roomId === "theater-korea" ? "theater" : roomId);
const ROOMS = Object.keys(ROOM_LIFE);

/** Every floor cell (0.25 m grid) a walker can reach from the spawn point. */
function reachable(scene: string) {
  const room = roomFor(scene);
  const grid = 0.25;
  const start: [number, number] = [0, room.spawnZ];
  const seen = new Map<string, [number, number]>([["0,0", start]]);
  const queue: [number, number][] = [[0, 0]];
  for (let head = 0; head < queue.length; head++) {
    const [i, j] = queue[head];
    const from = seen.get(`${i},${j}`)!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di,
        nj = j + dj,
        key = `${ni},${nj}`;
      if (seen.has(key)) continue;
      const to: [number, number] = [start[0] + ni * grid, start[1] + nj * grid];
      if (Math.abs(to[0]) > room.walkX || to[1] < room.minZ || to[1] > room.maxZ) continue;
      const moved = moveInterior(scene, from[0], from[1], to[0] - from[0], to[1] - from[1]);
      if (Math.hypot(moved[0] - to[0], moved[1] - to[1]) > 1e-6) continue;
      seen.set(key, to);
      queue.push([ni, nj]);
    }
  }
  return [...seen.values()];
}

afterEach(() => {
  for (const id of ROOMS) setRoomSolids(sceneOf(id), null);
});

describe("furniture is solid", () => {
  it.each(ROOMS)("%s: big furniture has footprints", (id) => {
    const kit = buildRoomLife(id)!;
    expect(kit.solids.length).toBeGreaterThan(5);
    // Thin (low tier) rooms collide exactly like full ones.
    expect(buildRoomLife(id, { thin: true })!.solids.length).toBe(kit.solids.length);
  });

  it.each(ROOMS)("%s: every prop, the door and the room's middle stay reachable", (id) => {
    const scene = sceneOf(id);
    const kit = buildRoomLife(id)!;
    setRoomSolids(scene, solidsOf(id));
    const room = roomFor(scene);
    const cells = reachable(scene);
    const near = (x: number, z: number, reach: number) => cells.some(([cx, cz]) => Math.hypot(cx - x, cz - z) <= reach);
    const unreachable = kit.props.filter((prop) => !near(prop.x, prop.z, (prop.reach ?? DEFAULT_REACH) - 0.15)).map((p) => p.id);
    expect(unreachable).toEqual([]);
    // The exit doorway is clear, and so is the interior spot (0, -2).
    expect(near(0, room.doorZ - 0.6, 0.6)).toBe(true);
    if (scene !== "secret") expect(near(0, -2, 1.2)).toBe(true);
    // No reachable cell is inside a footprint.
    expect(cells.filter(([x, z]) => inFurniture(scene, x, z))).toEqual([]);
  });

  it.each(ROOMS)("%s: tapping any prop walks to it without ending inside furniture", (id) => {
    const scene = sceneOf(id);
    const kit = buildRoomLife(id)!;
    setRoomSolids(scene, solidsOf(id));
    const room = roomFor(scene);
    for (const prop of kit.props) {
      if (prop.action.type === "sit") continue;
      let position: [number, number] = [0, room.spawnZ];
      const route = findInteriorPath(scene, position, [prop.x, prop.z]);
      for (const target of route) position = moveInterior(scene, ...position, target[0] - position[0], target[1] - position[1]);
      expect(inFurniture(scene, ...position), prop.id).toBe(false);
    }
  });

  it.each(ROOMS)("%s: a seated player can always stand and walk away", (id) => {
    const scene = sceneOf(id);
    const kit = buildRoomLife(id)!;
    setRoomSolids(scene, solidsOf(id));
    for (const prop of kit.props) {
      if (prop.action.type !== "sit") continue;
      const { seat, face } = prop.action;
      // Standing up lands on free floor (beside a coffee table, not in it)...
      const stand: [number, number] = [seat[0] + Math.sin(face) * 0.9, seat[2] + Math.cos(face) * 0.9];
      const [sx, sz] = inFurniture(scene, ...stand) ? freeNear(scene, ...stand)! : stand;
      expect(inFurniture(scene, sx, sz), prop.id).toBe(false);
      // ...and from the seat itself some direction always walks free.
      const free = [0, 1, 2, 3, 4, 5, 6, 7].some((i) => {
        let [x, z] = [seat[0], seat[2]];
        for (let n = 0; n < 40; n++) [x, z] = moveInterior(scene, x, z, Math.sin(face + i * 0.785) * 0.05, Math.cos(face + i * 0.785) * 0.05);
        return !inFurniture(scene, x, z);
      });
      expect(free, prop.id).toBe(true);
    }
  });
});

describe("walls", () => {
  it.each(ROOMS)("%s: no furniture stands in a wall or partition", (id) => {
    const scene = sceneOf(id);
    const hits: string[] = [];
    for (const wall of HOUSE_PARTITIONS[scene] ?? [])
      for (const s of solidsOf(id)) {
        const c = Math.abs(Math.cos(s.turn)),
          n = Math.abs(Math.sin(s.turn));
        const ex = s.hw * c + s.hd * n,
          ez = s.hw * n + s.hd * c;
        if (Math.abs(s.x - wall.x) < ex + wall.width / 2 - 0.02 && Math.abs(s.z - wall.z) < ez + wall.depth / 2 - 0.02)
          hits.push(`${s.x.toFixed(1)},${s.z.toFixed(1)} in wall at ${wall.x.toFixed(1)},${wall.z.toFixed(1)}`);
      }
    expect(hits).toEqual([]);
  });
});

describe("oriented footprints", () => {
  it("blocks the office sofa from every side and slides along it", () => {
    setRoomSolids("office", solidsOf("office"));
    // The lounge sofa sits at (-7.2, 6.4), 3.4 m wide and facing the door.
    const [, z] = moveInterior("office", -7.2, 9, 0, -4);
    expect(z).toBeGreaterThan(6.4 + 0.62 + 0.3);
    const [, zBack] = moveInterior("office", -7.2, 4, 0, 4);
    expect(zBack).toBeLessThan(6.4 - 0.62 - 0.3);
    expect(inFurniture("office", -7.2, 6.4)).toBe(true);
  });
  it("turns with the furniture (the deal table runs along z)", () => {
    setRoomSolids("office", solidsOf("office"));
    // Rotated a quarter turn: 4 m long in z, 1.3 m in x.
    expect(inFurniture("office", 7.4, 10.4 + 1.8)).toBe(true);
    expect(inFurniture("office", 7.4 + 0.9, 10.4)).toBe(true);
    expect(inFurniture("office", 7.4 + 1.8, 10.4 + 1.8)).toBe(false);
    expect(inFurniture("office", 7.4 + 1.2, 10.4 - 2.6)).toBe(false);
  });
  it("never walks into furniture under a random walk", () => {
    for (const id of ROOMS) {
      const scene = sceneOf(id);
      setRoomSolids(scene, solidsOf(id));
      let [x, z] = [0, roomFor(scene).spawnZ];
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
      let heading = 0;
      for (let i = 0; i < 3000; i++) {
        heading += rand() * 0.6;
        [x, z] = moveInterior(scene, x, z, Math.sin(heading) * 0.25, Math.cos(heading) * 0.25);
        if (inFurniture(scene, x, z)) throw new Error(`${id}: inside furniture at ${x.toFixed(2)}, ${z.toFixed(2)}`);
      }
      setRoomSolids(scene, null);
    }
  });
});

/** Flat floor boxes drawn outside the kits (Interior.tsx mats, HouseRooms.tsx
 * rugs, RoomDressing.tsx mats), as [x, z, w, d]. The kitchen's tiled floors
 * are floors: rugs lie on them, 2.5 cm and more above. */
function fixedMats(scene: string): [number, number, number, number][] {
  const room = roomFor(scene);
  const mats: [number, number, number, number][] = [[0, room.doorZ, 3, 2]];
  if (!["badminton", "go", "theater"].includes(scene)) mats.push([0, -2, 4.2, 3]);
  if (scene === "kappa") mats.push([-5, 6.8, 9.6, 9.1], [6.5, 6.3, 6.9, 8.7]);
  if (scene === "boathouse") mats.push([0, -14.4, 5, 6]);
  if (scene === "gym")
    mats.push([-13.5, -15.4, 3, 5.5], [13.5, -15.4, 3, 5.5], [13.3, 11, 4.5, 5.5], [-13.4, 10, 2.8, 2.6], [-13.4, 14, 2.8, 2.6], [13.3, 1.8, 4.3, 5], [-13.5, 6.2, 3.8, 1.7]);
  return mats;
}

describe("floor coverings never share a plane", () => {
  it.each(ROOMS)("%s: rugs clear the boards and never overlap another covering", (id) => {
    const kit = buildRoomLife(id)!;
    expect(kit.coverings.length).toBeGreaterThan(0);
    // Every rug's base layer (a 3 cm slab or disc) is lifted: the visible top
    // clears the floorboards (0.071) by 5 cm and stays under the feet (0.18).
    const base = kit.statics.filter((p) => p.p[1] < 0.2 && Math.abs(p.s[1] - 0.03) < 1e-6 && Math.max(p.s[0], p.s[2]) > 1.2);
    for (const p of base) {
      expect(p.p[1] + 0.015).toBeGreaterThanOrEqual(0.071 + 0.05 - 1e-9);
      expect(p.p[1] + 0.04).toBeLessThan(0.18);
    }
    const all = [
      ...kit.coverings.map((c) => ({ ...c, what: `rug ${c.x.toFixed(1)},${c.z.toFixed(1)}` })),
      ...fixedMats(sceneOf(id)).map(([x, z, w, d]) => ({ x, z, ex: w / 2, ez: d / 2, what: `mat ${x},${z}` })),
    ];
    const overlaps: string[] = [];
    for (let i = 0; i < kit.coverings.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i],
          b = all[j];
        if (Math.abs(a.x - b.x) < a.ex + b.ex - 0.02 && Math.abs(a.z - b.z) < a.ez + b.ez - 0.02) overlaps.push(`${a.what} / ${b.what}`);
      }
    expect(overlaps).toEqual([]);
  });
});
