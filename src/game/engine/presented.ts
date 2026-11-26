import { create } from "zustand";
import type { Scene } from "../core/store";

/**
 * The scene actually on screen. It trails `useGame.scene` while an incoming
 * scene compiles hidden (the previous one stays presented, camera held), so
 * lighting, backdrop and shadows follow what the visitor sees, never a frame
 * early.
 */
export const usePresented = create<{ scene: Scene; activity: boolean }>(() => ({
  scene: "hub",
  activity: false,
}));
