/**
 * Regatta rivals and tuning bots (PLAN_GAMES §2.2), pure and seeded. Rivals
 * run the same `stepBoat` as the player; this module only decides their
 * input: a racing line by pure pursuit with a curvature feed-forward, Hold
 * Water before a bend they cannot make, boost on the straights, and a
 * character each (Blue defends, White is clean, Green drafts and leans).
 */
import { APEX_D, bendAhead, kappa, lineOffset, wrapS } from "./rowCourse";
import { BUOY, HULL_HALF, PEDAL, PIER, hullGap, TURN_RATE, rand, type Boat, type Race, type RowInput } from "./rowing";

export const LOOK_AHEAD = 9;

function pursue(b: Boat, targetD: number, s: number, race: Race, out: RowInput) {
  const k = kappa(race.course, b.s);
  const turn = TURN_RATE * Math.max(0.4, Math.min(1, b.v / 8));
  const ff = (k * b.v) / turn;
  // A capped approach angle: a boat swinging across at 40° cannot stop.
  const want = Math.max(-2, Math.min(2, Math.atan2(targetD - b.d, LOOK_AHEAD)));
  out.steer = Math.max(-1, Math.min(1, ff + (want - b.th) * 2.6));
}

/** Hold Water when this bend, 0.9 s ahead, is too tight at this speed. */
function needsHold(race: Race, b: Boat): boolean {
  const k = kappa(race.course, b.s + b.v * 0.9);
  if (k === 0) return false;
  const R = 1 / Math.abs(k);
  return b.v > 1.08 * TURN_RATE * (R + 3.5);
}

function boostOnStraight(race: Race, b: Boat, out: RowInput) {
  // Spend a charge on a straight of at least 25 u (press on alternate steps).
  const straight = kappa(race.course, b.s) === 0 && !bendAhead(race.course, b.s, 25);
  out.boost = race.t > 0.3 && straight && b.meter >= 100 && b.boostT <= 0 && !b.prevBoost;
}

/** A rival's input for this step. */
export function rivalInput(race: Race, b: Boat, out: RowInput): RowInput {
  out.boost = out.hold = false;
  const c = race.course,
    p = race.boats[0];
  const s = b.s + LOOK_AHEAD;
  let target = lineOffset(c, s);
  if (b.id === 1) {
    // Blue defends the inside when you are close behind.
    const gap = b.s - p.s;
    if (gap > 0 && gap < 8) {
      const bend = bendAhead(c, b.s, 40);
      if (bend) target += Math.sign(bend.k) * 1.5;
    }
  } else if (b.id === 3) {
    // Green drafts whoever is just ahead, and leans on you at the apex.
    for (const o of race.boats) {
      const ds = o.s - b.s;
      if (o !== b && ds > 3 && ds < 14 && Math.abs(o.d - target) < 4) {
        target = o.d;
        break;
      }
    }
    const bend = bendAhead(c, b.s, 0);
    if (bend && Math.abs(p.s - b.s) < 3) target += Math.sign(p.d - b.d) * 1.5;
  }
  target = steerClear(race, b, avoid(race, b, target));
  target = Math.max(-7.6, Math.min(7.6, target));
  pursue(b, target, s, race, out);
  out.hold = needsHold(race, b);
  boostOnStraight(race, b, out);
  return out;
}

/** Pull out of a boat's stern rather than rowing up it (side: more room). */
function avoid(race: Race, b: Boat, target: number): number {
  for (const o of race.boats) {
    if (o === b || o.finished) continue;
    const ds = o.s - b.s;
    if (ds > 0 && ds < 10 && Math.abs(o.d - target) < 2.6) {
      const side = o.d > 0 ? -1 : 1;
      return o.d + side * 2.8;
    }
    // Alongside: hold your water, don't row into him.
    if (ds > -4 && ds <= 0 && Math.abs(o.d - b.d) < 3 && Math.sign(target - b.d) === Math.sign(o.d - b.d)) return b.d - Math.sign(o.d - b.d) * 0.5;
  }
  return target;
}

/** The obstacles are solid: thread the bridge between its piers, and pass
 * behind a pedal boat rather than across its bow. */
export function steerClear(race: Race, b: Boat, target: number): number {
  const c = race.course;
  const w = wrapS(c, b.s);
  let ds = c.bridge - w;
  if (c.closed && ds < -c.length / 2) ds += c.length;
  if (ds > -4 && ds < 28) {
    const lane = PIER.d - PIER.radius - 1.1;
    target = Math.max(-lane, Math.min(lane, target));
  }
  // Leave the apex buoys a boat's width on the inside.
  for (const bend of c.bends) {
    let db = bend.apexS - w;
    if (c.closed && db < -c.length / 2) db += c.length;
    if (c.closed && db > c.length / 2) db -= c.length;
    if (db > -5 && db < 12) {
      const inside = Math.sign(bend.apexD);
      const lim = Math.abs(bend.apexD) - BUOY.radius - HULL_HALF - 0.4;
      if (target * inside > lim) target = lim * inside;
      // Look ahead along the current heading: if the hull would touch the
      // buoy within ~0.7 s, swing wide now rather than hitting it.
      if (db > -2 && aheadHits(race, b, bend.apexS, bend.apexD, BUOY.radius)) target = bend.apexD - inside * 3;
    }
  }
  for (const p of race.pedals) {
    let dp = p.s - w;
    if (c.closed && dp < -c.length / 2) dp += c.length;
    if (dp < -3 || dp > 6 + b.v * 1.6) continue;
    // Where the pedal boat will be when we get there, and which way it goes.
    const eta = Math.max(0, dp) / Math.max(4, b.v);
    const ph = race.t * (3 / 8) + p.phase;
    const at = Math.sin(ph + eta * (3 / 8)) * PEDAL.amp;
    const dir = Math.cos(ph + eta * (3 / 8)) >= 0 ? 1 : -1;
    if (Math.abs(at - target) < PEDAL.radius + 1.6) target = at - dir * (PEDAL.radius + 2);
    const pv = Math.cos(ph) * PEDAL.amp * (3 / 8);
    if (aheadHits(race, b, p.s, p.d, PEDAL.radius, pv)) target = p.d - dir * (PEDAL.radius + 3.5);
  }
  return target;
}

function aheadHits(race: Race, b: Boat, os: number, od: number, R: number, vd = 0): boolean {
  const s0 = b.s,
    d0 = b.d;
  let hit = false;
  for (const t of LOOK_T) {
    b.s = s0 + b.v * Math.cos(b.th) * t;
    b.d = d0 + b.v * Math.sin(b.th) * t;
    if (hullGap(race, b, os, od + vd * t, R + 0.4) > 0) {
      hit = true;
      break;
    }
  }
  b.s = s0;
  b.d = d0;
  return hit;
}
const LOOK_T = [0.25, 0.5, 0.75] as const;

export type RowBot = "passenger" | "centre" | "line" | "ace" | "masher";
export const ROW_BOTS: readonly RowBot[] = ["passenger", "centre", "line", "ace", "masher"];
export type RowBotMemory = { steer: number; next: number };
export const rowBotMemory = (): RowBotMemory => ({ steer: 0, next: 0 });

/** The player's boat driven by a tuning bot. */
export function botInput(race: Race, bot: RowBot, m: RowBotMemory, out: RowInput): RowInput {
  const b = race.boats[0],
    c = race.course;
  out.boost = out.hold = false;
  out.steer = 0;
  if (bot === "passenger") {
    out.boost = !b.prevBoost && race.t > 0.2;
    return out;
  }
  if (bot === "masher") {
    if (race.t >= m.next) {
      m.next = race.t + 1 / 3;
      m.steer = rand(race) * 2 - 1;
    }
    out.steer = m.steer;
    out.boost = rand(race) < 0.02;
    return out;
  }
  const s = b.s + LOOK_AHEAD;
  if (bot === "centre") {
    pursue(b, 0, s, race, out);
    out.hold = needsHold(race, b);
    return out;
  }
  // Line / Ace: the racing line, boost on straights, draft a nearby wake.
  let target = lineOffset(c, s);
  for (const o of race.boats) {
    const ds = o.s - b.s;
    if (o === b || o.finished) continue;
    if (ds > 9.5 && ds < 14 && Math.abs(o.d - target) < 2) {
      target = o.d; // tuck into the wake
      break;
    }
    if (ds > -4 && ds <= 0 && Math.abs(o.d - b.d) < 3 && Math.sign(target - b.d) === Math.sign(o.d - b.d)) {
      target = b.d - Math.sign(o.d - b.d) * 0.5; // alongside: give him room
      break;
    }
    if (ds > 0 && ds <= 9.5 && Math.abs(o.d - b.d) < 2.8) {
      target = o.d + (o.d > 0 ? -2.9 : 2.9); // pull out and slingshot past
      break;
    }
  }
  const clear = race.boats.every((o) => o === b || Math.abs(o.s - b.s) > 12);
  if (bot === "ace" && clear) {
    // Shave the apex buoy (gap ≤ 1.8 is Perfect) when nobody is near.
    const w = wrapS(c, b.s + 4);
    for (const bend of c.bends) {
      const ds = Math.abs(w - bend.apexS);
      if (ds < 10) target = Math.sign(bend.k) * (APEX_D - 1.1) * (1 - ds / 20) + target * (ds / 20);
    }
  }
  if (bot === "ace" && race.t > -0.05 && race.t < 0.05 && !b.rocketUsed) out.boost = !b.prevBoost;
  target = steerClear(race, b, Math.max(-7.6, Math.min(7.6, target)));
  pursue(b, target, s, race, out);
  out.hold = needsHold(race, b);
  if (!out.boost) boostOnStraight(race, b, out);
  return out;
}
