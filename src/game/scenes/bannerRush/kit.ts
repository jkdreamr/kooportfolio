import type { ComponentType } from "react";
import type { SoundKind, SoundOptions } from "../../core/sound";
import type { Cue, CueOptions } from "../../core/audio/cues";
import type { juice } from "../juice/Juice";
import type { ResultCard } from "../../ui/ResultCard";
import type { BestResult, BestRule } from "../../../shared/save";

/**
 * What the lazily loaded game borrows from the engine chunk (stateful engine
 * singletons and village contracts). Optional members are WS-J contracts
 * that may not have landed: Banner Rush works without them.
 */
export type RushKit = {
  sound: (kind: SoundKind, opts?: SoundOptions) => void;
  cue: (name: Cue, opts?: CueOptions) => void;
  /** Is this palette recipe known (the br-* additions may not have landed)? */
  hasSound: (name: string) => boolean;
  juice: typeof juice;
  ResultCard: ComponentType<Parameters<typeof ResultCard>[0]>;
  bests: () => Readonly<Record<string, number>>;
  countBest: (key: string) => BestResult;
  recordBest: (key: string, value: number, rule?: BestRule) => BestResult;
  /** QA builds: publish handles on `window.__qa` (a no-op otherwise). */
  expose: (handles: Record<string, unknown>) => void;
  /** Claim Escape while a match runs (gameMode's escape hook). */
  setEscapeHandler: (fn: (() => boolean) | null) => void;
  /** The player's avatar colour and hat. */
  avatar: () => { color: string; hat: boolean };
  muted: () => boolean;
  /** WS-J: Passport stamp (true = newly earned) [R2-2]. */
  stamp?: (id: string) => boolean;
  /** WS-J: Daily Three report [R2-3]. */
  reportRun?: (game: string, run: { daily: boolean; won: boolean; score: number }) => void;
  /** WS-J: shared QA registry [R2-18]. */
  registerGameQa?: (id: string, api: { state: () => unknown; act: (name: string, ...args: unknown[]) => unknown }) => void;
  /** WS-J: Passport "Reset progress" [R2-25]. */
  registerResetHook?: (fn: () => void) => void;
  /** WS-J: the village clock's QA scale (never its slow-motion scale) [R2-19]. */
  qaScale?: () => number;
  /** Village vibration preference. */
  vibration?: () => boolean;
};
