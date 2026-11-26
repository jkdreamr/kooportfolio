import { useEffect, useRef, useState } from "react";
import { usePresented } from "../engine/presented";
import { isInterior } from "../core/world";
import { sound } from "../core/sound";
import { MOTION, prefersReducedMotion } from "./motion";

/**
 * Doorway feedback. A soft shadow, shaped like stepping through a frame,
 * clears from the centre out over MOTION.veilOut after every change of scene
 * while the camera's 0.6 s blend carries the eye. Never a loading cover:
 * input is live the whole time and the veil ignores the pointer.
 *
 * Timing hook for the engine: `coverDoorway()` darkens to the veil's peak in
 * MOTION.veilIn and resolves; the following scene change then clears it. A
 * caller that wants the swap itself under the veil awaits it before `go()`.
 * If no scene change follows within a second the veil clears by itself.
 */
const COVER_EVENT = "door-veil-cover";
export function coverDoorway(): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  window.dispatchEvent(new Event(COVER_EVENT));
  return new Promise((resolve) => window.setTimeout(resolve, MOTION.veilIn));
}

type Veil = { key: number; phase: "cover" | "clear"; kind: "enter" | "exit" };

export function DoorTransition() {
  // Clear when the new scene is actually on screen (an incoming interior
  // compiles hidden while the previous frame is held), not when requested.
  const scene = usePresented((s) => s.scene);
  const previous = useRef(scene);
  const [veil, setVeil] = useState<Veil | null>(null);
  useEffect(() => {
    let fallback = 0;
    const cover = () => {
      setVeil({ key: performance.now(), phase: "cover", kind: "enter" });
      window.clearTimeout(fallback);
      fallback = window.setTimeout(
        () => setVeil((v) => (v?.phase === "cover" ? { ...v, phase: "clear" } : v)),
        1000,
      );
    };
    window.addEventListener(COVER_EVENT, cover);
    return () => {
      window.removeEventListener(COVER_EVENT, cover);
      window.clearTimeout(fallback);
    };
  }, []);
  useEffect(() => {
    const from = previous.current;
    previous.current = scene;
    if (from === scene) return;
    const doorway = isInterior(scene) || isInterior(from);
    if (doorway) sound("door");
    if (prefersReducedMotion()) return;
    setVeil((v) => ({
      key: v?.phase === "cover" ? v.key : performance.now(),
      phase: "clear",
      kind: scene === "hub" ? "exit" : "enter",
    }));
  }, [scene]);
  useEffect(() => {
    if (veil?.phase !== "clear") return;
    const timer = window.setTimeout(() => setVeil(null), MOTION.veilOut + 60);
    return () => window.clearTimeout(timer);
  }, [veil]);
  if (!veil) return null;
  return (
    <div
      key={veil.key}
      className="door-veil"
      data-phase={veil.phase}
      data-kind={veil.kind}
      aria-hidden="true"
    />
  );
}
