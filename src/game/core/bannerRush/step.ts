/**
 * The tick (§2.12). `step` advances the state in place and returns it.
 */
import { GLOW_CAP, GLOW_PER_TICK, GLOW_UNIT, PH_DOUBLE, PH_OVER, PH_OVERTIME, PH_TRIPLE } from "./constants";
import { CARDS, CARD_IDS, MEMBER_OFFSETS } from "./cards";
import { applyDamage, attackStep, kill } from "./combat";
import { emit } from "./events";
import { checkDeploy, deployOut, nearestFree, R_BUSY, R_OK } from "./field";
import { movementStep } from "./movement";
import { castSpell, FX_COMET, FX_GOSTONE, FX_SMASH, spellStep } from "./spells";
import { freeSlot, initEntity } from "./state";
import { targetingStep } from "./targeting";
import { deployCountdown, timerStep } from "./buildings";
import { aiObserve, aiStep } from "./ai";
import {
  EV_DEPLOY,
  EV_END,
  EV_GLOW_FULL,
  EV_PHASE,
  EV_REFUSED,
  EV_SPAWN,
  ST_LEAK0,
  ST_PLAYS0,
  ST_REFUSED,
  type DeployInput,
  type MatchState,
} from "./types";
import { DEPLOY_TICKS, MEMBER_STAGGER } from "./constants";

const accepted = new Uint8Array(2);

// @hot
/** Accepts one deploy (already validated by checkDeploy into deployOut). */
function perform(s: MatchState, side: number, slot: number) {
  const base = side * 8;
  const cardIndex = s.cards[base + slot];
  const card = CARDS[CARD_IDS[cardIndex]];
  s.glow[side] -= card.cost * GLOW_UNIT;
  // Cycle: played card to the back, next into the slot.
  s.cards[base + slot] = s.cards[base + 4];
  s.cards[base + 4] = s.cards[base + 5];
  s.cards[base + 5] = s.cards[base + 6];
  s.cards[base + 6] = s.cards[base + 7];
  s.cards[base + 7] = cardIndex;
  s.stats[ST_PLAYS0 + side]++;
  const x = deployOut.x,
    y = deployOut.y;
  emit(s, EV_DEPLOY, side, cardIndex, slot, 0, x, y);
  if (card.type === "spell") {
    castSpell(s, side, cardIndex === 14 ? FX_GOSTONE : cardIndex === 15 ? FX_SMASH : FX_COMET, x, y);
    return;
  }
  const offsets = MEMBER_OFFSETS[cardIndex];
  const sign = side === 0 ? 1 : -1;
  for (let m = 0; m < card.count; m++) {
    const e = freeSlot(s);
    if (e < 0) break;
    let px = x,
      py = y;
    if (offsets) {
      px = x + offsets[m * 2] * sign;
      py = y + offsets[m * 2 + 1] * sign;
      if (nearestFree(s, px, py, 2.5)) {
        px = deployOut.x;
        py = deployOut.y;
      }
    }
    initEntity(s, e, card.unit, side, px, py, DEPLOY_TICKS + MEMBER_STAGGER * m);
    s.member[e] = m;
    emit(s, EV_SPAWN, e, card.unit, side, m, px, py);
  }
}

// @hot
function tryInput(s: MatchState, side: number, slot: number, x: number, y: number) {
  if (accepted[side]) {
    emit(s, EV_REFUSED, side, R_BUSY, slot, 0, x, y);
    return R_BUSY;
  }
  const r = checkDeploy(s, side, slot, x, y);
  if (r !== R_OK) {
    s.stats[ST_REFUSED]++;
    emit(s, EV_REFUSED, side, r, slot, 0, x, y);
    return r;
  }
  accepted[side] = 1;
  perform(s, side, slot);
  return R_OK;
}

// @hot
function glowMult(s: MatchState) {
  const t = s.tick;
  if (t < s.doubleAt) return s.doubleStart ? 2 : 1;
  return t < s.tripleAt ? 2 : 3;
}

// @hot
function lowestTower(s: MatchState, side: number) {
  let best = -1;
  for (let k = 0; k < 3; k++) {
    const t = side * 3 + k;
    if (s.alive[t] && (best < 0 || s.hp[t] < s.hp[best])) best = t;
  }
  return best;
}

// @hot
function end(s: MatchState, winner: number, reason: number) {
  s.phase = PH_OVER;
  s.winner = winner;
  s.reason = reason;
  s.endTick = s.tick;
  emit(s, EV_END, winner, reason, s.banners[0], s.banners[1], 0, 0);
}

// @hot
/** One 50 ms tick. Inputs from outside are applied before the AI's. */
export function step(s: MatchState, inputs: readonly DeployInput[]): MatchState {
  s.eventCount = 0;
  if (s.phase === PH_OVER) {
    s.tick += 1;
    return s;
  }
  accepted[0] = 0;
  accepted[1] = 0;
  // 1–2. Inputs (outside first), then the AI's.
  for (let k = 0; k < inputs.length; k++) {
    const input = inputs[k];
    if (s.ai[input.side].enabled) continue;
    tryInput(s, input.side, input.slot, input.x, input.y);
  }
  for (let side = 0; side < 2; side++) {
    if (!s.ai[side].enabled) continue;
    if (aiStep(s, side)) tryInput(s, side, s.aiOut[side * 4], s.aiOut[side * 4 + 1], s.aiOut[side * 4 + 2]);
  }
  // 3. Glow.
  const mult = glowMult(s);
  for (let side = 0; side < 2; side++) {
    const before = s.glow[side];
    if (before >= GLOW_CAP) {
      s.stats[ST_LEAK0 + side]++;
      continue;
    }
    const gain = Math.floor(GLOW_PER_TICK * mult * s.glowMul[side]);
    s.glow[side] = Math.min(GLOW_CAP, before + gain);
    if (s.glow[side] >= GLOW_CAP) emit(s, EV_GLOW_FULL, side, 0, 0, 0, 0, 0);
  }
  // 4. Timers and spells.
  timerStep(s);
  spellStep(s);
  // 5–7.
  targetingStep(s);
  movementStep(s);
  attackStep(s);
  // 8.
  applyDamage(s);
  deployCountdown(s);
  // 9. Phase changes and the end.
  if (s.banners[0] >= 3 || s.banners[1] >= 3) {
    end(s, s.banners[0] >= 3 ? 0 : 1, 0);
  } else {
    const next = s.tick + 1;
    if (next === s.doubleAt) {
      s.phase = PH_DOUBLE;
      emit(s, EV_PHASE, PH_DOUBLE, 0, 0, 0, 0, 0);
    }
    if (next === s.regEnd) {
      if (s.banners[0] !== s.banners[1]) end(s, s.banners[0] > s.banners[1] ? 0 : 1, 1);
      else {
        s.phase = PH_OVERTIME;
        emit(s, EV_PHASE, PH_OVERTIME, 0, 0, 0, 0, 0);
      }
    } else if (s.phase === PH_OVERTIME || s.phase === PH_TRIPLE) {
      if (s.banners[0] !== s.banners[1]) end(s, s.banners[0] > s.banners[1] ? 0 : 1, 2);
      else if (next === s.tripleAt) {
        s.phase = PH_TRIPLE;
        emit(s, EV_PHASE, PH_TRIPLE, 0, 0, 0, 0, 0);
      } else if (next >= s.otEnd) {
        const a = lowestTower(s, 0),
          b = lowestTower(s, 1);
        const ha = a >= 0 ? s.hp[a] : 0,
          hb = b >= 0 ? s.hp[b] : 0;
        if (ha === hb) end(s, -1, 4);
        else {
          const loser = ha < hb ? a : b;
          kill(s, loser);
          end(s, ha < hb ? 1 : 0, 3);
        }
      }
    }
  }
  if (s.ai[0].enabled) aiObserve(s, 0);
  if (s.ai[1].enabled) aiObserve(s, 1);
  s.tick += 1;
  return s;
}

