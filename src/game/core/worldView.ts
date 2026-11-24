import { create } from "zustand";

export const MIN_WORLD_ZOOM = 0.8;
export const MAX_WORLD_ZOOM = 14;

export const useWorldView = create<{ zoom: number }>(() => ({ zoom: 1 }));

export function fitIsland() {
  useWorldView.setState({ zoom: 1 });
}

export function zoomWorld(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  useWorldView.setState(({ zoom }) => ({
    zoom: Math.max(MIN_WORLD_ZOOM, Math.min(MAX_WORLD_ZOOM, zoom * factor)),
  }));
}
