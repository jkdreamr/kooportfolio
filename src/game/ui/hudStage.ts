import { useEffect, useState } from "react";
import { useStage, TIER_BUDGETS, type Tier } from "../../stage/contract";
import { useGame } from "../core/store";
import { stageGate } from "../core/input";
import { MOTION, prefersReducedMotion } from "./motion";

/**
 * hidden  – site / peek / tearing / flying: mounted, invisible, inert.
 * enter   – the staggered entrance is playing (MOTION.revealTotal).
 * shown   – at rest; mount animations (doors, panels) still play.
 */
export type HudMotion = "hidden" | "enter" | "shown";

/** How long /play waits for an engine to announce itself before the HUD
 * takes over on its own (a build where no stage drives the modes). */
const LEGACY_GRACE_MS = 2500;

export function useHudReveal(): HudMotion {
  const mode = useStage((s) => s.mode);
  const revealed = useStage((s) => s.hudRevealed);
  const [legacy, setLegacy] = useState(stageGate.legacy);
  useEffect(() => {
    if (legacy || !location.pathname.startsWith("/play")) return;
    const timer = window.setTimeout(() => {
      const s = useStage.getState();
      if (s.mode === "site" && s.tier === null && !s.ready) {
        stageGate.legacy = true;
        setLegacy(true);
      }
    }, LEGACY_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [legacy]);
  const visible = (mode === "game" && revealed) || (legacy && mode === "site");
  const [state, setState] = useState<HudMotion>("hidden");
  useEffect(() => {
    if (!visible) {
      setState("hidden");
      return;
    }
    setState("enter");
    // Labels finish last (prompt step + 160 ms + 420 ms); stay in "enter" past them.
    const total = prefersReducedMotion() ? 260 : MOTION.revealTotal + 260;
    const timer = window.setTimeout(() => setState("shown"), total);
    return () => window.clearTimeout(timer);
  }, [visible]);
  return state;
}

export type GlassMode = "full" | "lite" | "none";

const compactQuery = "(pointer: coarse), (max-width: 700px)";

/**
 * Backdrop-filter budget. Full: the documented eight panes (desktop, high
 * tier). Lite: two panes (dock + header capsule, or the open dialog) with a
 * smaller radius, for phones and the medium tier. None: low tier, opaque.
 * The tier is the engine's once-chosen `useStage.tier`.
 */
export function useGlassMode(): GlassMode {
  const tier = useStage((s) => s.tier);
  const quality = useGame((s) => s.quality);
  const [compact, setCompact] = useState(
    () => typeof matchMedia === "function" && matchMedia(compactQuery).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(compactQuery);
    const change = () => setCompact(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  // The engine's once-chosen tier (which honours the player's saved quality
  // preference); the legacy quality flag only stands in before it exists.
  return glassModeFor(tier ?? (quality === "low" ? "low" : "high"), compact);
}

export function glassModeFor(tier: Tier, compact: boolean): GlassMode {
  const panes = TIER_BUDGETS[tier].backdropPanes;
  if (panes <= 0) return "none";
  if (compact || panes <= 2) return "lite";
  return "full";
}
