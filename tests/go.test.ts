import { describe, expect, it } from "vitest";
import {
  chooseGoMove, GO_KOMI, goGroup, newGoGame, passGo, playGo,
  resumeGo, scoreGo, toggleGoDead, type GoGame,
} from "../src/game/core/go";

function position(black: number[], white: number[]): GoGame {
  const game = newGoGame();
  black.forEach((p) => { game.board[p] = 1; });
  white.forEach((p) => { game.board[p] = 2; });
  game.history = [game.board.join("")];
  return game;
}

describe("9×9 Go", () => {
  it("starts empty, alternates turns, and rejects occupied and off-board points without mutation", () => {
    const game = newGoGame();
    const move = playGo(game, 40);
    expect(move.ok).toBe(true);
    if (!move.ok) return;
    expect(move.game.turn).toBe(2);
    expect(move.game.board[40]).toBe(1);
    expect(game.board.every((p) => p === 0)).toBe(true);
    expect(playGo(move.game, 40).ok).toBe(false);
    for (const point of [-1, 81, 1.5, NaN]) expect(playGo(game, point).ok).toBe(false);
  });
  it("captures an entire connected group once, without wrapping across board edges", () => {
    const game = position([2, 9], [0, 1]);
    const move = playGo(game, 10);
    expect(move.ok).toBe(true);
    if (!move.ok) return;
    expect(move.captured).toBe(2);
    expect(move.game.captures).toEqual([2, 0]);
    expect(move.game.board.slice(0, 2)).toEqual([0, 0]);
    expect(game.board[0]).toBe(2);
    expect(goGroup(position([8, 9], []).board, 8).stones).toEqual([8]);
  });
  it("rejects suicide but allows a capturing move that creates a liberty", () => {
    const suicide = position([1, 9], []);
    suicide.turn = 2;
    expect(playGo(suicide, 0).ok).toBe(false);
    const capture = position([2, 10, 18], [1, 9]);
    const move = playGo(capture, 0);
    expect(move.ok).toBe(true);
    if (move.ok) {
      expect(move.captured).toBe(2);
      expect(goGroup(move.game.board, 0).liberties.size).toBe(2);
    }
  });
  it("forbids ko recapture and any earlier repeated position, but permits a ko threat elsewhere", () => {
    const game = position([1, 9, 19], [2, 10, 12, 20]);
    const take = playGo(game, 11);
    expect(take.ok).toBe(true);
    if (!take.ok) return;
    expect(take.captured).toBe(1);
    expect(playGo(take.game, 10)).toEqual({ ok: false, reason: "Ko: that would repeat a board position." });
    const threat = playGo(take.game, 70);
    expect(threat.ok).toBe(true);
    const later = { ...take.game, history: [...take.game.history, "unrelated-position"] };
    expect(playGo(later, 10).ok).toBe(false);
  });
  it("ends play after two consecutive passes, can resume, and resets pass count after a move", () => {
    const once = passGo(newGoGame());
    expect(once.phase).toBe("playing");
    const move = playGo(once, 40);
    if (move.ok) expect(move.game.passes).toBe(0);
    const count = passGo(once);
    expect(count.phase).toBe("scoring");
    expect(playGo(count, 20).ok).toBe(false);
    expect(passGo(count)).toBe(count);
    const resumed = resumeGo(count);
    expect(resumed.phase).toBe("playing");
    expect(resumed.passes).toBe(0);
    expect(resumed.history).toEqual(count.history);
  });
  it("counts area once, leaves shared space neutral, and gives White komi", () => {
    const game = position([31, 39, 41, 49], [80]);
    game.captures = [20, 10]; // Captures are not a second source of points.
    const score = scoreGo(game);
    expect(score.black).toBe(5);
    expect(score.white).toBe(1 + GO_KOMI);
    expect(score.owners[40]).toBe(1);
    expect(score.owners[0]).toBe(0);
    expect(scoreGo(newGoGame()).black).toBe(0);
    expect(scoreGo(newGoGame()).white).toBe(GO_KOMI);
  });
  it("marks whole dead groups by agreement and restores them when play resumes", () => {
    const game = { ...position([2, 9, 10], [0, 1, 80]), phase: "scoring" as const };
    const marked = toggleGoDead(game, 0);
    expect(marked.dead.sort()).toEqual([0, 1]);
    expect(scoreGo(marked).black).toBe(5);
    expect(scoreGo(marked).white).toBe(1 + GO_KOMI);
    expect(toggleGoDead(marked, 1).dead).toEqual([]);
    expect(resumeGo(marked).dead).toEqual([]);
    expect(resumeGo(marked).board[0]).toBe(2);
    expect(toggleGoDead(newGoGame(), 0).dead).toEqual([]);
  });
  it("computer takes a capture, returns only legal moves, and can agree to finish", () => {
    const capture = position([2, 9], [0, 1]);
    expect(chooseGoMove(capture)).toBe(10);
    let game = newGoGame();
    for (let i = 0; i < 36; i++) {
      const point = chooseGoMove(game);
      if (point === null) { game = passGo(game); continue; }
      const move = playGo(game, point);
      expect(move.ok).toBe(true);
      if (move.ok) game = move.game;
    }
    const ready = { ...newGoGame(), moves: 30, passes: 1 };
    expect(chooseGoMove(ready)).toBeNull();
    expect(chooseGoMove({ ...ready, phase: "finished" })).toBeNull();
  });
});
