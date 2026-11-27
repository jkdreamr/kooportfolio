/**
 * Combat (§2.10, §2.6): swings, projectiles, the end-of-tick damage queue,
 * deaths and their consequences (banners, Keep wake, pockets, Balloon pop).
 */
import { DAMAGE_CAP, KEEP, LOOKOUT_L, MAX_EFFECTS, MAX_ENTS, MAX_PROJ } from "./constants";
import {
  BALLOON_POP,
  HOOP_SWISH,
  K_BALLOON,
  K_HOOP,
  K_KEEP,
  K_ROWER,
  K_TELESCOPE,
  ROWER_CHARGE,
  T_ALL,
  TELESCOPE,
  UNIT_SPECS,
} from "./cards";
import { emit } from "./events";
import { towerSlot } from "./state";
import { active, clearTarget, edgeDist, hasValidTarget, validFor } from "./targeting";
import {
  EV_DEATH,
  EV_HEAL,
  EV_HIT,
  EV_IMPACT,
  EV_KEEP_WAKE,
  EV_POCKET_OPEN,
  EV_SHOT,
  EV_STUN,
  EV_SWING,
  EV_TOWER_DOWN,
  HF_BEAM,
  HF_CHARGE,
  HF_KILL,
  HF_MELEE,
  HF_PROJ,
  HF_SPLASH,
  HF_SWISH,
  type MatchState,
} from "./types";

// @hot
export function queueDamage(s: MatchState, target: number, amount: number, flags: number, src: number, stun: number) {
  const i = s.qCount;
  if (i >= DAMAGE_CAP) return;
  s.qTarget[i] = target;
  s.qAmount[i] = amount;
  s.qFlags[i] = flags;
  s.qSrc[i] = src;
  s.qStun[i] = stun;
  s.qCount = i + 1;
}

// @hot
export function wakeKeep(s: MatchState, side: number) {
  const k = towerSlot(side, KEEP);
  if (!s.alive[k] || !s.asleep[k]) return;
  s.asleep[k] = 0;
  s.wakeT[k] = 20;
  emit(s, EV_KEEP_WAKE, side, 0, 0, 0, s.x[k], s.y[k]);
}

// @hot
function launch(s: MatchState, i: number, t: number, dmg: number, flags: number) {
  let p = -1;
  for (let k = 0; k < MAX_PROJ; k++)
    if (!s.pAlive[k]) {
      p = k;
      break;
    }
  if (p < 0) return;
  const u = UNIT_SPECS[s.kind[i]];
  s.pAlive[p] = 1;
  s.pGen[p] = (s.pGen[p] + 1) & 0xffff;
  s.pSide[p] = s.side[i];
  s.pSrc[p] = i;
  s.pSrcKind[p] = s.kind[i];
  s.pTarget[p] = t;
  s.pTargetGen[p] = s.gen[t];
  s.pX[p] = s.x[i];
  s.pY[p] = s.y[i];
  s.pTX[p] = s.x[t];
  s.pTY[p] = s.y[t];
  s.pSpeed[p] = u.proj;
  s.pDmg[p] = dmg;
  s.pSplash[p] = u.splash;
  s.pTargets[p] = u.targets === T_ALL ? 1 : 0;
  s.pFlags[p] = flags;
  const dx = s.x[t] - s.x[i],
    dy = s.y[t] - s.y[i];
  s.pDist[p] = Math.sqrt(dx * dx + dy * dy);
  s.pTravel[p] = 0;
  emit(s, EV_SHOT, p, i, t, s.kind[i], s.x[i], s.y[i]);
}

// @hot
function splashAround(s: MatchState, side: number, cx: number, cy: number, radius: number, targets: number, dmg: number, flags: number, src: number, except: number) {
  for (let j = 0; j < MAX_ENTS; j++) {
    if (j === except || !validFor(s, targets, side, j)) continue;
    const dx = s.x[j] - cx,
      dy = s.y[j] - cy;
    const d = Math.sqrt(dx * dx + dy * dy) - UNIT_SPECS[s.kind[j]].radius;
    if (d <= radius) queueDamage(s, j, dmg, flags, src, 0);
  }
}

// @hot
/** Step 7: swings start and resolve; projectiles advance and arrive. */
export function attackStep(s: MatchState) {
  for (let i = 0; i < MAX_ENTS; i++) {
    if (!s.alive[i]) continue;
    const u = UNIT_SPECS[s.kind[i]];
    if (u.kind === "stall") continue;
    if (!active(s, i) || s.kbT[i] > 0) {
      if (s.cd[i] > 0) s.cd[i]--;
      continue;
    }
    const t = s.target[i];
    const valid = hasValidTarget(s, i);
    if (s.kind[i] === K_TELESCOPE) {
      // Starlight beam: instant, ramps while it stays on the same target.
      if (valid && edgeDist(s, i, t) <= u.range) {
        s.rampT[i]++;
        if (s.cd[i] <= 0) {
          const r = s.rampT[i];
          const dmg = r <= TELESCOPE.stepTicks ? TELESCOPE.ramp[0] : r <= TELESCOPE.stepTicks * 2 ? TELESCOPE.ramp[1] : TELESCOPE.ramp[2];
          queueDamage(s, t, dmg, HF_BEAM, i, 0);
          s.cd[i] = TELESCOPE.beam;
        }
      } else s.rampT[i] = 0;
      if (s.cd[i] > 0) s.cd[i]--;
      continue;
    }
    if (s.swingT[i] > 0) {
      s.swingT[i]--;
      if (s.swingT[i] === 0) {
        if (valid && edgeDist(s, i, t) <= u.range + 0.5) {
          let dmg = u.dmg;
          let flags = 0;
          if (s.kind[i] === K_HOOP) {
            s.shots[i]++;
            if (s.shots[i] >= HOOP_SWISH.every) {
              s.shots[i] = 0;
              dmg = Math.floor(dmg * HOOP_SWISH.mult);
              flags |= HF_SWISH;
            }
          }
          if (u.proj > 0) launch(s, i, t, dmg, flags | HF_PROJ);
          else {
            if (s.kind[i] === K_ROWER && s.charged[i]) {
              dmg *= ROWER_CHARGE.mult;
              flags |= HF_CHARGE;
              s.charged[i] = 0;
              s.walkT[i] = 0;
            }
            queueDamage(s, t, dmg, flags | HF_MELEE, i, 0);
            if (u.splash > 0)
              splashAround(s, s.side[i], s.x[t], s.y[t], u.splash, u.splashGround ? 0 : u.targets, dmg, HF_MELEE | HF_SPLASH, i, t);
          }
          s.cd[i] = u.hit - u.swing;
        } else s.cd[i] = 0;
      }
    } else if (valid && s.cd[i] <= 0 && edgeDist(s, i, t) <= u.range) {
      s.swingT[i] = u.swing;
      emit(s, EV_SWING, i, t, s.kind[i], 0, s.x[i], s.y[i]);
    }
    if (s.cd[i] > 0) s.cd[i]--;
  }
  // Projectiles: home on the target's current position.
  for (let p = 0; p < MAX_PROJ; p++) {
    if (!s.pAlive[p]) continue;
    const t = s.pTarget[p];
    if (t >= 0 && s.alive[t] && s.gen[t] === s.pTargetGen[p]) {
      s.pTX[p] = s.x[t];
      s.pTY[p] = s.y[t];
    } else s.pTarget[p] = -1;
    const dx = s.pTX[p] - s.pX[p],
      dy = s.pTY[p] - s.pY[p];
    const d = Math.sqrt(dx * dx + dy * dy);
    const v = s.pSpeed[p];
    if (d > v) {
      s.pX[p] += (dx / d) * v;
      s.pY[p] += (dy / d) * v;
      s.pTravel[p] += v;
      if (s.pTravel[p] > s.pDist[p]) s.pDist[p] = s.pTravel[p] + d - v;
      continue;
    }
    s.pX[p] = s.pTX[p];
    s.pY[p] = s.pTY[p];
    s.pTravel[p] = s.pDist[p];
    s.pAlive[p] = 0;
    const side = s.pSide[p];
    const splash = s.pSplash[p];
    emit(s, EV_IMPACT, p, s.pSrcKind[p], s.pFlags[p], Math.floor(splash * 100), s.pX[p], s.pY[p]);
    if (splash > 0) splashAround(s, side, s.pX[p], s.pY[p], splash, s.pTargets[p], s.pDmg[p], HF_PROJ | HF_SPLASH, s.pSrc[p], -1);
    else if (t >= 0) queueDamage(s, t, s.pDmg[p], s.pFlags[p] | HF_PROJ, s.pSrc[p], 0);
  }
}

const dmgSum = new Int32Array(MAX_ENTS);
const healSum = new Int32Array(MAX_ENTS);
const lastHit = new Int16Array(MAX_ENTS);
const stunMax = new Int16Array(MAX_ENTS);

// @hot
/** Step 8: apply queued damage and heals at once, remove the dead. */
export function applyDamage(s: MatchState) {
  for (let i = 0; i < MAX_ENTS; i++) {
    dmgSum[i] = 0;
    healSum[i] = 0;
    lastHit[i] = -1;
    stunMax[i] = 0;
  }
  for (let q = 0; q < s.qCount; q++) {
    const t = s.qTarget[q];
    if (!s.alive[t]) continue;
    let a = s.qAmount[q];
    if (a < 0) {
      healSum[t] -= a;
      continue;
    }
    const u = UNIT_SPECS[s.kind[t]];
    if (u.resist > 0 && s.qFlags[q] & HF_PROJ) a = Math.floor(a * (1 - u.resist) + 0.5);
    s.qAmount[q] = a;
    dmgSum[t] += a;
    lastHit[t] = q;
    if (s.qStun[q] > stunMax[t]) stunMax[t] = s.qStun[q];
  }
  for (let q = 0; q < s.qCount; q++) {
    const t = s.qTarget[q];
    if (!s.alive[t] || s.qAmount[q] < 0) continue;
    const kill = lastHit[t] === q && s.hp[t] - dmgSum[t] <= 0;
    emit(s, EV_HIT, t, s.qAmount[q], s.qFlags[q] | (kill ? HF_KILL : 0), s.qSrc[q], s.x[t], s.y[t]);
  }
  for (let t = 0; t < MAX_ENTS; t++) {
    if (!s.alive[t]) continue;
    const u = UNIT_SPECS[s.kind[t]];
    if (dmgSum[t] > 0) {
      s.hp[t] -= dmgSum[t];
      if (t < 6 && s.unbreakable[s.side[t]] && s.hp[t] < 1) s.hp[t] = 1;
      if (s.kind[t] === K_KEEP) wakeKeep(s, s.side[t]);
    }
    if (stunMax[t] > 0 && s.hp[t] > 0) {
      if (stunMax[t] > s.stunT[t]) s.stunT[t] = stunMax[t];
      if (s.swingT[t] > 0 || s.target[t] >= 0) clearTarget(s, t);
      const lead = u.first;
      if (s.cd[t] < lead) s.cd[t] = lead;
      s.walkT[t] = 0;
      s.charged[t] = 0;
      emit(s, EV_STUN, t, stunMax[t], 0, 0, s.x[t], s.y[t]);
    }
    if (healSum[t] > 0 && s.hp[t] > 0 && !u.building) {
      const before = s.hp[t];
      s.hp[t] = Math.min(s.maxHp[t], s.hp[t] + healSum[t]);
      if (s.hp[t] > before) emit(s, EV_HEAL, t, s.hp[t] - before, 0, 0, s.x[t], s.y[t]);
    }
  }
  s.qCount = 0;
  // Deaths (decay included).
  for (let t = 0; t < MAX_ENTS; t++) {
    if (!s.alive[t] || s.hp[t] > 0) continue;
    kill(s, t);
  }
}

// @hot
export function kill(s: MatchState, t: number) {
  const side = s.side[t];
  const kind = s.kind[t];
  s.alive[t] = 0;
  s.hp[t] = 0;
  emit(s, EV_DEATH, t, kind, side, 0, s.x[t], s.y[t]);
  if (t < 6) {
    const scorer = 1 - side;
    const which = t % 3;
    s.banners[scorer] = which === KEEP ? 3 : s.banners[scorer] + 1;
    emit(s, EV_TOWER_DOWN, t, scorer, s.banners[scorer], 0, s.x[t], s.y[t]);
    if (which !== KEEP) {
      wakeKeep(s, side);
      // The fallen own-left Lookout opens the scorer's right pocket.
      emit(s, EV_POCKET_OPEN, scorer, which === LOOKOUT_L ? 1 : 0, 0, 0, s.x[t], s.y[t]);
    }
    return;
  }
  if (kind === K_BALLOON) {
    for (let e = 0; e < MAX_EFFECTS; e++)
      if (!s.eAlive[e]) {
        s.eAlive[e] = 1;
        s.eKind[e] = 3;
        s.eSide[e] = side;
        s.eX[e] = s.x[t];
        s.eY[e] = s.y[t];
        s.eT[e] = 1;
        s.eDir[e] = BALLOON_POP.radius;
        s.eProg[e] = 0;
        break;
      }
  }
}
