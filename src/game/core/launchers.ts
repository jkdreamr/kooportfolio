/**
 * Registry of mini-game launchers per scene, so rooms can expose a "Play"
 * action without every HUD component importing every game. Owned by the
 * sound/game-feel workstream; this is the shared contract.
 *
 * Rooms register with `useLauncher`. The header renders `useLaunchers(scene)`;
 * while any component renders that list for a scene, `useLauncherHosted`
 * reports true and the room hides its own in-world launch button, so a game
 * is always launchable from exactly one visible place.
 */
import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { Scene } from "./store";

export type Launcher = { scene: Scene; id: string; label: string; start: () => void; hint?: string };

type LauncherState = {
  byScene: Partial<Record<Scene, readonly Launcher[]>>;
  /** How many mounted components render each scene's launchers. */
  hosts: Partial<Record<Scene, number>>;
};

const EMPTY: readonly Launcher[] = Object.freeze([]);
const useLauncherStore = create<LauncherState>(() => ({ byScene: {}, hosts: {} }));

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

function host(scene: Scene, delta: number) {
  useLauncherStore.setState((s) => ({ hosts: { ...s.hosts, [scene]: Math.max(0, (s.hosts[scene] ?? 0) + delta) } }));
}

/** The launchers registered for a scene (stable array between changes).
 * Rendering them marks the scene as hosted (see `useLauncherHosted`). */
export function useLaunchers(scene: Scene): readonly Launcher[] {
  useEffect(() => {
    host(scene, 1);
    return () => host(scene, -1);
  }, [scene]);
  return useLauncherStore((s) => s.byScene[scene] ?? EMPTY);
}

/** Non-React read, for tests and imperative callers. */
export function launchersFor(scene: Scene): readonly Launcher[] {
  return useLauncherStore.getState().byScene[scene] ?? EMPTY;
}

/** True while the HUD renders this scene's launchers. */
export function useLauncherHosted(scene: Scene): boolean {
  return useLauncherStore((s) => (s.hosts[scene] ?? 0) > 0);
}
export const launcherHosted = (scene: Scene) => (useLauncherStore.getState().hosts[scene] ?? 0) > 0;

/**
 * Registers a room's launcher while `enabled` (typically: its game is not
 * already running). `start` may change every render; the latest one runs.
 */
export function useLauncher(
  scene: Scene,
  id: string,
  label: string,
  start: () => void,
  options: { enabled?: boolean; hint?: string } = {},
) {
  const latest = useRef(start);
  useEffect(() => {
    latest.current = start;
  });
  const enabled = options.enabled ?? true,
    hint = options.hint;
  useEffect(() => {
    if (!enabled) return;
    return registerLauncher({ scene, id, label, hint, start: () => latest.current() });
  }, [scene, id, label, hint, enabled]);
}
