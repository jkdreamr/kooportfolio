import { describe, expect, it } from "vitest";
import { RECIPES, type CookingAction } from "../src/game/core/interiorGames";
import {
  newRestaurant,
  restaurantReducer,
  type Restaurant,
} from "../src/game/core/restaurant";

const open = () => restaurantReducer(newRestaurant(), { type: "open" });
function prepare(state: Restaurant, heat: number) {
  const order = state.orders.find((entry) => entry.id === state.active)!;
  const actions: CookingAction[] = [
    ...RECIPES[order.recipe].ingredients.map((ingredient) => ({
      type: "ingredient" as const,
      ingredient,
    })),
    { type: "chop" },
    { type: "chop" },
    { type: "chop" },
    { type: "finish", heat },
  ];
  return actions.reduce(
    (next, action) => restaurantReducer(next, { type: "prep", action }),
    state,
  );
}
describe("customer kitchen", () => {
  it("requires a ticket, prepares its recipe and pays once for a service", () => {
    let state = open();
    expect(
      restaurantReducer(state, { type: "prep", action: { type: "serve" } }),
    ).toBe(state);
    state = restaurantReducer(state, { type: "take", id: 0 });
    const wrong = restaurantReducer(state, {
      type: "prep",
      action: { type: "ingredient", ingredient: "Carrot" },
    });
    expect(wrong).toBe(state);
    state = prepare(state, 0.63);
    state = restaurantReducer(state, {
      type: "prep",
      action: { type: "serve" },
    });
    expect(state.served).toBe(1);
    expect(state.tips).toBe(16);
    expect(state.orders.map((order) => order.id)).not.toContain(0);
    expect(
      restaurantReducer(state, { type: "prep", action: { type: "serve" } }),
    ).toBe(state);
  });
  it("burnt food earns nothing and keeps the customer's ticket", () => {
    let state = restaurantReducer(open(), { type: "take", id: 1 });
    state = restaurantReducer(prepare(state, 1), {
      type: "prep",
      action: { type: "serve" },
    });
    expect(state.tips).toBe(0);
    expect(state.orders).toHaveLength(2);
    expect(state.active).toBeNull();
    expect(state.batch.stage).toBe("idle");
  });
  it("expires impatient customers and discards their in-flight prep", () => {
    let state = restaurantReducer(open(), { type: "take", id: 0 });
    state = restaurantReducer(state, { type: "tick", dt: 39 });
    expect(state.missed).toBe(1);
    expect(state.active).toBeNull();
    expect(state.batch.stage).toBe("idle");
    expect(state.orders.every((order) => order.patience > 0)).toBe(true);
  });
  it("caps the line at three and fills unoccupied counter places", () => {
    let state = restaurantReducer(open(), { type: "tick", dt: 11 });
    expect(state.orders).toHaveLength(3);
    expect(new Set(state.orders.map((order) => order.seat)).size).toBe(3);
    state = restaurantReducer(state, { type: "tick", dt: 13 });
    expect(state.orders).toHaveLength(3);
  });
  it("ends on real elapsed time, locks input, and resets a new shift", () => {
    let state = restaurantReducer(open(), { type: "tick", dt: 90 });
    expect(state.status).toBe("over");
    expect(restaurantReducer(state, { type: "take", id: 0 })).toBe(state);
    state = restaurantReducer(state, { type: "open" });
    expect(state.remaining).toBe(90);
    expect(state.orders).toHaveLength(2);
    expect(state.tips).toBe(0);
  });
});
