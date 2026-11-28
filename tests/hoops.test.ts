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
  makeChance,
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
    expect(greenHalfWidth("layup", 1)).toBeCloseTo(0.2);
    expect(greenHalfWidth("layup", 3)).toBeCloseTo(0.126, 3);
    expect(greenHalfWidth("jumper", 4)).toBeCloseTo(0.071, 3);
    expect(greenHalfWidth("jumper", 5)).toBeCloseTo(0.059, 3);
    expect(greenHalfWidth("three", 7)).toBeCloseTo(0.0374, 3);
    expect(greenHalfWidth("three", 10)).toBeCloseTo(0.03);
    const j = greenHalfWidth("jumper", 5);
    expect(greenHalfWidth("jumper", 5, { fade: true })).toBeCloseTo(j * 0.8);
    expect(greenHalfWidth("jumper", 5, { moving: true })).toBeCloseTo(j * 0.85);
    expect(greenHalfWidth("jumper", 5, { contest: 1 })).toBeCloseTo(j * 0.5);
    expect(greenHalfWidth("jumper", 5, { fire: true })).toBeCloseTo(j * 1.25);
  });
  it("close shots are easy when open, still hard when contested", () => {
    // Open layup at the rim: a wide window and a near-sure make.
    expect(greenHalfWidth("layup", 1.2)).toBeGreaterThan(0.18);
    expect(makeChance("layup", 0.05, greenHalfWidth("layup", 1.2), 0, 1.2)).toBeGreaterThan(0.95);
    // Just off the green, a close shot still falls most of the time.
    expect(makeChance("layup", 0.25, greenHalfWidth("layup", 1.2), 0, 1.2)).toBeGreaterThan(0.6);
    // A hand in the face takes most of that away.
    const c = 1, w = greenHalfWidth("layup", 1.2, { contest: c });
    expect(makeChance("layup", 0.05, w, c, 1.2)).toBeLessThan(0.3);
  });
  it("make chance falls off smoothly with distance (no cliffs)", () => {
    let prev = makeChance("layup", 0, 1, 0, 0.5);
    for (let d = 0.5; d <= 10; d += 0.05) {
      const type = d >= ZONE.three ? "three" : d > 3.4 ? "jumper" : "layup";
      const top = makeChance(type, 0, 1, 0, d);
      expect(top).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - top).toBeLessThan(0.01);
      prev = top;
    }
  });
  it("a drive into the paint dunks by itself", () => {
    const g = newHoops("shoot", "classmate", 3);
    g.p.x = 0;
    g.p.z = 2.0; // from the top of the key: drive, then keep attacking
    const i = { ...freshInput(), mz: -1, move: true };
    stepHoops(g, i);
    i.move = false;
    for (let k = 0; k < 90 && g.ball.phase === "held"; k++) stepHoops(g, i);
    expect(g.ball.phase).toBe("flight");
    expect(g.ball.kind).toBe("dunk");
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
