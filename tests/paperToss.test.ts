import { describe, expect, it } from "vitest";
import {
  TOSS_LIMIT, binPosition, chargePower, newTossRound, stepToss, throwPaper, type TossRound,
} from "../src/game/core/paperToss";

function finishShot(round: TossRound, aim: number, power: number, dt = 1 / 60) {
  let current = throwPaper(round, aim, power);
  for (let i = 0; i < 150 && current.shot; i++) current = stepToss(current, dt);
  return current;
}

describe("paper toss", () => {
  it("charges up and back down until release", () => {
    expect(chargePower(0)).toBe(0);
    expect(chargePower(0.475)).toBeCloseTo(0.5);
    expect(chargePower(0.95)).toBeCloseTo(1);
    expect(chargePower(1.425)).toBeCloseTo(0.5);
    expect(chargePower(1.9)).toBeCloseTo(0);
  });

  it("requires both aim and power, independent of crossing frame size", () => {
    for (const dt of [1 / 60, 0.1]) {
      const round = newTossRound();
      expect(finishShot(round, 0, 0.5, dt)).toMatchObject({ attempts: 1, score: 1, result: "hit" });
      expect(finishShot(round, 1.6, 0.5, dt)).toMatchObject({ attempts: 1, score: 0, result: "miss" });
      expect(finishShot(round, 0, 0.1, dt)).toMatchObject({ attempts: 1, score: 0, result: "miss" });
      expect(finishShot(round, 0, 0.9, dt)).toMatchObject({ attempts: 1, score: 0, result: "miss" });
    }
  });

  it("scores against the moving bin when the paper reaches it, not when released", () => {
    const round = finishShot(newTossRound(), 0, 0.5);
    expect(binPosition(round.railAngle)).toBe(0);
    expect(finishShot(round, 0, 0.5).result).toBe("miss");
    expect(finishShot(round, 1.3, 0.5)).toMatchObject({ attempts: 2, score: 2, result: "hit" });
    expect(stepToss({ ...round, attempts: 4 }, 0.3).railAngle)
      .toBeGreaterThan(stepToss(round, 0.3).railAngle);
  });

  it("blocks overlapping throws, ends after six shots, and starts a clean rematch", () => {
    const shot = throwPaper(newTossRound(), 0, 0);
    expect(throwPaper(shot, 0, 0.5)).toBe(shot);
    let round = newTossRound();
    for (let i = 0; i < TOSS_LIMIT; i++) round = finishShot(round, 0, 0);
    expect(round).toMatchObject({ attempts: TOSS_LIMIT, score: 0, shot: null });
    expect(throwPaper(round, 0, 0.5)).toBe(round);
    expect(stepToss(round, 1)).toBe(round);
    expect(newTossRound()).toMatchObject({ attempts: 0, score: 0, shot: null, railAngle: 0 });
  });
});
