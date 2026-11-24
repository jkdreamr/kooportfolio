import { create } from "zustand";
import { keys, touch } from "./input";
import { runtime, useGame, type Scene } from "./store";

export type GameModeId =
  | "badminton"
  | "blackjack"
  | "pong"
  | "kitchen"
  | "go"
  | "stadium"
  | "skate"
  | "basketball"
  | "music"
  | "math"
  | "gym"
  | "cognition";
type ActiveGame = {
  id: GameModeId;
  scene: Scene;
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
  stadium: "stadium",
  skate: "skate",
  basketball: "basketball",
  music: "music",
  math: "math",
  gym: "gym",
  cognition: "cognition",
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
    state.panel !== "none"
  )
    return false;
  const position: [number, number] = [runtime.x, runtime.z];
  clearInput();
  useGameMode.setState({
    active: { id, scene: state.scene, position, heading: runtime.heading },
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
  if (useGame.getState().scene === active.scene) {
    [runtime.x, runtime.z] = active.position;
    runtime.heading = active.heading;
  }
}
