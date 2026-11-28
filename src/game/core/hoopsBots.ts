/**
 * Blacktop tuning bots (PLAN_GAMES §2.1): scripted players that drive the
 * real input path (`HoopsInput`). The vitest tuning tables and the QA
 * `act("auto", name)` hook use the same code.
 */
import { HOOP_X, HOOP_Z, METER, ZONE, delayedHolder, dist, rand, type Hoops, type HoopsInput } from "./hoops";
import { RIVALS } from "./hoopsRival";

export type BotName = "statue" | "driver" | "mixer" | "passive" | "perfect";
export const BOTS: readonly BotName[] = ["statue", "driver", "mixer", "passive", "perfect"];

export type BotMemory = { target: number; jumpFor: number; jumpAt: number; jitter: number };
export const botMemory = (jitter = 0.04): BotMemory => ({ target: -1, jumpFor: -9, jumpAt: -1, jitter });

/** Timing error in seconds, uniform ±jitter, drawn from the game's rng. */
const err = (g: Hoops, m: BotMemory) => (rand(g) * 2 - 1) * m.jitter;

/** Fills `out` with this bot's input for the next step. */
export function botInput(g: Hoops, bot: BotName, m: BotMemory, out: HoopsInput): HoopsInput {
  out.mx = out.mz = 0;
  out.move = false;
  out.charge = undefined;
  out.shoot = false;
  if (bot === "passive" || g.over) return out;
  const p = g.p,
    r = g.r,
    b = g.ball;
  const solo = g.mode !== "1v1";
  const mine = b.phase === "held" && b.holder === 0;
  const d = dist(p.x, p.z) || 1;
  const ux = (HOOP_X - p.x) / d,
    uz = (HOOP_Z - p.z) / d;
  const gap = solo ? 99 : Math.hypot(r.x - p.x, r.z - p.z);
  if (mine) {
    if (g.t < g.checkUntil) return out;
    if (p.gatherAt >= 0) {
      // Hold, then let go at the planned charge.
      out.shoot = true;
      if (m.target < 0) m.target = METER[p.gatherType].centre + err(g, m) / METER[p.gatherType].fill;
      if ((g.t - p.gatherAt) / METER[p.gatherType].fill >= m.target - 1e-9) {
        out.charge = m.target;
        m.target = -1;
      }
      return out;
    }
    m.target = -1;
    if (g.takeBack) {
      out.mx = Math.max(-3, Math.min(3, p.x * 0.6)) - p.x;
      out.mz = HOOP_Z + ZONE.three + 1.2 - p.z;
      return out;
    }
    const press = () => {
      out.shoot = !g.prevShoot;
    };
    if (bot === "statue") {
      press();
      return out;
    }
    if (bot === "perfect") {
      // Hot Shot / Shootaround: shoot from where you stand.
      press();
      return out;
    }
    const speed = Math.hypot(p.vx, p.vz);
    if (bot === "driver") {
      out.mx = ux;
      out.mz = uz;
      if ((d <= 3.3 && speed >= 2.2) || g.shotClock < 1.5) press();
      return out;
    }
    // Mixer.
    if (d <= 3.3 && speed >= 2.2) {
      out.mx = ux;
      out.mz = uz;
      press();
      return out;
    }
    if (gap < 1.6 && g.t >= p.cdUntil && d < ZONE.three + 1.5) {
      out.move = true;
      out.mx = -uz;
      out.mz = ux;
      return out;
    }
    if (gap > 2.0 && d > ZONE.paint + 0.3 && d < ZONE.three - 0.3) {
      press();
      return out;
    }
    if (g.shotClock < 2) {
      press();
      return out;
    }
    out.mx = ux;
    out.mz = uz;
    return out;
  }
  if (solo || bot === "statue") return out;
  // Defence (and loose balls).
  if (b.phase === "loose") {
    if (g.t - b.since < 0.2) return out;
    out.mx = b.x - p.x;
    out.mz = b.z - p.z;
    return out;
  }
  if (b.phase === "held" && b.holder === 1) {
    // A human's reaction: guard where he was 0.2 s ago.
    const [hx, hz] = delayedHolder(g, 0.2);
    const rd = dist(hx, hz) || 1;
    const sag = 1.0;
    const tx = hx + ((HOOP_X - hx) / rd) * sag,
      tz = hz + ((HOOP_Z - hz) / rd) * sag;
    out.mx = (tx - p.x) * 3;
    out.mz = (tz - p.z) * 3;
    if (bot === "mixer" && r.gatherAt >= 0) {
      out.mx = (r.x - p.x) * 3;
      out.mz = (r.z - p.z) * 3;
      if (m.jumpFor !== r.gatherAt) {
        m.jumpFor = r.gatherAt;
        m.jumpAt = r.gatherAt + METER[r.gatherType].fill * METER[r.gatherType].centre + err(g, m);
      }
      if (m.jumpAt > 0 && g.t >= m.jumpAt) {
        m.jumpAt = -1;
        out.shoot = !g.prevShoot;
      }
    }
    void RIVALS;
    return out;
  }
  // Ball in the air: box toward the rim.
  out.mx = (HOOP_X - p.x) * 0.5;
  out.mz = (HOOP_Z + 2.4 - p.z) * 0.5;
  return out;
}
