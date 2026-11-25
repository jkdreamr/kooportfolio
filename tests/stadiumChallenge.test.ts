import { describe, expect, it } from "vitest";
import {
  goalCrossingTime,
  judgeKick,
  kickPosition,
} from "../src/game/core/fieldGoal";
import {
  scoreStadiumKick,
  stadiumAimTarget,
  stadiumAimWindow,
  stadiumKick,
  stadiumPowerTarget,
  stadiumTiming,
  stadiumTimingStart,
  STADIUM_KICKS,
  STADIUM_TARGET,
} from "../src/game/core/stadiumChallenge";

describe("stadium challenge", () => {
  it.each(STADIUM_KICKS)(
    "gives each spot a playable power and aim window (%j)",
    (spot) => {
      const power = stadiumPowerTarget(spot);
      expect(power).toBeLessThan(1);
      expect(judgeKick(stadiumKick(spot, 0, 0.5))).toBe("Short");
      for (const timing of [power, 1]) {
        for (const x of [-2.1, 0, 2.1]) {
          const kick = stadiumKick(
            spot,
            timing,
            stadiumAimTarget(spot, timing, x),
          );
          expect(kickPosition(kick, goalCrossingTime(kick))[0]).toBeCloseTo(
            x,
            2,
          );
          expect(judgeKick(kick)).toBe("Good");
        }
      }
    },
  );

  it("moves the aim window against the crosswind", () => {
    const spot = STADIUM_KICKS[4];
    const calm = stadiumAimTarget({ ...spot, wind: 0 }, 0.8, 0);
    const aiming = stadiumAimTarget(spot, 0.8, 0);
    expect(aiming).toBeLessThan(calm);
    expect(judgeKick(stadiumKick(spot, 0.8, calm))).toBe("Wide right");
  });

  it("sweeps faster on later kicks and reverses at the far edge", () => {
    expect(stadiumTiming(0.5, 4, true)).toBeGreaterThan(
      stadiumTiming(0.5, 0, true),
    );
    expect(stadiumTiming(1 / 0.58, 0, true)).toBeCloseTo(1);
    expect(stadiumTiming(2 / 0.58, 0, true)).toBeCloseTo(0);
  });

  it("starts the first kick in the green on both meters without helping later kicks", () => {
    const spot = STADIUM_KICKS[0];
    const powerWindow = [stadiumPowerTarget(spot), 1] as const;
    const power = stadiumTimingStart(0, powerWindow);
    const aimWindow = stadiumAimWindow(spot, power);
    const aim = stadiumTimingStart(0, aimWindow);
    expect(power).toBeGreaterThan(powerWindow[0]);
    expect(aim).toBeGreaterThan(aimWindow[0]);
    expect(aim).toBeLessThan(aimWindow[1]);
    expect(stadiumTiming(0, 0, true, aim)).toBe(aim);
    expect(judgeKick(stadiumKick(spot, power, aim))).toBe("Good");
    expect(stadiumTimingStart(1, aimWindow)).toBe(0);
  });

  it("rewards consecutive makes and clears the streak on a miss", () => {
    let score = { points: 0, streak: 0 };
    for (let i = 0; i < 3; i++) score = scoreStadiumKick(score, "Good");
    expect(score).toEqual({ points: STADIUM_TARGET, streak: 3 });
    expect(scoreStadiumKick(score, "Short")).toEqual({
      points: STADIUM_TARGET,
      streak: 0,
    });
    score = scoreStadiumKick(scoreStadiumKick(score, "Wide left"), "Good");
    expect(score).toEqual({ points: STADIUM_TARGET + 3, streak: 1 });
  });
});
