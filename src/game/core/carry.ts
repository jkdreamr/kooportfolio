/**
 * "Hands" (PLAN_GAMES §5.2–5.5, cut down): what the player is carrying, what
 * it is for, where it goes, what Use / Give / Drop do with it, and the small
 * fetch quests that ink a stamp. Pure: reads the session ActivityState from
 * core/regionalActivities and returns plain data for the view and the chip.
 *
 * One rule: one kind of thing in your hands at a time. The chip says what it
 * is, what to do with it, and points at where it goes; a beacon marks that
 * place. Use = the best action here and now (give it to whoever wants it when
 * you are there, else the item's own use); Drop sets it on the ground.
 */
import type { WorldId } from "./worlds";
import { POND } from "./pond";
import {
  activitySpots,
  nearbyRegionalActivity,
  PARCEL_DOORS,
  regionalActionLabel,
  stepRegionalActivity,
  type ActivityState,
  type RegionalAction,
} from "./regionalActivities";

export type CarryKind = "basket" | "parcel" | "ramen" | "book";
export type Carried = { kind: CarryKind; count: number; parcel: number | null };

/** Dropped items return to where they came from after this long. */
export const DROP_RETURN_SECONDS = 120;
export const PICKUP_REACH = 2.4;

export const ITEM_NAMES: Record<CarryKind, string> = {
  basket: "Produce basket",
  parcel: "Parcel",
  ramen: "Bowl of ramen",
  book: "Library book",
};

/** What is in the player's hands in this world, or null. */
export function carriedIn(world: WorldId, s: ActivityState): Carried | null {
  if (world === "home" && s.basket > 0) return { kind: "basket", count: s.basket, parcel: null };
  if (world === "home" && s.parcel !== null) return { kind: "parcel", count: 1, parcel: s.parcel };
  if (world === "korea" && s.bowl) return { kind: "ramen", count: 1, parcel: null };
  if (world === "stanford" && s.books > 0) return { kind: "book", count: s.books, parcel: null };
  return null;
}

/** The action that takes each kind out of your hands at its destination. */
const DELIVER: Record<CarryKind, (c: Carried) => RegionalAction> = {
  basket: () => "produce",
  parcel: (c) => `parcel-${c.parcel ?? 0}` as RegionalAction,
  ramen: () => "picnic",
  book: () => "bookdrop",
};
/** Sources: picking these up fills your hands. */
const SOURCE: Record<string, CarryKind> = {
  harvest: "basket",
  postbox: "parcel",
  ramen: "ramen",
  book: "book",
};
const kindOfSource = (id: RegionalAction): CarryKind | undefined => SOURCE[id.replace(/-\d+$/, "")];

export const spotOf = (id: RegionalAction): readonly [number, number] => activitySpots.find((s) => s.id === id)!.p;

/** Where the carried thing goes (beacons, chip arrow). */
export function destinations(c: Carried): (readonly [number, number])[] {
  return [spotOf(DELIVER[c.kind](c))];
}

/** One rule: a different kind of thing cannot be picked up with full hands. */
export function handsFull(world: WorldId, s: ActivityState, id: RegionalAction): boolean {
  const held = carriedIn(world, s),
    wants = kindOfSource(id);
  return !!held && !!wants && wants !== held.kind;
}

/** Fetch quests: each inks a passport stamp once (stamp ids from passport.ts). */
export type Quest = {
  id: string;
  world: WorldId;
  item: CarryKind;
  stamp: string;
  name: string;
  goal: number;
  progress: (s: ActivityState) => number;
};
export const QUESTS: readonly Quest[] = [
  { id: "market", world: "home", item: "basket", stamp: "home.market", name: "Market day", goal: 3, progress: (s) => s.produceCrates },
  { id: "post", world: "home", item: "parcel", stamp: "home.post", name: "Post round", goal: 4, progress: (s) => s.parcelsDelivered },
  { id: "overdue", world: "stanford", item: "book", stamp: "stanford.books", name: "Overdue", goal: 3, progress: (s) => s.booksReturned },
  { id: "lunch", world: "korea", item: "ramen", stamp: "korea.ramen", name: "Lunch by the river", goal: 1, progress: (s) => s.mealsServed },
];
export const questFor = (world: WorldId, kind: CarryKind) => QUESTS.find((q) => q.world === world && q.item === kind);
/** Stamps whose quest is complete in this state. */
export const questStamps = (s: ActivityState) => QUESTS.filter((q) => q.progress(s) >= q.goal).map((q) => q.stamp);

/** Line 2 of the chip: what the item is for (and quest progress). */
export function purposeOf(world: WorldId, c: Carried, s: ActivityState, done: (stamp: string) => boolean): string {
  const base =
    c.kind === "basket"
      ? "Take it to the market crate"
      : c.kind === "parcel"
        ? `Deliver it to the ${PARCEL_DOORS[c.parcel ?? 0].name} door`
        : c.kind === "ramen"
          ? "Serve it to the picnic guest by the river"
          : "Return it to the book drop";
  const q = questFor(world, c.kind);
  if (!q || done(q.stamp)) return base;
  return `${base} · ${q.name} ${Math.min(q.progress(s), q.goal)}/${q.goal}`;
}

export type UseAction = "give" | "feed-ducks" | "eat" | "read" | "shake";
export type BestUse = { action: UseAction; label: string; disabled?: boolean; reason?: string; target?: RegionalAction };

export const POND_REACH = 9;

/** The best thing to do with the carried item at (x, z) right now. */
export function bestUse(world: WorldId, c: Carried, s: ActivityState, x: number, z: number, now: number): BestUse {
  // At its destination: give / deliver it (the existing step does the work).
  const near = nearbyRegionalActivity(world, x, z, s);
  const deliver = DELIVER[c.kind](c);
  if (near?.id === deliver) {
    const ok = stepRegionalActivity(s, deliver, now) !== s;
    return {
      action: "give",
      label: regionalActionLabel(s, deliver, now),
      target: deliver,
      disabled: !ok,
      reason: ok ? undefined : "Not now",
    };
  }
  if (c.kind === "basket") {
    const atPond = world === "home" && Math.hypot(x - POND.x, z - POND.z) < POND_REACH;
    return atPond
      ? { action: "feed-ducks", label: "Feed the ducks" }
      : { action: "feed-ducks", label: "Feed the ducks", disabled: true, reason: "Find the pond to feed the ducks" };
  }
  if (c.kind === "ramen") return { action: "eat", label: "Eat" };
  if (c.kind === "book") return { action: "read", label: "Read a page" };
  return { action: "shake", label: "Shake" };
}

/** Applies a non-delivery use to the session state (delivery goes through
 * stepRegionalActivity). Returns the same object when nothing changes. */
export function applyUse(s: ActivityState, action: UseAction): ActivityState {
  if (action === "feed-ducks") return s.basket > 0 ? { ...s, basket: s.basket - 1 } : s;
  if (action === "eat") return s.bowl ? { ...s, bowl: false } : s;
  return s;
}

/** Shake lines: what each door's parcel sounds like (village flavour). */
export const PARCEL_SHAKES = [
  "Sounds like stones. For the Go room, surely.",
  "Paper, lots of it. Someone is writing a lot.",
  "Something rattles in a tin. Drum sticks?",
  "Smells faintly of garlic.",
] as const;

export type Dropped = Carried & { x: number; z: number; at: number };

/** Empties the player's hands onto the ground at (x, z). */
export function drop(world: WorldId, s: ActivityState, x: number, z: number, now: number): { play: ActivityState; dropped: Dropped | null } {
  const c = carriedIn(world, s);
  if (!c) return { play: s, dropped: null };
  const play =
    c.kind === "basket"
      ? { ...s, basket: 0 }
      : c.kind === "parcel"
        ? { ...s, parcel: null }
        : c.kind === "ramen"
          ? { ...s, bowl: false }
          : { ...s, books: 0 };
  return { play, dropped: { ...c, x, z, at: now } };
}

/** Picks a dropped item back up (only into empty hands). */
export function pickUp(world: WorldId, s: ActivityState, d: Dropped): ActivityState {
  if (carriedIn(world, s)) return s;
  if (d.kind === "basket") return { ...s, basket: d.count };
  if (d.kind === "parcel") return { ...s, parcel: d.parcel };
  if (d.kind === "ramen") return { ...s, bowl: true };
  return { ...s, books: d.count };
}

export const dropExpired = (d: Dropped, now: number) => now - d.at >= DROP_RETURN_SECONDS;

/** Which world each kind belongs to (a dropped item stays in its world). */
export const KIND_WORLD: Record<CarryKind, WorldId> = { basket: "home", parcel: "home", ramen: "korea", book: "stanford" };
