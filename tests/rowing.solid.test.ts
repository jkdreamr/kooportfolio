import { describe, expect, it } from "vitest";
import { BUOY, PEDAL, PIER, V_MAX, freshRowInput, hullGap, newRace, stepRace, type Race } from "../src/game/core/rowing";

/** Every solid obstacle at the race's current time: [s, d, radius]. */
const solids = (r: Race): [number, number, number][] => [
  [r.course.bridge, PIER.d, PIER.radius],
  [r.course.bridge, -PIER.d, PIER.radius],
  ...r.course.bends.map((b): [number, number, number] => [b.apexS, b.apexD, BUOY.radius]),
  ...r.pedals.map((p): [number, number, number] => [p.s, p.d, PEDAL.radius]),
];
const deepest = (r: Race) => Math.max(...solids(r).map(([s, d, R]) => hullGap(r, r.boats[0], s, d, R)));

/** A Grand Prix with the rivals parked far away, the player placed by hand. */
function place(s: number, d: number, th: number, v: number) {
  const r = newRace({ mode: "gp", seed: 3 });
  r.t = 1;
  r.boats.forEach((b, i) => i && ((b.s = -400 - i * 20), (b.finished = true)));
  const p = r.boats[0];
  Object.assign(p, { s, d, th, v });
  return { r, p };
}
const run = (r: Race, seconds: number, steer: (t: number) => number, each?: () => void) => {
  const inputs = [freshRowInput(), freshRowInput(), freshRowInput(), freshRowInput()];
  for (let i = 0; i < seconds * 60; i++) {
    inputs[0].steer = steer(i / 60);
    stepRace(r, inputs);
    each?.();
  }
};

describe("Regatta: obstacles are solid", () => {
  it("no approach to a pier, buoy or pedal boat ever passes through it", () => {
    const c = newRace({ mode: "gp" }).course;
    let worst = 0;
    const targets: [number, number][] = [
      [c.bridge, PIER.d],
      [c.bridge, -PIER.d],
      ...c.bends.map((b): [number, number] => [b.apexS, b.apexD]),
      ...newRace({ mode: "gp" }).pedals.map((p): [number, number] => [p.s, 0]),
    ];
    for (const [s, d] of targets)
      for (const off of [-0.8, -0.3, 0, 0.3, 0.8])
        for (const th of [-0.25, 0, 0.25])
          for (const v of [6, 12, V_MAX]) {
            const { r, p } = place(s - 10, d + off - Math.sin(th) * 10, th, v);
            p.boostT = v > 13 ? 5 : 0;
            run(r, 2, () => 0, () => void (worst = Math.max(worst, deepest(r))));
          }
    // Resolved every step: at most a hair of overlap after the step.
    expect(worst).toBeLessThan(0.12);
  }, 120_000);
  it("a head-on pier hit stops the boat dead and bounces it back", () => {
    const { r, p } = place(newRace().course.bridge - 6, PIER.d, 0, 12);
    let minV = 99,
      back = false,
      prev = p.s;
    const events: string[] = [];
    run(r, 1, () => 0, () => {
      minV = Math.min(minV, p.v);
      if (p.s < prev - 1e-4) back = true;
      prev = p.s;
      for (const e of r.events) if (e.boat === 0) events.push(e.k);
    });
    expect(minV).toBeLessThan(1);
    expect(back).toBe(true);
    expect(events).toContain("pier");
  });
  it("is fair: steering away always frees you, and a passive boat slides off", () => {
    const bridge = newRace().course.bridge;
    for (const steer of [1, -1, 0]) {
      const { r, p } = place(bridge - 6, PIER.d, 0, 12);
      run(r, 8, (t) => (t > 1 ? steer : 0));
      expect(p.s).toBeGreaterThan(bridge + 6);
    }
  });
  it("the wrong-way reset still works next to an obstacle", () => {
    const { r, p } = place(newRace().course.bridge - 4, PIER.d + 2.2, Math.PI * 0.9, 3);
    const seen: string[] = [];
    run(r, 3.5, () => 0, () => r.events.forEach((e) => e.boat === 0 && seen.push(e.k)));
    expect(seen).toContain("reset");
    expect(Math.abs(p.th)).toBeLessThan(Math.PI / 2);
  });
});
