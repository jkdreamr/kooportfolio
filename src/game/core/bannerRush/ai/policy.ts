/**
 * Choosing an action (§4.3): candidates scored in Glow-equivalents; the best
 * above its threshold is returned in `choice` (module scratch).
 */
import { GLOW_CAP, GLOW_UNIT, KEEP, MAX_ENTS } from "../constants";
import {
  CARDS,
  CARD_IDS,
  COUNTERS,
  SPELLS,
  T_ALL,
  T_BUILDINGS,
  UNIT_KINDS,
  UNIT_SPECS,
  type CardId,
} from "../cards";
import { checkDeploy, deployOut as deployOutRef, R_OK } from "../field";
import { draw } from "../rng";
import { mirX, mirY, towerSlot } from "../state";
import type { AiMemory, MatchState } from "../types";
import { obs, ox, oy, UNIT_VALUE } from "./observe";
import type { TierParams } from "./tuning";

export const P_DEFEND = 1;
export const P_COUNTER = 2;
export const P_PUSH = 3;
export const P_PUNISH = 4;
export const P_FINISH = 5;
export const P_LEAK = 6;
export const P_FOLLOW = 7;
export const P_MISTAKE = 9;

export const choice = { u: 0.5, slot: -1, x: 0.5, y: 0.5, plan: 0, lane: 0, value: 0.5 };
/** Second best (for mistakes). */
export const second = { u: 0.5, slot: -1, x: 0.5, y: 0.5, plan: 0, lane: 0, value: 0.5 };

const TAG = (c: number, tag: string) => (CARDS[CARD_IDS[c]].tags as readonly string[]).includes(tag);
const cost = (c: number) => CARDS[CARD_IDS[c]].cost;
const typeOf = (c: number) => CARDS[CARD_IDS[c]].type;
const unitOf = (c: number) => UNIT_SPECS[CARDS[CARD_IDS[c]].unit];

function consider(u: number, slot: number, x: number, y: number, plan: number, lane: number, value: number) {
  if (u > choice.u) {
    Object.assign(second, choice);
    choice.u = u;
    choice.slot = slot;
    choice.x = x;
    choice.y = y;
    choice.plan = plan;
    choice.lane = lane;
    choice.value = value;
  } else if (u > second.u) {
    second.u = u;
    second.slot = slot;
    second.x = x;
    second.y = y;
    second.plan = plan;
    second.lane = lane;
    second.value = value;
  }
}

/** Absolute legal position for an own-frame request (writes `legal`). */
export const legal = { x: 0.5, y: 0.5 };
export function legalize(s: MatchState, side: number, slot: number, px: number, py: number): boolean {
  const tries = 6;
  for (let k = 0; k < tries; k++) {
    let qx = px,
      qy = py;
    if (k === 1) qy = Math.max(py, 15.5);
    else if (k === 2) {
      qx = Math.min(15.5, Math.max(0.5, px));
      qy = Math.max(py, 16.5);
    } else if (k >= 3) {
      qx = Math.min(15.5, Math.max(0.5, px + (k === 3 ? 1.5 : k === 4 ? -1.5 : 0)));
      qy = Math.max(py, 15.5) + (k === 5 ? 2 : 1);
    }
    const r = checkDeploy(s, side, slot, mirX(side, qx), mirY(side, qy));
    if (r === R_OK) {
      // checkDeploy wrote the snapped absolute position.
      legal.x = deployOutRef.x;
      legal.y = deployOutRef.y;
      return true;
    }
  }
  return false;
}

function counterScore(t: TierParams, c: number, lane: number, s: MatchState): number {
  const id = CARD_IDS[c] as CardId;
  const type = typeOf(c);
  const u = type === "spell" ? null : unitOf(c);
  // Cannot hit the threat at all.
  if (obs.hasAir[lane] && obs.enemyCount[lane] === 1 && u && u.targets !== T_ALL) return -2;
  if (id === "haycart" || id === "balloon") return -2;
  if (u && u.targets === T_BUILDINGS) return -2;
  if (t.counters === 0) return type === "troop" ? 0.5 : -1;
  let score = 0;
  if (obs.hasAir[lane] && TAG(c, "antiAir")) score += 1;
  if (obs.swarm[lane] >= 3 && TAG(c, "splash")) score += 1;
  if (obs.bldTargeter[lane] && (TAG(c, "tank") || type === "building")) score += 1;
  if (obs.tankHp[lane] >= 1500 && id === "telescope") score += 1;
  if (t.counters === 2) {
    const lead = obs.lead[lane];
    if (lead >= 0) {
      const table = COUNTERS[UNIT_KINDS[s.kind[lead]]];
      if (table && table[id]) score += table[id]!;
    }
  }
  return score;
}

/** Best spell centre over enemy troops (own frame); returns the value, writes spellAt. */
const spellAt = { x: 0.5, y: 0.5 };
function spellValue(s: MatchState, side: number, c: number, onlyOwnHalf: boolean, respectsKeep: boolean): number {
  const id = CARD_IDS[c];
  const enemy = 1 - side;
  let best = 0;
  const dmg = id === "gostone" ? SPELLS.gostone.dmg : id === "smash" ? SPELLS.smash.dmg : SPELLS.comet.dmg;
  const radius = id === "gostone" ? SPELLS.gostone.radius : id === "comet" ? SPELLS.comet.radius : 0;
  for (let i = 6; i < MAX_ENTS; i++) {
    if (!s.alive[i] || s.side[i] !== enemy || UNIT_SPECS[s.kind[i]].building) continue;
    const cx0 = ox(s, side, i),
      cy0 = oy(s, side, i);
    if (onlyOwnHalf && cy0 < 11) continue;
    for (let m = 0; m < 2; m++) {
      const cx = cx0;
      let cy = cy0;
      if (id === "smash") {
        cy = cy0 + 0.6;
        if (m === 1) continue;
      } else if (id === "comet") {
        // Lead a moving target a little: it lands in 1 s.
        cy = cy0 + (m === 1 ? 0.8 : 0.3);
      } else if (m === 1) continue;
      let sum = 0,
        hits = 0;
      for (let j = 6; j < MAX_ENTS; j++) {
        if (!s.alive[j] || s.side[j] !== enemy || UNIT_SPECS[s.kind[j]].building) continue;
        const jx = ox(s, side, j),
          jy = oy(s, side, j);
        const r = UNIT_SPECS[s.kind[j]].radius;
        let inside: boolean;
        if (id === "smash") inside = Math.abs(jx - cx) - r <= 1.2 && jy - r <= cy && jy + r >= cy - 7;
        else {
          const dx = jx - cx,
            dy = jy - cy;
          inside = Math.sqrt(dx * dx + dy * dy) - r <= radius;
        }
        if (!inside) continue;
        hits++;
        const v = UNIT_VALUE[s.kind[j]];
        sum += v * Math.min(1, dmg / s.hp[j]);
        if (id === "gostone") sum += v * 0.25;
      }
      // Never touch a sleeping enemy Keep (own frame (8, 3)).
      if (respectsKeep && s.asleep[towerSlot(enemy, KEEP)]) {
        const kx = 8 - cx,
          ky = 3 - cy;
        if (id !== "smash" && Math.sqrt(kx * kx + ky * ky) - 1.9 <= radius) continue;
        if (id === "smash" && Math.abs(kx) - 1.9 <= 1.2 && cy - 7 <= 3 + 1.9) continue;
      }
      const score = sum + (hits >= 2 ? 0.01 * hits : 0);
      if (score > best) {
        best = score;
        spellAt.x = cx;
        spellAt.y = cy;
      }
    }
  }
  return best;
}

/** Score candidates for `side`; returns true if `choice` holds an action. */
export function decide(s: MatchState, side: number, t: TierParams, mem: AiMemory, rngIndex: number): boolean {
  choice.u = 0;
  choice.slot = -1;
  second.u = 0;
  second.slot = -1;
  const glow = s.glow[side] / GLOW_UNIT;
  const base = side * 8;
  const tick = s.tick;
  const ahead = s.banners[side] > s.banners[1 - side];
  const protect = ahead && tick >= s.regEnd - 400 && tick < s.regEnd;
  const defendAt = protect ? 0.2 : t.defendAt;
  let pushAt = t.pushAt;
  if (t.saveForDouble && tick >= s.doubleAt - 200 && tick < s.doubleAt) pushAt = 9.5;
  if (t.saveForDouble && tick >= s.doubleAt) pushAt -= 2;
  const enemy = 1 - side;

  // 5. Finish a tower with a spell.
  for (let k = 0; k < 4; k++) {
    const c = s.cards[base + k];
    if (typeOf(c) !== "spell" || glow < cost(c)) continue;
    const id = CARD_IDS[c];
    const towerDmg = id === "gostone" ? SPELLS.gostone.tower : id === "smash" ? SPELLS.smash.tower : SPELLS.comet.tower;
    for (let w = 0; w < 3; w++) {
      const tw = towerSlot(enemy, w);
      if (!s.alive[tw] || s.hp[tw] > towerDmg) continue;
      const tx = ox(s, side, tw),
        ty = oy(s, side, tw) + (id === "smash" ? 1.5 : 0);
      consider(10, k, tx, ty, P_FINISH, tx < 8 ? 0 : 1, 10);
    }
  }
  // Sprout puts spells on the nearest tower when it has Glow to burn.
  // 1. Defend.
  for (let lane = 0; lane < 2; lane++) {
    const net = obs.net[lane];
    if (net <= defendAt) continue;
    const threat = obs.threat[lane];
    const lead = obs.lead[lane];
    if (lead < 0 && threat <= 0) continue;
    const lx = lead >= 0 ? ox(s, side, lead) : lane === 0 ? 3 : 13;
    const ly = lead >= 0 ? oy(s, side, lead) : 15;
    const tx = lane === 0 ? 3 : 13,
      ty = 20.5;
    // 2 tiles in front of the Lookout toward the threat.
    let dx = lx - tx,
      dy = ly - ty;
    const n = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= n;
    dy /= n;
    const fx = tx + dx * 2,
      fy = Math.max(15.5, ty + dy * 2);
    for (let k = 0; k < 4; k++) {
      const c = s.cards[base + k];
      const cc = cost(c);
      if (glow < cc) continue;
      const type = typeOf(c);
      let px: number, py: number;
      let extra = 0;
      if (type === "spell") {
        if (t.spellValue < 0) continue;
        const v = spellValue(s, side, c, true, t.respectsKeep);
        if (v <= 0) continue;
        if (t.spellValue === 0 ? v < 1.5 : v < t.spellValue * cc) continue;
        px = spellAt.x;
        py = spellAt.y;
        extra = v - cc * 0.5;
      } else if (type === "building") {
        if (!t.centrePull && t.counters < 2) {
          px = fx;
          py = fy + 1;
        } else {
          const look = towerSlot(side, lane === 0 ? 0 : 1);
          if (s.alive[look]) {
            px = lane === 0 ? 7 : 9;
            py = 18;
          } else {
            px = 8;
            py = 22;
          }
        }
      } else {
        const u = unitOf(c);
        if (TAG(c, "swarm") && obs.enemyCount[lane] === 1 && obs.ranged[lane] === 1 && lead >= 0 && ly >= 15) {
          px = lx;
          py = ly;
          extra = 1;
        } else if (u.proj > 0 || TAG(c, "splash") && u.range > 2) {
          px = fx + (lane === 0 ? 2 : -2);
          py = Math.min(27.5, fy + 3);
        } else {
          px = fx;
          py = fy;
        }
      }
      const value = cc;
      const over = Math.max(0, cc - threat - 1.5);
      const u = counterScore(t, c, lane, s) + Math.min(threat, value) - over + extra;
      if (u > 0) consider(u + net * 0.2, k, px, py, P_DEFEND, lane, net);
    }
  }
  // 2. Counter-push after a defence.
  for (let lane = 0; lane < 2; lane++) {
    if (protect || obs.threat[lane] > 0.01 || obs.survivors[lane] < 3 || glow < 4) continue;
    if (mem.defendedLane !== lane || tick - mem.defendEnd > 120) continue;
    for (let k = 0; k < 4; k++) {
      const c = s.cards[base + k];
      if (typeOf(c) !== "troop" || glow < cost(c)) continue;
      let fit = 0;
      if (!obs.survivorsTank[lane] && TAG(c, "tank")) fit = 1;
      else if (obs.survivorsTank[lane] && (TAG(c, "ranged") || TAG(c, "splash"))) fit = 1;
      else if (glow >= 7 && TAG(c, "winCondition")) fit = 0.8;
      if (!fit) continue;
      const sx = obs.survivorX[lane],
        sy = obs.survivorY[lane];
      const tank = TAG(c, "tank");
      consider((1.5 + obs.survivors[lane] * 0.3) * fit, k, sx, Math.max(15.5, tank ? sy - 1 : sy + 2), P_COUNTER, lane, obs.survivors[lane]);
    }
  }
  // 4. Punish.
  if (t.punish && !protect && mem.enemyGlow <= 3 * GLOW_UNIT) {
    if (mem.backSpend >= 0 && tick - mem.backSpend < 60) {
      for (let k = 0; k < 4; k++) {
        const c = s.cards[base + k];
        if (glow < cost(c) || !(TAG(c, "winCondition") || CARD_IDS[c] === "rowers")) continue;
        // The other lane from the enemy's push.
        const lane = obs.threat[0] > obs.threat[1] ? 1 : 0;
        consider(2.5, k, lane === 0 ? 3 : 13, 15.5, P_PUNISH, lane, 0);
      }
    }
  }
  // 3. Push.
  const opening = tick < 200 && s.stats[2] + s.stats[3] === 0;
  const needed = opening ? t.openAt : pushAt;
  if (!protect && glow >= needed && obs.net[0] <= defendAt && obs.net[1] <= defendAt) {
    const sc0 = obs.weak[0] * 2 - obs.enemyDef[0] * 0.4 + obs.push[0] * 0.3;
    const sc1 = obs.weak[1] * 2 - obs.enemyDef[1] * 0.4 + obs.push[1] * 0.3;
    const lane = sc0 > sc1 ? 0 : sc1 > sc0 ? 1 : draw(s.rng, rngIndex) < 0.5 ? 0 : 1;
    let best = -1,
      bestCost = -1;
    for (let k = 0; k < 4; k++) {
      const c = s.cards[base + k];
      if (typeOf(c) !== "troop" || glow < cost(c)) continue;
      if ((TAG(c, "tank") || TAG(c, "winCondition")) && cost(c) > bestCost) {
        best = k;
        bestCost = cost(c);
      }
    }
    if (best < 0)
      for (let k = 0; k < 4; k++) {
        const c = s.cards[base + k];
        if (typeOf(c) === "troop" && TAG(c, "cycle") && glow >= cost(c)) {
          best = k;
          break;
        }
      }
    if (best >= 0) {
      const c = s.cards[base + best];
      // Air and win conditions at the back; Rowers go at the bridge to charge.
      const atBridge = CARD_IDS[c] === "rowers" || CARD_IDS[c] === "skater";
      consider(1 + (glow - needed) * 0.5, best, atBridge ? (lane === 0 ? 3 : 13) : lane === 0 ? 6.5 : 9.5, atBridge ? 18.5 : 27.5, P_PUSH, lane, 0);
    }
  }
  // Follow-up behind a push lead.
  if (!mem.followDone && mem.leadSlot >= 0) {
    const l = mem.leadSlot;
    if (s.alive[l] && s.gen[l] === mem.leadGen && s.side[l] === side) {
      const ly = oy(s, side, l);
      if (ly < 21) {
        const lx = ox(s, side, l);
        for (let k = 0; k < 4; k++) {
          const c = s.cards[base + k];
          if (typeOf(c) !== "troop" || glow < cost(c)) continue;
          if (!(TAG(c, "ranged") || TAG(c, "support") || TAG(c, "swarm") || TAG(c, "splash"))) continue;
          consider(1.4, k, lx, Math.max(15.5, ly + 2), P_FOLLOW, lx < 8 ? 0 : 1, 0);
        }
      }
    }
  }
  // Late spells on the lowest tower (Captain and Maxed).
  if (t.punish && (s.phase >= 2 || (tick >= s.regEnd - 600 && !ahead)) && glow >= 6) {
    let low = -1;
    for (let w = 0; w < 3; w++) {
      const tw = towerSlot(enemy, w);
      if (s.alive[tw] && (low < 0 || s.hp[tw] < s.hp[low])) low = tw;
    }
    if (low >= 0)
      for (let k = 0; k < 4; k++) {
        const c = s.cards[base + k];
        if (typeOf(c) !== "spell" || CARD_IDS[c] === "gostone" || glow < cost(c)) continue;
        if (low % 3 === KEEP && s.asleep[low] && t.respectsKeep) continue;
        consider(1.2, k, ox(s, side, low), oy(s, side, low) + (CARD_IDS[c] === "smash" ? 1.5 : 0), P_FINISH, 0, 0);
      }
  }
  // Sprout throws spells at the nearest tower.
  if (t.spellValue < 0 && glow >= 7) {
    for (let k = 0; k < 4; k++) {
      const c = s.cards[base + k];
      if (typeOf(c) !== "spell" || glow < cost(c)) continue;
      const tw = towerSlot(enemy, s.alive[towerSlot(enemy, 0)] ? 0 : 2);
      consider(0.9, k, ox(s, side, tw), oy(s, side, tw), P_FINISH, 0, 0);
    }
  }
  // 9. Do not leak.
  if (s.glow[side] >= GLOW_CAP && mem.capTicks >= t.leakTolerance) {
    let best = -1,
      bestCost = 99;
    for (let k = 0; k < 4; k++) {
      const c = s.cards[base + k];
      if (typeOf(c) !== "troop") continue;
      const cc = cost(c) - (TAG(c, "cycle") ? 0.5 : 0);
      if (cc < bestCost) {
        bestCost = cc;
        best = k;
      }
    }
    if (best >= 0) consider(0.8, best, draw(s.rng, rngIndex) < 0.5 ? 6.5 : 9.5, 27.5, P_LEAK, 0, 0);
  }
  return choice.slot >= 0;
}

/** A Sprout mistake: a random affordable card at a random legal own-half tile. */
export function randomAction(s: MatchState, side: number, rngIndex: number): boolean {
  const glow = s.glow[side] / GLOW_UNIT;
  const base = side * 8;
  const k0 = Math.floor(draw(s.rng, rngIndex) * 4);
  for (let d = 0; d < 4; d++) {
    const k = (k0 + d) % 4;
    if (glow < cost(s.cards[base + k])) continue;
    choice.slot = k;
    choice.x = 0.5 + Math.floor(draw(s.rng, rngIndex) * 16);
    choice.y = 15.5 + Math.floor(draw(s.rng, rngIndex) * 12);
    choice.plan = P_MISTAKE;
    choice.u = 0.5;
    return true;
  }
  return false;
}
