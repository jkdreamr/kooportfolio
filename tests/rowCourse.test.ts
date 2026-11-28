import { describe, expect, it } from "vitest";
import { HALF_WIDTH, course, kappa, lineOffset } from "../src/game/core/rowCourse";

describe("Regatta courses", () => {
  it("the Lagoon Loop closes at the origin after 360° and is 388 long", () => {
    const c = course("loop");
    expect(c.length).toBeCloseTo(388.0, 0);
    expect(Math.hypot(c.x[c.n - 1], c.y[c.n - 1])).toBeLessThan(0.01);
    expect(c.h[c.n - 1]).toBeCloseTo(2 * Math.PI, 3);
  });
  it("the River Run is 457.3 long", () => {
    expect(course("river").length).toBeCloseTo(457.3, 0);
  });
  it("|dκ| < 1 everywhere on the water", () => {
    for (const id of ["loop", "river"] as const) {
      const c = course(id);
      for (let s = 0; s < c.length; s += 0.5) expect(Math.abs(HALF_WIDTH * kappa(c, s))).toBeLessThan(1);
    }
  });
  it("the racing line stays on the water and goes inside at each apex", () => {
    const c = course("loop");
    for (let s = 0; s < c.length; s += 1) expect(Math.abs(lineOffset(c, s))).toBeLessThanOrEqual(6.4 + 1e-9);
    for (const b of c.bends) expect(Math.sign(lineOffset(c, b.apexS))).toBe(Math.sign(b.k));
  });
});
