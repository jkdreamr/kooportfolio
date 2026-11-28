import { useEffect, useState } from "react";
import { useStage } from "../../../../stage/contract";
import type { Villager } from "../../../core/npcs";
import { outfitFor } from "../cast";
import { holdsFor, mix, outfitFromPalette, shade, type Outfit, type PaletteLike } from "../outfit";
import { outfitPalette } from "./figure";
import { castNow, castRetryDelay, loadCast, type Cast, type SculptChar } from "./runtime";

/** The baked cast, fetched once the visitor is actually in the game (never
 * while the stage only warms behind the portfolio), shortly after ready.
 * Null until then, or if it fails: callers keep the primitive rig. A failed
 * load is retried a few times with a growing delay. `want: false` (a tier
 * that never shows the sculpt) downloads nothing and returns null. */
export function useCast(want = true): Cast | null {
  const [cast, setCast] = useState<Cast | null>(castNow());
  const [attempt, setAttempt] = useState(0);
  const ready = useStage((s) => s.ready);
  const inGame = useStage((s) => s.mode === "game");
  useEffect(() => {
    if (!want || !ready || !inGame || cast) return;
    let live = true,
      retry = 0;
    const id = window.setTimeout(() => {
      loadCast().then((c) => {
        if (!live) return;
        if (c) return setCast(c);
        const delay = castRetryDelay();
        if (delay !== null) retry = window.setTimeout(() => setAttempt((n) => n + 1), delay);
      });
    }, 1200);
    return () => {
      live = false;
      window.clearTimeout(id);
      window.clearTimeout(retry);
    };
  }, [want, ready, inGame, cast, attempt]);
  return want ? cast : null;
}

function glowFor(o: Outfit) {
  const glow: number[] = [];
  (o.extras ?? []).slice(0, 4).forEach((e, i) => {
    if (e.kind === "lightstick") glow[24 + i * 2] = 2.2;
  });
  return glow;
}
export function sculptCharFor(npc: Villager): SculptChar {
  const o = outfitFor(npc);
  return { id: npc.id, palette: outfitPalette(o, mix, shade), glow: glowFor(o), holds: holdsFor(o), scale: o.build?.height ?? 1 };
}
export const PLAYER_SCULPT = { hat: "player:hat", bare: "player:bare" } as const;
export function sculptPaletteFor(p: PaletteLike) {
  return outfitPalette(outfitFromPalette(p), mix, shade);
}
