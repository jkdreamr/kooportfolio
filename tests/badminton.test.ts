import { describe, expect, it } from "vitest";
import {
  BADMINTON,
  canReturnBadminton,
  newBadmintonGame,
  newBadmintonLanding,
  predictBadmintonLanding,
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
    expect(game.message).toBe("Move to shuttle");
    game.player.x = 3.2;
    stepBadminton(game, { ...idle, swing: true }, 1 / 120);
    expect(game.lastHit).toBe("opponent");
    advance(game, 0.3);
    stepBadminton(game, { ...idle, swing: true, aim: -1 }, 1 / 120);
    expect(game.lastHit).toBe("player");
    expect(game.shuttle.vx).toBeLessThan(0);
    expect(game.shuttle.vz).toBeLessThan(0);
  });

  it("uses a standard high serve while preserving aim and the selected return shot", () => {
    const serves = (["clear", "drop", "smash"] as const).map((shot) => {
      const game = newBadmintonGame();
      const input = { ...idle, swing: true, aim: 1 as const, shot };
      stepBadminton(game, input, 1 / 120);
      expect(input.shot).toBe(shot);
      expect(game.shuttle.vx).toBeGreaterThan(0);
      expect(game.shuttle.vz).toBeLessThan(0);
      return game.shuttle;
    });
    expect(serves[1]).toEqual(serves[0]);
    expect(serves[2]).toEqual(serves[0]);
    const left = newBadmintonGame();
    stepBadminton(left, { ...idle, swing: true, aim: -1 }, 1 / 120);
    expect(left.shuttle.vx).toBeLessThan(0);
  });

  it("shows a timing cue only when pressing hit can return the shuttle", () => {
    const game = newBadmintonGame();
    expect(canReturnBadminton(game)).toBe(false);
    game.phase = "rally";
    game.lastHit = "opponent";
    Object.assign(game.shuttle, { x: 0, z: 5.7, y: 1.6, vx: 0, vy: 0, vz: 1 });
    expect(canReturnBadminton(game)).toBe(true);
    stepBadminton(game, { ...idle, swing: true, shot: "drop" }, 1 / 120);
    expect(game.lastHit).toBe("player");
    expect(game.rally).toBe(1);
    expect(canReturnBadminton(game)).toBe(false);
  });

  it.each([
    { x: 0, z: -2, y: 1.6, message: "Wait for return" },
    { x: 0, z: 5.7, y: 5, message: "Too early" },
    { x: 0, z: 5.7, y: 0.4, message: "Too late" },
    { x: 3, z: 5.7, y: 1.6, message: "Move to shuttle" },
  ])(
    "gives actionable missed-return feedback: $message",
    ({ x, z, y, message }) => {
      const game = newBadmintonGame();
      game.phase = "rally";
      game.lastHit = "opponent";
      Object.assign(game.shuttle, { x, z, y, vx: 0, vy: 0, vz: 0 });
      expect(canReturnBadminton(game)).toBe(false);
      stepBadminton(game, { ...idle, swing: true }, 1 / 120);
      expect(game.lastHit).toBe("opponent");
      expect(game.message).toBe(message);
    },
  );

  it.each([
    { x: 3, y: 1.6, movement: 1, seconds: 0.35, message: "Move to shuttle" },
    { x: 0, y: 5, movement: 0, seconds: 0.3, message: "Too early" },
  ])(
    "clears $message when moving or waiting makes a return legal",
    ({ x, y, movement, seconds, message }) => {
      const game = newBadmintonGame();
      game.phase = "rally";
      game.lastHit = "opponent";
      Object.assign(game.shuttle, { x, z: 5.7, y, vx: 0, vy: 0, vz: 0 });
      stepBadminton(game, { ...idle, swing: true }, 1 / 120);
      expect(game.message).toBe(message);
      advance(game, seconds, { ...idle, x: movement });
      expect(canReturnBadminton(game)).toBe(true);
      expect(game.message).toBe("");
      stepBadminton(game, { ...idle, swing: true }, 1 / 120);
      expect(game.lastHit).toBe("player");
    },
  );

  it("lets the opponent return a reachable serve instead of awarding automatic points", () => {
    const game = newBadmintonGame();
    stepBadminton(game, { ...idle, swing: true }, 1 / 120);
    advance(game, 1.8);
    expect(game.lastHit).toBe("opponent");
    expect(game.rally).toBe(2);
    expect(game.score).toEqual([0, 0]);
  });

  it("does not let a player's missed swing suppress the opponent's reachable return", () => {
    const game = newBadmintonGame();
    game.phase = "rally";
    game.lastHit = "player";
    game.flightTime = 0.5;
    Object.assign(game.shuttle, {
      x: 0,
      z: -5.7,
      y: 1.8,
      vx: 0,
      vy: -1,
      vz: -1,
    });
    stepBadminton(game, { ...idle, swing: true }, 1 / 120);
    expect(game.lastHit).toBe("opponent");
    expect(game.shuttle.vz).toBeGreaterThan(0);
    expect(game.playerCooldown).toBeGreaterThan(0);
  });

  it("lets reachable corner drops win a real match rather than an endless perfect-opponent rally", () => {
    const game = newBadmintonGame();
    // Only use normal controls: serve, move under an incoming shot, drop away.
    for (let frame = 0; frame < 60 * 60 && !game.winner; frame++) {
      const s = game.shuttle,
        p = game.player;
      const incoming = game.lastHit === "opponent";
      const contact = Math.max(
        0,
        (s.vy +
          Math.sqrt(
            Math.max(0, s.vy ** 2 + 2 * BADMINTON.gravity * (s.y - 1.8)),
          )) /
          BADMINTON.gravity,
      );
      const tx = Math.max(-3.8, Math.min(3.8, s.x + s.vx * contact));
      const tz = Math.max(0.8, Math.min(8.2, s.z + s.vz * contact));
      stepBadminton(
        game,
        {
          x: incoming && Math.abs(tx - p.x) > 0.09 ? Math.sign(tx - p.x) : 0,
          z: incoming && Math.abs(tz - p.z) > 0.09 ? Math.sign(tz - p.z) : 0,
          swing:
            game.phase === "ready" ||
            (incoming &&
              s.z > 0.25 &&
              s.y >= 0.5 &&
              s.y <= 1.8 &&
              Math.hypot(s.x - p.x, s.z - p.z) < 1.6),
          aim: game.opponent.x >= 0 ? -1 : 1,
          shot: "drop",
        },
        1 / 60,
      );
    }
    expect(game.winner).toBe("player");
    expect(game.score[0]).toBe(BADMINTON.winningScore);
    expect(game.longestRally).toBeGreaterThanOrEqual(3);
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

  it.each([
    { vx: 0.9, vz: 5.2, kind: "in", winner: "opponent" },
    { vx: 3.4, vz: 5.2, kind: "out", winner: "player" },
    { vx: 0.2, vz: 9.5, kind: "out", winner: "player" },
  ] as const)(
    "predicts the exact landing spot and call of an untouched flight ($kind)",
    ({ vx, vz, kind, winner }) => {
      const game = newBadmintonGame();
      game.phase = "rally";
      game.lastHit = "opponent";
      Object.assign(game.shuttle, { x: 0.4, y: 2.2, z: -4, vx, vy: 4.5, vz });
      const landing = predictBadmintonLanding(game, newBadmintonLanding());
      expect(landing.active).toBe(true);
      expect(landing.side).toBe("player");
      expect(landing.winner).toBe(winner);
      const { x, z, time } = landing;
      // Uneven frames: the contact is resolved inside the substep, not at its end.
      let t = 0;
      for (let i = 0; game.phase === "rally" && i < 400; i++) {
        const dt = [0.016, 0.033, 0.007][i % 3];
        stepBadminton(game, idle, dt);
        t += dt;
      }
      expect(game.call.kind).toBe(kind);
      expect(game.call.x).toBeCloseTo(x, 6);
      expect(game.call.z).toBeCloseTo(z, 6);
      expect(Math.abs(t - time)).toBeLessThan(0.034);
      expect(game.score[winner === "player" ? 0 : 1]).toBe(1);
      expect(game.message).toContain(kind === "in" ? "In!" : "Out!");
    },
  );

  it("predicts a net cord and reports no landing outside a rally", () => {
    const game = newBadmintonGame();
    expect(predictBadmintonLanding(game, newBadmintonLanding()).active).toBe(false);
    game.phase = "rally";
    Object.assign(game.shuttle, { x: 0, y: 1, z: 0.5, vx: 0, vy: 0, vz: -6 });
    const landing = predictBadmintonLanding(game, newBadmintonLanding());
    expect(landing.net).toBe(true);
    expect(landing.inBounds).toBe(false);
    expect(landing.z).toBe(0);
  });
});
