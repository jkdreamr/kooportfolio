export const ANAGRAMS = [
  { clue: "A book of maps", tiles: "TSAAL", answer: "ATLAS" },
  { clue: "A writing stick with an eraser", tiles: "CILPEN", answer: "PENCIL" },
  { clue: "A book of words with the same meaning", tiles: "SUAHUTRES", answer: "THESAURUS" },
  { clue: "The bend at the corner of a page", tiles: "GODEAR", answer: "DOGEAR" },
  { clue: "A page number in an old book", tiles: "OLIFO", answer: "FOLIO" },
] as const;

type Round = {
  page: number;
  selected: number[];
  result: "solved" | "retry" | null;
};
type Move =
  | { type: "pick"; index: number }
  | { type: "letter"; letter: string }
  | { type: "undo" | "check" | "next" | "restart" };

export const newAnagrams = (): Round => ({ page: 0, selected: [], result: null });

export function playAnagrams(round: Round, move: Move): Round {
  if (move.type === "restart") return newAnagrams();
  const puzzle = ANAGRAMS[round.page];
  if (!puzzle) return round;
  if (round.result === "solved") {
    return move.type === "next"
      ? { page: round.page + 1, selected: [], result: null }
      : round;
  }
  if (move.type === "check" && round.selected.length === puzzle.tiles.length) {
    const word = round.selected.map((index) => puzzle.tiles[index]).join("");
    return { ...round, result: word === puzzle.answer ? "solved" : "retry" };
  }
  if (move.type === "undo" && round.selected.length > 0) {
    return { ...round, selected: round.selected.slice(0, -1), result: null };
  }
  const index = move.type === "pick" ? move.index
    : move.type === "letter" ? [...puzzle.tiles].findIndex(
      (letter, i) => letter === move.letter.toUpperCase() && !round.selected.includes(i),
    )
    : -1;
  return Number.isInteger(index) && index >= 0 && index < puzzle.tiles.length && !round.selected.includes(index)
    ? { ...round, selected: [...round.selected, index], result: null }
    : round;
}
