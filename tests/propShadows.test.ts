import { describe, expect, it } from "vitest";
import { propBlobs, type PropBox } from "../src/game/world/env/PropShadows";

const b = (x: number, z: number, w: number, d: number, y0: number, y1: number): PropBox => ({
  minX: x - w / 2, maxX: x + w / 2, minY: y0, maxY: y1, minZ: z - d / 2, maxZ: z + d / 2,
});

describe("interior contact blobs (B10)", () => {
  const floor = b(0, 0, 10, 8, -0.2, 0);
  it("one blob per table-and-chairs group, footprint × 0.6", () => {
    const table = [b(0, 0, 1.2, 0.8, 0.7, 0.76), ...[[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]].map(([x, z]) => b(x, z, 0.06, 0.06, 0, 0.7))];
    const chair = [b(2, 0, 0.45, 0.45, 0.42, 0.47), b(2, 0, 0.45, 0.05, 0, 0.42), b(2, 0.2, 0.45, 0.05, 0.47, 0.95)];
    const blobs = propBlobs([floor, ...table, ...chair]);
    expect(blobs).toHaveLength(2);
    const t = blobs.find((x) => Math.abs(x.x) < 0.1)!;
    expect(t.rx).toBeCloseTo(1.2 * 0.6, 2);
    expect(t.y).toBeCloseTo(0.012, 3);
  });
  it("skips walls, tall shelves, rugs and lights on the ceiling", () => {
    const wall = b(-4.9, 0, 0.2, 8, 0, 3);
    const shelf = b(-4, 3, 1.2, 0.4, 0, 2.4);
    const rug = b(0, 0, 3, 2, 0, 0.01);
    const lamp = b(1, 1, 0.4, 0.4, 2.6, 2.9);
    expect(propBlobs([floor, wall, shelf, rug, lamp])).toEqual([]);
  });
  it("a chair against a wall still gets its blob", () => {
    const wall = b(-4.9, 0, 0.2, 8, 0, 3);
    const chair = b(-4.55, 0, 0.45, 0.45, 0, 0.95);
    expect(propBlobs([floor, wall, chair])).toHaveLength(1);
  });
});
