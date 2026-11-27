/**
 * Movement and pathing (§2.9): goals, bridge waypoints, steering around
 * solid obstacles, separation, field and river constraints, knockback and
 * the unstick watchdog.
 */
import { KEEP, L, LANE_SPLIT_X, LOOKOUT_L, LOOKOUT_R, MAX_ENTS, W } from "./constants";
import { K_ROWER, ROWER_CHARGE, UNIT_SPECS } from "./cards";
import { riverConstrain, waypoint, wp } from "./field";
import { towerSlot } from "./state";
import { edgeDist } from "./targeting";
import { ST_UNIT_TICKS, ST_WATCHDOG, type MatchState } from "./types";

const prevX = new Float64Array(MAX_ENTS);
const prevY = new Float64Array(MAX_ENTS);
const dir = { x: 0.5, y: 0.5 };
const live = new Int16Array(MAX_ENTS);
const liveR = new Float64Array(MAX_ENTS);
const liveM = new Float64Array(MAX_ENTS);
const liveAir = new Uint8Array(MAX_ENTS);
const liveFix = new Uint8Array(MAX_ENTS);

// @hot
/** The enemy tower a troop with no target walks to. */
export function laneGoal(s: MatchState, i: number): number {
  const side = s.side[i];
  const ownLeft = side === 0 ? s.x[i] < LANE_SPLIT_X : s.x[i] > W - LANE_SPLIT_X;
  const look = towerSlot(1 - side, ownLeft ? LOOKOUT_R : LOOKOUT_L);
  return s.alive[look] ? look : towerSlot(1 - side, KEEP);
}

// @hot
function steer(s: MatchState, i: number, target: number) {
  const r = UNIT_SPECS[s.kind[i]].radius;
  const x = s.x[i],
    y = s.y[i];
  let bestT = 2,
    obstacle = -1;
  for (let j = 0; j < MAX_ENTS; j++) {
    if (j === i || j === target || !s.alive[j]) continue;
    const u = UNIT_SPECS[s.kind[j]];
    if (!u.building) continue;
    const R = u.radius + r + 0.15;
    // Closest approach of the segment pos → pos + dir × 1.5 to the obstacle.
    const ox = s.x[j] - x,
      oy = s.y[j] - y;
    // Only obstacles ahead (one just behind or beside never deflects).
    let t = (ox * dir.x + oy * dir.y) / 1.5;
    if (t <= 0) continue;
    if (t > 1) t = 1;
    const cx = dir.x * 1.5 * t - ox,
      cy = dir.y * 1.5 * t - oy;
    if (cx * cx + cy * cy < R * R && t < bestT) {
      bestT = t;
      obstacle = j;
    }
  }
  if (obstacle < 0) return;
  const R = UNIT_SPECS[s.kind[obstacle]].radius + r + 0.15;
  const ox = s.x[obstacle] - x,
    oy = s.y[obstacle] - y;
  const d2 = ox * ox + oy * oy;
  let ax: number, ay: number, bx: number, by: number;
  if (d2 > R * R) {
    // Exact tangents without trigonometry.
    const k = Math.sqrt(d2 - R * R);
    ax = (ox * k - oy * R) / d2;
    ay = (oy * k + ox * R) / d2;
    bx = (ox * k + oy * R) / d2;
    by = (oy * k - ox * R) / d2;
  } else {
    const d = Math.sqrt(d2) || 1;
    ax = -oy / d;
    ay = ox / d;
    bx = oy / d;
    by = -ox / d;
  }
  const da = ax * dir.x + ay * dir.y,
    db = bx * dir.x + by * dir.y;
  let pickA: boolean;
  if (Math.abs(da - db) > 1e-9) pickA = da > db;
  else pickA = (LANE_SPLIT_X - x) * ax >= (LANE_SPLIT_X - x) * bx;
  const nx = pickA ? ax : bx,
    ny = pickA ? ay : by;
  const n = Math.sqrt(nx * nx + ny * ny) || 1;
  dir.x = nx / n;
  dir.y = ny / n;
}

// @hot
/** Step 6 of the tick: walk, separate, constrain. */
export function movementStep(s: MatchState) {
  for (let i = 0; i < MAX_ENTS; i++) {
    prevX[i] = s.x[i];
    prevY[i] = s.y[i];
  }
  for (let i = 6; i < MAX_ENTS; i++) {
    if (!s.alive[i]) continue;
    const u = UNIT_SPECS[s.kind[i]];
    s.planted[i] = 0;
    s.moving[i] = 0;
    if (u.building) continue;
    s.stats[ST_UNIT_TICKS]++;
    if (s.kbT[i] > 0) {
      s.x[i] += s.kbX[i];
      s.y[i] += s.kbY[i];
      s.kbT[i]--;
      continue;
    }
    if (s.deployT[i] > 0 || s.stunT[i] > 0) continue;
    const t = s.target[i];
    let gx: number, gy: number;
    if (t >= 0) {
      if (edgeDist(s, i, t) <= u.range) {
        s.planted[i] = 1;
        const fx = s.x[t] - s.x[i],
          fy = s.y[t] - s.y[i];
        const n = Math.sqrt(fx * fx + fy * fy);
        if (n > 1e-6) {
          s.fx[i] = fx / n;
          s.fy[i] = fy / n;
        }
        if (s.kind[i] === K_ROWER) s.walkT[i] = 0;
        continue;
      }
      gx = s.x[t];
      gy = s.y[t];
    } else {
      const g = laneGoal(s, i);
      gx = s.x[g];
      gy = s.y[g];
    }
    if (s.sidestepT[i] > 0) {
      s.sidestepT[i]--;
      dir.x = s.x[i] < LANE_SPLIT_X ? 1 : -1;
      dir.y = 0;
    } else {
      if (u.air) {
        wp.x = gx;
        wp.y = gy;
      } else waypoint(s.x[i], s.y[i], gx, gy);
      const dx = wp.x - s.x[i],
        dy = wp.y - s.y[i];
      const n = Math.sqrt(dx * dx + dy * dy);
      if (n < 1e-6) continue;
      dir.x = dx / n;
      dir.y = dy / n;
      if (!u.air) steer(s, i, t);
    }
    let speed = u.speed * s.speedMul;
    if (s.kind[i] === K_ROWER) {
      if (s.charged[i]) speed = ROWER_CHARGE.speed * s.speedMul;
      s.walkT[i]++;
      if (s.walkT[i] >= ROWER_CHARGE.walkTicks) s.charged[i] = 1;
    }
    s.x[i] += dir.x * speed;
    s.y[i] += dir.y * speed;
    s.fx[i] = dir.x;
    s.fy[i] = dir.y;
    s.moving[i] = 1;
  }
  // Separation: two passes over all pairs, ground with ground, air with air.
  let n = 0;
  for (let i = 0; i < MAX_ENTS; i++) if (s.alive[i]) live[n++] = i;
  for (let k = 0; k < n; k++) {
    const i = live[k];
    const u = UNIT_SPECS[s.kind[i]];
    liveR[k] = u.radius;
    liveAir[k] = u.air ? 1 : 0;
    liveFix[k] = u.building || s.deployT[i] > 0 ? 1 : 0;
    liveM[k] = u.mass * (s.planted[i] ? 3 : 1);
  }
  for (let pass = 0; pass < 2; pass++)
    for (let ka = 0; ka < n; ka++) {
      const a = live[ka];
      const ra = liveR[ka],
        airA = liveAir[ka],
        fixA = liveFix[ka];
      for (let kb = ka + 1; kb < n; kb++) {
        if (liveAir[kb] !== airA) continue;
        const fixB = liveFix[kb];
        if (fixA && fixB) continue;
        const b = live[kb];
        let dx = s.x[b] - s.x[a];
        const rr = ra + liveR[kb];
        if (dx > rr || dx < -rr) continue;
        let dy = s.y[b] - s.y[a];
        if (dy > rr || dy < -rr) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-9) {
          // Exactly coincident: separate along +x (the lower slot goes left).
          if (!fixB) s.x[b] += fixA ? rr : rr * 0.5;
          if (!fixA) s.x[a] -= fixB ? rr : rr * 0.5;
          continue;
        }
        const p = rr - d;
        dx /= d;
        dy /= d;
        if (fixA) {
          s.x[b] += dx * p;
          s.y[b] += dy * p;
        } else if (fixB) {
          s.x[a] -= dx * p;
          s.y[a] -= dy * p;
        } else {
          const ma = liveM[ka],
            mb = liveM[kb];
          const sa = (p * mb) / (ma + mb),
            sb = (p * ma) / (ma + mb);
          s.x[a] -= dx * sa;
          s.y[a] -= dy * sa;
          s.x[b] += dx * sb;
          s.y[b] += dy * sb;
        }
      }
    }
  // Constraints and the watchdog.
  for (let i = 6; i < MAX_ENTS; i++) {
    if (!s.alive[i]) continue;
    const u = UNIT_SPECS[s.kind[i]];
    if (u.building) continue;
    const r = u.radius;
    if (s.x[i] < r) s.x[i] = r;
    else if (s.x[i] > W - r) s.x[i] = W - r;
    if (s.y[i] < r) s.y[i] = r;
    else if (s.y[i] > L - r) s.y[i] = L - r;
    if (!u.air) riverConstrain(s, i, prevX[i], prevY[i]);
    if (s.planted[i] || s.deployT[i] > 0 || s.stunT[i] > 0 || s.kbT[i] > 0) {
      s.stuckT[i] = 0;
      s.stuckX[i] = s.x[i];
      s.stuckY[i] = s.y[i];
      continue;
    }
    s.stuckT[i]++;
    if (s.stuckT[i] >= 60) {
      const dx = s.x[i] - s.stuckX[i],
        dy = s.y[i] - s.stuckY[i];
      if (dx * dx + dy * dy < 0.04 && s.sidestepT[i] <= 0) {
        s.sidestepT[i] = 10;
        s.stats[ST_WATCHDOG]++;
      }
      s.stuckT[i] = 0;
      s.stuckX[i] = s.x[i];
      s.stuckY[i] = s.y[i];
    }
  }
}
