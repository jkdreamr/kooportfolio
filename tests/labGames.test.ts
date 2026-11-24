import { describe, expect, it } from "vitest";
import {
  advanceBeat,
  beatCue,
  beatPadLane,
  beatRewardCoins,
  beatRoundEnd,
  BEAT_COUNT_IN,
  BEAT_INTERVAL,
  newBeatGame,
  queueBeatPad,
  hitBeat,
  HIT_WINDOW,
  flipLights,
  newLightsBoard,
  LIGHTS_TARGET,
  lightsHint,
  type BeatGame,
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
  it("lets players try pads in the count-in, then cues only scoring windows", () => {
    const start = { ...newBeatGame(), phase: "playing" as const };
    const countIn = advanceBeat(start, BEAT_COUNT_IN - HIT_WINDOW - 0.01);
    expect(hitBeat(countIn, 0)).toBe(countIn);
    expect(beatCue(countIn, 0)).toBe(false);
    const first = advanceBeat(countIn, 0.02);
    expect(beatCue(first, 0)).toBe(true);
    expect(beatCue(first, 1)).toBe(false);
    expect(beatCue(hitBeat(first, 0), 0)).toBe(false);
    expect(beatCue(advanceBeat(first, 0.5), 0)).toBe(false);
  });
  it("does not deduct points for a wrong pad after an early hit in the count-in", () => {
    const start = { ...newBeatGame(), phase: "playing" as const };
    const early = advanceBeat(start, BEAT_COUNT_IN - 0.1);
    const hit = hitBeat(early, 0);
    expect(hit.points).toBe(60);
    expect(hitBeat(hit, 1)).toBe(hit);
    expect(hitBeat(hit, 0)).toBe(hit);
    const onBeat = advanceBeat(hit, BEAT_COUNT_IN - hit.time);
    expect(hitBeat(onBeat, 1).points).toBe(25);
  });
  it("introduces the rhythm before faster pairs without extending the round", () => {
    const game = newBeatGame();
    const gaps = game.notes
      .slice(1)
      .map((note, i) => note.at - game.notes[i].at);
    expect(
      gaps.slice(0, 15).every((gap) => Math.abs(gap - BEAT_INTERVAL) < 0.001),
    ).toBe(true);
    expect(
      gaps.slice(15).some((gap) => Math.abs(gap - BEAT_INTERVAL / 2) < 0.001),
    ).toBe(true);
    expect(beatRoundEnd(game)).toBeCloseTo(BEAT_COUNT_IN + 32 * BEAT_INTERVAL);
  });
  it("starts a new combo on an early hit after skipping the preceding half beat", () => {
    const initial = { ...newBeatGame(), phase: "playing" as const };
    const [lead, skipped, next] = initial.notes.slice(17, 20);
    const hitLead = hitBeat(advanceBeat(initial, lead.at), lead.lane);
    const early = next.at - 0.13;
    const overlap = advanceBeat(hitLead, early - hitLead.time);
    expect(overlap.notes[18].missed).toBe(false);
    const hitNext = hitBeat(overlap, next.lane);
    expect(hitNext.combo).toBe(1);
    expect(hitNext.best).toBe(1);
    const expired = advanceBeat(
      hitNext,
      skipped.at + HIT_WINDOW + 0.001 - early,
    );
    expect(expired.notes[18].missed).toBe(true);
    expect(expired.combo).toBe(1);
    expect(hitBeat(hitNext, skipped.lane).combo).toBe(3);
  });
  it("rejects a four-pad burst on every note regardless of pad order", () => {
    let game: BeatGame = { ...newBeatGame(), phase: "playing" };
    for (const [index, note] of game.notes.entries()) {
      for (let i = 0; i < 4; i++) {
        const at = note.at + i * 0.015;
        game = queueBeatPad(advanceBeat(game, at - game.time), (index + i) % 4);
      }
    }
    game = advanceBeat(game, 1);
    expect(game.phase).toBe("done");
    expect(game.notes.every((note) => !note.hit)).toBe(true);
    expect(game.points).toBe(0);
    expect(beatRewardCoins(game)).toBe(0);
  });
  it("counts every press in an off-beat burst against reward accuracy", () => {
    let game: BeatGame = { ...newBeatGame(), phase: "playing" };
    for (const [index, note] of game.notes.entries()) {
      game = queueBeatPad(advanceBeat(game, note.at - game.time), note.lane);
      if (index >= 9) continue;
      game = advanceBeat(game, 0.23);
      for (const lane of [0, 1, 2, 3]) game = queueBeatPad(game, lane);
    }
    game = advanceBeat(game, 1);
    expect(game.notes.filter((note) => note.hit)).toHaveLength(32);
    expect(game.points).toBe(2885);
    expect(game.offBeatPresses).toBe(36);
    expect(beatRewardCoins(game)).toBe(0);
  });
  it("scores a single press at its original time even while the hit window closes", () => {
    const start = { ...newBeatGame(), phase: "playing" as const };
    const late = advanceBeat(start, BEAT_COUNT_IN + HIT_WINDOW - 0.01);
    const queued = queueBeatPad(late, 0);
    const waiting = advanceBeat(queued, 0.03);
    expect(waiting.notes[0].missed).toBe(false);
    const judged = advanceBeat(waiting, 0.04);
    expect(judged.notes[0].hit).toBe(true);
    expect(judged.points).toBe(60);
  });
  it.each([
    { cleanHits: 20, delay: 0.1, mistakes: 0, coins: 12 },
    { cleanHits: 20, delay: 0.1, mistakes: 1, coins: 0 },
    { cleanHits: 32, delay: 0, mistakes: 0, coins: 20 },
    { cleanHits: 32, delay: 0, mistakes: 17, coins: 0 },
  ])(
    "awards $coins coins for $cleanHits hits, $delay timing error and $mistakes wrong taps",
    ({ cleanHits, delay, mistakes, coins }) => {
      let game: BeatGame = { ...newBeatGame(), phase: "playing" };
      for (const [index, note] of game.notes.slice(0, cleanHits).entries()) {
        game = queueBeatPad(
          advanceBeat(game, note.at + delay - game.time),
          note.lane,
        );
        if (index < mistakes)
          game = queueBeatPad(advanceBeat(game, 0.1), (note.lane + 1) % 4);
      }
      expect(beatRewardCoins(game)).toBe(0);
      game = advanceBeat(game, beatRoundEnd(game) - game.time + 0.01);
      expect(game.notes.filter((note) => note.hit)).toHaveLength(cleanHits);
      expect(beatRewardCoins(game)).toBe(coins);
    },
  );
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
});
