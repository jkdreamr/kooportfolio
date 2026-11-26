import { useSyncExternalStore } from "react";
import { coverDoorway } from "../ui/DoorTransition";
import { keys, touch } from "./input";
import { useGameMode } from "./gameMode";
import { runtime, useGame, type Scene } from "./store";

/** Door and exit swaps happen under the doorway veil (DoorTransition):
 * it darkens for MOTION.veilIn, the scene changes beneath it, and it clears
 * once the new scene is presented, so the room/street content swap is never
 * a bare cut. Reduced motion resolves at once (no veil).
 * Owner: WS-D (moved out of Game.tsx by WS-A's contract step). */
let doorwayBusy = false;
export function throughDoorway(scene: Scene) {
  if (doorwayBusy) return;
  doorwayBusy = true;
  void coverDoorway().then(() => {
    doorwayBusy = false;
    useGame.getState().go(scene);
  });
}

/** Leave the current room for the hub under the doorway veil. */
export function leaveRoom() {
  throughDoorway("hub");
}

/* ── One-step exit ────────────────────────────────────────────────────────
 * "← Exit" records an intent and walks to the door mat; arriving on the mat
 * with the intent set leaves at once (no E). Walking onto the mat by hand
 * keeps the E prompt. Any movement input, a new walk target, a scene change,
 * a panel or a game opening cancels the intent, as does a game overlay that
 * has not closed within 6 s; a walk that has not arrived within 4 s (no path, the skate park's own controller) leaves
 * directly under the veil. */
export const EXIT_INTENT_MS = 6000;
export const EXIT_ARRIVE_MS = 4000;
type ExitIntent = {
  scene: Scene;
  at: number;
  /** When the walk to the mat began (0 while a game overlay still closes). */
  walkAt: number;
  /** walkTo() assigns a fresh array: another walk or a key replaces it. */
  path: unknown;
};
let intent: ExitIntent | null = null;
let ticker = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];

export function requestExit(scene: Scene) {
  intent = { scene, at: performance.now(), walkAt: 0, path: null };
  if (!ticker) ticker = window.setInterval(tickExitIntent, 100);
  emit();
}
/** Call right after the walk to the mat was issued (walkTo). */
export function exitWalkStarted() {
  if (!intent) return;
  intent.walkAt = performance.now();
  intent.path = runtime.path;
}
export function cancelExit() {
  if (ticker) window.clearInterval(ticker);
  ticker = 0;
  if (!intent) return;
  intent = null;
  emit();
}
export function exitIntentScene() {
  return intent?.scene ?? null;
}

function tickExitIntent() {
  if (!intent) return cancelExit();
  const g = useGame.getState();
  const now = performance.now();
  const moved =
    Math.hypot(touch.x, touch.z) > 0.1 || MOVE_KEYS.some((k) => keys.has(k));
  if (
    g.scene !== intent.scene ||
    g.panel !== "none" ||
    g.paused ||
    moved ||
    (!intent.walkAt && now - intent.at > EXIT_INTENT_MS) ||
    (intent.walkAt &&
      (runtime.path !== intent.path || g.overlayLocked || useGameMode.getState().active))
  )
    return cancelExit();
  if (!intent.walkAt) return;
  if (g.near === "exit" || now - intent.walkAt > EXIT_ARRIVE_MS) {
    cancelExit();
    leaveRoom();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** True while an Exit press for `scene` is walking to the door. */
export function useExitIntent(scene: Scene) {
  return useSyncExternalStore(subscribe, () => intent?.scene === scene);
}
