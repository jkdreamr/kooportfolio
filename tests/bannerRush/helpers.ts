import { createMatch, step } from "../../src/game/core/bannerRush";
import { CARD_IDS, STARTER_DECKS, UNIT_KINDS, type CardId, type UnitKind } from "../../src/game/core/bannerRush/cards";
import { freeSlot, initEntity } from "../../src/game/core/bannerRush/state";
import type { AiTier, DeployInput, MatchState, Modifier, Side } from "../../src/game/core/bannerRush/types";

export const LAWN = STARTER_DECKS.lawnRush.cards;
export const ALL8 = (first: CardId[]) => [...first, ...CARD_IDS.filter((c) => !first.includes(c))].slice(0, 8);

export function match(opts: { seed?: number; decks?: [readonly CardId[], readonly CardId[]]; ai?: [AiTier | null, AiTier | null]; modifiers?: Modifier[] } = {}) {
  return createMatch({ seed: opts.seed ?? 1, decks: opts.decks ?? [LAWN, LAWN], ai: opts.ai ?? [null, null], modifiers: opts.modifiers });
}

/** Spawns an active unit (no deploy time). */
export function spawn(s: MatchState, kind: UnitKind, side: Side, x: number, y: number, deployT = 0) {
  const slot = freeSlot(s);
  initEntity(s, slot, UNIT_KINDS.indexOf(kind), side, x, y, deployT);
  return slot;
}

export function run(s: MatchState, ticks: number, inputs: (s: MatchState) => DeployInput[] = () => []) {
  for (let i = 0; i < ticks && s.phase !== 4; i++) step(s, inputs(s));
  return s;
}

/** Puts card `id` into hand slot 0 for `side`. */
export function hand(s: MatchState, side: Side, id: CardId, slot = 0) {
  const c = CARD_IDS.indexOf(id);
  const base = side * 8;
  for (let k = 0; k < 8; k++)
    if (s.cards[base + k] === c) {
      s.cards[base + k] = s.cards[base + slot];
      s.cards[base + slot] = c;
      return;
    }
  s.cards[base + slot] = c;
}

/** Collect events of a type over a run. */
export function collect(s: MatchState, ticks: number, type: number, inputs: (s: MatchState) => DeployInput[] = () => []) {
  const out: { tick: number; a: number; b: number; c: number; d: number; x: number; y: number }[] = [];
  for (let i = 0; i < ticks && s.phase !== 4; i++) {
    step(s, inputs(s));
    for (let e = 0; e < s.eventCount; e++)
      if (s.evType[e] === type) out.push({ tick: s.tick - 1, a: s.evA[e], b: s.evB[e], c: s.evC[e], d: s.evD[e], x: s.evX[e], y: s.evY[e] });
  }
  return out;
}
