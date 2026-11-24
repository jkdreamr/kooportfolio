import { describe, expect, it } from "vitest";
import {
  advanceBeat,
  beatPadLane,
  newBeatGame,
  hitBeat,
  HIT_WINDOW,
  flipLights,
  newLightsBoard,
  LIGHTS_TARGET,
  lightsPar,
  lightsReach,
  lightsSolution,
  lightsHint,
} from "../src/game/core/labGames";

describe("Beat Lab", () => {
  it("takes letter and number shortcuts without treating browser shortcuts as hits", () => {
    const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) =>
      beatPadLane({
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        ...modifiers,
      });
    expect(
      ["f", "G", "h", "j", "1", "2", "3", "4"].map((key) => press(key)),
    ).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(press("f", { metaKey: true })).toBe(-1);
    expect(press("1", { ctrlKey: true })).toBe(-1);
    expect(press("g", { altKey: true })).toBe(-1);
    expect(press("j", { isComposing: true })).toBe(-1);
    expect(press("Escape")).toBe(-1);
  });
  it("judges timing and lane, never scores a note twice, and penalizes spamming", () => {
    const start = { ...newBeatGame(), phase: "playing" as const, time: 2.4 };
    const hit = hitBeat(start, 0);
    expect(hit.points).toBe(100);
    expect(hit.combo).toBe(1);
    expect(hitBeat(hit, 0).points).toBe(65);
    expect(hitBeat(start, 2).points).toBe(0);
    expect(
      hitBeat({ ...start, time: 2.4 + HIT_WINDOW - 0.001 }, 0).points,
    ).toBe(60);
    expect(
      hitBeat({ ...start, time: 2.4 - HIT_WINDOW - 0.001 }, 0).points,
    ).toBe(0);
    expect(hitBeat(newBeatGame(), 0).points).toBe(0);
  });
  it("expires missed notes, finishes without input, and preserves hits", () => {
    let game = { ...newBeatGame(), phase: "playing" as const };
    for (const note of game.notes) {
      game = advanceBeat(game, note.at - game.time) as typeof game;
      game = hitBeat(game, note.lane) as typeof game;
    }
    expect(game.points).toBe(3200);
    expect(game.best).toBe(32);
    expect(advanceBeat(game, 1).phase).toBe("done");
    const idle = advanceBeat({ ...newBeatGame(), phase: "playing" }, 40);
    expect(idle.phase).toBe("done");
    expect(idle.notes.every((n) => n.missed)).toBe(true);
    expect(advanceBeat(idle, 1)).toBe(idle);
  });
});

describe("Math Lab", () => {
  it("flips only orthogonal neighbours without wrapping across rows", () => {
    expect(flipLights(0, 2)).toBe((1 << 1) | (1 << 2) | (1 << 5));
    expect(flipLights(0, 4)).toBe(
      (1 << 1) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 7),
    );
    expect(flipLights(flipLights(173, 6), 6)).toBe(173);
    expect(flipLights(173, -1)).toBe(173);
  });
  it("makes three distinct solvable boards with useful hints through arbitrary play", () => {
    expect(new Set([0, 1, 2].map(newLightsBoard)).size).toBe(3);
    for (let round = 0; round < 3; round++) {
      let board = newLightsBoard(round);
      expect(board).not.toBe(LIGHTS_TARGET);
      board = flipLights(board, 5);
      let count = 0;
      while (board !== LIGHTS_TARGET && count++ < 10) {
        const hint = lightsHint(board);
        expect(hint).not.toBeNull();
        board = flipLights(board, hint!);
      }
      expect(board).toBe(LIGHTS_TARGET);
    }
    expect(lightsHint(LIGHTS_TARGET)).toBeNull();
  });
  it("ramps puzzles so the shortest solution always equals par", () => {
    for (const seed of [0, 7, 123456]) {
      for (let round = 0; round < 8; round++) {
        const board = newLightsBoard(round, seed);
        const solution = lightsSolution(board);
        let solved = board;
        for (let tile = 0; tile < 9; tile++)
          if (solution & (1 << tile)) solved = flipLights(solved, tile);
        expect(solved).toBe(LIGHTS_TARGET);
        let presses = 0;
        for (let m = solution; m; m &= m - 1) presses++;
        expect(presses).toBe(lightsPar(round));
        expect(newLightsBoard(round, seed)).toBe(board);
      }
    }
    expect(lightsPar(0)).toBe(2);
    expect(lightsPar(99)).toBe(6);
    expect(newLightsBoard(3, 1)).not.toBe(newLightsBoard(3, 2));
  });
  it("reports which tiles a press flips", () => {
    expect(lightsReach(4)).toBe(flipLights(0, 4));
    expect(lightsReach(9)).toBe(0);
  });
});
