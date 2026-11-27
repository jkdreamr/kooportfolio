/**
 * The AI reads the board (§4.2) in its own frame, from public information
 * only: entity kinds, sides, positions and HP, tower HP, the clock. Results
 * go into module scratch (no allocation).
 */
import { KEEP, LOOKOUT_L, LOOKOUT_R, MAX_ENTS } from "../constants";
import { CARDS, T_ALL, T_BUILDINGS, UNIT_SPECS, UNIT_KINDS, type CardId } from "../cards";
import { mirX, mirY, towerSlot } from "../state";
import type { MatchState } from "../types";

/** Glow value of one unit of each kind (card cost / count). */
const KIND_CARD: Partial<Record<string, CardId>> = {
  skater: "skater",
  runner: "runners",
  kite: "kites",
  slinger: "slinger",
  shieldbearer: "shieldbearer",
  hoop: "hoop",
  rower: "rowers",
  lantern: "lantern",
  beekeeper: "beekeeper",
  haycart: "haycart",
  balloon: "balloon",
  mascot: "mascot",
  telescope: "telescope",
  stall: "stall",
};
export const UNIT_VALUE = Float64Array.from(UNIT_KINDS, (k) => {
  if (k === "cook") return 0.6;
  const c = KIND_CARD[k];
  return c ? CARDS[c].cost / Math.max(1, CARDS[c].count) : 0;
});

export const obs = {
  threat: new Float64Array(2),
  defence: new Float64Array(2),
  net: new Float64Array(2),
  push: new Float64Array(2),
  weak: new Float64Array(2),
  enemyDef: new Float64Array(2),
  hasAir: new Uint8Array(2),
  swarm: new Int32Array(2),
  tankHp: new Int32Array(2),
  ranged: new Int32Array(2),
  bldTargeter: new Uint8Array(2),
  /** Leading threat per lane (entity slot, −1 none). */
  lead: new Int16Array(2),
  enemyCount: new Int32Array(2),
  friendlyAll: new Uint8Array(2),
  survivors: new Float64Array(2),
  survivorsTank: new Uint8Array(2),
  survivorsRanged: new Uint8Array(2),
  survivorX: new Float64Array(2),
  survivorY: new Float64Array(2),
};

/** Own-frame coordinates of entity i for `side`. */
export const ox = (s: MatchState, side: number, i: number) => mirX(side, s.x[i]);
export const oy = (s: MatchState, side: number, i: number) => mirY(side, s.y[i]);

// @hot
export function laneTower(s: MatchState, side: number, lane: number) {
  const t = towerSlot(side, lane === 0 ? LOOKOUT_L : LOOKOUT_R);
  return s.alive[t] ? t : towerSlot(side, KEEP);
}

// @hot
export function observe(s: MatchState, side: number) {
  const enemy = 1 - side;
  for (let l = 0; l < 2; l++) {
    obs.threat[l] = 0;
    obs.defence[l] = 0;
    obs.push[l] = 0;
    obs.enemyDef[l] = 0;
    obs.hasAir[l] = 0;
    obs.swarm[l] = 0;
    obs.tankHp[l] = 0;
    obs.ranged[l] = 0;
    obs.bldTargeter[l] = 0;
    obs.lead[l] = -1;
    obs.enemyCount[l] = 0;
    obs.friendlyAll[l] = 0;
    obs.survivors[l] = 0;
    obs.survivorsTank[l] = 0;
    obs.survivorsRanged[l] = 0;
    obs.survivorX[l] = 0;
    obs.survivorY[l] = 0;
  }
  // Friendly all-targeters per lane (on own half).
  for (let i = 6; i < MAX_ENTS; i++) {
    if (!s.alive[i] || s.side[i] !== side) continue;
    const u = UNIT_SPECS[s.kind[i]];
    const x = ox(s, side, i),
      y = oy(s, side, i);
    const lane = x < 8 ? 0 : 1;
    if (u.targets === T_ALL && y >= 13) obs.friendlyAll[lane] = 1;
  }
  let best0 = -1,
    best1 = -1;
  for (let i = 6; i < MAX_ENTS; i++) {
    if (!s.alive[i]) continue;
    const u = UNIT_SPECS[s.kind[i]];
    const x = ox(s, side, i),
      y = oy(s, side, i);
    const lane = x < 8 ? 0 : 1;
    const value = UNIT_VALUE[s.kind[i]];
    const hpFrac = s.hp[i] / s.maxHp[i];
    if (s.side[i] === enemy) {
      if (u.building) {
        // An enemy building within reach of my towers.
        if (y >= 13) obs.threat[lane] += value * 0.5;
        continue;
      }
      if (y < 10) continue;
      const t = laneTower(s, side, lane);
      const dx = ox(s, side, t) - x,
        dy = oy(s, side, t) - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const prox = 1 + Math.min(1, Math.max(0, (16 - dist) / 16));
      let kf = 1;
      if (u.targets === T_BUILDINGS) kf = 1.3;
      else if (u.air && !obs.friendlyAll[lane]) kf = 1.2;
      const score = value * (0.5 + 0.5 * hpFrac) * prox * kf;
      obs.threat[lane] += score;
      obs.enemyCount[lane]++;
      if (u.air) obs.hasAir[lane] = 1;
      if (s.hp[i] <= 200) obs.swarm[lane]++;
      if (s.hp[i] > obs.tankHp[lane]) obs.tankHp[lane] = s.hp[i];
      if (u.proj > 0) obs.ranged[lane]++;
      if (u.targets === T_BUILDINGS) obs.bldTargeter[lane] = 1;
      const key = score * prox;
      if (lane === 0 ? key > best0 : key > best1) {
        if (lane === 0) best0 = key;
        else best1 = key;
        obs.lead[lane] = i;
      }
    } else {
      if (u.building) continue;
      if (y >= 14) obs.defence[lane] += value * hpFrac;
      if (y < 14) obs.push[lane] += value * hpFrac;
      // Survivors near the river on our side, for counter-pushes.
      if (y < 24) {
        obs.survivors[lane] += value * hpFrac;
        if (UNIT_SPECS[s.kind[i]].hp >= 900) obs.survivorsTank[lane] = 1;
        if (u.proj > 0) obs.survivorsRanged[lane] = 1;
        obs.survivorX[lane] += x * value;
        obs.survivorY[lane] += y * value;
      }
    }
  }
  for (let l = 0; l < 2; l++) {
    const look = towerSlot(side, l === 0 ? LOOKOUT_L : LOOKOUT_R);
    if (s.alive[look]) obs.defence[l] += 2.5 * (s.hp[look] / s.maxHp[look]);
    if (!s.asleep[towerSlot(side, KEEP)]) obs.defence[l] += 1;
    obs.net[l] = obs.threat[l] - obs.defence[l];
    // The enemy Lookout facing lane l (own-frame x = 3 or 13) is the enemy's opposite one.
    const theirs = towerSlot(enemy, l === 0 ? LOOKOUT_R : LOOKOUT_L);
    obs.weak[l] = s.alive[theirs] ? 1 - s.hp[theirs] / s.maxHp[theirs] : 1.5;
    if (obs.survivors[l] > 0) {
      let v = 0;
      for (let i = 6; i < MAX_ENTS; i++)
        if (s.alive[i] && s.side[i] === side && !UNIT_SPECS[s.kind[i]].building && oy(s, side, i) < 24 && (ox(s, side, i) < 8 ? 0 : 1) === l)
          v += UNIT_VALUE[s.kind[i]];
      if (v > 0) {
        obs.survivorX[l] /= v;
        obs.survivorY[l] /= v;
      }
    }
  }
  // Enemy defence on their half, per lane (own frame).
  for (let i = 6; i < MAX_ENTS; i++) {
    if (!s.alive[i] || s.side[i] !== enemy) continue;
    const y = oy(s, side, i);
    if (y >= 14) continue;
    const lane = ox(s, side, i) < 8 ? 0 : 1;
    obs.enemyDef[lane] += UNIT_VALUE[s.kind[i]];
  }
}
