/** Banner Rush rules: the public API (§2.14). Pure: no three.js, React, DOM, Date or Math.random. */
export type { MatchConfig, MatchState, DeployInput, DeployCheck, Modifier, AiTier, Side, Outcome, OwnView, PublicView } from "./types";
export { createMatch, cloneState, hashState, ownView, publicView } from "./state";
export { step } from "./step";
export { canDeploy } from "./field";
export { runReplay, Recorder, type Replay } from "./replay";
export { CARDS, UNIT_SPECS, STARTER_DECKS, CARD_IDS, type CardId } from "./cards";
export { RULES_VERSION } from "./constants";
import { cloneState } from "./state";
import { step } from "./step";
import type { DeployInput, MatchState } from "./types";
import { OUTCOME_REASONS, type Outcome, type Side } from "./types";

/** step on a copy (for tests that need the old state). */
export const stepPure = (s: MatchState, inputs: readonly DeployInput[]) => step(cloneState(s), inputs);

export function outcome(s: MatchState): Outcome | null {
  if (s.winner === -2) return null;
  return {
    winner: s.winner < 0 ? null : (s.winner as Side),
    reason: OUTCOME_REASONS[s.reason],
    banners: [s.banners[0], s.banners[1]],
    endTick: s.endTick,
  };
}
