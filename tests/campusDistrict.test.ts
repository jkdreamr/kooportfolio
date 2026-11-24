import { describe, expect, it } from "vitest";
import {
  campusDistrictFootprint as parcel,
  campusDistrictObstacles as obstacles,
  campusDistrictStops as stops,
} from "../src/game/core/campusDistrict";

const clear = (x: number, z: number) =>
  !obstacles.some(
    ([cx, cz, hx, hz]) =>
      Math.abs(x - cx) < hx + 0.3 && Math.abs(z - cz) < hz + 0.3,
  );

describe("campus district pedestrian layout", () => {
  it("keeps the eight campus stops clear at avatar clearance", () => {
    expect(Object.keys(stops)).toHaveLength(8);
    for (const [name, [x, z]] of Object.entries(stops)) {
      expect(clear(x, z), name).toBe(true);
      expect(x).toBeGreaterThan(parcel.minX);
      expect(x).toBeLessThan(parcel.maxX);
      expect(z).toBeGreaterThan(parcel.minZ);
      expect(z).toBeLessThan(parcel.maxZ);
    }
  });
  it("connects the entry to the Oval, quad, church and side courts without crossing solids", () => {
    // Flood-fill at the same 0.6-unit grid spacing used by world navigation.
    const grid = 0.6,
      key = (x: number, z: number) => `${x},${z}`;
    const start = stops.entry.map((n) => Math.round(n / grid));
    const queue = [start],
      seen = new Set([key(start[0], start[1])]);
    for (let i = 0; i < queue.length; i++) {
      const [x, z] = queue[i];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz,
          wx = nx * grid,
          wz = nz * grid,
          id = key(nx, nz);
        if (
          seen.has(id) ||
          wx < parcel.minX ||
          wx > parcel.maxX ||
          wz < parcel.minZ ||
          wz > parcel.maxZ ||
          !clear(wx, wz)
        )
          continue;
        seen.add(id);
        queue.push([nx, nz]);
      }
    }
    for (const [name, [x, z]] of Object.entries(stops))
      expect(
        seen.has(key(Math.round(x / grid), Math.round(z / grid))),
        name,
      ).toBe(true);
  });
  it("contains every collision rectangle inside the agreed parcel", () => {
    for (const [x, z, hx, hz] of obstacles) {
      expect(hx).toBeGreaterThan(0);
      expect(hz).toBeGreaterThan(0);
      expect(x - hx).toBeGreaterThanOrEqual(parcel.minX);
      expect(x + hx).toBeLessThanOrEqual(parcel.maxX);
      expect(z - hz).toBeGreaterThanOrEqual(parcel.minZ);
      expect(z + hz).toBeLessThanOrEqual(parcel.maxZ);
    }
  });
});
