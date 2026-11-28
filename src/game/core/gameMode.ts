import { create } from "zustand";
import { keys, touch } from "./input";
import { runtime, useGame, type Scene } from "./store";
import { isNearPhotoBooth } from "./photoBoothLayout";
// QA builds: `window.__qa.games` exists from the start (games register into it).
import "./gameQa";

export type GameModeId =
  | "badminton"
  | "blackjack"
  | "pong"
  | "kitchen"
  | "go"
  | "paper-toss"
  | "stadium"
  | "skate"
  | "basketball"
  | "music"
  | "math"
  | "gym"
  | "photo-booth"
  | "banner-rush";
type ActiveGame = {
  id: GameModeId;
  scene: Scene;
  world: ReturnType<typeof useGame.getState>["world"];
  position: [number, number];
  heading: number;
};
export const useGameMode = create<{ active: ActiveGame | null }>(() => ({
  active: null,
}));

const rooms: Record<GameModeId, Scene> = {
  badminton: "badminton",
  blackjack: "kappa",
  pong: "kappa",
  kitchen: "kitchen",
  go: "go",
  "paper-toss": "office",
  stadium: "stadium",
  skate: "skate",
  basketball: "basketball",
  music: "music",
  math: "math",
  gym: "gym",
  "photo-booth": "hub",
  "banner-rush": "townhall",
};
function clearInput() {
  keys.clear();
  touch.x = touch.z = 0;
  runtime.target = null;
  runtime.path = [];
  runtime.moving = false;
  runtime.near = "";
  runtime.shoot = runtime.shooting = runtime.burst = false;
  runtime.steer = 0;
}

// Starting is explicit: entering a room never starts its game. Repeated starts
// preserve the original walking position, including rematches and new rounds.
export function startGameMode(id: GameModeId): boolean {
  const state = useGame.getState();
  const active = useGameMode.getState().active;
  if (active) return active.id === id && active.scene === state.scene;
  if (
    state.scene !== rooms[id] ||
    state.paused ||
    state.traveling ||
    state.panel !== "none" ||
    (id === "photo-booth" &&
      (state.world !== "korea" || state.overlayLocked ||
        !isNearPhotoBooth(runtime.x, runtime.z)))
  )
    return false;
  const position: [number, number] = [runtime.x, runtime.z];
  clearInput();
  useGameMode.setState({
    active: { id, scene: state.scene, world: state.world, position, heading: runtime.heading },
  });
  useGame.setState({ near: "" });
  return true;
}

export function endGameMode() {
  const active = useGameMode.getState().active;
  if (!active) return;
  useGameMode.setState({ active: null });
  clearInput();
  // A scene transition has already chosen its own spawn. Never overwrite it.
  const state = useGame.getState();
  if (state.scene === active.scene && state.world === active.world) {
    [runtime.x, runtime.z] = active.position;
    runtime.heading = active.heading;
  }
}

type EscapeClaim = { id: GameModeId; handler: () => boolean | void };
const escapeClaims: EscapeClaim[] = [];
/**
 * Lets a running game take Escape (to pause itself) instead of Escape ending
 * the game mode. While game `id` is the active mode, Escape calls `handler`;
 * returning `false` lets the mode end as before. The latest claim for the
 * active game wins. Returns the release; claim from an effect:
 *
 *   useEffect(() => claimEscape("basketball", () => setPaused((p) => !p)), []);
 */
export function claimEscape(id: GameModeId, handler: () => boolean | void): () => void {
  const claim: EscapeClaim = { id, handler };
  escapeClaims.push(claim);
  return () => {
    const i = escapeClaims.indexOf(claim);
    if (i >= 0) escapeClaims.splice(i, 1);
  };
}

// Escape dismisses the pause/settings layer first, not the game underneath it.
export function escapeGameMode(repeat = false): boolean {
  const state = useGame.getState();
  const active = useGameMode.getState().active;
  if (repeat || !active || state.paused || state.panel !== "none")
    return false;
  for (let i = escapeClaims.length - 1; i >= 0; i--) {
    const claim = escapeClaims[i];
    if (claim.id !== active.id) continue;
    let taken: boolean | void = true;
    try {
      taken = claim.handler();
    } catch {
      /* A failing handler still counts as handled: never end a run on a bug. */
    }
    if (taken !== false) return true;
    break;
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("interior-game-close"));
  endGameMode();
  return true;
}
