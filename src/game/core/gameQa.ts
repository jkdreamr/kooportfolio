/**
 * Per-game QA handles (PLAN_GAMES J0). A game registers a small snapshot and
 * an input hook while it is mounted:
 *
 *   useEffect(() => registerGameQa("basketball", {
 *     state: () => ({ points, shots, holding }),
 *     act: (name, value) => { if (name === "release") release(value as number); },
 *   }), []);
 *
 * Scripts read them as `window.__qa.games[id].state()` / `.act(name, value)`.
 * Only QA builds (dev, or `VITE_QA=1`) keep anything: elsewhere registering
 * is a no-op that returns a no-op, and the map never reaches `window`.
 */
import { exposeQa, qaEnabled } from "../../stage/qa";
import type { GameModeId } from "./gameMode";

/** Game modes, plus the rowing race (a scene of its own, not a game mode). */
export type GameQaId = GameModeId | "rowing";

export type GameQaApi = {
  /** A small JSON-serialisable snapshot of the game's state. */
  state: () => unknown;
  /** Performs one input ("release", "call", "hit", …) with an optional value. */
  act?: (name: string, value?: unknown) => void;
};

/** Live handles by game id; `window.__qa.games` in QA builds. */
const games: Partial<Record<GameQaId, GameQaApi>> = {};
exposeQa({ games });

/** Registers a game's QA handle; returns the unregister function. A later
 * registration for the same id replaces the earlier one, and only the
 * current one's unregister removes it. */
export function registerGameQa(id: GameQaId, api: GameQaApi): () => void {
  if (!qaEnabled()) return () => {};
  games[id] = api;
  return () => {
    if (games[id] === api) delete games[id];
  };
}

/** The handle registered for `id`, if any (tests and in-page scripts). */
export const gameQa = (id: GameQaId): GameQaApi | undefined => games[id];
