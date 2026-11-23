import { describe, expect, it } from "vitest";
import {
  cookingReducer,
  diceReducer,
  newCookingGame,
  newDiceGame,
  SOUP_INGREDIENTS,
} from "../src/game/core/interiorGames";

describe("Kappa Sigma dice", () => {
  it("banks safe rolls but loses only the current turn on a one", () => {
    let game = newDiceGame();
    game = diceReducer(diceReducer(game, { type: "roll" }), {
      type: "settle",
      value: 6,
    });
    expect(game.turn).toBe(6);
    game = diceReducer(game, { type: "bank" });
    expect(game.player).toBe(6);
    expect(game.phase).toBe("house");
    game = diceReducer(game, { type: "house", values: [4, 1] });
    expect(game.house).toBe(0);
    game = diceReducer(diceReducer(game, { type: "roll" }), {
      type: "settle",
      value: 5,
    });
    game = diceReducer(diceReducer(game, { type: "roll" }), {
      type: "settle",
      value: 1,
    });
    expect(game.player).toBe(6);
    expect(game.turn).toBe(0);
    expect(game.phase).toBe("house");
  });
  it("requires banking to win and does not accept input during the other turn or after a result", () => {
    let game = { ...newDiceGame(), player: 18 };
    game = diceReducer(diceReducer(game, { type: "roll" }), {
      type: "settle",
      value: 5,
    });
    expect(game.winner).toBeNull();
    game = diceReducer(game, { type: "bank" });
    expect(game.winner).toBe("player");
    expect(diceReducer(game, { type: "roll" })).toBe(game);
    expect(diceReducer(game, { type: "bank" })).toBe(game);
    const houseTurn = { ...newDiceGame(), house: 19, phase: "house" as const };
    expect(diceReducer(houseTurn, { type: "roll" })).toBe(houseTurn);
    expect(
      diceReducer(houseTurn, { type: "house", values: [2, 4] }).winner,
    ).toBe("house");
    expect(diceReducer(newDiceGame(), { type: "bank" }).phase).toBe("ready");
    expect(diceReducer(game, { type: "reset" })).toEqual(newDiceGame());
  });
});

describe("kitchen cooking", () => {
  function preppedSoup() {
    let game = cookingReducer(newCookingGame(), { type: "start" });
    for (const ingredient of SOUP_INGREDIENTS)
      game = cookingReducer(game, { type: "ingredient", ingredient });
    for (let i = 0; i < 3; i++) game = cookingReducer(game, { type: "chop" });
    return game;
  }
  it("requires three different ingredients and all chopping before heat or serving", () => {
    let game = cookingReducer(newCookingGame(), { type: "start" });
    game = cookingReducer(game, { type: "ingredient", ingredient: "Tomato" });
    expect(
      cookingReducer(game, { type: "ingredient", ingredient: "Tomato" }),
    ).toBe(game);
    expect(cookingReducer(game, { type: "chop" })).toBe(game);
    expect(cookingReducer(game, { type: "serve" })).toBe(game);
    expect(preppedSoup().stage).toBe("cook");
  });
  it("separates the target cooking window, early removal and burning, then resets for another batch", () => {
    const game = preppedSoup();
    expect(cookingReducer(game, { type: "finish", heat: 0.3 }).quality).toBe(
      "good",
    );
    for (const heat of [0.5, 0.65, 0.76])
      expect(cookingReducer(game, { type: "finish", heat }).quality).toBe(
        "perfect",
      );
    expect(cookingReducer(game, { type: "finish", heat: 1 }).quality).toBe(
      "burnt",
    );
    const served = cookingReducer(
      cookingReducer(game, { type: "finish", heat: 0.6 }),
      { type: "serve" },
    );
    expect(served.stage).toBe("done");
    expect(cookingReducer(served, { type: "serve" })).toBe(served);
    expect(cookingReducer(served, { type: "start" })).toEqual({
      ...newCookingGame(),
      stage: "gather",
    });
  });
});
