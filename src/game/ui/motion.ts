import { useEffect, useRef, useState } from "react";

/**
 * The HUD's motion vocabulary, mirrored by the `--motion-*` tokens in
 * hud-motion.css. Durations are in milliseconds.
 *
 * Reveal: wordmark, header capsule +80, dock +160 (rises 12px), zoom/time card
 * +240, context prompt last (+320); each 420ms on cubic-bezier(.2,.8,.2,1).
 */
export const MOTION = {
  reveal: 420,
  revealStagger: 80,
  /** Last reveal step starts at 4 × stagger; the whole entrance settles here. */
  revealTotal: 420 + 4 * 80,
  enter: 320,
  exit: 160,
  /** Door veil: a doorway's shadow sweeping over the frame and clearing. */
  veilIn: 160,
  veilOut: 520,
} as const;

export function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type PresenceState = "enter" | "exit";

/**
 * Keeps a conditionally rendered surface mounted for its exit animation.
 * Returns whether to render and which phase it is in. The last children are
 * frozen during exit so the pane does not blank out while it leaves.
 */
export function usePresence(show: boolean, exitMs: number = MOTION.exit) {
  const [mounted, setMounted] = useState(show);
  const [phase, setPhase] = useState<PresenceState>("enter");
  useEffect(() => {
    if (show) {
      setMounted(true);
      setPhase("enter");
      return;
    }
    if (!mounted) return;
    setPhase("exit");
    const ms = prefersReducedMotion() ? Math.min(exitMs, 90) : exitMs;
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
    // `mounted` is intentionally read, not tracked: only `show` drives phases.
  }, [show, exitMs]);
  return { mounted: show || mounted, phase: show ? "enter" : phase } as const;
}

/** Holds the last non-null value so an exiting pane keeps its content. */
export function useLatched<T>(value: T | null | undefined | false) {
  const ref = useRef<T | null>(null);
  if (value) ref.current = value;
  return ref.current;
}
