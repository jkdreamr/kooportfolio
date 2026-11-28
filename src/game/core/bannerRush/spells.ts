/**
 * Spells (§3.3): Go Stone, Badminton Smash, Comet, plus the Balloon's pop.
 * No entity is created; effects live in a pool of 8.
 */
import { MAX_EFFECTS, MAX_ENTS } from "./constants";
import { BALLOON_POP, SPELLS, T_ALL, UNIT_SPECS } from "./cards";
import { queueDamage } from "./combat";
import { emit } from "./events";
import { clearTarget, validFor } from "./targeting";
import { EV_KNOCK, EV_SPELL, HF_SPELL, HF_SPLASH, type MatchState } from "./types";

export const FX_GOSTONE = 0;
export const FX_SMASH = 1;
export const FX_COMET = 2;
export const FX_POP = 3;
const SPELL_CARD = [14, 15, 16, -1];

// @hot
export function castSpell(s: MatchState, side: number, kind: number, x: number, y: number): number {
  for (let e = 0; e < MAX_EFFECTS; e++) {
    if (s.eAlive[e]) continue;
    s.eAlive[e] = 1;
    s.eKind[e] = kind;
    s.eSide[e] = side;
    s.eX[e] = x;
    s.eY[e] = y;
    // +1: the spell step of the cast tick counts down once, so it lands exactly `delay` ticks later.
    s.eT[e] = kind === FX_GOSTONE ? SPELLS.gostone.delay + 1 : kind === FX_COMET ? SPELLS.comet.delay + 1 : 0;
    s.eDir[e] = side === 0 ? -1 : 1;
    s.eProg[e] = 0;
    for (let j = 0; j < MAX_ENTS; j++) s.eHit[e * MAX_ENTS + j] = 0;
    emit(s, EV_SPELL, side, SPELL_CARD[kind], 0, e, x, y);
    return e;
  }
  return -1;
}

// @hot
function knock(s: MatchState, j: number, dx: number, dy: number, dist: number, ticks: number) {
  if (UNIT_SPECS[s.kind[j]].building || dist <= 0) return;
  const n = Math.sqrt(dx * dx + dy * dy);
  if (n < 1e-9) return;
  s.kbT[j] = ticks;
  s.kbX[j] = ((dx / n) * dist) / ticks;
  s.kbY[j] = ((dy / n) * dist) / ticks;
  clearTarget(s, j);
  s.walkT[j] = 0;
  s.charged[j] = 0;
  emit(s, EV_KNOCK, j, 0, 0, 0, s.x[j], s.y[j]);
}

// @hot
function circle(s: MatchState, e: number, radius: number, dmg: number, tower: number, stun: number, knockDist: number, knockTicks: number, maxMass: number) {
  const side = s.eSide[e];
  const cx = s.eX[e],
    cy = s.eY[e];
  for (let j = 0; j < MAX_ENTS; j++) {
    if (!validFor(s, T_ALL, side, j)) continue;
    const u = UNIT_SPECS[s.kind[j]];
    const dx = s.x[j] - cx,
      dy = s.y[j] - cy;
    if (Math.sqrt(dx * dx + dy * dy) - u.radius > radius) continue;
    queueDamage(s, j, u.building ? tower : dmg, HF_SPELL | HF_SPLASH, -1, stun);
    if (knockDist > 0 && u.mass <= maxMass) knock(s, j, dx, dy, knockDist, knockTicks);
  }
}

// @hot
/** Advances spell effects (part of step 4); damage goes to the queue. */
export function spellStep(s: MatchState) {
  for (let e = 0; e < MAX_EFFECTS; e++) {
    if (!s.eAlive[e]) continue;
    const kind = s.eKind[e];
    if (kind === FX_SMASH) {
      const sp = SPELLS.smash;
      const y0 = s.eY[e] + s.eDir[e] * s.eProg[e];
      s.eProg[e] += sp.speed;
      const y1 = s.eY[e] + s.eDir[e] * s.eProg[e];
      const lo = y0 < y1 ? y0 : y1,
        hi = y0 < y1 ? y1 : y0;
      const side = s.eSide[e];
      for (let j = 0; j < MAX_ENTS; j++) {
        if (!validFor(s, T_ALL, side, j)) continue;
        if (s.eHit[e * MAX_ENTS + j] === s.gen[j] + 1) continue;
        const u = UNIT_SPECS[s.kind[j]];
        if (Math.abs(s.x[j] - s.eX[e]) - u.radius > sp.width / 2) continue;
        if (s.y[j] + u.radius < lo || s.y[j] - u.radius > hi) continue;
        s.eHit[e * MAX_ENTS + j] = s.gen[j] + 1;
        queueDamage(s, j, u.building ? sp.tower : sp.dmg, HF_SPELL, -1, 0);
        knock(s, j, 0, s.eDir[e], u.mass > 12 ? sp.heavyKnock : sp.knock, sp.knockTicks);
      }
      if (s.eProg[e] >= sp.length - 1e-9) {
        s.eAlive[e] = 0;
        emit(s, EV_SPELL, side, 15, 1, e, s.eX[e], y1);
      }
      continue;
    }
    s.eT[e]--;
    if (s.eT[e] > 0) continue;
    s.eAlive[e] = 0;
    if (kind === FX_GOSTONE) {
      const g = SPELLS.gostone;
      circle(s, e, g.radius, g.dmg, g.tower, g.stun, 0, 0, 0);
      emit(s, EV_SPELL, s.eSide[e], 14, 1, e, s.eX[e], s.eY[e]);
    } else if (kind === FX_COMET) {
      const c = SPELLS.comet;
      circle(s, e, c.radius, c.dmg, c.tower, 0, c.knock, c.knockTicks, 8);
      emit(s, EV_SPELL, s.eSide[e], 16, 1, e, s.eX[e], s.eY[e]);
    } else if (kind === FX_POP) {
      // The Balloon's pop: troops and card buildings 180, towers 60.
      const side = s.eSide[e];
      for (let j = 0; j < MAX_ENTS; j++) {
        if (!validFor(s, T_ALL, side, j)) continue;
        const u = UNIT_SPECS[s.kind[j]];
        const dx = s.x[j] - s.eX[e],
          dy = s.y[j] - s.eY[e];
        if (Math.sqrt(dx * dx + dy * dy) - u.radius > BALLOON_POP.radius) continue;
        queueDamage(s, j, u.tower ? BALLOON_POP.tower : BALLOON_POP.dmg, HF_SPLASH, -1, 0);
      }
      emit(s, EV_SPELL, side, -1, 1, e, s.eX[e], s.eY[e]);
    }
  }
}
