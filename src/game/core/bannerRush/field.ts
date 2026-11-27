/**
 * The field: zones, snapping, blocked tiles, canDeploy, bridge waypoints and
 * the river constraint (§2.1, §2.5, §2.9 steps 3 and 6).
 */
import {
  BRIDGE_SPAN,
  BRIDGE_X0,
  BRIDGE_X1,
  BUILDING_CAP,
  GLOW_UNIT,
  KEEP,
  L,
  LANE_SPLIT_X,
  LOOKOUT_L,
  LOOKOUT_R,
  MAX_ENTS,
  PH_OVER,
  RIVER_Y0,
  RIVER_Y1,
  TOWER_HALF,
  TROOP_CAP,
  W,
} from "./constants";
import { CARDS, CARD_IDS, UNIT_SPECS } from "./cards";
import { countUnits, mirX, mirY, towerSlot } from "./state";
import type { DeployCheck, DeployReason, MatchState, Side } from "./types";

export const R_OK = 0;
export const R_PHASE = 1;
export const R_SLOT = 2;
export const R_GLOW = 3;
export const R_ZONE = 4;
export const R_BLOCKED = 5;
export const R_CAP = 6;
export const R_BUSY = 7;
const REASON_NAMES: readonly DeployReason[] = ["ok", "phase", "slot", "glow", "zone", "blocked", "cap", "busy"];

/** Result of the last `checkDeploy` (module scratch: no allocation). */
export const deployOut = { reason: 0, x: 0.5, y: 0.5, card: -1 };

/** Has `side`'s attack pocket on its own-frame left (0) / right (1) opened? */
export function pocketOpen(s: MatchState, side: number, right: number): boolean {
  // The enemy Lookout at own-frame x = 3 is the enemy's own-right one.
  return !s.alive[towerSlot(1 - side, right ? LOOKOUT_L : LOOKOUT_R)];
}

// @hot
/** Troop/building zone test for an own-frame tile centre. */
export function inTroopZone(s: MatchState, side: number, ox: number, oy: number): boolean {
  if (ox < 0 || ox >= W || oy >= L) return false;
  if (oy >= RIVER_Y1) return true;
  if (oy >= RIVER_Y0 - 5 && oy < RIVER_Y0) return pocketOpen(s, side, ox >= LANE_SPLIT_X ? 1 : 0);
  return false;
}

// @hot
/** Is the tile whose centre is (x, y) (absolute) blocked? */
export function tileBlocked(s: MatchState, x: number, y: number): boolean {
  if (x < 0 || x >= W || y < 0 || y >= L) return true;
  if (y >= RIVER_Y0 && y < RIVER_Y1) return true;
  for (let i = 0; i < MAX_ENTS; i++) {
    if (!s.alive[i]) continue;
    if (i < 6) {
      const h = TOWER_HALF[i % 3];
      if (Math.abs(x - s.x[i]) < h && Math.abs(y - s.y[i]) < h) return true;
    } else if (UNIT_SPECS[s.kind[i]].building) {
      if (Math.abs(x - s.x[i]) < 1 && Math.abs(y - s.y[i]) < 1) return true;
    }
  }
  return false;
}

// @hot
function troopTileOk(s: MatchState, side: number, cx: number, cy: number, spell: boolean): number {
  if (spell) return cx >= 0 && cx < W && cy >= 0 && cy < L ? R_OK : R_ZONE;
  if (!inTroopZone(s, side, mirX(side, cx), mirY(side, cy))) return R_ZONE;
  return tileBlocked(s, cx, cy) ? R_BLOCKED : R_OK;
}

// @hot
/** Building corner (cx, cy): the four tiles around it. */
function buildingOk(s: MatchState, side: number, cx: number, cy: number): number {
  let blocked = false;
  for (let k = 0; k < 4; k++) {
    const tx = cx - 0.5 + (k & 1);
    const ty = cy - 0.5 + (k >> 1);
    if (!inTroopZone(s, side, mirX(side, tx), mirY(side, ty))) return R_ZONE;
    if (tileBlocked(s, tx, ty)) blocked = true;
  }
  return blocked ? R_BLOCKED : R_OK;
}

// @hot
/**
 * Validates a deploy request and snaps it; writes `deployOut` and returns the
 * reason code. The position is computed even when the reason is not OK, so
 * the ghost can show where the card would land.
 */
export function checkDeploy(s: MatchState, side: number, slot: number, x: number, y: number): number {
  deployOut.card = -1;
  deployOut.x = x;
  deployOut.y = y;
  if (slot < 0 || slot > 3 || !(x === x) || !(y === y)) {
    deployOut.reason = s.phase === PH_OVER ? R_PHASE : R_SLOT;
    return deployOut.reason;
  }
  const cardIndex = s.cards[side * 8 + slot];
  const card = CARDS[CARD_IDS[cardIndex]];
  deployOut.card = cardIndex;
  const building = card.type === "building";
  const spell = card.type === "spell";
  let cx: number, cy: number, place: number;
  if (building) {
    cx = Math.min(W - 1, Math.max(1, Math.floor(x + 0.5)));
    cy = Math.min(L - 1, Math.max(1, Math.floor(y + 0.5)));
    place = buildingOk(s, side, cx, cy);
  } else {
    cx = Math.min(W - 0.5, Math.max(0.5, Math.floor(x) + 0.5));
    cy = Math.min(L - 0.5, Math.max(0.5, Math.floor(y) + 0.5));
    place = troopTileOk(s, side, cx, cy, spell);
  }
  if (place === R_BLOCKED) {
    // Forgiving placement: the nearest free spot within 1.5 tiles.
    let best = -1,
      bx = 0,
      by = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const px = cx + dx,
          py = cy + dy;
        const ddx = px - x,
          ddy = py - y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > 2.25 + 1e-9) continue;
        const ok = building ? buildingOk(s, side, px, py) : troopTileOk(s, side, px, py, false);
        if (ok !== R_OK) continue;
        if (best < 0 || d2 < best - 1e-12 || (Math.abs(d2 - best) <= 1e-12 && (py < by || (py === by && px < bx)))) {
          best = d2;
          bx = px;
          by = py;
        }
      }
    if (best >= 0) {
      cx = bx;
      cy = by;
      place = R_OK;
    }
  }
  deployOut.x = cx;
  deployOut.y = cy;
  let reason = R_OK;
  if (s.phase === PH_OVER) reason = R_PHASE;
  else if (cardIndex < 0) reason = R_SLOT;
  else if (s.glow[side] < card.cost * GLOW_UNIT) reason = R_GLOW;
  else if (place !== R_OK) reason = place;
  else if (building && countUnits(s, side, true) >= BUILDING_CAP) reason = R_CAP;
  else if (!building && !spell && countUnits(s, side, false) + card.count > TROOP_CAP) reason = R_CAP;
  deployOut.reason = reason;
  return reason;
}

/** Public form of checkDeploy (§2.5). */
export function canDeploy(s: MatchState, side: Side, slot: number, x: number, y: number): DeployCheck {
  const r = checkDeploy(s, side, slot, x, y);
  return { ok: r === R_OK, reason: REASON_NAMES[r], x: deployOut.x, y: deployOut.y };
}
export const reasonName = (code: number) => REASON_NAMES[code];

/** Nearest free tile centre to (x, y) within `radius` (absolute), for formation members. */
// @hot
export function nearestFree(s: MatchState, x: number, y: number, radius: number): number {
  const cx = Math.floor(x) + 0.5,
    cy = Math.floor(y) + 0.5;
  if (x >= 0 && x < W && y >= 0 && y < L && !tileBlocked(s, cx, cy)) {
    deployOut.x = x;
    deployOut.y = y;
    return 1;
  }
  let best = -1;
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const px = cx + dx,
        py = cy + dy;
      if (tileBlocked(s, px, py)) continue;
      const d2 = (px - x) * (px - x) + (py - y) * (py - y);
      if (best < 0 || d2 < best) {
        best = d2;
        deployOut.x = px;
        deployOut.y = py;
      }
    }
  return best >= 0 ? 1 : 0;
}

/** Waypoint scratch. */
export const wp = { x: 0.5, y: 0.5 };

// @hot
/**
 * Bridge waypoint for a ground troop at (x, y) heading to (gx, gy) (§2.9
 * step 3). Writes `wp`.
 */
export function waypoint(x: number, y: number, gx: number, gy: number) {
  const inBand = y > RIVER_Y0 && y < RIVER_Y1;
  const north = y <= RIVER_Y0;
  const goalNorth = gy < (RIVER_Y0 + RIVER_Y1) / 2;
  const goalInBand = gy > RIVER_Y0 && gy < RIVER_Y1;
  if (!inBand && !goalInBand && north === goalNorth) {
    wp.x = gx;
    wp.y = gy;
    return;
  }
  if (inBand && goalInBand && Math.abs(gx - x) < 1.6) {
    wp.x = gx;
    wp.y = gy;
    return;
  }
  // Choose a bridge: least |x − b| + |gx − b|; tie → the troop's side of the lane line.
  const c0 = Math.abs(x - BRIDGE_X0) + Math.abs(gx - BRIDGE_X0);
  const c1 = Math.abs(x - BRIDGE_X1) + Math.abs(gx - BRIDGE_X1);
  let b: number;
  if (inBand) b = Math.abs(x - BRIDGE_X0) < Math.abs(x - BRIDGE_X1) ? BRIDGE_X0 : BRIDGE_X1;
  else b = c0 < c1 ? BRIDGE_X0 : c1 < c0 ? BRIDGE_X1 : x < LANE_SPLIT_X ? BRIDGE_X0 : BRIDGE_X1;
  const ex = Math.min(b + 0.6, Math.max(b - 0.6, x));
  if (inBand) {
    // Head for the bank the goal is on (or, for a goal in the band, the far bank).
    const toNorth = goalInBand ? gy < y : goalNorth;
    wp.x = Math.min(b + 0.6, Math.max(b - 0.6, x));
    wp.y = toNorth ? RIVER_Y0 - 0.05 : RIVER_Y1 + 0.05;
    return;
  }
  const nearY = north ? RIVER_Y0 : RIVER_Y1;
  const farY = north ? RIVER_Y1 + 0.05 : RIVER_Y0 - 0.05;
  if (Math.abs(y - nearY) <= 0.15 && Math.abs(x - b) <= BRIDGE_SPAN) {
    wp.x = ex;
    wp.y = farY;
  } else {
    wp.x = ex;
    wp.y = nearY;
  }
}

// @hot
/** River constraint (§2.9 step 6) for a ground troop that moved from (px, py). */
export function riverConstrain(s: MatchState, i: number, px: number, py: number) {
  const y = s.y[i];
  if (y <= RIVER_Y0 || y >= RIVER_Y1) return;
  const x = s.x[i];
  if (Math.abs(x - BRIDGE_X0) <= BRIDGE_SPAN || Math.abs(x - BRIDGE_X1) <= BRIDGE_SPAN) return;
  const wasInBand = py > RIVER_Y0 && py < RIVER_Y1;
  if (wasInBand) {
    // On a bridge: clamp back into its span.
    const b = Math.abs(px - BRIDGE_X0) < Math.abs(px - BRIDGE_X1) ? BRIDGE_X0 : BRIDGE_X1;
    s.x[i] = Math.min(b + BRIDGE_SPAN, Math.max(b - BRIDGE_SPAN, x));
  } else s.y[i] = py <= RIVER_Y0 ? RIVER_Y0 : RIVER_Y1;
}

export { KEEP };
