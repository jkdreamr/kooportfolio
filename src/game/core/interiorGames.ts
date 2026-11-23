export type DiceGame = {
  player: number;
  house: number;
  turn: number;
  die: number;
  houseDie: number;
  phase: "ready" | "rolling" | "house" | "over";
  winner: "player" | "house" | null;
  message: string;
};
export const newDiceGame = (): DiceGame => ({
  player: 0,
  house: 0,
  turn: 0,
  die: 5,
  houseDie: 3,
  phase: "ready",
  winner: null,
  message: "Roll a 1 and lose your turn. Bank to keep your points.",
});
export type DiceAction =
  | { type: "roll" }
  | { type: "settle"; value: number }
  | { type: "bank" }
  | { type: "house"; values: [number, number] }
  | { type: "reset" };
export function diceReducer(game: DiceGame, action: DiceAction): DiceGame {
  if (action.type === "reset") return newDiceGame();
  if (action.type === "roll" && game.phase === "ready")
    return { ...game, phase: "rolling", message: "Rolling…" };
  if (action.type === "settle" && game.phase === "rolling") {
    if (action.value === 1)
      return {
        ...game,
        die: 1,
        turn: 0,
        phase: "house",
        message: "One. Turn lost. House rolls.",
      };
    return {
      ...game,
      die: action.value,
      turn: game.turn + action.value,
      phase: "ready",
      message: "Roll again or bank your points.",
    };
  }
  if (action.type === "bank" && game.phase === "ready" && game.turn > 0) {
    const player = game.player + game.turn;
    return {
      ...game,
      player,
      turn: 0,
      phase: player >= 21 ? "over" : "house",
      winner: player >= 21 ? "player" : null,
      message: player >= 21 ? "You win." : "Points banked. House rolls.",
    };
  }
  if (action.type === "house" && game.phase === "house") {
    let points = 0,
      houseDie = 1;
    for (const value of action.values) {
      houseDie = value;
      if (value === 1) {
        points = 0;
        break;
      }
      points += value;
    }
    const house = game.house + points;
    return {
      ...game,
      house,
      houseDie,
      phase: house >= 21 ? "over" : "ready",
      winner: house >= 21 ? "house" : null,
      message:
        house >= 21
          ? "House wins. Another round?"
          : points === 0
            ? "House rolled a 1. Your turn."
            : `House banks ${points}. Your turn.`,
    };
  }
  return game;
}

export const SOUP_INGREDIENTS = ["Tomato", "Carrot", "Herbs"] as const;
export type Ingredient = (typeof SOUP_INGREDIENTS)[number];
export const RECIPES = {
  garden: {
    name: "Garden soup",
    ingredients: ["Tomato", "Carrot", "Herbs"] as readonly Ingredient[],
    color: "#d77a35",
  },
  tomato: {
    name: "Tomato soup",
    ingredients: ["Tomato", "Herbs"] as readonly Ingredient[],
    color: "#bc4932",
  },
  carrot: {
    name: "Carrot soup",
    ingredients: ["Carrot", "Herbs"] as readonly Ingredient[],
    color: "#dda13b",
  },
};
export type RecipeId = keyof typeof RECIPES;
export type CookingGame = {
  recipe: RecipeId;
  stage: "idle" | "gather" | "chop" | "cook" | "serve" | "done";
  ingredients: Ingredient[];
  chops: number;
  quality: "perfect" | "good" | "burnt" | null;
};
export const newCookingGame = (recipe: RecipeId = "garden"): CookingGame => ({
  recipe,
  stage: "idle",
  ingredients: [],
  chops: 0,
  quality: null,
});
export type CookingAction =
  | { type: "start"; recipe?: RecipeId }
  | { type: "ingredient"; ingredient: Ingredient }
  | { type: "chop" }
  | { type: "finish"; heat: number }
  | { type: "serve" };
export function cookingReducer(
  game: CookingGame,
  action: CookingAction,
): CookingGame {
  if (action.type === "start" && ["idle", "done"].includes(game.stage))
    return { ...newCookingGame(action.recipe), stage: "gather" };
  if (
    action.type === "ingredient" &&
    game.stage === "gather" &&
    RECIPES[game.recipe].ingredients.includes(action.ingredient) &&
    !game.ingredients.includes(action.ingredient)
  ) {
    const ingredients = [...game.ingredients, action.ingredient];
    return {
      ...game,
      ingredients,
      stage:
        ingredients.length === RECIPES[game.recipe].ingredients.length
          ? "chop"
          : "gather",
    };
  }
  if (action.type === "chop" && game.stage === "chop") {
    const chops = game.chops + 1;
    return { ...game, chops, stage: chops >= 3 ? "cook" : "chop" };
  }
  if (action.type === "finish" && game.stage === "cook")
    return {
      ...game,
      stage: "serve",
      quality:
        action.heat >= 0.5 && action.heat <= 0.76
          ? "perfect"
          : action.heat >= 1
            ? "burnt"
            : "good",
    };
  if (action.type === "serve" && game.stage === "serve")
    return { ...game, stage: "done" };
  return game;
}
