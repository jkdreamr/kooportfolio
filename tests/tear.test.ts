import { describe, expect, it } from "vitest";
import {
  buildSeam,
  crackFronts,
  curl,
  curlClearAxis,
  flapOf,
  gapHalfWidth,
  mulberry32,
  noise1D,
  rayToRect,
  seamOffset,
  signedSeamDistance,
  tearFronts,
  toSeamFrame,
} from "../src/stage/peephole/tear";

const seam = () =>
  buildSeam({
    origin: { x: 820, y: 290 },
    dir: { x: 3, y: 1 },
    width: 1440,
    height: 900,
    rim: 18,
    seed: 7,
  });

describe("seeded noise", () => {
  it("is deterministic and bounded", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
    const n = noise1D(3);
    for (let x = -50; x < 50; x += 0.37) {
      expect(Math.abs(n(x))).toBeLessThanOrEqual(1);
    }
    // Continuous.
    expect(Math.abs(n(10.5) - n(10.5001))).toBeLessThan(1e-3);
  });
});

describe("seam", () => {
  it("reaches past every edge of the paper along the pull axis", () => {
    const s = seam();
    const end = (k: number) => ({
      x: s.origin.x + s.dir.x * k,
      y: s.origin.y + s.dir.y * k,
    });
    const a = end(s.sMax);
    const b = end(s.sMin);
    const outside = (p: { x: number; y: number }) =>
      p.x < 0 || p.x > 1440 || p.y < 0 || p.y > 900;
    expect(outside(a)).toBe(true);
    expect(outside(b)).toBe(true);
    expect(rayToRect({ x: 0, y: 0 }, { x: 1, y: 0 }, 100, 50)).toBe(100);
  });
  it("starts on the rim, wanders, and is the same for the same seed", () => {
    const s = seam();
    expect(seamOffset(s, 0)).toBe(0);
    expect(seamOffset(s, 10)).toBe(0);
    let max = 0;
    for (let k = s.sMin; k < s.sMax; k += 3) max = Math.max(max, Math.abs(seamOffset(s, k)));
    expect(max).toBeGreaterThan(3);
    expect(max).toBeLessThan(20);
    expect(seam().offsets).toEqual(s.offsets);
    const other = buildSeam({ ...s, width: 1440, height: 900, seed: 8 });
    expect(other.offsets).not.toEqual(s.offsets);
  });
  it("splits the page into two flaps by signed distance", () => {
    const s = seam();
    const above = { x: s.origin.x + s.normal.x * 120, y: s.origin.y + s.normal.y * 120 };
    const below = { x: s.origin.x - s.normal.x * 120, y: s.origin.y - s.normal.y * 120 };
    expect(flapOf(s, above)).toBe(1);
    expect(flapOf(s, below)).toBe(-1);
    const f = toSeamFrame(s, above);
    expect(f.t).toBeCloseTo(120);
    expect(signedSeamDistance(s, above)).toBeCloseTo(120 - seamOffset(s, f.s));
  });
  it("tear fronts run from the rim to both ends; preview cracks stay short", () => {
    const s = seam();
    const start = tearFronts(s, 0);
    expect(start.back).toBeCloseTo(-s.rim);
    expect(start.front).toBeCloseTo(s.rim);
    const end = tearFronts(s, 1);
    expect(end.back).toBeCloseTo(s.sMin);
    expect(end.front).toBeCloseTo(s.sMax);
    const mid = tearFronts(s, 0.5);
    // Trailing side leads.
    expect(-mid.back / -s.sMin).toBeGreaterThan(mid.front / s.sMax);
    const crack = crackFronts(s, 1, 220);
    expect(crack.front - crack.back).toBeLessThan(0.9 * 220 + 2 * s.rim);
    expect(gapHalfWidth(0, crack, 6)).toBeCloseTo(6);
    expect(gapHalfWidth(crack.front, crack, 6)).toBe(0);
    expect(gapHalfWidth(crack.front + 5, crack, 6)).toBe(0);
  });
});

describe("page curl", () => {
  it("leaves flat paper alone beyond the fold", () => {
    expect(curl(300, 100, 40)).toEqual({ u: 300, z: 0, phi: 0 });
  });
  it("is continuous and preserves arc length", () => {
    const R = 40;
    const axis = 260;
    let prev = curl(0, axis, R);
    let arc = 0;
    const step = 0.5;
    for (let d = step; d <= 400; d += step) {
      const p = curl(d, axis, R);
      const seg = Math.hypot(p.u - prev.u, p.z - prev.z);
      expect(seg).toBeLessThan(step * 1.01);
      arc += seg;
      prev = p;
    }
    expect(arc).toBeCloseTo(400, 0);
  });
  it("turns the torn edge over and carries it away from the seam", () => {
    const R = 50;
    const p = curl(0, 400, R);
    expect(p.phi).toBeGreaterThan(Math.PI);
    expect(p.z).toBe(2 * R);
    expect(p.u).toBeGreaterThan(400);
  });
  it("a flap is entirely past its far edge at the clear axis", () => {
    const R = 60;
    const dMax = 700;
    const axis = curlClearAxis(dMax, R);
    for (let d = 0; d <= dMax; d += 10) expect(curl(d, axis, R).u).toBeGreaterThan(dMax);
  });
});
