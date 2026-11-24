import type { WorldId } from "./worlds";

export const GARDEN_REGROW_SECONDS = 35;
export const PICNIC_MEAL_SECONDS = 30;
export const BASKET_CAPACITY = 3;
export const BOOK_RESHELVE_SECONDS = 45;
export const BITE_WINDOW_SECONDS = 2.5;
export const COINS = {
  crop: 3,
  ramen: 12,
  parcel: 10,
  book: 5,
  fish: 8,
} as const;
export const PARCEL_DOORS = [
  { id: "go", name: "Go", p: [-42, 23.2] },
  { id: "writing", name: "Writing", p: [0, -42.5] },
  { id: "music", name: "Beat Lab", p: [-11, -20.5] },
  { id: "kitchen", name: "Kitchen", p: [-8, 16.4] },
] as const;
export const BOOK_SPOTS = [
  [17, 29],
  [3, 32],
  [32, 44],
] as const;
export const FISHING_SPOTS = [
  [0, 21],
  [40, 21],
] as const;
type Indexed<P extends string, N extends number> = `${P}-${N}`;
export type RegionalAction =
  | Indexed<"harvest", 0 | 1 | 2 | 3>
  | "produce"
  | "ramen"
  | "picnic"
  | "postbox"
  | Indexed<"parcel", 0 | 1 | 2 | 3>
  | Indexed<"book", 0 | 1 | 2>
  | "bookdrop"
  | Indexed<"fish", 0 | 1>;
export type ActivityState = {
  gardenReadyAt: number[];
  basket: number;
  produceCrates: number;
  bowl: boolean;
  guestFedUntil: number;
  mealsServed: number;
  parcel: number | null;
  parcelsDelivered: number;
  booksReadyAt: number[];
  books: number;
  booksReturned: number;
  /** Bite time per rod; null while the line is out of the water. */
  biteAt: (number | null)[];
  fishCaught: number;
};
export const freshActivities = (): ActivityState => ({
  gardenReadyAt: [0, 0, 0, 0],
  basket: 0,
  produceCrates: 0,
  bowl: false,
  guestFedUntil: 0,
  mealsServed: 0,
  parcel: null,
  parcelsDelivered: 0,
  booksReadyAt: [0, 0, 0],
  books: 0,
  booksReturned: 0,
  biteAt: [null, null],
  fishCaught: 0,
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
  { id: "postbox", world: "home", p: [4, -4.6] },
  ...PARCEL_DOORS.map((d, i) => ({
    id: `parcel-${i}` as RegionalAction,
    world: "home" as const,
    p: d.p,
  })),
  { id: "ramen", world: "korea", p: [39, 10.6] },
  { id: "picnic", world: "korea", p: [-41, 51.8] },
  ...FISHING_SPOTS.map((p, i) => ({
    id: `fish-${i}` as RegionalAction,
    world: "korea" as const,
    p,
  })),
  ...BOOK_SPOTS.map((p, i) => ({
    id: `book-${i}` as RegionalAction,
    world: "stanford" as const,
    p,
  })),
  { id: "bookdrop", world: "stanford", p: [41, 54.7] },
];
const index = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));
/** Door drop-offs only exist while carrying that door's parcel, so Enter keeps working. */
function offered(id: RegionalAction, s?: ActivityState) {
  return (
    !id.startsWith("parcel-") || (s !== undefined && s.parcel === index(id))
  );
}
export function nearbyRegionalActivity(
  world: WorldId,
  x: number,
  z: number,
  s?: ActivityState,
) {
  return activitySpots
    .filter((spot) => spot.world === world && offered(spot.id, s))
    .map((spot) => ({ spot, d: Math.hypot(spot.p[0] - x, spot.p[1] - z) }))
    .filter((spot) => spot.d < 2.4)
    .sort((a, b) => a.d - b.d)[0]?.spot;
}
export function regionalActionLabel(
  s: ActivityState,
  id: RegionalAction,
  now: number,
): string {
  if (id.startsWith("harvest-")) {
    const wait = s.gardenReadyAt[index(id)] - now;
    return wait > 0
      ? `Growing · ${Math.ceil(wait)}s`
      : s.basket >= BASKET_CAPACITY
        ? "Basket full"
        : "Harvest";
  }
  if (id === "produce")
    return s.basket ? `Deliver ${s.basket}` : "Bring produce";
  if (id === "ramen") return s.bowl ? "Bowl in hand" : "Take ramen";
  if (id === "picnic") {
    if (s.guestFedUntil > now) return "Eating";
    return s.bowl ? "Serve ramen" : "Bring ramen";
  }
  if (id === "postbox")
    return s.parcel === null
      ? "Take parcel"
      : `For ${PARCEL_DOORS[s.parcel].name}`;
  if (id.startsWith("parcel-")) return "Deliver parcel";
  if (id.startsWith("book-")) {
    const wait = s.booksReadyAt[index(id)] - now;
    return wait > 0 ? "Returned" : "Pick up book";
  }
  if (id === "bookdrop")
    return s.books
      ? `Return ${s.books} ${s.books === 1 ? "book" : "books"}`
      : "Book return";
  const bite = s.biteAt[index(id)];
  if (bite === null) return "Cast";
  if (now < bite) return "Waiting";
  return now <= bite + BITE_WINDOW_SECONDS ? "Reel in" : "Got away · Cast";
}
/** Coins the action pays right now; zero when it would not change anything. */
export function regionalPayout(
  s: ActivityState,
  id: RegionalAction,
  now: number,
  gardenLevel = 1,
): number {
  if (id === "produce") return s.basket * COINS.crop * gardenLevel;
  if (id === "picnic")
    return s.bowl && s.guestFedUntil <= now ? COINS.ramen : 0;
  if (id.startsWith("parcel-"))
    return s.parcel === index(id) ? COINS.parcel : 0;
  if (id === "bookdrop") return s.books * COINS.book;
  if (id.startsWith("fish-")) {
    const bite = s.biteAt[index(id)];
    return bite !== null && now >= bite && now <= bite + BITE_WINDOW_SECONDS
      ? COINS.fish
      : 0;
  }
  return 0;
}
/** Session-local play; coins are paid by the caller from `regionalPayout`. */
export function stepRegionalActivity(
  s: ActivityState,
  id: RegionalAction,
  now: number,
  random: () => number = Math.random,
): ActivityState {
  if (id.startsWith("harvest-")) {
    const i = index(id);
    if (s.basket >= BASKET_CAPACITY || now < s.gardenReadyAt[i]) return s;
    const gardenReadyAt = [...s.gardenReadyAt];
    gardenReadyAt[i] = now + GARDEN_REGROW_SECONDS;
    return { ...s, gardenReadyAt, basket: s.basket + 1 };
  }
  if (id === "produce")
    return s.basket
      ? { ...s, basket: 0, produceCrates: s.produceCrates + s.basket }
      : s;
  if (id === "ramen") return s.bowl ? s : { ...s, bowl: true };
  if (id === "picnic") {
    if (!s.bowl || s.guestFedUntil > now) return s;
    return {
      ...s,
      bowl: false,
      guestFedUntil: now + PICNIC_MEAL_SECONDS,
      mealsServed: s.mealsServed + 1,
    };
  }
  if (id === "postbox")
    return s.parcel === null
      ? { ...s, parcel: s.parcelsDelivered % PARCEL_DOORS.length }
      : s;
  if (id.startsWith("parcel-"))
    return s.parcel === index(id)
      ? { ...s, parcel: null, parcelsDelivered: s.parcelsDelivered + 1 }
      : s;
  if (id.startsWith("book-")) {
    const i = index(id);
    if (now < s.booksReadyAt[i]) return s;
    const booksReadyAt = [...s.booksReadyAt];
    booksReadyAt[i] = now + BOOK_RESHELVE_SECONDS;
    return { ...s, booksReadyAt, books: s.books + 1 };
  }
  if (id === "bookdrop")
    return s.books
      ? { ...s, books: 0, booksReturned: s.booksReturned + s.books }
      : s;
  const i = index(id),
    bite = s.biteAt[i],
    biteAt = [...s.biteAt];
  if (bite !== null && now < bite) return s;
  if (bite !== null && now <= bite + BITE_WINDOW_SECONDS) {
    biteAt[i] = null;
    return { ...s, biteAt, fishCaught: s.fishCaught + 1 };
  }
  biteAt[i] = now + 3 + random() * 4;
  return { ...s, biteAt };
}
