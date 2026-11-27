/**
 * Timers (step 4 of the tick): deploy countdowns, stuns, Keep wake, card
 * building decay and Stall spawns (§3.2), the Lantern's aura.
 */
import { MAX_ENTS, TROOP_CAP } from "./constants";
import { K_COOK, K_LANTERN, K_STALL, K_TELESCOPE, LANTERN_AURA, STALL, TELESCOPE, UNIT_SPECS } from "./cards";
import { queueDamage } from "./combat";
import { emit } from "./events";
import { nearestFree, deployOut } from "./field";
import { countUnits, freeSlot, initEntity } from "./state";
import { EV_SPAWN_COOK, type MatchState } from "./types";

// @hot
/** Deploy countdowns run at the end of the tick, so a unit created in tick t
 * is inert for ticks t … t + 19 (20 ticks) and acts from t + 20. */
export function deployCountdown(s: MatchState) {
  for (let i = 6; i < MAX_ENTS; i++) if (s.alive[i] && s.deployT[i] > 0) s.deployT[i]--;
}

// @hot
export function timerStep(s: MatchState) {
  for (let i = 0; i < MAX_ENTS; i++) {
    if (!s.alive[i] || s.deployT[i] > 0) continue;
    if (s.stunT[i] > 0) s.stunT[i]--;
    if (s.wakeT[i] > 0) s.wakeT[i]--;
    const kind = s.kind[i];
    if (kind === K_TELESCOPE) {
      s.lifeAcc[i]++;
      if (s.lifeAcc[i] % TELESCOPE.decayEvery === 0) s.hp[i] -= TELESCOPE.decay;
    } else if (kind === K_STALL) {
      s.lifeAcc[i]++;
      if (s.lifeAcc[i] % STALL.decayEvery === 0) s.hp[i] -= STALL.decay;
      if (s.stunT[i] <= 0) {
        s.spawnT[i]++;
        const due = s.spawnT[i] === STALL.firstSpawn || (s.spawnT[i] > STALL.firstSpawn && (s.spawnT[i] - STALL.firstSpawn) % STALL.every === 0);
        if (due && countUnits(s, s.side[i], false) < TROOP_CAP) {
          const side = s.side[i];
          const fy = side === 0 ? -1 : 1;
          const slot = freeSlot(s);
          if (slot >= 0 && nearestFree(s, s.x[i], s.y[i] + fy * STALL.ahead, 2)) {
            initEntity(s, slot, K_COOK, side, deployOut.x, deployOut.y, STALL.cookDeploy);
            emit(s, EV_SPAWN_COOK, slot, K_COOK, side, i, deployOut.x, deployOut.y);
          }
        }
      }
    } else if (kind === K_LANTERN && s.stunT[i] <= 0) {
      s.auraT[i]++;
      if (s.auraT[i] >= LANTERN_AURA.every) {
        s.auraT[i] = 0;
        const side = s.side[i];
        const r2 = LANTERN_AURA.radius * LANTERN_AURA.radius;
        for (let j = 6; j < MAX_ENTS; j++) {
          if (j === i || !s.alive[j] || s.side[j] !== side || UNIT_SPECS[s.kind[j]].building) continue;
          const dx = s.x[j] - s.x[i],
            dy = s.y[j] - s.y[i];
          if (dx * dx + dy * dy <= r2) queueDamage(s, j, -LANTERN_AURA.heal, 0, i, 0);
        }
      }
    }
  }
}
