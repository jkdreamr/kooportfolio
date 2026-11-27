/**
 * Scripted player bots for tuning (§4.6): pure functions of the state, a
 * side and their own memory. They act through the same inputs a human sends.
 */
import { GLOW_UNIT, MAX_ENTS } from "./constants";
import { CARDS, CARD_IDS, UNIT_SPECS, T_ALL, T_BUILDINGS, hasTag, type CardId } from "./cards";
import { checkDeploy, deployOut, R_OK } from "./field";
import { draw, deriveSeed } from "./rng";
import { mirX, mirY } from "./state";
import { EV_DEPLOY, EV_SPAWN, type DeployInput, type MatchState, type Side } from "./types";

export type BotMemory = { rng: Int32Array; next: number; lane: number; lead: number; leadGen: number; lastEnemy: number; lastEnemyX: number; lastEnemyCard: number; lastEnemySlot: number };
export const botMemory = (seed: number): BotMemory => ({ rng: new Int32Array([deriveSeed(seed, 77)]), next: 0, lane: -1, lead: -1, leadGen: 0, lastEnemy: -1000, lastEnemyX: 8, lastEnemyCard: -1, lastEnemySlot: -1 });
export type Bot = (s: MatchState, side: Side, m: BotMemory) => DeployInput | null;

const card = (s: MatchState, side: number, k: number) => CARDS[CARD_IDS[s.cards[side * 8 + k]]];
const glow = (s: MatchState, side: number) => s.glow[side] / GLOW_UNIT;

/** An own-frame request through canDeploy; null if illegal. */
function play(s: MatchState, side: Side, slot: number, ox: number, oy: number): DeployInput | null {
  const x = mirX(side, ox),
    y = mirY(side, oy);
  if (checkDeploy(s, side, slot, x, y) !== R_OK) return null;
  return { side, slot, x: deployOut.x, y: deployOut.y };
}

/** Watch the opponent's deploys from the previous tick's events. */
function watch(s: MatchState, side: number, m: BotMemory) {
  for (let e = 0; e < s.eventCount; e++) {
    if (s.evType[e] === EV_DEPLOY && s.evA[e] === 1 - side) {
      m.lastEnemy = s.tick;
      m.lastEnemyX = mirX(side, s.evX[e]);
      m.lastEnemyCard = s.evB[e];
    }
    if (s.evType[e] === EV_SPAWN && s.evC[e] === 1 - side) m.lastEnemySlot = s.evA[e];
  }
}

export const randomBot: Bot = (s, side, m) => {
  if (s.tick < m.next) return null;
  const affordable: number[] = [];
  for (let k = 0; k < 4; k++) if (glow(s, side) >= card(s, side, k).cost) affordable.push(k);
  if (!affordable.length) return null;
  m.next = s.tick + 20 + Math.floor(draw(m.rng, 0) * 41);
  const k = affordable[Math.floor(draw(m.rng, 0) * affordable.length)];
  for (let tries = 0; tries < 8; tries++) {
    const spell = card(s, side, k).type === "spell";
    const x = 0.5 + Math.floor(draw(m.rng, 0) * 16);
    const y = spell ? 0.5 + Math.floor(draw(m.rng, 0) * 28) : 15.5 + Math.floor(draw(m.rng, 0) * 12);
    const out = play(s, side, k, x, y);
    if (out) return out;
  }
  return null;
};

export const cheapLeftBot: Bot = (s, side) => {
  let best = -1;
  for (let k = 0; k < 4; k++) if (best < 0 || card(s, side, k).cost < card(s, side, best).cost) best = k;
  if (glow(s, side) < card(s, side, best).cost) return null;
  return play(s, side, best, 3, 15.5);
};

export const mirrorBot: Bot = (s, side, m) => {
  watch(s, side, m);
  const g = glow(s, side);
  if (m.lastEnemy === s.tick - 1 && m.lastEnemyCard >= 0) {
    const id = CARD_IDS[m.lastEnemyCard] as CardId;
    const threat = CARDS[id];
    const u = threat.unit >= 0 ? UNIT_SPECS[threat.unit] : null;
    let best = -1,
      bestScore = -1;
    for (let k = 0; k < 4; k++) {
      const c = card(s, side, k);
      if (c.cost > g || c.type === "spell") continue;
      const cu = c.unit >= 0 ? UNIT_SPECS[c.unit] : null;
      if (cu && cu.targets === T_BUILDINGS) continue;
      let score = 0;
      if (u?.air && cu?.targets === T_ALL) score += 2;
      if (u?.air && cu && cu.targets !== T_ALL) score -= 3;
      if (hasTag(id, "swarm") && hasTag(c.id, "splash")) score += 2;
      if (u?.targets === T_BUILDINGS && (hasTag(c.id, "tank") || c.type === "building")) score += 2;
      score += c.cost * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (best >= 0 && threat.type !== "spell") {
      const lane = m.lastEnemyX < 8 ? 3 : 13;
      return play(s, side, best, lane, 18.5) ?? play(s, side, best, lane, 17.5);
    }
  }
  if (s.tick - m.lastEnemy > 120 && g >= 8) {
    let best = -1;
    for (let k = 0; k < 4; k++) {
      const c = card(s, side, k);
      if (c.type !== "troop" || c.cost > g) continue;
      if (best < 0 || c.cost > card(s, side, best).cost) best = k;
    }
    if (best >= 0) return play(s, side, best, m.lastEnemyX < 8 ? 3 : 13, 15.5);
  }
  return null;
};

export const pusherBot: Bot = (s, side, m) => {
  if (m.lane < 0) m.lane = draw(m.rng, 0) < 0.5 ? 0 : 1;
  const g = glow(s, side);
  const leadAlive = m.lead >= 0 && s.alive[m.lead] && s.gen[m.lead] === m.leadGen;
  if (!leadAlive) {
    m.lead = -1;
    if (g < 10) return null;
    let best = -1;
    for (let k = 0; k < 4; k++) {
      const c = card(s, side, k);
      if (c.type !== "troop") continue;
      if ((hasTag(c.id, "tank") || hasTag(c.id, "winCondition")) && (best < 0 || c.cost > card(s, side, best).cost)) best = k;
    }
    if (best < 0) for (let k = 0; k < 4; k++) if (card(s, side, k).type === "troop" && (best < 0 || card(s, side, k).cost > card(s, side, best).cost)) best = k;
    if (best < 0) return null;
    const out = play(s, side, best, m.lane === 0 ? 6.5 : 9.5, 27.5);
    if (out) {
      // The lead is the next free slot the rules will use.
      for (let i = 6; i < MAX_ENTS; i++)
        if (!s.alive[i]) {
          m.lead = i;
          m.leadGen = (s.gen[i] + 1) & 0xffff;
          break;
        }
    }
    return out;
  }
  for (let k = 0; k < 4; k++) {
    const c = card(s, side, k);
    if (c.cost > g) continue;
    const lx = mirX(side, s.x[m.lead]),
      ly = mirY(side, s.y[m.lead]);
    if (c.type === "spell") {
      const out = play(s, side, k, lx, ly - 4);
      if (out) return out;
      continue;
    }
    const out = play(s, side, k, lx, Math.max(15.5, ly + 2));
    if (out) return out;
  }
  return null;
};

export const BOTS = { random: randomBot, cheapLeft: cheapLeftBot, mirror: mirrorBot, pusher: pusherBot } as const;
export type BotName = keyof typeof BOTS;
