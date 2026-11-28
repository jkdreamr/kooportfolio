import { describe, expect, it } from "vitest";
import {
  DAILY_DISTANCES,
  LADDER,
  POWER_SWEEP_S,
  aimAt,
  aimForAngle,
  aimSweep,
  attemptFor,
  buildKick,
  currentAttempt,
  idealAngle,
  isGameWinner,
  ladderYards,
  makeScore,
  neededPower,
  newDrive,
  powerAt,
  powerZone,
  recordKick,
  resolveAttempt,
  snapClock,
  swingWindow,
} from "../src/game/core/stadiumChallenge";
import { attemptMetres, simulateKick } from "../src/game/core/fieldGoal";
import { botStats } from "./stadiumBots";

describe("the ladder", () => {
  it("climbs 25 … 60 then +1 yd", () => {
    expect(LADDER.map((_, i) => ladderYards(i))).toEqual([25, 30, 35, 39, 43, 46, 49, 52, 55, 58, 60]);
    expect(ladderYards(11)).toBe(61);
    expect(ladderYards(15)).toBe(65);
  });
  it("a miss repeats the distance; three misses end the drive", () => {
    const d = newDrive("drive", 1);
    recordKick(d, currentAttempt(d), "Good");
    expect(currentAttempt(d).yards).toBe(30);
    recordKick(d, currentAttempt(d), "Wide left");
    expect(currentAttempt(d).yards).toBe(30);
    recordKick(d, currentAttempt(d), "Short");
    expect(d.over).toBe(false);
    recordKick(d, currentAttempt(d), "Blocked");
    expect(d.over).toBe(true);
    expect(d.score).toBe(25);
    expect(d.longest).toBe(25);
  });
  it("scores yards, double on a game-winner, +5 after two in a row", () => {
    expect(makeScore(43, false, 1)).toBe(43);
    expect(makeScore(43, true, 1)).toBe(86);
    expect(makeScore(43, false, 3)).toBe(48);
    expect(isGameWinner(4)).toBe(true);
    expect(isGameWinner(3)).toBe(false);
  });
  it("the daily is six fixed distances, the same for everyone that day", () => {
    const a = newDrive("daily", 20000),
      b = newDrive("daily", 20000);
    const seen: number[] = [];
    while (!a.over) {
      const at = currentAttempt(a);
      expect(currentAttempt(b)).toEqual(at);
      seen.push(at.yards);
      recordKick(a, at, "Wide left");
      recordKick(b, at, "Wide left");
    }
    expect(seen).toEqual([...DAILY_DISTANCES]);
  });
  it("the first three rungs are calm, the first kick from the middle", () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(attemptFor(seed, 0, 0).spot.x).toBe(0);
      for (const r of [0, 1, 2]) expect(attemptFor(seed, r, r).spot.wind).toBe(0);
      expect(Math.abs(attemptFor(seed, 6, 6).spot.wind)).toBeLessThanOrEqual(1.6);
    }
  });
});

describe("power and aim", () => {
  it("needed power rises with distance and is above 0.8 from 60 yd", () => {
    let last = 0;
    for (let y = 20; y <= 64; y++) {
      const p = neededPower({ x: 0, d: attemptMetres(y), wind: 0 });
      expect(p).toBeGreaterThan(last);
      last = p;
    }
    expect(neededPower({ x: 0, d: attemptMetres(60), wind: 0 })).toBeGreaterThan(0.8);
  });
  it("power lands in green at p*, short below it", () => {
    for (const y of [25, 43, 55]) {
      const spot = { x: 0, d: attemptMetres(y), wind: 0 };
      const p = neededPower(spot);
      expect(simulateKick(buildKick(spot, p + 0.005, 0.5)).result).toBe("Good");
      expect(simulateKick(buildKick(spot, p - 0.05, 0.5)).result).toBe("Short");
    }
  });
  it("power matters: over-swing multiplies the aim error and hooks left", () => {
    const spot = { x: 0, d: attemptMetres(35), wind: 0 };
    const pStar = neededPower(spot),
      zone = powerZone(35);
    const ideal = idealAngle(spot, pStar);
    const clean = buildKick(spot, pStar + zone, aimForAngle(ideal + 0.02));
    const over = buildKick(spot, pStar + zone + 0.2, aimForAngle(ideal + 0.02));
    expect(clean.overswing).toBe(0);
    expect(over.overswing).toBeCloseTo(0.2);
    // Error 0.02 × (1 + 6·0.2) = 0.044, then a 0.06 rad hook to the left.
    expect(over.angle - idealAngle(spot, over.power)).toBeCloseTo(0.02 * 2.2 - 0.06, 3);
  });
  it("the power bar sweeps 0 → 1 in 1 s and back; the aim bar from its seeded edge", () => {
    expect(powerAt(0)).toBe(0);
    expect(powerAt(POWER_SWEEP_S)).toBeCloseTo(1);
    expect(powerAt(1.5)).toBeCloseTo(0.5);
    expect(aimAt(0, 0, 0)).toBe(0);
    expect(aimAt(0, 0, 1)).toBe(1);
    expect(aimAt(1 / aimSweep(0), 0, 0)).toBeCloseTo(1);
    expect(aimSweep(0)).toBeCloseTo(0.55);
    expect(aimSweep(100)).toBe(1.05);
  });
});

describe("clocks (review P0-7)", () => {
  it("rungs 1 and 2 have no clocks; later ones fall to their floors", () => {
    expect(snapClock(0)).toBe(Infinity);
    expect(swingWindow(1)).toBe(Infinity);
    expect(snapClock(2)).toBeCloseTo(1.5);
    expect(swingWindow(2)).toBeCloseTo(1.9);
    expect(snapClock(40)).toBe(1.25);
    expect(swingWindow(40)).toBe(1.4);
  });
  it("for every rung up to 40 the needed power and any aim are reachable with 150 ms to spare", () => {
    for (let rung = 0; rung <= 40; rung++) {
      const a = attemptFor(11, rung, rung);
      const pStar = Math.min(1, neededPower(a.spot));
      // Worst wait for the needed power is p* seconds (from 0 at the snap).
      expect(pStar * POWER_SWEEP_S, `rung ${rung}`).toBeLessThan(snapClock(rung) - 0.15);
      // Worst wait for any aim is one full traverse.
      expect(1 / aimSweep(rung), `rung ${rung}`).toBeLessThan(swingWindow(rung) - 0.15);
    }
  });
  it("a lock after its clock is blocked", () => {
    const a = attemptFor(1, 4, 4);
    expect(resolveAttempt(a, snapClock(4) + 0.01, 0.2).result).toBe("Blocked");
    expect(resolveAttempt(a, 0.5, swingWindow(4) + 0.01).result).toBe("Blocked");
    expect(resolveAttempt(a, null, null).result).toBe("Blocked");
  });
});

describe("tuning bots (§2.4)", () => {
  // Gaussian lock error σ on both bars. Printed values set core/medals.ts.
  it("perfect ≥ 60 yd; good 49–56; average 36–46; masher ≤ 35", () => {
    const perfect = botStats(0, 10),
      good = botStats(50),
      average = botStats(110),
      masher = botStats(250);
    expect(perfect.longest).toBeGreaterThanOrEqual(60);
    expect(good.longest).toBeGreaterThanOrEqual(49);
    expect(good.longest).toBeLessThanOrEqual(56.5);
    expect(average.longest).toBeGreaterThanOrEqual(36);
    expect(average.longest).toBeLessThanOrEqual(46);
    expect(masher.longest).toBeLessThanOrEqual(35);
    expect(masher.score).toBeLessThanOrEqual(70);
    expect(average.score).toBeGreaterThanOrEqual(90);
    expect(average.score).toBeLessThanOrEqual(250);
  });
});
