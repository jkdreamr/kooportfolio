import type { WorldId } from "./worlds";

export const GARDEN_REGROW_SECONDS = 35;
export const PICNIC_MEAL_SECONDS = 30;
export const BASKET_CAPACITY = 3;
export type RegionalAction =
  | "harvest-0"
  | "harvest-1"
  | "harvest-2"
  | "harvest-3"
  | "produce"
  | "ramen"
  | "picnic";
export type ActivityState = {
  gardenReadyAt: number[];
  basket: number;
  produceCrates: number;
  bowl: boolean;
  guestFedUntil: number;
  mealsServed: number;
};
export const freshActivities = (): ActivityState => ({
  gardenReadyAt: [0, 0, 0, 0],
  basket: 0,
  produceCrates: 0,
  bowl: false,
  guestFedUntil: 0,
  mealsServed: 0,
});
export const activitySpots: readonly {
  id: RegionalAction;
  world: WorldId;
  p: readonly [number, number];
}[] = [
  { id: "harvest-0", world: "home", p: [16.5, 42] },
  { id: "harvest-1", world: "home", p: [16.5, 55] },
  { id: "harvest-2", world: "home", p: [23.5, 42] },
  { id: "harvest-3", world: "home", p: [23.5, 55] },
  { id: "produce", world: "home", p: [25, -8.8] },
  { id: "ramen", world: "korea", p: [39, 10.6] },
  { id: "picnic", world: "korea", p: [-41, 51.8] },
];
export function nearbyRegionalActivity(world: WorldId, x: number, z: number) {
  return activitySpots
    .filter((s) => s.world === world)
    .map((s) => ({ spot: s, d: Math.hypot(s.p[0] - x, s.p[1] - z) }))
    .filter((s) => s.d < 2.4)
    .sort((a, b) => a.d - b.d)[0]?.spot;
}
export function regionalActionLabel(
  s: ActivityState,
  id: RegionalAction,
  now: number,
): string {
  if (id.startsWith("harvest-")) {
    const wait = s.gardenReadyAt[Number(id.slice(-1))] - now;
    return wait > 0
      ? `Growing · ${Math.ceil(wait)}s`
      : s.basket >= BASKET_CAPACITY
        ? "Basket full"
        : "Harvest";
  }
  if (id === "produce")
    return s.basket ? `Deliver ${s.basket}` : "Bring produce";
  if (id === "ramen") return s.bowl ? "Bowl in hand" : "Take ramen";
  if (s.guestFedUntil > now) return "Eating";
  return s.bowl ? "Serve ramen" : "Bring ramen";
}
/** Session-local play: no biography, currency, rewards or durable-save changes. */
export function stepRegionalActivity(
  s: ActivityState,
  id: RegionalAction,
  now: number,
): ActivityState {
  if (id.startsWith("harvest-")) {
    const index = Number(id.slice(-1));
    if (s.basket >= BASKET_CAPACITY || now < s.gardenReadyAt[index]) return s;
    const gardenReadyAt = [...s.gardenReadyAt];
    gardenReadyAt[index] = now + GARDEN_REGROW_SECONDS;
    return { ...s, gardenReadyAt, basket: s.basket + 1 };
  }
  if (id === "produce")
    return s.basket
      ? { ...s, basket: 0, produceCrates: s.produceCrates + s.basket }
      : s;
  if (id === "ramen") return s.bowl ? s : { ...s, bowl: true };
  if (!s.bowl || s.guestFedUntil > now) return s;
  return {
    ...s,
    bowl: false,
    guestFedUntil: now + PICNIC_MEAL_SECONDS,
    mealsServed: s.mealsServed + 1,
  };
}
