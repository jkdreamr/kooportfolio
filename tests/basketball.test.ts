import { describe, expect, it } from "vitest";
import {
  BACKBOARD,
  COURT_Y,
  HOOP,
  dailyCourtSeed,
  launchBall,
  shotValue,
  stepBall,
  type BallState,
} from "../src/game/core/basketball";

const ballAt = (p: BallState["p"], v: BallState["v"]): BallState => ({
  p,
  v,
  age: 0,
  scored: false,
  bounced: false,
});
function flight(ball: BallState, hoop = HOOP, dt = 1 / 120) {
  let scores = 0;
  for (let time = 0; time < 4; time += dt) {
    const next = stepBall(ball, dt, hoop);
    ball = next.ball;
    scores += Number(next.score);
  }
  return { ball, scores };
}
describe("court collision regressions", () => {
  it("clears rounded board corners without a phantom bank contact", () => {
    const clear = stepBall(
      ballAt({ x: 1.525, y: 5.175, z: -5.3 }, { x: 0, y: 0, z: -35 }),
      1 / 30,
    );
    expect(clear.ball.contacts?.board).toBe(0);
    expect(clear.ball.v.z).toBeLessThan(0);
    const edge = stepBall(
      ballAt({ x: 1.4, y: 5, z: -5.3 }, { x: 0, y: 0, z: -35 }),
      1 / 30,
    );
    expect(edge.ball.contacts?.board).toBeGreaterThan(0);
  });
  it("catches high shots at the real upper backboard and fast crossings", () => {
    const high = stepBall(
      ballAt({ x: 0, y: 4.96, z: -5.3 }, { x: 0, y: 0, z: -35 }),
      1 / 30,
    );
    expect(high.ball.v.z).toBeGreaterThan(0);
    expect(high.ball.contacts?.board).toBe(1);
    expect(
      stepBall(
        ballAt({ x: 0, y: BACKBOARD.y, z: -6.3 }, { x: 0, y: 0, z: 35 }),
        1 / 30,
      ).ball.v.z,
    ).toBeLessThan(0);
    expect(
      stepBall(
        ballAt({ x: 0, y: 5.4, z: -5.3 }, { x: 0, y: 0, z: -35 }),
        1 / 30,
      ).ball.contacts?.board,
    ).toBe(0);
  });
  it("supports downward clean shots, lob arcs, and translated hoops", () => {
    for (const style of ["arc", "lob"] as const) {
      for (const [x, z] of [
        [0, 5],
        [-3.5, 0.8],
        [3.5, 0.8],
        [0, -0.2],
      ]) {
        expect(flight(launchBall(x, z, 0.62, 0, HOOP, style)).scores).toBe(1);
      }
    }
    const moved = { ...HOOP, x: 1.5 };
    expect(flight(launchBall(0, 4, 0.62, 0, moved), moved).scores).toBe(1);
    expect(
      stepBall(ballAt({ x: 0, y: 2.9, z: -5 }, { x: 0, y: 2, z: 0 }), 0.1)
        .score,
    ).toBe(false);
  });
  it("has consistent scoring at 30 and 120 Hz and never scores twice", () => {
    expect(flight(launchBall(0, 5, 0.62), HOOP, 1 / 30).scores).toBe(1);
    expect(flight(launchBall(0, 5, 0.62)).scores).toBe(1);
    expect(flight(launchBall(0, 5, 0.62, 0.5)).scores).toBe(0);
  });
  it("keeps rebounds above the court, finite, and does not call floor contact a bank", () => {
    let b = ballAt({ x: 0, y: 1, z: 3 }, { x: 1, y: -6, z: 1 });
    for (let i = 0; i < 1500; i++) {
      b = stepBall(b, 1 / 120).ball;
      expect(b.p.y).toBeGreaterThanOrEqual(COURT_Y + 0.23);
      expect(Number.isFinite(b.p.x + b.p.y + b.p.z)).toBe(true);
    }
    expect(b.contacts?.board).toBe(0);
    expect(shotValue(b, 4).label).toBe("Bounce");
    expect(
      shotValue({ ...b, contacts: { board: 1, floor: 0, rim: 0, wall: 0 } }, 4),
    ).toEqual({ points: 4, label: "Bank" });
  });
  it("uses a stable UTC seed, not local time or random state", () => {
    expect(dailyCourtSeed(new Date("2026-11-23T01:00:00Z"))).toBe(
      dailyCourtSeed(new Date("2026-11-23T23:59:59Z")),
    );
    expect(dailyCourtSeed(new Date("2026-11-24T00:00:00Z"))).not.toBe(
      dailyCourtSeed(new Date("2026-11-23T23:59:59Z")),
    );
  });
});
