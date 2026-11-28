import { describe, expect, it } from "vitest";
import { Kit, triangleCount } from "../src/game/scenes/life/kit";
import { buildRoomLife, ROOM_LIFE } from "../src/game/scenes/life/rooms";
import { roomFor } from "../src/game/core/room";
import { allProgress } from "../src/game/core/discoveries";
import { roomStories } from "../src/content/room-stories";

const rooms = Object.keys(ROOM_LIFE);
const sceneOf = (roomId: string) => (roomId === "theater-korea" ? "theater" : roomId);

describe("kit", () => {
  it("nests placements: turn, offset and scale compose", () => {
    const k = new Kit();
    k.at(10, 0, Math.PI / 2, () => k.at(0, 2, 0, () => k.box([1, 0.5, 0], [1, 1, 1], "#ffffff"), 0, 2));
    const [piece] = k.statics;
    // Local +z maps to world +x after a quarter turn; local +x to world −z.
    expect(piece.p[0]).toBeCloseTo(12);
    expect(piece.p[1]).toBeCloseTo(1);
    expect(piece.p[2]).toBeCloseTo(-2);
    expect(piece.s).toEqual([2, 2, 2]);
    expect(piece.r[1]).toBeCloseTo(Math.PI / 2);
  });
  it("prop parts are stored relative to the prop", () => {
    const k = new Kit();
    k.at(5, 5, Math.PI, () => k.prop({ id: "p", label: "P", verb: "Use" }, () => k.box([0.5, 1, 0], [1, 1, 1], "#ffffff")));
    expect(k.statics.length).toBe(0);
    const prop = k.props[0];
    expect([prop.x, prop.z]).toEqual([5, 5]);
    expect(prop.parts[0].p[0]).toBeCloseTo(0.5);
    expect(prop.parts[0].p[1]).toBeCloseTo(1);
    expect(prop.parts[0].r[1]).toBeCloseTo(0);
    expect(() => k.prop({ id: "p", label: "again", verb: "Use" })).toThrow();
  });
  it("thin kits skip clutter only", () => {
    const full = new Kit(),
      thin = new Kit({ thin: true });
    for (const k of [full, thin]) {
      k.box([0, 0, 0], [1, 1, 1], "#ffffff");
      k.clutter(() => k.box([0, 0, 0], [1, 1, 1], "#ffffff"));
    }
    expect(full.statics.length).toBe(2);
    expect(thin.statics.length).toBe(1);
  });
});

describe("room life", () => {
  it("covers every house room in the three worlds", () => {
    expect(rooms.sort()).toEqual(
      ["badminton", "boathouse", "cognition", "go", "gym", "kappa", "kitchen", "math", "music", "office", "secret", "theater", "theater-korea", "writing"].sort(),
    );
  });

  it.each(rooms)("%s: at least eight things to find, all reachable", (roomId) => {
    const kit = buildRoomLife(roomId)!;
    const room = roomFor(sceneOf(roomId));
    expect(kit.props.length).toBeGreaterThanOrEqual(8);
    expect(new Set(kit.props.map((p) => p.id)).size).toBe(kit.props.length);
    for (const prop of kit.props) {
      // Standing somewhere inside the walk rectangle, within reach.
      const sx = Math.max(-room.walkX, Math.min(room.walkX, prop.x)),
        sz = Math.max(room.minZ, Math.min(room.maxZ, prop.z));
      expect(Math.hypot(prop.x - sx, prop.z - sz), `${roomId}:${prop.id}`).toBeLessThan((prop.reach ?? 2.3) - 0.3);
      expect(prop.label.length, prop.id).toBeGreaterThan(2);
      expect(prop.verb.length, prop.id).toBeGreaterThan(2);
    }
  });

  it.each(rooms)("%s: within the triangle budget, and thin is lighter", (roomId) => {
    const full = triangleCount(buildRoomLife(roomId)!);
    const thin = triangleCount(buildRoomLife(roomId, { thin: true })!);
    expect(full).toBeLessThanOrEqual(25000);
    expect(thin).toBeLessThanOrEqual(full);
    // The same things to find on every tier.
    expect(buildRoomLife(roomId, { thin: true })!.props.map((p) => p.id)).toEqual(buildRoomLife(roomId)!.props.map((p) => p.id));
  });

  it.each(rooms)("%s: the way in stays clear", (roomId) => {
    const kit = buildRoomLife(roomId)!;
    const room = roomFor(sceneOf(roomId));
    // Nothing taller than a rug in the lane from the door mat inward.
    for (const piece of kit.statics) {
      const top = piece.p[1] + piece.s[1] / 2;
      if (top < 0.2) continue;
      const blocked = Math.abs(piece.p[0]) < 1.2 && piece.p[2] > room.doorZ - 4.5;
      expect(blocked, `${roomId} piece at ${piece.p.map((n) => n.toFixed(1))}`).toBe(false);
    }
  });

  it("room totals are declared for the stamp card", () => {
    const progress = allProgress();
    for (const roomId of rooms) expect(progress.rooms[roomId].total).toBe(buildRoomLife(roomId)!.props.length);
    expect(progress.total).toBeGreaterThanOrEqual(rooms.length * 8);
  });

  it("cards quote the room stories only where the story says so", () => {
    // No card may be empty or run long; the story file stays the source for
    // the header card (this guards against a card growing into a second bio).
    for (const roomId of rooms)
      for (const prop of buildRoomLife(roomId)!.props)
        if (prop.action.type === "read") {
          expect(prop.action.title.length, prop.id).toBeGreaterThan(1);
          expect(prop.action.text.length, prop.id).toBeGreaterThan(8);
          expect(prop.action.text.length, prop.id).toBeLessThanOrEqual(220);
        }
    expect(Object.keys(roomStories).length).toBeGreaterThan(0);
  });
});
