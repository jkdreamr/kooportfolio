/**
 * The opponent AI (§4): part of the deterministic step. `aiStep` runs first
 * in each tick for an AI side and may write one deploy into `state.aiOut`;
 * `aiObserve` runs at the end of the tick and updates its memory from the
 * public events. It has its own RNG stream and memory inside the state.
 */
import { GLOW_CAP, GLOW_UNIT, GLOW_PER_TICK } from "../constants";
import { CARDS, CARD_IDS } from "../cards";
import { draw, drawInt } from "../rng";
import { mirY } from "../state";
import { EV_DEPLOY, type MatchState } from "../types";
import { obs, observe } from "./observe";
import { choice, decide, legal, legalize, P_DEFEND, P_FOLLOW, P_PUSH, randomAction, second } from "./policy";
import { TIERS } from "./tuning";

export { TIERS } from "./tuning";

// @hot
/** Returns true when it wrote a deploy for `side` into aiOut. */
export function aiStep(s: MatchState, side: number): boolean {
  const mem = s.ai[side];
  const t = TIERS[mem.tier];
  const rng = 1 + side;
  if (s.glow[side] >= GLOW_CAP) mem.capTicks++;
  else mem.capTicks = 0;
  // A scheduled action comes due.
  if (mem.due >= 0 && s.tick >= mem.due) {
    mem.due = -1;
    const c = s.cards[side * 8 + mem.slot];
    const affordable = s.glow[side] >= CARDS[CARD_IDS[c]].cost * GLOW_UNIT;
    let still = affordable;
    if (still && mem.plan === P_DEFEND) {
      observe(s, side);
      still = obs.threat[mem.planLane] >= mem.planValue * 0.3 && obs.net[mem.planLane] > -1;
    }
    if (still) {
      const j = t.jitter;
      let px = mem.x + (draw(s.rng, rng) * 2 - 1) * j;
      let py = mem.y + (draw(s.rng, rng) * 2 - 1) * j;
      if (CARDS[CARD_IDS[c]].type === "spell") {
        // Spells keep their aim (a jittered spell is a different decision).
        px = mem.x + (draw(s.rng, rng) * 2 - 1) * j * 0.3;
        py = mem.y + (draw(s.rng, rng) * 2 - 1) * j * 0.3;
      }
      if (legalize(s, side, mem.slot, px, py) || legalize(s, side, mem.slot, mem.x, mem.y)) {
        s.aiOut[side * 4] = mem.slot;
        s.aiOut[side * 4 + 1] = legal.x;
        s.aiOut[side * 4 + 2] = legal.y;
        mem.lastDeploy = s.tick;
        if (mem.plan === P_PUSH) {
          mem.leadSlot = -2; // resolved to the spawned entity in aiObserve
          mem.followDone = 0;
        } else if (mem.plan === P_FOLLOW) mem.followDone = 1;
        if (mem.plan === P_DEFEND) {
          mem.defendedLane = mem.planLane;
          mem.defendEnd = s.tick;
        }
        return true;
      }
    }
  }
  if (mem.due >= 0) return false;
  if (s.tick - mem.lastDeploy < t.minGap) return false;
  mem.thinkT--;
  if (mem.thinkT > 0) return false;
  mem.thinkT = t.thinkEvery;
  observe(s, side);
  if (!decide(s, side, t, mem, rng)) return false;
  mem.decisions++;
  // The tier's mistake roll.
  if (draw(s.rng, rng) < t.mistake) {
    mem.mistakes++;
    if (mem.tier === 0) {
      if (!randomAction(s, side, rng)) return false;
    } else if (mem.tier === 1 && draw(s.rng, rng) < 0.5) {
      choice.x = 16 - choice.x; // right card, wrong lane
    } else if (second.slot >= 0) Object.assign(choice, second);
  }
  mem.slot = choice.slot;
  mem.x = choice.x;
  mem.y = choice.y;
  mem.plan = choice.plan;
  mem.planLane = choice.lane;
  mem.planValue = choice.value;
  mem.due = s.tick + drawInt(s.rng, rng, t.reaction[0], t.reaction[1]);
  return false;
}

// @hot
/** End of tick: track the opponent's public plays and estimated Glow, and
 * the entity our push lead became. */
export function aiObserve(s: MatchState, side: number) {
  const mem = s.ai[side];
  const enemy = 1 - side;
  const mult = s.tick < s.doubleAt ? (s.doubleStart ? 2 : 1) : s.tick < s.tripleAt ? 2 : 3;
  mem.enemyGlow = Math.min(GLOW_CAP, mem.enemyGlow + GLOW_PER_TICK * mult);
  for (let e = 0; e < s.eventCount; e++) {
    if (s.evType[e] !== EV_DEPLOY) continue;
    const who = s.evA[e];
    const c = s.evB[e];
    if (who === enemy) {
      mem.enemyGlow = Math.max(0, mem.enemyGlow - CARDS[CARD_IDS[c]].cost * GLOW_UNIT);
      mem.seen[c] = 1;
      for (let k = 7; k > 0; k--) mem.lastPlays[k] = mem.lastPlays[k - 1];
      mem.lastPlays[0] = c;
      mem.playCount++;
      // Spent ≥ 5 at its back (our own-frame y < 6).
      if (CARDS[CARD_IDS[c]].cost >= 5 && mirY(side, s.evY[e]) < 6) mem.backSpend = s.tick;
    } else if (who === side && mem.leadSlot === -2) {
      // Find the entity spawned this tick for our push.
      for (let k = 0; k < s.eventCount; k++)
        if (s.evType[k] === 2 && s.evC[k] === side) {
          mem.leadSlot = s.evA[k];
          mem.leadGen = s.gen[mem.leadSlot];
          break;
        }
      if (mem.leadSlot === -2) {
        mem.leadSlot = -1;
        mem.followDone = 1;
      }
    }
  }
}
