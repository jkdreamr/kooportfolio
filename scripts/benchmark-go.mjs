import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier === "./go" ? "./go.ts" : specifier, context);
  },
});

const { newGoGame, passGo, playGo, scoreGo } = await import("../src/game/core/go.ts");
const { chooseGoMove } = await import("../src/game/core/goBot.ts");
const openings = [[], [20, 60], [40, 20], [11, 56], [23, 58], [21, 42]];
let wins = 0, blackWins = 0, whiteWins = 0, hardMoves = 0, totalMs = 0, longestMs = 0;

const play = (game, point) => {
  if (point === null) return passGo(game);
  const move = playGo(game, point);
  assert.ok(move.ok, move.reason);
  return move.game;
};

for (const opening of openings) {
  for (const hardColor of [1, 2]) {
    let game = opening.reduce(play, newGoGame());
    while (game.phase === "playing" && game.moves < 180) {
      const hard = game.turn === hardColor;
      const start = performance.now();
      const point = chooseGoMove(game, hard ? "hard" : "medium");
      if (hard) {
        const ms = performance.now() - start;
        hardMoves++;
        totalMs += ms;
        longestMs = Math.max(longestMs, ms);
      }
      game = play(game, point);
    }
    assert.equal(game.phase, "scoring", "Game did not reach scoring within 180 moves");
    const score = scoreGo(game);
    const won = score.winner === hardColor;
    if (won) {
      wins++;
      if (hardColor === 1) blackWins++;
      else whiteWins++;
    }
    console.log(`${opening.join(",") || "empty"} | Hard as ${hardColor === 1 ? "Black" : "White"} ${won ? "won" : "lost"} by ${score.margin} in ${game.moves} moves`);
  }
}
console.log(`Hard won ${wins}/${openings.length * 2} (Black ${blackWins}/${openings.length}, White ${whiteWins}/${openings.length}); Hard move mean ${Math.round(totalMs / hardMoves)} ms, max ${Math.round(longestMs)} ms.`);
