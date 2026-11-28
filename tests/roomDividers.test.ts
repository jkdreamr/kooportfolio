import { describe, expect, it } from "vitest";
import { DIVIDER_DEPTH, DIVIDER_DOOR, findInteriorPath, moveInterior, ROOM_DIVIDERS } from "../src/game/core/houseRooms";
import { roomFor } from "../src/game/core/room";
import { buildRoomLife } from "../src/game/scenes/life/rooms";
import { DEFAULT_REACH } from "../src/game/core/interactables";

const rooms = Object.keys(ROOM_DIVIDERS);

describe("room dividers", () => {
  it.each(rooms)("%s: every interactable can be walked to from the door", (scene) => {
    const room = roomFor(scene);
    const start: [number, number] = [0, room.maxZ - 2.3];
    const kit = buildRoomLife(scene)!;
    const stuck: string[] = [];
    for (const prop of kit.props) {
      let ok = false;
      for (let r = 0.6; r <= DEFAULT_REACH - 0.3 && !ok; r += 0.4)
        for (let a = 0; a < 16 && !ok; a++) {
          const x = Math.max(-room.walkX, Math.min(room.walkX, prop.x + Math.cos((a / 16) * Math.PI * 2) * r));
          const z = Math.max(room.minZ, Math.min(room.maxZ, prop.z + Math.sin((a / 16) * Math.PI * 2) * r));
          if (Math.hypot(x - prop.x, z - prop.z) > DEFAULT_REACH) continue;
          const path = findInteriorPath(scene, start, [x, z]);
          const end = path[path.length - 1];
          ok = !!end && Math.hypot(end[0] - x, end[1] - z) < 0.01;
        }
      if (!ok) stuck.push(prop.id);
    }
    expect(stuck).toEqual([]);
  });

  it.each(rooms)("%s: the archways let the player through and the walls stop them", (scene) => {
    const { z, doors, runs } = ROOM_DIVIDERS[scene];
    for (const d of doors) expect(moveInterior(scene, d, z + 1.2, 0, -2.4)[1]).toBeCloseTo(z - 1.2, 5);
    const [a, b] = runs.reduce((w, r) => (r[1] - r[0] > w[1] - w[0] ? r : w));
    const x = Math.max(-roomFor(scene).walkX + 0.5, Math.min(roomFor(scene).walkX - 0.5, (a + b) / 2));
    expect(moveInterior(scene, x, z + 1.2, 0, -2.4)[1]).toBeGreaterThan(z + DIVIDER_DEPTH / 2);
  });

  it.each(rooms)("%s: no dressing stands inside a wall", (scene) => {
    const { z, runs, doors } = ROOM_DIVIDERS[scene];
    // The arch posts' plinths stand on the wall ends on purpose.
    const arch = (x: number) => doors.some((d) => Math.abs(x - d) < DIVIDER_DOOR / 2 + 0.45);
    const inside = buildRoomLife(scene)!.statics.filter(
      (p) => !arch(p.p[0]) && p.p[1] - p.s[1] / 2 < 1.4 && Math.abs(p.p[2] - z) < DIVIDER_DEPTH / 2 + 0.05 && runs.some(([a, b]) => p.p[0] > a + 0.05 && p.p[0] < b - 0.05) && Math.abs(p.s[2] - DIVIDER_DEPTH) > 0.2 && p.s[1] < 1.4,
    );
    expect(inside.length).toBeLessThan(3);
  });

  it.each(rooms)("%s: each archway has wall either side, ending exactly at its posts", (scene) => {
    const { doors, runs } = ROOM_DIVIDERS[scene];
    for (const d of doors) {
      expect(runs.some(([, b]) => Math.abs(b - (d - DIVIDER_DOOR / 2)) < 1e-6)).toBe(true);
      expect(runs.some(([a]) => Math.abs(a - (d + DIVIDER_DOOR / 2)) < 1e-6)).toBe(true);
    }
    // Runs meet the left wall's face and the cut-away right edge of the floor.
    expect(runs[0][0]).toBeLessThanOrEqual(-15.5);
    expect(runs[runs.length - 1][1]).toBeGreaterThanOrEqual(15);
  });
});
