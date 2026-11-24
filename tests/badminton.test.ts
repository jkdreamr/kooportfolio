import { describe, expect, it } from "vitest";
import {
  BADMINTON,
  newBadmintonGame,
  stepBadminton,
  type BadmintonGame,
  type BadmintonInput,
} from "../src/game/core/badminton";

const idle: BadmintonInput = {
  x: 0,
  z: 0,
  swing: false,
  aim: 0,
  shot: "clear",
};
function advance(game: BadmintonGame, seconds: number, input = idle) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++)
    stepBadminton(game, input, 1 / 120);
}
function falling(game: BadmintonGame, x: number, z: number) {
  game.phase = "rally";
  Object.assign(game.shuttle, { x, z, y: 0.21, vx: 0, vy: -3, vz: 0 });
}

describe("badminton quick singles", () => {
  it("waits for a serve and launches a visible arc above the net", () => {
    const game = newBadmintonGame();
    advance(game, 2);
    expect(game.phase).toBe("ready");
    stepBadminton(game, { ...idle, swing: true }, 1 / 120);
    expect(game.phase).toBe("rally");
    expect(game.rally).toBe(1);
    expect(game.shuttle.vz).toBeLessThan(0);
    advance(game, 0.8);
    expect(game.shuttle.z).toBeLessThan(0);
    expect(game.shuttle.y).toBeGreaterThan(BADMINTON.net);
    expect(game.score).toEqual([0, 0]);
  });

  it("requires a reachable incoming shuttle and enforces the swing cooldown", () => {
    const game = newBadmintonGame();
    game.phase = "rally";
    game.lastHit = "opponent";
    Object.assign(game.shuttle, {
      x: 3.2,
      z: 5.7,
      y: 1.6,
      vx: 0,
      vy: 0,
      vz: 1,
    });
    stepBadminton(game, { ...idle, swing: true }, 1 / 120);
    expect(game.lastHit).toBe("opponent");
    expect(game.message).toBe("Miss");
    game.player.x = 3.2;
    stepBadminton(game, { ...idle, swing: true }, 1 / 120);
    expect(game.lastHit).toBe("opponent");
    advance(game, 0.3);
    stepBadminton(game, { ...idle, swing: true, aim: -1 }, 1 / 120);
    expect(game.lastHit).toBe("player");
    expect(game.shuttle.vx).toBeLessThan(0);
    expect(game.shuttle.vz).toBeLessThan(0);
  });

  it("lets the opponent return a reachable serve instead of awarding automatic points", () => {
    const game = newBadmintonGame();
    stepBadminton(game, { ...idle, swing: true }, 1 / 120);
    advance(game, 1.8);
    expect(game.lastHit).toBe("opponent");
    expect(game.rally).toBe(2);
    expect(game.score).toEqual([0, 0]);
  });

  it("awards an in-bounds landing to the hitter, and an out or net to the receiver", () => {
    const inside = newBadmintonGame();
    falling(inside, 2, -7);
    stepBadminton(inside, idle, 0.04);
    expect(inside.score).toEqual([1, 0]);
    const outside = newBadmintonGame();
    falling(outside, 4, -7);
    stepBadminton(outside, idle, 0.04);
    expect(outside.score).toEqual([0, 1]);
    const net = newBadmintonGame();
    net.phase = "rally";
    Object.assign(net.shuttle, { x: 0, y: 1, z: 0.01, vx: 0, vy: 0, vz: -6 });
    stepBadminton(net, idle, 0.04);
    expect(net.score).toEqual([0, 1]);
    expect(net.message).toContain("Net");
    advance(net, 0.8);
    expect(net.score).toEqual([0, 1]);
  });

  it("uses rally-point serving, win by two, an 11-point cap, and freezes completed matches", () => {
    const game = newBadmintonGame();
    game.score = [6, 6];
    falling(game, 0, -7);
    stepBadminton(game, idle, 0.04);
    expect(game.score).toEqual([7, 6]);
    expect(game.phase).toBe("point");
    advance(game, 1.5);
    expect(game.phase).toBe("ready");
    expect(game.server).toBe("player");
    falling(game, 0, -7);
    stepBadminton(game, idle, 0.1);
    expect(game.phase).toBe("over");
    expect(game.winner).toBe("player");
    advance(game, 4, { ...idle, swing: true });
    expect(game.score).toEqual([8, 6]);
    const cap = newBadmintonGame();
    cap.score = [10, 10];
    falling(cap, 0, -7);
    stepBadminton(cap, idle, 0.1);
    expect(cap.phase).toBe("over");
    expect(cap.score).toEqual([11, 10]);
  });

  it("normalizes diagonal movement, confines players to their half, and bounds dropped frames", () => {
    const straight = newBadmintonGame(),
      diagonal = newBadmintonGame();
    straight.phase = diagonal.phase = "rally";
    Object.assign(straight.shuttle, { y: 100 });
    Object.assign(diagonal.shuttle, { y: 100 });
    const original = { x: straight.player.x, z: straight.player.z };
    stepBadminton(straight, { ...idle, x: 1 }, 0.1);
    stepBadminton(diagonal, { ...idle, x: 1, z: 1 }, 0.1);
    expect(
      Math.hypot(
        diagonal.player.x - original.x,
        diagonal.player.z - original.z,
      ),
    ).toBeCloseTo(straight.player.x - original.x, 7);
    stepBadminton(straight, { ...idle, x: 1, z: -1 }, 50);
    expect(straight.player.x).toBeLessThan(2);
    expect(straight.player.z).toBeGreaterThan(0);
    const before = structuredClone(straight);
    stepBadminton(straight, idle, NaN);
    expect(straight).toEqual(before);
  });
});
