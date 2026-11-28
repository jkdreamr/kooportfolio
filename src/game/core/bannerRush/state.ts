/**
 * Match state: creation, entity pool, clone, hash and the two views (§2.7,
 * §2.13, §4.1). Struct of arrays, allocated once in createMatch.
 */
import {
  DAMAGE_CAP,
  DOUBLE_AT,
  EVENT_CAP,
  GLOW_CAP,
  GLOW_START,
  GLOW_UNIT,
  KEEP,
  L,
  MAX_EFFECTS,
  MAX_ENTS,
  MAX_PROJ,
  OVERTIME_END,
  REGULATION_END,
  RULES_VERSION,
  TOWER_X,
  TOWER_Y,
  TRIPLE_AT,
  W,
} from "./constants";
import { CARD_IDS, K_KEEP, K_LOOKOUT, UNIT_KINDS, UNIT_SPECS, type CardId } from "./cards";
import { deriveSeed, draw, fnv1aBytes, FNV_OFFSET } from "./rng";
import type { AiMemory, MatchConfig, MatchState, OwnView, PublicView, Side } from "./types";
import { AI_TIERS } from "./types";

function aiMemory(tier: number): AiMemory {
  return {
    tier,
    enabled: tier >= 0 ? 1 : 0,
    thinkT: 0,
    due: -1,
    slot: -1,
    x: 0,
    y: 0,
    plan: 0,
    planValue: 0,
    planLane: 0,
    lastDeploy: -1000,
    enemyGlow: GLOW_START,
    seen: new Uint8Array(CARD_IDS.length),
    lastPlays: new Int8Array(8).fill(-1),
    playCount: 0,
    capTicks: 0,
    leadSlot: -1,
    leadGen: 0,
    followDone: 1,
    defendedLane: -1,
    defendEnd: -1,
    backSpend: -1,
    emote: 0,
    decisions: 0,
    mistakes: 0,
  };
}

/** Own frame ↔ absolute (side 1 is a point mirror). */
export const mirX = (side: number, x: number) => (side === 0 ? x : W - x);
export const mirY = (side: number, y: number) => (side === 0 ? y : L - y);
export const towerSlot = (side: number, which: number) => side * 3 + which;

export function createMatch(config: MatchConfig): MatchState {
  const n = MAX_ENTS;
  const s: MatchState = {
    v: RULES_VERSION,
    seed: config.seed | 0,
    tick: 0,
    phase: 0,
    winner: -2,
    reason: -1,
    endTick: -1,
    rng: new Int32Array([deriveSeed(config.seed, 1), deriveSeed(config.seed, 2), deriveSeed(config.seed, 3)]),
    glow: new Int32Array([GLOW_START, GLOW_START]),
    banners: new Int32Array(2),
    cards: new Int8Array(16),
    deckIds: new Int8Array(16),
    deckSize: new Int8Array([8, 8]),
    doubleAt: DOUBLE_AT,
    regEnd: REGULATION_END,
    tripleAt: TRIPLE_AT,
    otEnd: OVERTIME_END,
    doubleStart: 0,
    hideNext: 0,
    speedMul: 1,
    glowMul: new Float64Array([1, 1]),
    unbreakable: new Uint8Array(2),
    alive: new Uint8Array(n),
    gen: new Uint16Array(n),
    kind: new Uint8Array(n),
    side: new Uint8Array(n),
    x: new Float64Array(n),
    y: new Float64Array(n),
    fx: new Float64Array(n),
    fy: new Float64Array(n),
    hp: new Int32Array(n),
    maxHp: new Int32Array(n),
    deployT: new Int16Array(n),
    cd: new Int16Array(n),
    swingT: new Int16Array(n),
    target: new Int16Array(n).fill(-1),
    targetGen: new Uint16Array(n),
    stunT: new Int16Array(n),
    kbT: new Int16Array(n),
    kbX: new Float64Array(n),
    kbY: new Float64Array(n),
    walkT: new Int16Array(n),
    charged: new Uint8Array(n),
    shots: new Uint8Array(n),
    rampT: new Int32Array(n),
    lifeAcc: new Int32Array(n),
    spawnT: new Int32Array(n),
    auraT: new Int16Array(n),
    stuckX: new Float64Array(n),
    stuckY: new Float64Array(n),
    stuckT: new Int16Array(n),
    sidestepT: new Int16Array(n),
    planted: new Uint8Array(n),
    moving: new Uint8Array(n),
    asleep: new Uint8Array(n),
    wakeT: new Int16Array(n),
    member: new Uint8Array(n),
    pAlive: new Uint8Array(MAX_PROJ),
    pSide: new Uint8Array(MAX_PROJ),
    pSrc: new Int16Array(MAX_PROJ),
    pSrcKind: new Uint8Array(MAX_PROJ),
    pTarget: new Int16Array(MAX_PROJ),
    pTargetGen: new Uint16Array(MAX_PROJ),
    pX: new Float64Array(MAX_PROJ),
    pY: new Float64Array(MAX_PROJ),
    pTX: new Float64Array(MAX_PROJ),
    pTY: new Float64Array(MAX_PROJ),
    pSpeed: new Float64Array(MAX_PROJ),
    pDmg: new Int32Array(MAX_PROJ),
    pSplash: new Float64Array(MAX_PROJ),
    pTargets: new Uint8Array(MAX_PROJ),
    pFlags: new Uint8Array(MAX_PROJ),
    pDist: new Float64Array(MAX_PROJ),
    pTravel: new Float64Array(MAX_PROJ),
    pGen: new Uint16Array(MAX_PROJ),
    eAlive: new Uint8Array(MAX_EFFECTS),
    eKind: new Uint8Array(MAX_EFFECTS),
    eSide: new Uint8Array(MAX_EFFECTS),
    eX: new Float64Array(MAX_EFFECTS),
    eY: new Float64Array(MAX_EFFECTS),
    eT: new Int16Array(MAX_EFFECTS),
    eDir: new Float64Array(MAX_EFFECTS),
    eProg: new Float64Array(MAX_EFFECTS),
    eHit: new Uint16Array(MAX_EFFECTS * n),
    qCount: 0,
    qTarget: new Int16Array(DAMAGE_CAP),
    qAmount: new Int32Array(DAMAGE_CAP),
    qFlags: new Uint8Array(DAMAGE_CAP),
    qSrc: new Int16Array(DAMAGE_CAP),
    qStun: new Int16Array(DAMAGE_CAP),
    eventCount: 0,
    evType: new Uint8Array(EVENT_CAP),
    evA: new Int32Array(EVENT_CAP),
    evB: new Int32Array(EVENT_CAP),
    evC: new Int32Array(EVENT_CAP),
    evD: new Int32Array(EVENT_CAP),
    evX: new Float32Array(EVENT_CAP),
    evY: new Float32Array(EVENT_CAP),
    aiOut: new Float64Array(8),
    ai: [
      aiMemory(config.ai[0] ? AI_TIERS.indexOf(config.ai[0]) : -1),
      aiMemory(config.ai[1] ? AI_TIERS.indexOf(config.ai[1]) : -1),
    ],
    stats: new Int32Array(8),
  };
  // Decks: shuffled with the match RNG (Fisher–Yates, side 0 first).
  for (let side = 0; side < 2; side++) {
    const deck = config.decks[side];
    for (let i = 0; i < 8; i++) s.deckIds[side * 8 + i] = CARD_IDS.indexOf(deck[i % deck.length]);
    const order = Array.from(s.deckIds.subarray(side * 8, side * 8 + 8));
    for (let i = 7; i > 0; i--) {
      const j = Math.floor(draw(s.rng, 0) * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    for (let i = 0; i < 8; i++) s.cards[side * 8 + i] = order[i];
  }
  const towerHp = [2400, 2400, 4000, 2400, 2400, 4000];
  for (const m of config.modifiers ?? []) {
    switch (m.kind) {
      case "doubleStart":
        s.doubleStart = 1;
        break;
      case "shortMatch":
        s.doubleAt = 1200;
        s.regEnd = 2400;
        s.tripleAt = 3000;
        s.otEnd = 3600;
        break;
      case "hideNext":
        s.hideNext = 1;
        break;
      case "heavyLookouts":
        for (const i of [0, 1, 3, 4]) towerHp[i] = Math.floor(towerHp[i] * 1.25);
        break;
      case "swiftRiver":
        s.speedMul = 1.15;
        break;
      case "fixedHand": {
        // [R2-11] The deck is exactly these cards as a cycle: hand = the first
        // four, next = the fifth, and the return queue is what remains.
        const fixed = m.cards.map((c) => CARD_IDS.indexOf(c));
        for (let i = 0; i < 8; i++) s.cards[m.side * 8 + i] = i < fixed.length ? fixed[i] : -1;
        s.deckSize[m.side] = Math.max(5, Math.min(8, fixed.length));
        break;
      }
      case "glowStart":
        s.glow[m.side] = Math.min(GLOW_CAP, Math.floor(m.glow * GLOW_UNIT));
        break;
      case "glowRate":
        s.glowMul[m.side] = m.mult;
        break;
      case "towerHp":
        for (let i = 0; i < 6; i++) if (m.hp[i] > 0) towerHp[i] = Math.floor(m.hp[i]);
        break;
      case "unbreakable":
        s.unbreakable[m.side] = 1;
        break;
    }
  }
  for (let side = 0; side < 2; side++)
    for (let which = 0; which < 3; which++) {
      const slot = towerSlot(side, which);
      const kind = which === KEEP ? K_KEEP : K_LOOKOUT;
      initEntity(s, slot, kind, side, mirX(side, TOWER_X[which]), mirY(side, TOWER_Y[which]), 0);
      s.hp[slot] = s.maxHp[slot] = towerHp[slot];
      if (which === KEEP) s.asleep[slot] = 1;
    }
  return s;
}

/** Resets a slot for a new entity (bumps its generation). */
export function initEntity(s: MatchState, slot: number, kind: number, side: number, x: number, y: number, deployT: number) {
  const u = UNIT_SPECS[kind];
  s.alive[slot] = 1;
  s.gen[slot] = (s.gen[slot] + 1) & 0xffff;
  s.kind[slot] = kind;
  s.side[slot] = side;
  s.x[slot] = x;
  s.y[slot] = y;
  s.fx[slot] = 0;
  s.fy[slot] = side === 0 ? -1 : 1;
  s.hp[slot] = u.hp;
  s.maxHp[slot] = u.hp;
  s.deployT[slot] = deployT;
  s.cd[slot] = 0;
  s.swingT[slot] = 0;
  s.target[slot] = -1;
  s.targetGen[slot] = 0;
  s.stunT[slot] = 0;
  s.kbT[slot] = 0;
  s.kbX[slot] = 0;
  s.kbY[slot] = 0;
  s.walkT[slot] = 0;
  s.charged[slot] = 0;
  s.shots[slot] = 0;
  s.rampT[slot] = 0;
  s.lifeAcc[slot] = 0;
  s.spawnT[slot] = 0;
  s.auraT[slot] = 0;
  s.stuckX[slot] = x;
  s.stuckY[slot] = y;
  s.stuckT[slot] = 0;
  s.sidestepT[slot] = 0;
  s.planted[slot] = 0;
  s.moving[slot] = 0;
  s.asleep[slot] = 0;
  s.wakeT[slot] = 0;
  s.member[slot] = 0;
}

// @hot
/** First free non-tower slot, or −1. */
export function freeSlot(s: MatchState): number {
  for (let i = 6; i < MAX_ENTS; i++) if (!s.alive[i]) return i;
  return -1;
}

// @hot
export function countUnits(s: MatchState, side: number, buildings: boolean): number {
  let n = 0;
  for (let i = 6; i < MAX_ENTS; i++)
    if (s.alive[i] && s.side[i] === side && UNIT_SPECS[s.kind[i]].building === buildings) n++;
  return n;
}

/** Deep copy (typed arrays sliced, nested objects copied). */
export function cloneState(s: MatchState): MatchState {
  return cloneValue(s) as MatchState;
}
function cloneValue(v: unknown): unknown {
  if (ArrayBuffer.isView(v)) return (v as unknown as { slice(): unknown }).slice();
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = cloneValue((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

const scratch = new Float64Array(1);
const scratchBytes = new Uint8Array(scratch.buffer);
/** FNV-1a over every typed array and scalar of the state (events excluded). */
export function hashState(s: MatchState): number {
  let h = FNV_OFFSET;
  const visit = (v: unknown, key: string) => {
    if (key.startsWith("ev") || key === "eventCount" || key === "stats") return;
    if (ArrayBuffer.isView(v)) {
      const view = v as ArrayBufferView;
      h = fnv1aBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), h);
    } else if (typeof v === "number") {
      scratch[0] = v;
      h = fnv1aBytes(scratchBytes, h);
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, String(i)));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) visit((v as Record<string, unknown>)[k], k);
  };
  for (const k of Object.keys(s)) visit((s as unknown as Record<string, unknown>)[k], k);
  return h >>> 0;
}

/** A side's private view: hand, next and exact Glow. */
export function ownView(s: MatchState, side: Side): OwnView {
  const base = side * 8;
  return {
    side,
    hand: [0, 1, 2, 3].map((i) => CARD_IDS[s.cards[base + i]]) as CardId[],
    next: s.cards[base + 4] >= 0 ? CARD_IDS[s.cards[base + 4]] : null,
    glow: Math.floor(s.glow[side] / GLOW_UNIT),
    glowExact: s.glow[side] / GLOW_UNIT,
  };
}

/** What both sides can see. */
export function publicView(s: MatchState): PublicView {
  const units = [];
  for (let i = 6; i < MAX_ENTS; i++)
    if (s.alive[i])
      units.push({
        slot: i,
        kind: UNIT_KINDS[s.kind[i]],
        side: s.side[i] as Side,
        x: s.x[i],
        y: s.y[i],
        hp: s.hp[i],
        maxHp: s.maxHp[i],
        inert: s.deployT[i] > 0,
      });
  return {
    tick: s.tick,
    phase: s.phase,
    banners: [s.banners[0], s.banners[1]],
    towers: [0, 1, 2, 3, 4, 5].map((i) => (s.alive[i] ? s.hp[i] : 0)),
    units,
  };
}
