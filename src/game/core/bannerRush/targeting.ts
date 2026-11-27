/**
 * Targeting (§2.8): validity, sight, lock and nearest candidate. Edge
 * distance = centre distance − the candidate's radius.
 */
import { MAX_ENTS } from "./constants";
import { T_ALL, T_BUILDINGS, UNIT_SPECS } from "./cards";
import type { MatchState } from "./types";

// @hot
export function edgeDist(s: MatchState, a: number, b: number): number {
  const dx = s.x[b] - s.x[a],
    dy = s.y[b] - s.y[a];
  return Math.sqrt(dx * dx + dy * dy) - UNIT_SPECS[s.kind[b]].radius;
}

// @hot
/** Can attacker kind with `targets` hit entity b of the other side? */
export function validFor(s: MatchState, targets: number, side: number, b: number): boolean {
  if (!s.alive[b] || s.side[b] === side) return false;
  const u = UNIT_SPECS[s.kind[b]];
  if (targets === T_BUILDINGS) return u.building;
  if (targets === T_ALL) return true;
  return !u.air;
}

// @hot
/** Is attacker i able to act (not inert, stunned, asleep or waking)? */
export function active(s: MatchState, i: number): boolean {
  return s.deployT[i] <= 0 && s.stunT[i] <= 0 && !s.asleep[i] && s.wakeT[i] <= 0;
}

// @hot
export function hasValidTarget(s: MatchState, i: number): boolean {
  const t = s.target[i];
  if (t < 0) return false;
  if (!s.alive[t] || s.gen[t] !== s.targetGen[i]) return false;
  return validFor(s, UNIT_SPECS[s.kind[i]].targets, s.side[i], t);
}

// @hot
/** Nearest valid candidate within `reach` (edge distance); ties → lower slot. */
export function nearest(s: MatchState, i: number, reach: number, buildingsOnly: boolean): number {
  const u = UNIT_SPECS[s.kind[i]];
  const side = s.side[i];
  const targets = buildingsOnly ? T_BUILDINGS : u.targets;
  let best = -1,
    bestD = reach;
  for (let j = 0; j < MAX_ENTS; j++) {
    if (j === i || !validFor(s, targets, side, j)) continue;
    const d = edgeDist(s, i, j);
    if (d < bestD || (best < 0 && d <= bestD)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

// @hot
function acquire(s: MatchState, i: number, t: number) {
  if (s.target[i] === t && s.targetGen[i] === s.gen[t]) return;
  const u = UNIT_SPECS[s.kind[i]];
  s.target[i] = t;
  s.targetGen[i] = s.gen[t];
  const lead = u.first - u.swing;
  if (s.cd[i] < lead) s.cd[i] = lead;
  s.rampT[i] = 0;
}

// @hot
export function clearTarget(s: MatchState, i: number) {
  s.target[i] = -1;
  s.swingT[i] = 0;
  s.rampT[i] = 0;
}

// @hot
/** Step 5 of the tick: every active attacker keeps or finds a target. */
export function targetingStep(s: MatchState) {
  for (let i = 0; i < MAX_ENTS; i++) {
    if (!s.alive[i]) continue;
    const u = UNIT_SPECS[s.kind[i]];
    if (u.kind === "stall") continue;
    if (!active(s, i) || s.kbT[i] > 0) continue;
    const fixed = u.building; // towers and card buildings see exactly their range
    if (hasValidTarget(s, i)) {
      const d = edgeDist(s, i, s.target[i]);
      if (fixed) {
        if (d > u.range) clearTarget(s, i);
      } else if (u.targets === T_BUILDINGS) {
        // Building-targeters keep re-picking the nearest building until in range.
        // (with a quarter-tile hysteresis, so two equidistant buildings do not flicker).
        if (d > u.range) {
          const t = nearest(s, i, 1e9, true);
          if (t >= 0 && t !== s.target[i] && edgeDist(s, i, t) < d - 0.25) acquire(s, i, t);
        }
      } else if (d > u.sight + 1) clearTarget(s, i);
    } else if (s.target[i] >= 0) clearTarget(s, i);
    if (s.target[i] >= 0) continue;
    let t: number;
    if (fixed) t = nearest(s, i, u.range, false);
    else if (u.targets === T_BUILDINGS) t = nearest(s, i, 1e9, true);
    else t = nearest(s, i, u.sight, false);
    if (t >= 0) acquire(s, i, t);
  }
}
