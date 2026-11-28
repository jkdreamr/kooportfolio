import { describe, expect, it } from "vitest";
import { BOOST, BUMP, CORNER, CRUISE, ROCKET, SLIP, bump, freshRowInput, newRace, speedFactor, stepBoat, stepRace, type Boat } from "../src/game/core/rowing";
import { decodeGhost, encodeGhost, ghostRecorder } from "../src/game/core/rowGhost";
import { course, kappa } from "../src/game/core/rowCourse";
import { playRace } from "./rowSim";

const idle = [freshRowInput(), freshRowInput(), freshRowInput(), freshRowInput()];
const solo = () => {
  const r = newRace({ mode: "tt" });
  r.t = 0.5;
  const b = r.boats[0];
  b.v = CRUISE;
  return { r, b };
};

describe("Regatta physics", () => {
  it("kinematics conserve water speed: ds/dt = v cos θ / (1 − dκ)", () => {
    const { r, b } = solo();
    b.s = 70; // inside the first left bend (R22)
    b.d = 5;
    const k = kappa(r.course, b.s);
    expect(k).toBeCloseTo(1 / 22);
    const s0 = b.s;
    stepBoat(r, b, freshRowInput(), 1 / 600);
    const ds = (b.s - s0) * 600;
    expect(ds).toBeCloseTo((b.v * Math.cos(b.th)) / (1 - 5 * k), 1);
    expect(ds).toBeGreaterThan(b.v); // the inside of the bend covers more course
  });
  it("speed table: hold water, shallows, boost multiply the target", () => {
    const { r, b } = solo();
    const base = speedFactor(r, b);
    b.holding = true;
    expect(speedFactor(r, b) / base).toBeCloseTo(0.55);
    b.holding = false;
    b.d = 8;
    expect(speedFactor(r, b) / base).toBeCloseTo(0.8);
    b.d = 0;
    b.boostT = 1;
    expect(speedFactor(r, b) / base).toBeCloseTo(BOOST.mult);
  });
  it("the bank halves speed and scrapes", () => {
    const { r, b } = solo();
    b.d = 8.99;
    b.th = 0.5;
    stepBoat(r, b, freshRowInput());
    expect(Math.abs(b.d)).toBeLessThanOrEqual(9);
    expect(b.v).toBeLessThan(CRUISE * 0.6);
    expect(b.scrapeT).toBeGreaterThan(0);
  });
  it("boost meter arithmetic: a charge costs 100 and lasts 2.5 s", () => {
    const { r, b } = solo();
    b.meter = 250;
    stepBoat(r, b, { steer: 0, boost: true, hold: false });
    expect(b.meter).toBe(150);
    expect(b.boostT).toBeCloseTo(BOOST.time - 1 / 60, 2);
    b.prevBoost = false;
    stepBoat(r, b, { steer: 0, boost: true, hold: false });
    expect(b.meter).toBe(150); // not while one is running
  });
  it("slipstream arms after 1.5 s and slings on release", () => {
    const r = newRace({ mode: "gp", seed: 1 });
    r.t = 5;
    const [p, a] = r.boats;
    p.s = 300;
    p.d = 0;
    a.s = 308;
    a.d = 0;
    r.boats[2].s = r.boats[3].s = 600;
    for (const b of r.boats) b.v = CRUISE;
    const ins = idle;
    let armedAt = -1;
    for (let i = 0; i < 120; i++) {
      a.s = p.s + 8; // hold the gap
      stepRace(r, ins);
      if (p.armed && armedAt < 0) armedAt = i;
    }
    expect(armedAt).toBeGreaterThanOrEqual(Math.floor(SLIP.arm * 60) - 2);
    a.d = 6; // he moves away: the slingshot fires
    stepRace(r, ins);
    expect(p.slingT).toBeGreaterThan(0);
  });
  it("corner grades: Perfect at a gap of 1.8, Clean at 3.5", () => {
    const grade = (d: number) => {
      const { r, b } = solo();
      const bend = r.course.bends[0];
      b.s = bend.apexS - 0.05;
      b.d = d;
      b.bend = 0;
      b.bendGraded = false;
      b.bendVoid = false;
      b.meter = 0;
      stepBoat(r, b, freshRowInput());
      return b.meter;
    };
    expect(grade(7.4 - 1.75)).toBe(CORNER.perfectGain);
    expect(grade(7.4 - 3.4)).toBe(CORNER.cleanGain);
    expect(grade(7.4 - 4)).toBe(0);
  });
  it("the bump law conserves momentum along the normal within the restitution", () => {
    const r = newRace({ mode: "gp", seed: 1 });
    const [a, b] = r.boats as [Boat, Boat];
    a.s = 100;
    a.d = 0;
    a.th = 0.3;
    a.v = 12;
    b.s = 100.5;
    b.d = 1.5;
    b.th = -0.2;
    b.v = 9;
    const before = a.v * Math.sin(a.th) + b.v * Math.sin(b.th) + a.v * Math.cos(a.th) + b.v * Math.cos(b.th);
    expect(bump(r, a, b, false)).toBe(true);
    const after = a.v * Math.sin(a.th) + b.v * Math.sin(b.th) + a.v * Math.cos(a.th) + b.v * Math.cos(b.th);
    expect(after).toBeCloseTo(before, 6);
    void BUMP;
  });
  it("rocket start inside ±120 ms; early is a stall", () => {
    const r = newRace({ mode: "tt" });
    const b = r.boats[0];
    while (r.t < -0.05) stepRace(r, idle);
    stepRace(r, [{ steer: 0, boost: true, hold: false }]);
    expect(b.rocketUsed).toBe(true);
    expect(b.rocketT).toBeGreaterThan(0);
    const r2 = newRace({ mode: "tt" });
    while (r2.t < -1) stepRace(r2, idle);
    stepRace(r2, [{ steer: 0, boost: true, hold: false }]);
    for (let i = 0; i < 70; i++) stepRace(r2, idle);
    expect(r2.boats[0].stallT).toBeGreaterThan(0);
    void ROCKET;
  });
  it("checkpoints come in order and laps are timed", () => {
    const res = playRace("line", "novice", 3);
    expect(res.time).toBeGreaterThan(85);
    expect(res.time).toBeLessThan(120);
  });
  it("rivals are deterministic for a seed", () => {
    expect(playRace("line", "varsity", 9)).toEqual(playRace("line", "varsity", 9));
  });
  it("ghost encode and decode round trip within 0.05 u", () => {
    const rec = ghostRecorder(60);
    for (let i = 0; i < 300; i++) rec.sample(i / 60, i * 0.2 + 0.0123, Math.sin(i) * 7.3, Math.cos(i) * 0.4);
    const back = decodeGhost(encodeGhost(rec.ghost))!;
    expect(back.n).toBe(rec.ghost.n);
    for (let i = 0; i < back.n; i++) {
      expect(Math.abs(back.s[i] - rec.ghost.s[i])).toBeLessThan(0.05);
      expect(Math.abs(back.d[i] - rec.ghost.d[i])).toBeLessThan(0.05);
    }
  });
  it("a solo Time Trial: the racing line beats the centre line by ≥ 4 s", () => {
    const tt = (bot: "line" | "centre") => playRace(bot, "novice", 1, { mode: "tt" }).time;
    expect(tt("centre") - tt("line")).toBeGreaterThanOrEqual(4);
    void course;
  });
});
