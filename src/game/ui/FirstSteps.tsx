import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { runtime, useGame } from "../core/store";
import { isInterior } from "../core/world";
import { usePresence } from "./motion";

/** One-time guidance flags. Kept apart from the game save so a hint never
 * touches progress, and so clearing hints never clears a village. */
const KEY = "joshua-exe-hints-v1";
type Hints = { moved: boolean; entered: boolean; exited: boolean };
function readHints(): Hints {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { moved: !!raw.moved, entered: !!raw.entered, exited: !!raw.exited };
  } catch {
    return { moved: false, entered: false, exited: false };
  }
}
export const useHints = create<Hints & { learn: (key: keyof Hints) => void }>(
  (set, get) => ({
    ...readHints(),
    learn(key) {
      if (get()[key]) return;
      set({ [key]: true } as Pick<Hints, typeof key>);
      try {
        const { moved, entered, exited } = get();
        localStorage.setItem(KEY, JSON.stringify({ moved, entered, exited }));
      } catch {
        /* Private mode: hints simply show again next visit. */
      }
    },
  }),
);

/** Learns from what the player does, wherever the HUD is: first steps, the
 * first door in, the first door out. */
export function useHintLearning() {
  const scene = useGame((s) => s.scene);
  const learn = useHints((s) => s.learn);
  const previous = useRef(scene);
  useEffect(() => {
    const from = previous.current;
    previous.current = scene;
    if (from === scene) return;
    if (isInterior(scene)) learn("entered");
    if (scene === "hub" && isInterior(from)) learn("exited");
  }, [scene, learn]);
}

/**
 * The walk hint: shown once, after the HUD has settled, until the avatar
 * actually moves (keys, joystick, a tapped destination). It then leaves on
 * its own; nothing to dismiss.
 */
export function FirstSteps({ active }: { active: boolean }) {
  const moved = useHints((s) => s.moved);
  const learn = useHints((s) => s.learn);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (moved || !active) return;
    // Let the reveal finish and the player look first.
    const timer = window.setTimeout(() => setReady(true), 1400);
    return () => window.clearTimeout(timer);
  }, [moved, active]);
  useEffect(() => {
    if (moved) return;
    const start = [runtime.x, runtime.z];
    const poll = window.setInterval(() => {
      if (
        runtime.moving ||
        Math.hypot(runtime.x - start[0], runtime.z - start[1]) > 1.2
      )
        learn("moved");
    }, 200);
    return () => window.clearInterval(poll);
  }, [moved, learn]);
  const show = ready && active && !moved;
  const { mounted, phase } = usePresence(show, 220);
  if (!mounted) return null;
  return (
    <div className="first-steps" data-phase={phase} role="status">
      <span className="keyboard-hint">
        <span className="keycaps" aria-label="W A S D">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd>
        </span>
        to walk
        <i aria-hidden="true" />
        or click the ground
      </span>
      <span className="touch-hint">Drag the stick or tap the ground to walk</span>
    </div>
  );
}
