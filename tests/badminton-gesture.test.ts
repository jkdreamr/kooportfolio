import { describe, expect, it } from "vitest";
import { badmintonGesture } from "../src/game/core/badminton-gesture";

describe("badminton touch shots", () => {
  it("keeps a small finger wobble a centered drop", () => {
    expect(badmintonGesture(10, -12)).toEqual({ aim: 0, shot: "drop" });
  });
  it("combines diagonal shot selection and aim in one swipe", () => {
    expect(badmintonGesture(-40, -35)).toEqual({ aim: -1, shot: "clear" });
    expect(badmintonGesture(42, 38)).toEqual({ aim: 1, shot: "smash" });
    expect(badmintonGesture(-40, 0)).toEqual({ aim: -1, shot: "drop" });
  });
  it("keeps the keyboard-selected shot and aim when the hit pad is tapped", () => {
    expect(badmintonGesture(4, -8, { aim: -1, shot: "clear" }))
      .toEqual({ aim: -1, shot: "clear" });
    expect(badmintonGesture(0, 0, { aim: 1, shot: "smash" }))
      .toEqual({ aim: 1, shot: "smash" });
  });
  it("lets a swipe change shot or aim without resetting the other selection", () => {
    expect(badmintonGesture(0, -40, { aim: 1, shot: "smash" }))
      .toEqual({ aim: 1, shot: "clear" });
    expect(badmintonGesture(-40, 0, { aim: 1, shot: "smash" }))
      .toEqual({ aim: -1, shot: "smash" });
  });
});
