/**
 * Registry of mini-game launchers per scene, so rooms can expose a "Play"
 * action without every HUD component importing every game. Owned by the
 * sound/game-feel workstream; this is the shared contract.
 */
import { create } from "zustand";
import type { Scene } from "./store";

export type Launcher = { scene: Scene; id: string; label: string; start: () => void; hint?: string };

type LauncherState = { byScene: Partial<Record<Scene, readonly Launcher[]>> };

const EMPTY: readonly Launcher[] = Object.freeze([]);
const useLauncherStore = create<LauncherState>(() => ({ byScene: {} }));

/** Adds a launcher; returns a function that removes it. */
export function registerLauncher(l: Launcher): () => void {
  useLauncherStore.setState((s) => {
    const list = (s.byScene[l.scene] ?? EMPTY).filter((x) => x.id !== l.id);
    return { byScene: { ...s.byScene, [l.scene]: Object.freeze([...list, l]) } };
  });
  return () =>
    useLauncherStore.setState((s) => {
      const list = s.byScene[l.scene] ?? EMPTY;
      if (!list.includes(l)) return s;
      return { byScene: { ...s.byScene, [l.scene]: Object.freeze(list.filter((x) => x !== l)) } };
    });
}

/** The launchers registered for a scene (stable array between changes). */
export function useLaunchers(scene: Scene): readonly Launcher[] {
  return useLauncherStore((s) => s.byScene[scene] ?? EMPTY);
}

/** Non-React read, for tests and imperative callers. */
export function launchersFor(scene: Scene): readonly Launcher[] {
  return useLauncherStore.getState().byScene[scene] ?? EMPTY;
}
