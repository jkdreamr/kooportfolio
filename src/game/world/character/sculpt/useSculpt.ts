import { useEffect, useState } from "react";
import { useStage } from "../../../../stage/contract";
import type { Villager } from "../../../core/npcs";
import { outfitFor } from "../cast";
import { holdsFor, mix, outfitFromPalette, shade, type Outfit, type PaletteLike } from "../outfit";
import { outfitPalette } from "./figure";
import { castNow, loadCast, type Cast, type SculptChar } from "./runtime";

/** The baked cast, fetched once the visitor is actually in the game (never
 * while the stage only warms behind the portfolio), shortly after ready.
 * Null until then, or if it fails: callers keep the primitive rig. */
export function useCast(): Cast | null {
  const [cast, setCast] = useState<Cast | null>(castNow());
  const ready = useStage((s) => s.ready);
  const inGame = useStage((s) => s.mode === "game");
  useEffect(() => {
    if (!ready || !inGame || cast) return;
    let live = true;
    const id = window.setTimeout(() => {
      loadCast().then((c) => live && setCast(c));
    }, 1200);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [ready, inGame, cast]);
  return cast;
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
