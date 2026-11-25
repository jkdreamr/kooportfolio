import { describe, expect, it } from "vitest";
import {
  advanceRhyme,
  createLightsHintTracker,
  flipLights,
  newLightsBoard,
  newRhymeGame,
  LIGHTS_TARGET,
  lightsHint,
  RHYME_BARS,
  RHYME_FAMILIES,
  RHYME_BEATS,
  rhymeBarIndex,
  rhymeBarInterval,
  rhymeBeatInterval,
  rhymeCountIn,
  rhymeRoundEnd,
} from "../src/game/core/labGames";

describe("Beat Lab", () => {
  it("deals AABB couplets from the rhyme dictionary", () => {
    const game = newRhymeGame(42);
    expect(game.bars).toHaveLength(RHYME_BARS);
    for (let couplet = 0; couplet < RHYME_BARS; couplet += 2) {
      const [first, second] = game.bars.slice(couplet, couplet + 2);
      expect(second.family).toBe(first.family);
      expect(second.word).not.toBe(first.word);
      expect(RHYME_FAMILIES[first.family]).toContain(first.word);
      expect(RHYME_FAMILIES[first.family]).toContain(second.word);
    }
  });
  it("deals the same round for a seed and different rounds across seeds", () => {
    expect(newRhymeGame(7).bars).toEqual(newRhymeGame(7).bars);
    const words = (seed: number) =>
      newRhymeGame(seed).bars.map((bar) => bar.word).join(" ");
    expect(words(7)).not.toBe(words(8));
  });
  it("scores each bar played through and ends the round", () => {
    let game: ReturnType<typeof newRhymeGame> = {
      ...newRhymeGame(1),
      phase: "playing",
    };
    game = advanceRhyme(
      game,
      rhymeCountIn(game) + rhymeBarInterval(game) + 0.01,
    );
    expect(game.barsDone).toBe(1);
    expect(game.points).toBe(100);
    expect(rhymeBarIndex(game)).toBe(1);
    game = advanceRhyme(game, rhymeRoundEnd(game));
    expect(game.phase).toBe("done");
    expect(game.barsDone).toBe(RHYME_BARS);
    expect(game.points).toBe(RHYME_BARS * 100);
    expect(advanceRhyme(game, 1)).toBe(game);
  });
  it("runs the count-in and honours each beat", () => {
    for (let beat = 0; beat < RHYME_BEATS.length; beat++) {
      const game = newRhymeGame(3, beat);
      expect(rhymeBeatInterval(game)).toBeCloseTo(
        60 / RHYME_BEATS[beat].bpm,
      );
      expect(rhymeRoundEnd(game)).toBeCloseTo(
        rhymeBarInterval(game) * (RHYME_BARS + 1),
      );
      const waiting = advanceRhyme(
        { ...game, phase: "playing" },
        rhymeBeatInterval(game) * 2,
      );
      expect(rhymeBarIndex(waiting)).toBe(-1);
      expect(waiting.barsDone).toBe(0);
    }
  });
  it("ignores non-playing or invalid advances", () => {
    const ready = newRhymeGame(2);
    expect(advanceRhyme(ready, 1)).toBe(ready);
    const playing = { ...ready, phase: "playing" as const };
    expect(advanceRhyme(playing, -1)).toBe(playing);
    expect(advanceRhyme(playing, Number.NaN)).toBe(playing);
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
  it("uses every non-solved board once before repeating", () => {
    let solvable = [LIGHTS_TARGET];
    for (let tile = 0; tile < 9; tile++) {
      solvable = [
        ...solvable,
        ...solvable.map((board) => flipLights(board, tile)),
      ];
    }
    const rounds = Array.from({ length: LIGHTS_TARGET }, (_, round) =>
      newLightsBoard(round),
    );
    expect(new Set(rounds)).toEqual(new Set(solvable.slice(1)));
    expect(newLightsBoard(LIGHTS_TARGET)).toBe(rounds[0]);
  });
  it("keeps hint usage with the starting board rather than the attempt", () => {
    const hints = createLightsHintTracker();
    const first = newLightsBoard(0);
    const second = newLightsBoard(1);
    expect(hints.wasUsed(first)).toBe(false);
    expect(hints.reveal(first, flipLights(first, 5))).not.toBeNull();
    expect(hints.wasUsed(second)).toBe(false);
    expect(hints.wasUsed(newLightsBoard(0))).toBe(true);
    expect(hints.reveal(second, LIGHTS_TARGET)).toBeNull();
    expect(hints.wasUsed(second)).toBe(false);
  });
  it("restores practice status for only the hinted board after reload", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    };
    const first = newLightsBoard(0);
    const second = newLightsBoard(1);
    createLightsHintTracker(storage).reveal(first, flipLights(first, 5));
    const reloaded = createLightsHintTracker(storage);
    expect(reloaded.wasUsed(first)).toBe(true);
    expect(reloaded.wasUsed(second)).toBe(false);
  });
});
