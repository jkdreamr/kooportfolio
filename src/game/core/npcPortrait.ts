import { create } from "zustand";

/** The talking villager's portrait, snapshotted once from their own rig by
 * the world (world/NpcPortraitShot.tsx). `src` stays null until then; the
 * dialog draws a bust from the villager's palette meanwhile. */
export const usePortrait = create<{ id: string | null; src: string | null }>(() => ({
  id: null,
  src: null,
}));
