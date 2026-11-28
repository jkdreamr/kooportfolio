import { describe, expect, it } from "vitest";
import {
  CHECK_PAUSE,
  GAME_TO,
  SHOT_CLOCK,
  ZONE,
  check,
  contest,
  freshInput,
  greenHalfWidth,
  jump,
  newHoops,
  release,
  shotType,
  startShot,
  stepHoops,
  tryBlock,
} from "../src/game/core/hoops";
import { playGame } from "./hoopsSim";

const idle = freshInput();
const run = (g: ReturnType<typeof newHoops>, seconds: number, input = idle) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepHoops(g, input);
};

describe("Blacktop rules", () => {
  it("picks the shot from where you are and how you move", () => {
    expect(shotType(2.0, 4, 4)).toBe("dunk");
    expect(shotType(2.0, 3, 3)).toBe("layup");
    expect(shotType(3.3, 0, 2.5)).toBe("layup");
    expect(shotType(1.5, 0, 0)).toBe("layup"); // putback
    expect(shotType(5, 0, 0)).toBe("jumper");
    expect(shotType(ZONE.three, 0, 0)).toBe("three");
  });
  it("green half-widths and every modifier", () => {
    expect(greenHalfWidth("layup", 3)).toBeCloseTo(0.11);
    expect(greenHalfWidth("jumper", 4)).toBeCloseTo(0.07);
    expect(greenHalfWidth("jumper", 5)).toBeCloseTo(0.05);
    expect(greenHalfWidth("three", 7)).toBeCloseTo(0.038);
    expect(greenHalfWidth("three", 10)).toBeCloseTo(0.03);
    expect(greenHalfWidth("jumper", 5, { fade: true })).toBeCloseTo(0.04);
    expect(greenHalfWidth("jumper", 5, { moving: true })).toBeCloseTo(0.0425);
    expect(greenHalfWidth("jumper", 5, { contest: 1 })).toBeCloseTo(0.025);
    expect(greenHalfWidth("jumper", 5, { fire: true })).toBeCloseTo(0.0625);
  });
  it("contest law: gap, air and fadeaway", () => {
    expect(contest(0.9, true, false)).toBe(1);
    expect(contest(2.5, true, false)).toBe(0);
    expect(contest(1.7, true, false)).toBeCloseTo(0.5);
    expect(contest(0.9, false, false)).toBeCloseTo(0.6);
    expect(contest(0.9, true, true)).toBeCloseTo(0.4);
  });
  it("a Pure release is never blocked", () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = newHoops("1v1", "legend", seed);
      run(g, CHECK_PAUSE + 0.1);
      g.p.x = 0;
      g.p.z = 1;
      g.r.x = 0;
      g.r.z = 0.1;
      startShot(g, 0);
      g.r.jumpAt = g.t;
      release(g, 0, 0.62);
      tryBlock(g, 1);
      expect(g.ball.phase).toBe("flight");
      expect(g.ball.pure).toBe(true);
    }
  });
  it("the player's block inside ±60 ms always lands", () => {
    const g = newHoops("1v1", "classmate", 3);
    check(g, 1);
    run(g, CHECK_PAUSE + 0.05);
    g.r.x = 0;
    g.r.z = 1;
    g.p.x = 0;
    g.p.z = 0;
    startShot(g, 1);
    release(g, 1, 0.6);
    g.t += 0.05;
    jump(g, 0);
    expect(g.ball.phase).toBe("loose");
  });
  it("shot clock: a held ball turns over at 12 s", () => {
    const g = newHoops("1v1", "classmate", 1);
    g.r.x = g.r.z = 6; // keep him away
    let turnovers = 0;
    for (let i = 0; i < (CHECK_PAUSE + SHOT_CLOCK + 0.2) * 60; i++) {
      stepHoops(g, idle);
      turnovers += g.events.filter((e) => e.k === "turnover").length;
      if (turnovers) break;
    }
    expect(turnovers).toBe(1);
    expect(g.offense).toBe(1);
  });
  it("after a defensive rebound the ball must go back past the arc", () => {
    const g = newHoops("1v1", "classmate", 1);
    run(g, CHECK_PAUSE + 0.1);
    g.takeBack = true;
    g.p.x = 0;
    g.p.z = -1;
    startShot(g, 0);
    expect(g.p.gatherAt).toBe(-1);
    expect(g.events.some((e) => e.k === "takeBack")).toBe(true);
  });
  it("first to 15 ends the game", () => {
    const g = newHoops("1v1", "classmate", 1);
    g.score[0] = GAME_TO - 2;
    run(g, CHECK_PAUSE + 0.1);
    g.p.x = 0;
    g.p.z = 1;
    g.r.x = 5;
    g.r.z = 5;
    startShot(g, 0);
    release(g, 0, 0.62);
    run(g, 3);
    expect(g.over).toBe(true);
    expect(g.winner).toBe(0);
  });
  it("is deterministic for a seed", () => {
    expect(playGame("mixer", "hooper", 7)).toEqual(playGame("mixer", "hooper", 7));
  });
  it("Hot Shot: a new ball in hand within 0.6 s of the shot resolving", () => {
    const g = newHoops("hot", "classmate", 1);
    for (let n = 0; n < 5; n++) {
      stepHoops(g, { ...idle, charge: 0.62 });
      let guard = 0;
      while (!(g.ball.phase === "held") || g.resolvedAt < 0) {
        stepHoops(g, idle);
        if (++guard > 600) throw new Error("stuck");
      }
      expect(g.t - g.resolvedAt).toBeLessThanOrEqual(0.6);
    }
    expect(g.makes).toBe(5);
  });
});
