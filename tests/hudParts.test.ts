import { describe, expect, it } from "vitest";
import { COUNT_MS, countAt, easeOut } from "../src/game/ui/ResultCard";
import { rideLabel } from "../src/game/ui/TravelMap";

describe("result count-up", () => {
  it("runs 0 → score over 600 ms on the shared ease", () => {
    expect(countAt(120, 0)).toBe(0);
    expect(countAt(120, COUNT_MS)).toBe(120);
    expect(countAt(120, COUNT_MS * 2)).toBe(120);
    // cubic-bezier(.2,.8,.2,1) is front-loaded: well past half at 30%.
    expect(easeOut(0.3)).toBeGreaterThan(0.6);
    let last = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const y = easeOut(t);
      expect(y).toBeGreaterThanOrEqual(last - 1e-9);
      last = y;
    }
  });
});

describe("travel card copy", () => {
  it("says how and how long", () => {
    expect(rideLabel("plane")).toBe("Fly · 18 s");
    expect(rideLabel("train")).toBe("Train · 14 s");
    expect(rideLabel("plane", true)).toBe("Fly · 6 s");
  });
});
