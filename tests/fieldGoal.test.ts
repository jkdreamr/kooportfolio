import { describe, expect, it } from "vitest";
import {
  FIELD_GOAL,
  goalCrossingTime,
  goalClearanceTime,
  judgeKick,
  kickPosition,
  kickPower,
} from "../src/game/core/fieldGoal";

describe("stadium field goals", () => {
  it("scores the same arc the player sees crossing above the crossbar", () => {
    const kick = { angle: 0, power: 0.7 };
    const [x, y, z] = kickPosition(kick, goalCrossingTime(kick));
    expect(x).toBe(0);
    expect(z).toBeCloseTo(FIELD_GOAL.goalZ);
    expect(y - FIELD_GOAL.ballRadius).toBeGreaterThan(FIELD_GOAL.crossbar);
    expect(judgeKick(kick)).toBe("Good");
  });
  it("rejects underpowered and wide kicks, symmetrically", () => {
    expect(judgeKick({ angle: 0, power: 0.15 })).toBe("Short");
    expect(judgeKick({ angle: -0.3, power: 0.7 })).toBe("Wide left");
    expect(judgeKick({ angle: 0.3, power: 0.7 })).toBe("Wide right");
  });
  it("does not award a ball clipping an upright", () => {
    const angle = Math.atan(
      (FIELD_GOAL.halfWidth - FIELD_GOAL.ballRadius / 2) /
        (FIELD_GOAL.startZ - FIELD_GOAL.goalZ),
    );
    expect(judgeKick({ angle, power: 0.7 })).toBe("Wide right");
  });

  it("rejects a descending ball that clips after its center crosses the bar", () => {
    const kick = { angle: 0, power: 0.52206 };
    const [, y] = kickPosition(kick, goalCrossingTime(kick));
    expect(y - FIELD_GOAL.ballRadius - FIELD_GOAL.postRadius).toBeGreaterThan(
      FIELD_GOAL.crossbar,
    );
    expect(judgeKick(kick)).toBe("Short");
    expect(goalClearanceTime(kick)).toBeGreaterThan(goalCrossingTime(kick));
    expect(kickPosition(kick, goalClearanceTime(kick))[2]).toBeCloseTo(
      FIELD_GOAL.goalZ - FIELD_GOAL.ballRadius - FIELD_GOAL.postRadius,
    );
    expect(judgeKick({ angle: 0, power: 0.53 })).toBe("Good");
  });
  it("allows a high kick above the tops of the uprights", () => {
    expect(judgeKick({ angle: 0, power: 1 })).toBe("Good");
  });
  it("clamps power to its legal range and keeps the timing meter bounded", () => {
    expect(kickPosition({ angle: 0, power: 2 }, 1)).toEqual(
      kickPosition({ angle: 0, power: 1 }, 1),
    );
    for (let time = 0; time < 10; time += 0.1) {
      expect(kickPower(time)).toBeGreaterThanOrEqual(0.15);
      expect(kickPower(time)).toBeLessThanOrEqual(1);
    }
  });
});
