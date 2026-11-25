import { describe, expect, it } from "vitest";
import {
  LANDING_TIME,
  RIM_AGE,
  TOSS_LEVELS,
  binPosition,
  canThrowPaper,
  chargePower,
  launchPaper,
  levelCleared,
  newTossRound,
  roundOver,
  shotPosition,
  stepToss,
  swipeToss,
  throwPaper,
  type TossRound,
} from "../src/game/core/paperToss";

const ATTEMPTS = TOSS_LEVELS[0].attempts;

function finishShot(round: TossRound, aim: number, power: number, dt = 1 / 60) {
  let current = throwPaper(round, aim, power);
  for (let i = 0; i < 150 && (current.shot || current.landing); i++)
    current = stepToss(current, dt);
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
      expect(finishShot(round, 0, 0.5, dt)).toMatchObject({
        attempts: 1,
        made: 1,
        result: "hit",
      });
      expect(finishShot(round, 1.6, 0.5, dt)).toMatchObject({
        attempts: 1,
        made: 0,
        result: "miss",
      });
      expect(finishShot(round, 0, 0.1, dt)).toMatchObject({
        attempts: 1,
        made: 0,
        result: "miss",
      });
      expect(finishShot(round, 0, 0.9, dt)).toMatchObject({
        attempts: 1,
        made: 0,
        result: "miss",
      });
    }
  });

  it("forgives near-center power without making weak and strong throws land the same", () => {
    const round = newTossRound();
    expect(finishShot(round, 0, 0.38).result).toBe("hit");
    expect(finishShot(round, 0, 0.62).result).toBe("hit");
    expect(finishShot(round, 0, 0.25).result).toBe("miss");
    expect(finishShot(round, 0, 0.75).result).toBe("miss");
  });

  it("maps a swipe to independent aim and power and previews the actual launch", () => {
    expect(swipeToss(0, -0.1, -0.2)).toEqual({ aim: -0.48, power: 0 });
    expect(swipeToss(1, 0.5, 1.3)).toEqual({ aim: 2.4, power: 1 });
    const { aim, power } = swipeToss(0.4, -0.2, 0.5);
    const launched = throwPaper(newTossRound(), aim, power);
    expect(launched.shot).toEqual(launchPaper(aim, power));
    expect(shotPosition(launched.shot!, RIM_AGE).y).toBeCloseTo(1.4);
    expect(finishShot(newTossRound(), aim, power).result).toBe("miss");
  });

  it("scores against the moving bin when the paper reaches it, not when released", () => {
    const landed = stepToss(throwPaper(newTossRound(), 0, 0.5), RIM_AGE);
    expect(binPosition(landed.railAngle)).toBe(0);
    const round = stepToss(landed, LANDING_TIME);
    expect(finishShot(round, 0, 0.5).result).toBe("miss");
    expect(finishShot(round, 1.3, 0.5)).toMatchObject({
      attempts: 2,
      made: 2,
      result: "hit",
    });
    expect(stepToss({ ...round, attempts: 4 }, 0.3).railAngle).toBeGreaterThan(
      stepToss(round, 0.3).railAngle,
    );
  });

  it("keeps the next throw unavailable until the landing animation ends", () => {
    const landed = stepToss(throwPaper(newTossRound(), 0, 0.5), RIM_AGE);
    expect(landed).toMatchObject({
      attempts: 1,
      made: 1,
      shot: null,
      landing: { age: 0 },
    });
    const settling = stepToss(landed, LANDING_TIME / 2);
    expect(canThrowPaper(settling)).toBe(false);
    expect(throwPaper(settling, 0, 0.5)).toBe(settling);
    const ready = stepToss(settling, LANDING_TIME / 2);
    expect(ready.landing).toBeNull();
    expect(canThrowPaper(ready)).toBe(true);
    expect(throwPaper(ready, 0, 0.5).shot).not.toBeNull();
  });

  it("blocks overlapping throws, ends after the level's shots, and starts a clean rematch", () => {
    const shot = throwPaper(newTossRound(), 0, 0);
    expect(throwPaper(shot, 0, 0.5)).toBe(shot);
    let round = newTossRound();
    for (let i = 0; i < ATTEMPTS; i++) round = finishShot(round, 0, 0);
    expect(round).toMatchObject({ attempts: ATTEMPTS, made: 0, shot: null });
    expect(roundOver(round)).toBe(true);
    expect(throwPaper(round, 0, 0.5)).toBe(round);
    expect(stepToss(round, 1)).toBe(round);
    expect(newTossRound()).toMatchObject({
      level: 0,
      attempts: 0,
      made: 0,
      shot: null,
      railAngle: 0,
    });
  });

  it("clears a level when enough shots land, with later levels harder", () => {
    expect(TOSS_LEVELS.length).toBeGreaterThan(1);
    let round = newTossRound();
    for (const aim of [0, 1.3, 1.7])
      round = finishShot({ ...round, railAngle: 0 }, aim, 0.5);
    expect(levelCleared(round)).toBe(true);
    expect(roundOver(round)).toBe(false);
    const next = newTossRound(round.level + 1);
    expect(next.level).toBe(1);
    expect(newTossRound(TOSS_LEVELS.length).level).toBe(TOSS_LEVELS.length - 1);
    expect(
      stepToss({ ...round, level: 4, attempts: 2 }, 0.3).railAngle,
    ).toBeGreaterThan(stepToss({ ...round, attempts: 2 }, 0.3).railAngle);
  });

  it("drifts the paper with wind and lands it in the farther bin", () => {
    const windy = TOSS_LEVELS.findIndex((l) => l.wind !== 0);
    const calm = throwPaper(newTossRound(), 0, 0.5).shot!;
    const blown = throwPaper(newTossRound(windy), 0, 0.5).shot!;
    expect(shotPosition(blown, RIM_AGE).x).toBeGreaterThan(
      shotPosition(calm, RIM_AGE).x,
    );
    expect(finishShot(newTossRound(windy), -0.6, 0.5).result).toBe("hit");

    const far = TOSS_LEVELS.findIndex((l) => l.binZ < -4);
    const longShot = throwPaper(newTossRound(far), 0, 0.5).shot!;
    expect(shotPosition(longShot, RIM_AGE).z).toBeLessThan(-4);
    expect(finishShot(newTossRound(far), 0, 0.5).result).toBe("hit");
    expect(finishShot(newTossRound(far), 0, 0.5).made).toBe(1);
  });
});
