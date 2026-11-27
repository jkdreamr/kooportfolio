import { describe, expect, it } from "vitest";
import { freshTally, isPerfectRelease, tallyShot } from "../src/game/core/basketball";
import { GYM_STREAK_CHEER, nextGymStreak } from "../src/game/scenes/gymGame";
import { raceClock } from "../src/game/scenes/Rowing";

describe("basketball session tally (D8)", () => {
  it("adds points on makes, counts streaks, resets on a miss", () => {
    let t = freshTally();
    t = tallyShot(t, true, 3);
    t = tallyShot(t, true, 2);
    expect(t).toEqual({ points: 5, makes: 2, shots: 2, streak: 2, bestStreak: 2 });
    t = tallyShot(t, false);
    expect(t).toMatchObject({ points: 5, shots: 3, streak: 0, bestStreak: 2 });
    t = tallyShot(t, true, -4);
    expect(t.points).toBe(5);
  });
  it("knows the gold release window", () => {
    expect(isPerfectRelease(0.62)).toBe(true);
    expect(isPerfectRelease(0.66)).toBe(true);
    expect(isPerfectRelease(0.7)).toBe(false);
    expect(isPerfectRelease(0.5)).toBe(false);
  });
});

describe("gym lift streak (D8)", () => {
  it("clean and perfect extend, a miss resets", () => {
    let s = 0;
    for (const j of ["Clean", "Perfect", "Clean", "Clean", "Perfect"] as const) s = nextGymStreak(s, j);
    expect(s).toBe(GYM_STREAK_CHEER);
    expect(nextGymStreak(s, "Miss")).toBe(0);
    expect(nextGymStreak(3, "")).toBe(0);
  });
});

describe("rowing race clock (D8)", () => {
  it("formats race times as m:ss.s", () => {
    expect(raceClock(92.34)).toBe("1:32.3");
    expect(raceClock(5)).toBe("0:05.0");
    expect(raceClock(60)).toBe("1:00.0");
  });
});
