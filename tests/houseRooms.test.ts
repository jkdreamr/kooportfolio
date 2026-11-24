import { describe, expect, it } from "vitest";
import { moveInterior } from "../src/game/core/houseRooms";
import { ROOM } from "../src/game/core/room";

describe("connected house movement", () => {
  it("stops a long step at partitions rather than tunneling", () => {
    const [, z] = moveInterior("kappa", -5, 4, 0, -8);
    expect(z).toBeGreaterThan(1.7);
    const [x] = moveInterior("kitchen", -8, -3, 9, 0);
    expect(x).toBeLessThan(-5.9);
  });
  it("connects all three Kappa rooms with clear doors and entry", () => {
    expect(moveInterior("kappa", 0, ROOM.spawnZ, 0, -12)).toEqual([
      0,
      expect.closeTo(-2.5),
    ]);
    expect(moveInterior("kappa", -2, 5.5, 7, 0)[0]).toBeCloseTo(5);
    expect(moveInterior("kappa", 0, 9.5, 0, 1.8)[1]).toBeCloseTo(11.3);
  });
  it("connects dining to both kitchen and pantry and joins the back rooms", () => {
    for (const x of [-8.65, 8.65])
      expect(moveInterior("kitchen", x, 3, 0, -6)[1]).toBeCloseTo(-3);
    expect(moveInterior("kitchen", -8, -6.5, 6, 0)[0]).toBeCloseTo(-2);
  });
  it("slides along walls and preserves shared bounds for other scenes", () => {
    const [x, z] = moveInterior("kappa", -5, 3, 1, -4);
    expect(x).toBeCloseTo(-4);
    expect(z).toBeGreaterThan(1.7);
    expect(moveInterior("office", 0, 0, 30, -30)).toEqual([
      ROOM.walkX,
      ROOM.minZ,
    ]);
  });
});
