import { describe, expect, it } from "vitest";
import { ANAGRAMS, newAnagrams, playAnagrams } from "../src/game/core/anagrams";

describe("desk anagrams", () => {
  it("uses each tile at most once, including duplicate letters", () => {
    const start = newAnagrams();
    const picked = playAnagrams(start, { type: "pick", index: 2 });
    expect(playAnagrams(picked, { type: "pick", index: 2 })).toBe(picked);
    expect(playAnagrams(picked, { type: "pick", index: 99 })).toBe(picked);
    const pair = playAnagrams(picked, { type: "letter", letter: "a" });
    expect(pair.selected).toEqual([2, 3]);
    expect(playAnagrams(pair, { type: "letter", letter: "a" })).toBe(pair);
    expect(playAnagrams(pair, { type: "check" })).toBe(pair);
    expect(playAnagrams(pair, { type: "undo" }).selected).toEqual([2]);
  });

  it("leaves a wrong word editable without advancing", () => {
    const start = newAnagrams();
    const word = [...ANAGRAMS[0].tiles].reduce(
      (round, _, index) => playAnagrams(round, { type: "pick", index }), start,
    );
    const checked = playAnagrams(word, { type: "check" });
    expect(checked.result).toBe("retry");
    expect(playAnagrams(checked, { type: "next" })).toBe(checked);
    expect(playAnagrams(checked, { type: "undo" })).toMatchObject({ page: 0, result: null });
  });

  it("can solve every puzzle, then finish and replay", () => {
    let round = newAnagrams();
    for (const { answer, tiles } of ANAGRAMS) {
      expect(tiles).not.toEqual(answer);
      for (const letter of answer) round = playAnagrams(round, { type: "letter", letter });
      round = playAnagrams(round, { type: "check" });
      expect(round.result).toBe("solved");
      expect(playAnagrams(round, { type: "undo" })).toBe(round);
      round = playAnagrams(round, { type: "next" });
    }
    expect(round.page).toBe(ANAGRAMS.length);
    expect(playAnagrams(round, { type: "next" })).toBe(round);
    expect(playAnagrams(round, { type: "restart" })).toEqual(newAnagrams());
  });
});
