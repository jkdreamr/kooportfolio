import {
  cookingReducer,
  newCookingGame,
  type CookingAction,
  type CookingGame,
  type RecipeId,
} from "./interiorGames";

export type Order = {
  id: number;
  name: string;
  recipe: RecipeId;
  patience: number;
  maxPatience: number;
  seat: number;
};
export type Restaurant = {
  status: "closed" | "open" | "over";
  remaining: number;
  arrival: number;
  orders: Order[];
  nextId: number;
  active: number | null;
  batch: CookingGame;
  served: number;
  missed: number;
  tips: number;
  feedback: string;
};
const names = ["Sam", "Jules", "Max", "Ari", "Leo", "Kai"];
function customer(id: number, seat: number): Order {
  const maxPatience = 38 + (id % 3) * 6;
  return {
    id,
    name: names[id % names.length],
    recipe: (["tomato", "carrot", "garden"] as const)[id % 3],
    patience: maxPatience,
    maxPatience,
    seat,
  };
}
export const newRestaurant = (): Restaurant => ({
  status: "closed",
  remaining: 90,
  arrival: 10,
  orders: [],
  nextId: 2,
  active: null,
  batch: newCookingGame(),
  served: 0,
  missed: 0,
  tips: 0,
  feedback: "Take orders. Cook. Keep the line moving.",
});
export type RestaurantAction =
  | { type: "open" }
  | { type: "tick"; dt: number }
  | { type: "take"; id: number }
  | { type: "prep"; action: CookingAction }
  | { type: "end" };
export function restaurantReducer(
  state: Restaurant,
  action: RestaurantAction,
): Restaurant {
  if (action.type === "open" && state.status !== "open")
    return {
      ...newRestaurant(),
      status: "open",
      orders: [customer(0, 0), customer(1, 1)],
      feedback: "Choose a customer's ticket.",
    };
  if (state.status !== "open") return state;
  if (action.type === "end")
    return { ...state, status: "over", active: null, batch: newCookingGame() };
  if (action.type === "tick") {
    const remaining = Math.max(0, state.remaining - action.dt);
    if (remaining === 0)
      return {
        ...state,
        remaining,
        status: "over",
        active: null,
        batch: newCookingGame(),
      };
    let orders = state.orders
      .map((order) => ({ ...order, patience: order.patience - action.dt }))
      .filter((order) => order.patience > 0);
    const missed = state.missed + state.orders.length - orders.length;
    const lostActive =
      state.active !== null &&
      !orders.some((order) => order.id === state.active);
    let arrival = state.arrival - action.dt,
      nextId = state.nextId;
    if (arrival <= 0 && orders.length < 3) {
      const seat = [0, 1, 2].find(
        (n) => !orders.some((order) => order.seat === n),
      )!;
      orders = [...orders, customer(nextId++, seat)];
      arrival = 12;
    }
    return {
      ...state,
      remaining,
      orders,
      missed,
      arrival,
      nextId,
      active: lostActive ? null : state.active,
      batch: lostActive ? newCookingGame() : state.batch,
      feedback:
        missed > state.missed
          ? "A customer left. Keep moving."
          : state.feedback,
    };
  }
  if (action.type === "take" && state.active === null) {
    const order = state.orders.find((entry) => entry.id === action.id);
    return order
      ? {
          ...state,
          active: order.id,
          batch: cookingReducer(newCookingGame(), {
            type: "start",
            recipe: order.recipe,
          }),
          feedback: `${order.name}'s order.`,
        }
      : state;
  }
  if (action.type === "prep" && state.active !== null) {
    const batch = cookingReducer(state.batch, action.action);
    if (batch === state.batch) return state;
    if (batch.stage !== "done") return { ...state, batch };
    if (batch.quality === "burnt")
      return {
        ...state,
        batch: newCookingGame(),
        active: null,
        feedback: "Burnt. Take the ticket again.",
      };
    const order = state.orders.find((entry) => entry.id === state.active)!;
    const tip =
      4 +
      Math.ceil((order.patience / order.maxPatience) * 6) +
      (batch.quality === "perfect" ? 6 : 0);
    return {
      ...state,
      batch: newCookingGame(),
      active: null,
      orders: state.orders.filter((entry) => entry.id !== order.id),
      served: state.served + 1,
      tips: state.tips + tip,
      arrival: Math.min(state.arrival, 3),
      feedback: `${order.name} served. +${tip}`,
    };
  }
  return state;
}
