import { create } from "zustand";

export const MIN_WORLD_ZOOM = 0.8;
export const MAX_WORLD_ZOOM = 14;

/** Explore (walk) view: third-person camera behind the player. */
export const MIN_EXPLORE_DISTANCE = 6;
export const MAX_EXPLORE_DISTANCE = 16;
export const DEFAULT_EXPLORE_DISTANCE = 10;

export type WorldViewMode = "diorama" | "explore";

export interface WorldViewState {
  /** Diorama zoom (0.8–14, 1 = whole island). Kept while in explore. */
  zoom: number;
  /** The view the visitor chose. The camera only follows it when the scene
   * allows (hub, no travel/train/game mode/photo booth): see viewRuntime. */
  view: WorldViewMode;
  /** Explore boom length in world units (6–16). */
  exploreDistance: number;
  /** The view stored in the save when the game booted (null: none yet, a
   * first-time or pre-explore visitor). The flight landing reads it. */
  savedView: WorldViewMode | null;
}

export const useWorldView = create<WorldViewState>(() => ({
  zoom: 1,
  view: "diorama",
  exploreDistance: DEFAULT_EXPLORE_DISTANCE,
  savedView: null,
}));

/**
 * Non-reactive per-frame view state. Walker (Hub.tsx) is the only writer;
 * every other system reads it. blend: 0 = diorama pose, 1 = explore pose.
 * effective: the view the camera is heading to this frame.
 */
export const viewRuntime: { blend: number; effective: WorldViewMode } = {
  blend: 0,
  effective: "diorama",
};

export const clampExploreDistance = (distance: number) =>
  Number.isFinite(distance)
    ? Math.max(MIN_EXPLORE_DISTANCE, Math.min(MAX_EXPLORE_DISTANCE, distance))
    : DEFAULT_EXPLORE_DISTANCE;

export function fitIsland() {
  useWorldView.setState({ zoom: 1 });
}

export function zoomWorld(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  useWorldView.setState(({ zoom }) => ({
    zoom: Math.max(MIN_WORLD_ZOOM, Math.min(MAX_WORLD_ZOOM, zoom * factor)),
  }));
}

/** Explore dolly: factor > 1 moves the camera closer (same sense as zoom). */
export function dollyExplore(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  useWorldView.setState(({ exploreDistance }) => ({
    exploreDistance: clampExploreDistance(exploreDistance / factor),
  }));
}

export function setView(view: WorldViewMode) {
  if (view !== "diorama" && view !== "explore") return;
  if (useWorldView.getState().view === view) return;
  useWorldView.setState({ view });
}

export function toggleView() {
  setView(useWorldView.getState().view === "explore" ? "diorama" : "explore");
}
