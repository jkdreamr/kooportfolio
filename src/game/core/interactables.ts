/**
 * Interactables: small things in a scene the visitor can walk up to and use
 * (toggle a lamp, spin a globe, read a frame). One registry, one focus rule,
 * one way to activate, shared by keyboard (E), the on-screen prompt button
 * and taps on the thing itself.
 *
 * A scene registers what it offers; each frame it reports where the player
 * is (`updateFocus`), and the nearest item in reach becomes the focus. The
 * HUD prompt renders `useInteractables((s) => s.focus)`; E calls
 * `activateFocused()`. Using an item for the first time records a discovery
 * (core/discoveries.ts) unless the item opts out.
 *
 *   const off = registerInteractable({
 *     id: "globe", room: "office", x: 4, z: -6,
 *     label: "Globe", verb: "Spin", use: () => spin(),
 *   });
 *   updateFocus(runtime.x, runtime.z, runtime.heading);   // per frame
 *   activateFocused();                                     // on E
 *
 * Extending it (carryable items, deliveries): an item is plain data plus a
 * `use` callback, so "pick up" is an interactable whose `use` removes itself
 * and registers a "put down" one; `kind` and `data` are free for the owner
 * of that feature, `position` lets an item follow whatever carries it, and
 * `onInteract` observes every use without touching the items.
 */
import { create } from "zustand";
import { markDiscovered } from "./discoveries";

export type Interactable = {
  /** Unique within its room. */
  id: string;
  /** Discovery room id (see `discoveryRoomId`). */
  room: string;
  /** Floor position in the scene's coordinates. */
  x: number;
  z: number;
  /** Height of the prompt anchor and sparkle (default 1.4). */
  y?: number;
  /** How close the player must be, in metres (default 2.3). */
  reach?: number;
  /** What it is: "Record player". */
  label: string;
  /** What E does now: "Play record". A function for toggles. */
  verb: string | (() => string);
  use: () => void;
  /** Hidden from focus while this returns false. */
  enabled?: () => boolean;
  /** Counts as a discovery the first time (default true). */
  discover?: boolean;
  /** Metres subtracted from its distance when choosing a focus. */
  priority?: number;
  /** Live position for things that move (carried items). */
  position?: () => readonly [number, number];
  /** Free for feature owners: "lamp", "carry", "deliver"… */
  kind?: string;
  data?: unknown;
};

export type InteractEvent = {
  item: Interactable;
  /** This use was the item's discovery. */
  first: boolean;
  source: InteractSource;
};
export type InteractSource = "key" | "button" | "tap" | "script";

export const DEFAULT_REACH = 2.3;
/** A new candidate must beat the current focus by this much (no flicker). */
export const FOCUS_HYSTERESIS = 0.3;

type State = {
  items: readonly Interactable[];
  /** The item in reach, or null. */
  focus: Interactable | null;
  /** Bumps on every use, so views can replay a response. */
  uses: number;
  /** The last item used, and whether that was its discovery. */
  last: InteractEvent | null;
};

export const useInteractables = create<State>(() => ({
  items: Object.freeze([]) as readonly Interactable[],
  focus: null,
  uses: 0,
  last: null,
}));

const same = (a: Interactable, b: Interactable) => a.room === b.room && a.id === b.id;

/** Adds an item (replacing one with the same room and id). Returns removal. */
export function registerInteractable(item: Interactable): () => void {
  useInteractables.setState((s) => ({
    items: Object.freeze([...s.items.filter((other) => !same(other, item)), item]),
  }));
  return () =>
    useInteractables.setState((s) => {
      if (!s.items.includes(item)) return s;
      return {
        items: Object.freeze(s.items.filter((other) => other !== item)),
        focus: s.focus === item ? null : s.focus,
      };
    });
}

/** Adds several items at once. Returns one removal for all of them. */
export function registerInteractables(items: readonly Interactable[]): () => void {
  const offs = items.map(registerInteractable);
  return () => offs.forEach((off) => off());
}

export const positionOf = (item: Interactable): readonly [number, number] =>
  item.position ? item.position() : [item.x, item.z];

/**
 * The item to focus from (x, z): the nearest enabled one within its reach.
 * Facing breaks near-ties (what is in front wins by up to 0.5 m), and the
 * current focus is kept unless something is clearly closer.
 */
export function pickFocus(
  items: readonly Interactable[],
  x: number,
  z: number,
  heading?: number,
  current?: Interactable | null,
): Interactable | null {
  let best: Interactable | null = null,
    bestScore = Infinity;
  for (const item of items) {
    if (item.enabled && !item.enabled()) continue;
    // No tuple for fixed items: this runs every frame for every item.
    let ix = item.x,
      iz = item.z;
    if (item.position) [ix, iz] = item.position();
    const dx = ix - x,
      dz = iz - z;
    const distance = Math.hypot(dx, dz);
    if (distance > (item.reach ?? DEFAULT_REACH)) continue;
    let score = distance - (item.priority ?? 0);
    if (heading !== undefined && distance > 0.001)
      score -= 0.25 * ((dx * Math.sin(heading) + dz * Math.cos(heading)) / distance + 1);
    if (item === current) score -= FOCUS_HYSTERESIS;
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Per-frame: recompute the focus for the player's position. `blocked`
 * (a panel is open, a mini-game runs, another prompt has the key) clears it.
 * Writes the store only when the focus changes.
 */
export function updateFocus(x: number, z: number, heading?: number, blocked = false): Interactable | null {
  const state = useInteractables.getState();
  const next = blocked ? null : pickFocus(state.items, x, z, heading, state.focus);
  if (next !== state.focus) useInteractables.setState({ focus: next });
  return next;
}

/** Drops the focus (leaving the scene, opening an overlay). */
export function clearFocus() {
  if (useInteractables.getState().focus) useInteractables.setState({ focus: null });
}

const listeners = new Set<(event: InteractEvent) => void>();
/** Observes every use (feedback, analytics-free counters, carry rules). */
export function onInteract(listener: (event: InteractEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Uses an item now, whatever the focus is. Returns false if it is disabled. */
export function activate(item: Interactable, source: InteractSource = "script"): boolean {
  if (item.enabled && !item.enabled()) return false;
  const first = item.discover === false ? false : markDiscovered(item.room, item.id);
  item.use();
  const event: InteractEvent = { item, first, source };
  useInteractables.setState((s) => ({ uses: s.uses + 1, last: event }));
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* Feedback is garnish. */
    }
  }
  return true;
}

/** Uses the focused item. Returns true when something was used. */
export function activateFocused(source: InteractSource = "key"): boolean {
  const { focus } = useInteractables.getState();
  return focus ? activate(focus, source) : false;
}

export const verbOf = (item: Interactable) => (typeof item.verb === "function" ? item.verb() : item.verb);

/** The room id discoveries are filed under: the scene, except the two
 * cinemas, which share a scene and differ by world. */
export function discoveryRoomId(world: string, scene: string): string {
  return scene === "theater" && world === "korea" ? "theater-korea" : scene;
}

/** Removes everything (tests, scene teardown safety net). */
export function resetInteractables() {
  useInteractables.setState({ items: Object.freeze([]) as readonly Interactable[], focus: null, uses: 0, last: null });
}
