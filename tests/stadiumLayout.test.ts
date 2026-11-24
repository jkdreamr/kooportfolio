import { describe, expect, it } from "vitest";
import { moveInterior } from "../src/game/core/houseRooms";
import { STADIUM, STADIUM_SOLIDS } from "../src/game/core/stadiumLayout";
import { stadiumCameraFrame } from "../src/game/core/stadiumCamera";

describe("stadium walking", () => {
  it.each([-1, 1])(
    "slides along side %s instead of walking under its seating",
    (side) => {
      let x = 0;
      let z: number = STADIUM.spawnZ;
      for (let frame = 0; frame < 300; frame++)
        [x, z] = moveInterior(
          "stadium",
          x,
          z,
          side * 0.55 * 0.16,
          -0.83 * 0.16,
        );
      expect(Math.abs(x)).toBeLessThan(10.2);
      expect(z).toBeLessThan(-12);
      expect(
        STADIUM_SOLIDS.some(
          (solid) =>
            Math.abs(x - solid.x) < solid.width / 2 + 0.34 &&
            Math.abs(z - solid.z) < solid.depth / 2 + 0.34,
        ),
      ).toBe(false);
    },
  );

  it("connects the larger field to its actual entrance without an invisible wall", () => {
    const field = moveInterior("stadium", 0, STADIUM.spawnZ, 0, -50);
    expect(field[0]).toBe(0);
    expect(field[1]).toBeCloseTo(-23.5);
    const [x, z] = moveInterior("stadium", 0, -23.5, 0, 51.8);
    expect(x).toBe(0);
    expect(z).toBeCloseTo(STADIUM.doorZ);
  });

  it("views the outer west walkway from outside the opaque suite tower", () => {
    const frame = stadiumCameraFrame(
      { x: -19, z: 0 },
      false,
      [0, 0.48, 14.2],
      true,
    );
    expect(frame.position[0]).toBeLessThan(-19);
    expect(frame.target[0]).toBe(-19);
  });
});
