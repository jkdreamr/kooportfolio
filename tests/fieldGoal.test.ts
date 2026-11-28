import { describe, expect, it } from "vitest";
import { FIELD_GOAL, YARD_M, attemptMetres, attemptYards, fieldZ, planeCrossing, simulateKick, type KickSpot } from "../src/game/core/fieldGoal";

const mid = (yards: number, x = 0): KickSpot => ({ x, d: attemptMetres(yards), wind: 0 });
/** The angle that sends the ball to lateral `x` at the plane (no wind). */
function angleTo(spot: KickSpot, x: number) {
  return Math.atan2(x - spot.x, spot.d);
}

describe("field goal flight", () => {
  it("real goal: 5.64 m between the uprights, a 3.05 m crossbar", () => {
    expect(FIELD_GOAL.halfWidth * 2).toBeCloseTo(5.64);
    expect(FIELD_GOAL.crossbar).toBe(3.05);
  });
  it("yardage round-trips and every spot sits on its painted line", () => {
    for (let yards = 18; yards <= 70; yards++) {
      expect(attemptYards(attemptMetres(yards))).toBe(yards);
      // Posts are 10 yards behind the goal line: a 43-yarder is spotted on the 33.
      expect(fieldZ(attemptMetres(yards))).toBeCloseTo(FIELD_GOAL.goalLineZ + (yards - 10) * FIELD_GOAL.yardUnits);
    }
    expect(fieldZ(10 * YARD_M)).toBeCloseTo(FIELD_GOAL.goalLineZ);
  });
  it("through the middle is good; short and wide are not, symmetrically", () => {
    const spot = mid(30);
    expect(simulateKick({ angle: 0, power: 0.6, spot }).result).toBe("Good");
    expect(simulateKick({ angle: 0, power: 0.05, spot }).result).toBe("Short");
    expect(simulateKick({ angle: -0.2, power: 0.6, spot }).result).toBe("Wide left");
    expect(simulateKick({ angle: 0.2, power: 0.6, spot }).result).toBe("Wide right");
  });
  it("a ball 5 cm inside an upright scores; 5 cm outside does not", () => {
    const spot = mid(35);
    const R = FIELD_GOAL.ballRadius + FIELD_GOAL.postRadius;
    const inside = FIELD_GOAL.halfWidth - R - 0.05,
      outside = FIELD_GOAL.halfWidth + R + 0.05;
    expect(simulateKick({ angle: angleTo(spot, inside), power: 0.7, spot }).result).toBe("Good");
    expect(simulateKick({ angle: angleTo(spot, outside), power: 0.7, spot }).result).toBe("Wide right");
    expect(simulateKick({ angle: angleTo(spot, -outside), power: 0.7, spot }).result).toBe("Wide left");
  });
  it("on the post: it rings off, and may go in or out (both happen)", () => {
    const spot = mid(35);
    const results = new Set<string>();
    for (let k = -8; k <= 8; k++) {
      const x = FIELD_GOAL.halfWidth + k * 0.025;
      const f = simulateKick({ angle: angleTo(spot, x), power: 0.5, spot });
      if (f.hit === "post") results.add(f.result);
    }
    expect(results.has("Good")).toBe(true);
    expect([...results].some((r) => r !== "Good")).toBe(true);
  });
  it("the crossbar: just over is good, a doink off the top can drop in, just under is short", () => {
    const spot = mid(40);
    let lo = 0.3,
      hi = 0.9;
    // Find the power whose centre crosses the plane at the bar.
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (planeCrossing({ angle: 0, power: m, spot })![1] < FIELD_GOAL.crossbar) lo = m;
      else hi = m;
    }
    expect(simulateKick({ angle: 0, power: hi + 0.03, spot }).result).toBe("Good");
    expect(simulateKick({ angle: 0, power: hi - 0.03, spot }).result).toBe("Short");
    const near = simulateKick({ angle: 0, power: hi, spot });
    expect(near.hit).toBe("crossbar");
  });
  it("wind pushes the ball sideways", () => {
    const spot: KickSpot = { x: 0, d: attemptMetres(40), wind: 1.6 };
    const c = planeCrossing({ angle: 0, power: 0.7, spot })!;
    expect(c[0]).toBeGreaterThan(0.5);
  });
});
