/**
 * Discoveries: which small things a visitor has poked at, per room.
 *
 * Rooms declare their items once (`declareRoom`); touching one calls
 * `markDiscovered(roomId, itemId)`. Everything else reads from here:
 * the per-room "3/8 discovered" counter, the sparkle on untouched items, and
 * the cross-game stamp card, which can hook `onDiscovery` or the
 * `useDiscoveries` store and never needs to know about rooms or props.
 *
 * Kept under its own storage key (not in the save file): it is a keepsake,
 * not progress, and a blocked or full storage only makes it per-session.
 *
 *   declareRoom("music", ["record", "synth"]);
 *   markDiscovered("music", "record");        // true the first time
 *   roomProgress("music");                    // { found: 1, total: 2 }
 *   allProgress();                            // every room, plus the sum
 *   const off = onDiscovery((e) => stamp(e)); // { roomId, itemId, found, total, roomComplete }
 */
import { create } from "zustand";

export const DISCOVERIES_KEY = "joshua-exe-discoveries-v1";

export type Progress = { found: number; total: number };
export type DiscoveryEvent = {
  roomId: string;
  itemId: string;
  /** Items found in this room, counting this one. */
  found: number;
  /** Items the room declared. */
  total: number;
  /** This find completed the room. */
  roomComplete: boolean;
};

type State = {
  /** `${roomId}:${itemId}` → true. Replaced (never mutated) on change. */
  found: Readonly<Record<string, true>>;
  /** roomId → declared item ids. */
  rooms: Readonly<Record<string, readonly string[]>>;
};

const keyOf = (roomId: string, itemId: string) => `${roomId}:${itemId}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Tolerant parse: anything unexpected is an empty card, never a throw. */
export function parseDiscoveries(raw: string | null | undefined): Record<string, true> {
  const out: Record<string, true> = {};
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as { v?: unknown; found?: unknown };
    if (!data || data.v !== 1 || !Array.isArray(data.found)) return out;
    for (const key of data.found)
      if (typeof key === "string" && key.length < 96 && key.includes(":")) out[key] = true;
  } catch {
    /* A corrupt card starts over. */
  }
  return out;
}

export const serializeDiscoveries = (found: Readonly<Record<string, true>>) =>
  JSON.stringify({ v: 1, found: Object.keys(found).sort() });

function load(): Record<string, true> {
  try {
    return parseDiscoveries(storage()?.getItem(DISCOVERIES_KEY));
  } catch {
    return {};
  }
}

export const useDiscoveries = create<State>(() => ({ found: load(), rooms: {} }));

const listeners = new Set<(event: DiscoveryEvent) => void>();

/** Called for every first-time find. Returns the unsubscribe. */
export function onDiscovery(listener: (event: DiscoveryEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Declares (or replaces) the items a room offers; ids are unique per room. */
export function declareRoom(roomId: string, itemIds: readonly string[]) {
  const unique = [...new Set(itemIds)];
  const current = useDiscoveries.getState().rooms[roomId];
  if (current && current.length === unique.length && current.every((id, i) => id === unique[i])) return;
  useDiscoveries.setState((s) => ({ rooms: { ...s.rooms, [roomId]: Object.freeze(unique) } }));
}

export function isDiscovered(roomId: string, itemId: string): boolean {
  return useDiscoveries.getState().found[keyOf(roomId, itemId)] === true;
}

function count(state: State, roomId: string): Progress {
  const items = state.rooms[roomId] ?? [];
  let found = 0;
  for (const id of items) if (state.found[keyOf(roomId, id)]) found++;
  return { found, total: items.length };
}

/** Found / declared for one room (0/0 for a room that declared nothing). */
export function roomProgress(roomId: string): Progress {
  return count(useDiscoveries.getState(), roomId);
}

/** Every declared room, and the sum across them (the stamp card's numbers). */
export function allProgress(): { rooms: Record<string, Progress>; found: number; total: number } {
  const state = useDiscoveries.getState();
  const rooms: Record<string, Progress> = {};
  let found = 0,
    total = 0;
  for (const roomId of Object.keys(state.rooms)) {
    const p = (rooms[roomId] = count(state, roomId));
    found += p.found;
    total += p.total;
  }
  return { rooms, found, total };
}

/**
 * Records a find. Returns true the first time, false when it was already
 * found. Items a room never declared are still remembered (a later
 * declaration counts them), but they do not move the room's total.
 */
export function markDiscovered(roomId: string, itemId: string): boolean {
  const key = keyOf(roomId, itemId);
  const state = useDiscoveries.getState();
  if (state.found[key]) return false;
  const found = { ...state.found, [key]: true as const };
  useDiscoveries.setState({ found });
  try {
    storage()?.setItem(DISCOVERIES_KEY, serializeDiscoveries(found));
  } catch {
    /* Storage full or blocked: the card lasts this session. */
  }
  const progress = roomProgress(roomId);
  const event: DiscoveryEvent = {
    roomId,
    itemId,
    found: progress.found,
    total: progress.total,
    roomComplete: progress.total > 0 && progress.found === progress.total,
  };
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* A listener's failure never loses the find. */
    }
  }
  return true;
}

/** React: live progress for one room. */
export function useRoomProgress(roomId: string): Progress {
  const found = useDiscoveries((s) => count(s, roomId).found);
  const total = useDiscoveries((s) => (s.rooms[roomId] ?? []).length);
  return { found, total };
}

/** Forgets every find (settings "start over", tests). Declarations stay. */
export function resetDiscoveries() {
  useDiscoveries.setState({ found: {} });
  try {
    storage()?.removeItem(DISCOVERIES_KEY);
  } catch {
    /* Nothing to clear. */
  }
}
