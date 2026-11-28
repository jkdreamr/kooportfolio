/**
 * The per-frame 3D view (§1.6, §1.7, §5): poses and draws every troop, prop
 * and effect from the interpolated sim state and the view's own transient
 * pools (ghosts, debris, puffs, rings). Allocation-free in `draw`.
 */
import * as THREE from "three";
import { MAX_EFFECTS, MAX_ENTS, MAX_PROJ, KEEP } from "../../core/bannerRush/constants";
import {
  CARDS,
  CARD_IDS,
  K_BALLOON,
  K_HAYCART,
  K_HOOP,
  K_KEEP,
  K_KITE,
  K_LANTERN,
  K_LOOKOUT,
  K_SKATER,
  K_STALL,
  K_TELESCOPE,
  K_BEEKEEPER,
  K_SLINGER,
  SPELLS,
  TELESCOPE,
  UNIT_KINDS,
  UNIT_SPECS,
} from "../../core/bannerRush/cards";
import { inTroopZone, tileBlocked } from "../../core/bannerRush/field";
import { mirX, mirY } from "../../core/bannerRush/state";
import type { Gait, Pose } from "../../world/character/locomotion";
import { engine } from "./engineApi";

const createGait = (seed: number) => engine().locomotion.createGait(seed);
const stepGait: typeof import("../../world/character/locomotion").stepGait = (...a) => engine().locomotion.stepGait(...a);
import type { Look } from "../../world/character/rig";
import { FxLayer, setBillboard } from "./Fx";
import { BOX, CAPSULE, col, CONE, PropBatch, SPHERE } from "./Props";
import { MAX_DRAWN, poseCopy, TroopBatch } from "./Troops";
import { LOOK_OF, troopLook, type LookKind } from "./troopLooks";
import type { RushRuntime } from "./runtime";

export type Tier = "high" | "medium" | "low";
const GAIT_OPTS = {};
const GAIT_STILL = { still: true };
const GAITS = MAX_ENTS + 16;
/** Gait slots beyond the entity slots. */
const G_CREW = MAX_ENTS; // 6 crews
const G_CMD = MAX_ENTS + 6; // 2 commanders
const G_GHOST = MAX_ENTS + 8; // 1 (preview)
const DIE_MS = 420;

const easeOutBack = (t: number) => {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export type ViewOptions = {
  tier: Tier;
  team: [string, string];
  commander: [Look, Look];
  palace: boolean;
  reducedMotion: () => boolean;
};

export class RushView {
  readonly troops: TroopBatch;
  readonly props: PropBatch;
  readonly fx = new FxLayer();
  readonly tier: Tier;
  readonly group = new THREE.Group();
  private looks: (Look | null)[][] = [[], []];
  private crew: Look[];
  private commander: [Look, Look];
  private team: THREE.Color[];
  private teamDark: THREE.Color[];
  private teamRGB: Float32Array;
  private gaits: Gait[] = [];
  private pose = createGait(0).pose;
  private yaw = new Float32Array(MAX_ENTS);
  private viewGen = new Int32Array(MAX_ENTS).fill(-1);
  readonly spawnAt = new Float64Array(MAX_ENTS);
  readonly swingAt = new Float64Array(MAX_ENTS).fill(-1e9);
  readonly hitAt = new Float64Array(MAX_ENTS).fill(-1e9);
  readonly hitX = new Float32Array(MAX_ENTS);
  readonly hitY = new Float32Array(MAX_ENTS);
  private hpShown = new Float32Array(MAX_ENTS);
  private recentHp = new Float32Array(MAX_ENTS);
  private recentAt = new Float64Array(MAX_ENTS);
  private distance = new Float32Array(MAX_ENTS);
  private reduced: () => boolean;
  /* ghosts of defeated troops */
  private gN = 24;
  private gAlive = new Uint8Array(24);
  private gKind = new Uint8Array(24);
  private gSide = new Uint8Array(24);
  private gX = new Float32Array(24);
  private gY = new Float32Array(24);
  private gYaw = new Float32Array(24);
  private gT0 = new Float64Array(24);
  /* debris (props, ballistic) */
  private dN = 160;
  private dAlive = new Uint8Array(160);
  private dX = new Float32Array(160);
  private dY = new Float32Array(160);
  private dZ = new Float32Array(160);
  private dVX = new Float32Array(160);
  private dVY = new Float32Array(160);
  private dVZ = new Float32Array(160);
  private dS = new Float32Array(160);
  private dT0 = new Float64Array(160);
  private dLife = new Float32Array(160);
  private dCol: THREE.Color[] = [];
  private dLast = 0;
  /* additive puffs and rings */
  private pN = 128;
  private pAlive = new Uint8Array(128);
  private pX = new Float32Array(128);
  private pY = new Float32Array(128);
  private pZ = new Float32Array(128);
  private pR0 = new Float32Array(128);
  private pR1 = new Float32Array(128);
  private pRise = new Float32Array(128);
  private pT0 = new Float64Array(128);
  private pDur = new Float32Array(128);
  private pRGB = new Float32Array(128 * 3);
  private pRing = new Uint8Array(128);
  private pLast = 0;
  /* lingering spell props */
  private stoneAt = new Float64Array(MAX_EFFECTS).fill(-1e9);
  private stoneX = new Float32Array(MAX_EFFECTS);
  private stoneY = new Float32Array(MAX_EFFECTS);
  private stoneSide = new Uint8Array(MAX_EFFECTS);
  private craterAt = new Float64Array(4).fill(-1e9);
  private craterX = new Float32Array(4);
  private craterY = new Float32Array(4);
  private craterK = 0;
  /* towers */
  readonly towerHitAt = new Float64Array(6).fill(-1e9);
  readonly wakeAt = new Float64Array(2).fill(-1e9);
  pocketAt = -1e9;
  pocketSide = 0;
  pocketRight = 0;
  /* commanders: 0 idle, 1 cheer, 2 slump, 3 wave; until (ms) */
  readonly cmdMood = new Uint8Array(2);
  readonly cmdUntil = new Float64Array(2);
  /* deploy preview */
  preview = { on: false, slot: -1, card: -1, x: 0.5, y: 0.5, ok: false, stepAt: 0, fromX: 0.5, fromY: 0.5, need: 0 };
  selectedCard = -1;
  private zoneCard = -2;
  private zoneVersion = -1;
  private zoneRows = new Int8Array(28 * 16);
  showNumbers = true;
  highContrast = false;
  private glintPhase = new Float32Array(14);

  constructor(rt: RushRuntime, o: ViewOptions) {
    this.tier = o.tier;
    this.reduced = o.reducedMotion;
    const high = o.tier === "high";
    this.team = [col(o.team[0]), col(o.team[1])];
    this.teamDark = this.team.map((c) => c.clone().multiplyScalar(0.62));
    this.teamRGB = Float32Array.from([this.team[0].r, this.team[0].g, this.team[0].b, this.team[1].r, this.team[1].g, this.team[1].b]);
    const all: Look[] = [];
    for (let side = 0; side < 2; side++)
      for (let k = 0; k < UNIT_KINDS.length; k++) {
        const lk = LOOK_OF[UNIT_KINDS[k]];
        const look = lk ? troopLook(lk as LookKind, o.team[side], o.palace) : null;
        this.looks[side][k] = look;
        if (look) all.push(look);
      }
    this.crew = [troopLook("crew", o.team[0]), troopLook("crew", o.team[1])];
    this.commander = o.commander;
    all.push(...this.crew, ...this.commander);
    this.troops = new TroopBatch(high ? "high" : "low", !high, all, high);
    this.props = new PropBatch([260, 70, 300, 120], high ? "high" : "low", high);
    for (let i = 0; i < GAITS; i++) this.gaits.push(createGait(i + 1));
    for (let i = 0; i < this.dN; i++) this.dCol.push(col("#8a8a80"));
    for (let i = 0; i < 14; i++) this.glintPhase[i] = (i * 0.37) % 1;
    for (const m of this.troops.meshes) if (m) this.group.add(m);
    for (const m of this.props.meshes) this.group.add(m);
    for (const b of this.fx.all) this.group.add(b.mesh);
    void rt;
  }

  dispose() {
    this.troops.dispose();
    this.props.dispose();
    this.fx.dispose();
  }

  /* ------------------------------------------------------- pools (events) */

  ghost(kind: number, side: number, x: number, y: number, yaw: number, now: number) {
    for (let i = 0; i < this.gN; i++)
      if (!this.gAlive[i] || now - this.gT0[i] > DIE_MS) {
        this.gAlive[i] = 1;
        this.gKind[i] = kind;
        this.gSide[i] = side;
        this.gX[i] = x;
        this.gY[i] = y;
        this.gYaw[i] = yaw;
        this.gT0[i] = now;
        return;
      }
  }
  /** Debris box on a ballistic arc (tiles, tiles/s). */
  debris(x: number, y: number, h: number, vx: number, vy: number, vz: number, size: number, c: THREE.Color, life: number, now: number) {
    const i = this.dLast;
    this.dLast = (i + 1) % this.dN;
    this.dAlive[i] = 1;
    this.dX[i] = x;
    this.dY[i] = h;
    this.dZ[i] = y;
    this.dVX[i] = vx;
    this.dVY[i] = vy;
    this.dVZ[i] = vz;
    this.dS[i] = size;
    this.dT0[i] = now;
    this.dLife[i] = life;
    this.dCol[i] = c;
  }
  /** Additive puff (soft disc) or ring. */
  puff(x: number, y: number, h: number, r0: number, r1: number, rise: number, dur: number, r: number, g: number, b: number, ring: boolean, now: number) {
    const i = this.pLast;
    this.pLast = (i + 1) % this.pN;
    this.pAlive[i] = 1;
    this.pX[i] = x;
    this.pY[i] = h;
    this.pZ[i] = y;
    this.pR0[i] = r0;
    this.pR1[i] = r1;
    this.pRise[i] = rise;
    this.pT0[i] = now;
    this.pDur[i] = dur;
    this.pRGB[i * 3] = r;
    this.pRGB[i * 3 + 1] = g;
    this.pRGB[i * 3 + 2] = b;
    this.pRing[i] = ring ? 1 : 0;
  }
  dust(x: number, y: number, radius: number, now: number) {
    const rm = this.reduced();
    this.puff(x, y, 0.05, 0.3, radius, 0, rm ? 300 : 350, 0.55, 0.5, 0.4, true, now);
    if (rm) return;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + x;
      this.puff(x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, 0.15, 0.12, 0.32, 0.25, 300, 0.32, 0.28, 0.22, false, now);
      this.pRGB[((this.pLast + this.pN - 1) % this.pN) * 3] = 0.32;
      // drift outward
      this.pX[(this.pLast + this.pN - 1) % this.pN] += Math.cos(a) * 0.3;
      this.pZ[(this.pLast + this.pN - 1) % this.pN] += Math.sin(a) * 0.3;
    }
  }
  burst(x: number, y: number, h: number, n: number, speed: number, c: THREE.Color, size: number, now: number) {
    if (this.reduced()) return;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (k % 3) * 0.7;
      const sp = speed * (0.6 + ((k * 7) % 5) * 0.12);
      this.debris(x, y, h, Math.cos(a) * sp, 2.6 + ((k * 3) % 4) * 0.6, Math.sin(a) * sp, size * (0.7 + ((k * 5) % 4) * 0.15), c, 0.6 + ((k * 11) % 5) * 0.06, now);
    }
  }
  stone(e: number, x: number, y: number, side: number, now: number) {
    this.stoneAt[e] = now;
    this.stoneX[e] = x;
    this.stoneY[e] = y;
    this.stoneSide[e] = side;
  }
  crater(x: number, y: number, now: number) {
    const k = this.craterK++ % 4;
    this.craterAt[k] = now;
    this.craterX[k] = x;
    this.craterY[k] = y;
  }

  /* ------------------------------------------------------------- drawing */

  // @hot
  private resetGait(i: number) {
    const g = this.gaits[i];
    g.initialised = false;
    g.speed = 0;
    g.accel = 0;
    g.turn = 0;
  }

  // @hot
  /** One rig figure through the troop batch. */
  private figure(look: Look, gi: number, x: number, h: number, y: number, yaw: number, vx: number, vy: number, dt: number, sx: number, sy: number, sz: number, bright: number, red: number, still: boolean): Pose {
    const g = this.gaits[gi];
    const k = 2.2 / look.scale;
    const p = stepGait(g, still ? 0 : dt, vx * k, vy * k, yaw, still ? GAIT_STILL : GAIT_OPTS);
    poseCopy(this.pose, p);
    void x;
    void h;
    void y;
    void sx;
    void sy;
    void sz;
    void bright;
    void red;
    return this.pose;
  }

  // @hot
  draw(rt: RushRuntime, dt: number, camera: THREE.Camera) {
    const t0 = performance.now();
    const s = rt.state;
    const now = rt.now;
    const a = rt.alpha;
    const rm = this.reduced();
    setBillboard(camera.quaternion);
    this.troops.begin();
    this.props.begin();
    this.fx.begin();
    const fx = this.fx;
    const P = this.props;
    const high = this.tier === "high";
    // --- troops and card buildings
    for (let i = 6; i < MAX_ENTS; i++) {
      if (!s.alive[i]) {
        this.viewGen[i] = -1;
        continue;
      }
      const kind = s.kind[i];
      const side = s.side[i];
      const u = UNIT_SPECS[kind];
      let x = s.x[i],
        y = s.y[i];
      const fresh = this.viewGen[i] !== s.gen[i];
      if (fresh) {
        this.viewGen[i] = s.gen[i];
        this.resetGait(i);
        this.yaw[i] = Math.atan2(s.fx[i], s.fy[i]);
        this.hpShown[i] = s.hp[i];
        this.recentHp[i] = s.hp[i];
        if (this.spawnAt[i] < now - 5000) this.spawnAt[i] = now;
      } else if (rt.prevGen[i] === s.gen[i]) {
        x = rt.prevX[i] + (x - rt.prevX[i]) * a;
        y = rt.prevY[i] + (y - rt.prevY[i]) * a;
      }
      const vx = (s.x[i] - rt.prevX[i]) / 0.05,
        vy = (s.y[i] - rt.prevY[i]) / 0.05;
      const targetYaw = Math.atan2(s.fx[i], s.fy[i]);
      this.yaw[i] = lerpAngle(this.yaw[i], targetYaw, Math.min(1, dt * 12));
      const yaw = this.yaw[i];
      // HP bar easing.
      this.hpShown[i] += (s.hp[i] - this.hpShown[i]) * Math.min(1, dt / 0.12);
      if (s.hp[i] > this.recentHp[i] || now - this.recentAt[i] > 400) this.recentHp[i] += (s.hp[i] - this.recentHp[i]) * Math.min(1, dt * 6);
      // Deploy drop and squash.
      const age = now - this.spawnAt[i];
      let h = 0,
        sx = 1,
        sy = 1;
      if (!rm && age < 280) {
        const t = age / 280;
        h = 3.2 * (1 - t * t);
      } else if (!rm && age < 440) {
        const t = (age - 280) / 160;
        const k = Math.sin(t * Math.PI) * (1 - t * 0.5);
        sy = 1 - 0.28 * k + (t > 0.7 ? 0.04 * Math.sin((t - 0.7) * 10) : 0);
        sx = 1 + 0.15 * k;
      }
      const fadeIn = rm ? clamp01(age / 150) : 1;
      // Hit recoil.
      const hitAge = now - this.hitAt[i];
      if (!rm && hitAge < 50) {
        x += this.hitX[i] * 0.12;
        y += this.hitY[i] * 0.12;
      }
      let bright = s.deployT[i] > 0 ? 0.85 : 1;
      if (hitAge < 80) bright = 1.6;
      if (s.deployT[i] <= 0 && age < 1600 && age > 1000 + 280) bright = 1;
      const X = x - 8,
        Z = y - 14;
      // Swing pose override timing.
      const swingMs = u.proj > 0 ? 250 : 200;
      const sw = now - this.swingAt[i];
      const stunned = s.stunT[i] > 0;
      if (u.air) {
        this.drawAir(kind, side, X, Z, yaw, now, i, fadeIn * (bright > 1 ? 1.4 : 1), h);
      } else if (u.building) {
        this.drawBuilding(rt, kind, side, i, X, Z, now, h, sx, sy, bright);
      } else {
        const look = this.looks[side][kind];
        if (look) {
          const g = this.gaits[i];
          const p = stepGait(g, stunned ? 0 : dt, vx * (2.2 / look.scale), vy * (2.2 / look.scale), yaw, s.moving[i] ? GAIT_OPTS : GAIT_STILL);
          const pose = poseCopy(this.pose, p);
          if (sw >= 0 && sw < swingMs + 180) {
            const t = sw / swingMs;
            if (t < 1) {
              const e = easeOutBack(t);
              pose.armR = -0.4 + 1.9 * e;
              pose.elbowR = 0.3 + 0.6 * (1 - e);
              pose.chestYaw = 0.35 * (1 - 2 * t);
              if (t > 0.8) sy *= 0.94;
              if (u.targets === 2) pose.lean = 0.3 * Math.sin(t * Math.PI);
            } else {
              const back = (sw - swingMs) / 180;
              pose.armR = 1.5 * (1 - back);
            }
          }
          if (kind === K_SKATER && s.moving[i]) {
            pose.lean = 0.12;
            pose.hipL = 0.1;
            pose.hipR = -0.25 + Math.sin(now * 0.008) * 0.25;
          }
          if (s.charged[i]) {
            pose.lean = 0.35;
            pose.armR = 0.9;
            pose.armL = 0.9;
          }
          let H = h;
          if (kind === K_SKATER) H += 0.12;
          this.troops.draw(look, X, H, Z, yaw, sx * fadeIn, sy * fadeIn, sx * fadeIn, pose, bright, 0);
          if (kind === K_SKATER) {
            // The board under the feet.
            P.push(X, H, Z, 0, yaw, 0, 1);
            P.part(BOX, col("#8a603a"), 1, 0, 0.05, 0, 0.3, 0.05, 0.75, s.moving[i] ? 0.06 : 0, 0, 0);
            for (let w = 0; w < 4; w++) P.part(SPHERE, col("#3a3530"), 1, w & 1 ? 0.11 : -0.11, 0.0, w & 2 ? 0.26 : -0.26, 0.05, 0.05, 0.05, 0, 0, 0);
            P.pop();
          }
          if (kind === K_HAYCART) this.drawCart(side, X, Z, yaw, h, now, i, s.moving[i] === 1, sw >= 0 && sw < swingMs ? sw / swingMs : -1);
          if (stunned) {
            const top = 1.75 * look.scale + 0.25;
            for (let k = 0; k < 3; k++) {
              const ang = now * 0.006 + (k * Math.PI * 2) / 3;
              P.part(SPHERE, col("#ffd27a"), 1.2, X + Math.cos(ang) * 0.32, top, Z + Math.sin(ang) * 0.32, 0.07, 0.07, 0.07, 0, 0, 0);
            }
          }
        }
      }
      // Ground markers: team disc (yours solid) or ring (theirs), blob shadow.
      const r = u.radius * 1.25 * (age < 400 && !rm ? clamp01((age - 280) / 120) : 1);
      const c = this.teamRGB;
      if (!u.building && r > 0) {
        if (side === 0) fx.disc.add(X, 0.02, Z, r, r, 0, c[0], c[1], c[2]);
        else fx.ring.add(X, 0.025, Z, r, r, 0, c[3], c[4], c[5]);
        if (!high || u.air) {
          const sr = u.air ? u.radius * 0.6 : u.radius * 0.75;
          fx.shadow.add(X, 0.03, Z, sr, sr, 0, 0.11, 0.16, 0.09);
        }
      }
      // Ready bar while inert.
      if (s.deployT[i] > 0) {
        const total = 20 + 2 * s.member[i];
        const f = 1 - s.deployT[i] / total;
        fx.solid.add(X, 0.06, Z + u.radius + 0.2, 0.8, 0.1, 0, 0.1, 0.13, 0.1);
        fx.solid.add(X - 0.4 + 0.4 * f, 0.07, Z + u.radius + 0.2, 0.8 * f, 0.07, 0, 1, 0.82, 0.48);
      }
      // HP bar once damaged.
      if (s.hp[i] < s.maxHp[i]) {
        const look = this.looks[side][kind];
        const top = u.building ? 2.4 : u.air ? (kind === K_BALLOON ? 4.2 : 3.0) : 1.75 * (look ? look.scale : 1) + 0.35;
        const w = u.hp >= 900 ? 1.3 : 0.9,
          hh = u.hp >= 900 ? 0.15 : 0.12;
        const f = clamp01(this.hpShown[i] / s.maxHp[i]);
        this.bar(X, h + top, Z, w, hh, f, clamp01(this.recentHp[i] / s.maxHp[i]), side, hitAge < 80);
      }
    }
    // --- ghosts (defeated troops)
    for (let g = 0; g < this.gN; g++) {
      if (!this.gAlive[g]) continue;
      const t = now - this.gT0[g];
      if (t > DIE_MS) {
        this.gAlive[g] = 0;
        continue;
      }
      const kind = this.gKind[g];
      const look = this.looks[this.gSide[g]][kind];
      if (!look) continue;
      const sc = t < 120 ? 1 + 0.15 * (t / 120) : 1.15 * (1 - (t - 120) / 300);
      const rise = t < 120 ? 0 : 0.4 * ((t - 120) / 300);
      poseCopy(this.pose, this.gaits[G_GHOST].pose);
      this.pose.armL = this.pose.armR = 2.4;
      this.troops.draw(look, this.gX[g] - 8, rise, this.gY[g] - 14, this.gYaw[g], sc, sc, sc, this.pose, 1.25, 0);
    }
    // --- crews and commanders
    this.drawCrews(rt, dt, now);
    this.drawCommanders(rt, dt, now);
    // --- deploy preview ghost
    this.drawPreview(rt, dt, now);
    // --- projectiles
    for (let p = 0; p < MAX_PROJ; p++) {
      if (!s.pAlive[p]) continue;
      let x = s.pX[p],
        y = s.pY[p];
      if (rt.pPrevGen[p] === s.pGen[p]) {
        x = rt.pPrevX[p] + (x - rt.pPrevX[p]) * a;
        y = rt.pPrevY[p] + (y - rt.pPrevY[p]) * a;
      }
      const dist = Math.max(0.01, s.pDist[p]);
      const t = clamp01((s.pTravel[p] + s.pSpeed[p] * a) / dist);
      const kind = s.pSrcKind[p];
      const H = kind === K_HOOP ? 2.4 : kind === K_BEEKEEPER || kind === K_LANTERN ? 0.3 : 0.6;
      const base = kind === K_LOOKOUT ? 3.4 * (1 - t) + 0.6 * t : kind === K_KEEP ? 4.6 * (1 - t) + 0.6 * t : 0.9;
      const arc = rm ? 0 : 4 * H * t * (1 - t);
      const X = x - 8,
        Z = y - 14,
        Y = base + arc;
      if (kind === K_HOOP) {
        P.part(SPHERE, col("#e07a3a"), 1, X, Y, Z, 0.2, 0.2, 0.2, now * 0.01, 0, 0);
        if (s.pFlags[p] & 8) fx.addSoft.add(X, Y, Z, 0.4, 0.4, 0, 0.5, 0.38, 0.1, true);
      } else if (kind === K_BEEKEEPER) {
        for (let k = 0; k < 7; k++) {
          const ang = now * 0.02 + k * 0.9;
          P.part(SPHERE, col("#3a3020"), 1, X + Math.cos(ang) * 0.18, Y + Math.sin(ang * 1.3) * 0.1, Z + Math.sin(ang) * 0.18, 0.05, 0.05, 0.05, 0, 0, 0);
        }
        fx.addSoft.add(X, Y, Z, 0.3, 0.3, 0, 0.18, 0.14, 0.04, true);
      } else if (kind === K_LANTERN) {
        P.part(SPHERE, col("#ffd27a"), 1.3, X, Y, Z, 0.13, 0.13, 0.13, 0, 0, 0);
        fx.addSoft.add(X, Y, Z, 0.45, 0.45, 0, 0.5, 0.4, 0.15, true);
      } else {
        P.part(SPHERE, col(kind === K_SLINGER ? "#efe2bf" : "#e8c26e"), 1, X, Y, Z, 0.15, 0.13, 0.15, now * 0.012, now * 0.01, 0);
      }
      if (!high || kind === K_HOOP) fx.shadow.add(X, 0.03, Z, 0.16, 0.16, 0, 0.1, 0.12, 0.08);
    }
    // --- spells in flight and lingering
    this.drawSpells(rt, now);
    // --- debris
    for (let d = 0; d < this.dN; d++) {
      if (!this.dAlive[d]) continue;
      const t = (now - this.dT0[d]) / 1000;
      if (t > this.dLife[d]) {
        this.dAlive[d] = 0;
        continue;
      }
      let yy = this.dY[d] + this.dVY[d] * t - 9 * t * t;
      let k = t;
      if (yy < 0.05) {
        // one bounce, then rest
        yy = 0.05 + Math.abs(Math.sin(t * 12)) * 0.15 * (1 - t / this.dLife[d]);
        k = t * 0.85;
      }
      const sc = this.dS[d] * (1 - clamp01((t - this.dLife[d] + 0.15) / 0.15));
      P.part(BOX, this.dCol[d], 1, this.dX[d] - 8 + this.dVX[d] * k, yy, this.dZ[d] - 14 + this.dVZ[d] * k, sc, sc, sc, t * 9, t * 7, 0);
    }
    // --- puffs and rings
    for (let q = 0; q < this.pN; q++) {
      if (!this.pAlive[q]) continue;
      const t = (now - this.pT0[q]) / this.pDur[q];
      if (t >= 1) {
        this.pAlive[q] = 0;
        continue;
      }
      const e = 1 - (1 - t) * (1 - t);
      const r = this.pR0[q] + (this.pR1[q] - this.pR0[q]) * e;
      const f = 1 - t;
      const R = this.pRGB[q * 3] * f,
        G = this.pRGB[q * 3 + 1] * f,
        B = this.pRGB[q * 3 + 2] * f;
      if (this.pRing[q]) fx.addRing.add(this.pX[q] - 8, this.pY[q], this.pZ[q] - 14, r, r, 0, R, G, B);
      else fx.addSoft.add(this.pX[q] - 8, this.pY[q] + this.pRise[q] * e, this.pZ[q] - 14, r, r, 0, R, G, B, true);
    }
    // --- towers: bars, pennants, Keep glow and zzz
    this.drawTowers(rt, now);
    // --- field: water glints, pocket pulse, zone tint
    this.drawField(rt, dt, now);
    this.troops.end();
    this.props.end();
    this.fx.end();
    rt.viewMs[rt.viewN++ % rt.viewMs.length] = performance.now() - t0;
    rt.frames++;
  }

  // @hot
  private bar(X: number, Y: number, Z: number, w: number, h: number, f: number, recent: number, side: number, flash: boolean) {
    const fx = this.fx;
    const c = this.teamRGB;
    const o = side * 3;
    fx.solid.add(X, Y, Z, w + 0.06, h + 0.06, 0, 0.106, 0.141, 0.106, true);
    if (recent > f) fx.solid.add(X - w / 2 + (w * recent) / 2, Y + 0.001, Z, w * recent, h, 0, 0.95, 0.9, 0.8, true);
    const fc = flash ? 1 : 0;
    fx.solid.add(X - w / 2 + (w * f) / 2, Y + 0.002, Z, w * f, h, 0, c[o] + fc * (1 - c[o]), c[o + 1] + fc * (1 - c[o + 1]), c[o + 2] + fc * (1 - c[o + 2]), true);
    // Shape, not only colour: your bars carry a light top edge, theirs a dark one.
    fx.solid.add(X - w / 2 + (w * f) / 2, Y + 0.003 + h * 0.36, Z, w * f, h * 0.22, 0, side === 0 ? 1 : 0.15, side === 0 ? 0.97 : 0.12, side === 0 ? 0.85 : 0.1, true);
  }

  // @hot
  private drawAir(kind: number, side: number, X: number, Z: number, yaw: number, now: number, i: number, bright: number, drop: number) {
    const P = this.props;
    const team = this.team[side];
    if (kind === K_KITE) {
      const bob = Math.sin(now * 0.004 + i) * 0.15;
      const H = 2.4 + bob + drop * 0.3;
      P.push(X, H, Z, 0.2 + Math.sin(now * 0.003 + i) * 0.12, yaw + Math.sin(now * 0.002 + i) * 0.3, 0, 1);
      P.part(BOX, team, bright, 0, 0, 0, 0.5, 0.5, 0.04, 0, 0, Math.PI / 4);
      P.part(BOX, col("#f4ecd6"), bright, 0, 0, 0.025, 0.04, 0.68, 0.02, 0, 0, 0);
      P.part(BOX, col("#f4ecd6"), bright, 0, 0, 0.025, 0.5, 0.04, 0.02, 0, 0, 0);
      for (let k = 0; k < 5; k++) P.part(CAPSULE, k & 1 ? team : col("#f4ecd6"), bright, Math.sin(now * 0.006 + k) * 0.06 * k, -0.38 - k * 0.13, 0.05 * k, 0.03, 0.06, 0.03, 0, 0, 0);
      P.pop();
      // the string down to a tiny peg
      P.part(CAPSULE, col("#efe2bf"), 1, X, H * 0.5, Z + 0.15, 0.008, H, 0.008, 0.12, 0, 0);
    } else {
      const bob = Math.sin(now * 0.0025 + i) * 0.15;
      const H = 3.0 + bob + drop * 0.3;
      P.push(X, H, Z, 0, yaw + Math.sin(now * 0.0015) * 0.08, Math.sin(now * 0.002 + i) * 0.05, 1);
      P.part(SPHERE, col("#c89a5e"), bright, 0, 0.55, 0, 0.75, 0.85, 0.75, 0, 0, 0);
      P.part(SPHERE, team, bright, 0, 1.15, 0, 0.82, 0.45, 0.82, 0, 0, 0);
      P.part(CONE, col("#6b4a2c"), bright, 0, -0.38, 0, 0.18, 0.3, 0.18, Math.PI, 0, 0);
      P.part(BOX, col("#8a603a"), bright, 0, -0.75, 0, 0.42, 0.28, 0.42, 0, 0, 0);
      P.part(CAPSULE, team, bright, -0.25, -1.1, 0.1, 0.03, 0.5, 0.03, 0.2 + Math.sin(now * 0.005) * 0.2, 0, 0);
      P.part(CAPSULE, col("#f4ecd6"), bright, 0.25, -1.1, 0.1, 0.03, 0.5, 0.03, 0.2 + Math.cos(now * 0.005) * 0.2, 0, 0);
      P.pop();
    }
  }

  // @hot
  private drawCart(side: number, X: number, Z: number, yaw: number, drop: number, now: number, i: number, moving: boolean, ram: number) {
    const P = this.props;
    const lunge = ram >= 0 ? Math.sin(ram * Math.PI) * 0.25 : 0;
    P.push(X, drop, Z, 0, yaw, 0, 1);
    P.push(0, 0, 0.75 + lunge, 0, 0, 0, 1);
    P.part(BOX, col("#8a603a"), 1, 0, 0.45, 0, 0.95, 0.12, 1.1, 0, 0, 0);
    P.part(BOX, col("#6b4a2c"), 1, 0.45, 0.6, 0, 0.06, 0.3, 1.1, 0, 0, 0);
    P.part(BOX, col("#6b4a2c"), 1, -0.45, 0.6, 0, 0.06, 0.3, 1.1, 0, 0, 0);
    P.part(SPHERE, col("#e3c46a"), 1, 0, 0.9, 0, 0.5, 0.42, 0.62, 0, 0, 0);
    P.part(SPHERE, col("#d4b25a"), 1, 0.1, 1.15, 0.1, 0.32, 0.25, 0.4, 0, 0, 0);
    const spin = moving ? now * 0.006 + i : i;
    for (let w = -1; w <= 1; w += 2) {
      P.part(CAPSULE, col("#5a3e2a"), 1, w * 0.53, 0.3, 0, 0.3, 0.06, 0.3, 0, 0, Math.PI / 2);
      P.part(BOX, col("#c6c4ba"), 1, w * 0.56, 0.3, 0, 0.04, 0.5, 0.06, spin, 0, 0);
    }
    P.part(CAPSULE, col("#6b4a2c"), 1, 0, 1.5, -0.45, 0.025, 1.0, 0.025, 0, 0, 0);
    P.part(BOX, this.team[side], 1, 0.18, 1.8, -0.45, 0.36, 0.22, 0.02, 0, 0, Math.sin(now * 0.006) * 0.08);
    P.part(CAPSULE, col("#6b4a2c"), 1, 0.25, 0.65, -0.68, 0.025, 0.5, 0.025, -1.0, 0, 0);
    P.part(CAPSULE, col("#6b4a2c"), 1, -0.25, 0.65, -0.68, 0.025, 0.5, 0.025, -1.0, 0, 0);
    P.pop();
    P.pop();
  }

  // @hot
  private drawBuilding(rt: RushRuntime, kind: number, side: number, i: number, X: number, Z: number, now: number, drop: number, sx: number, sy: number, bright: number) {
    const P = this.props;
    const s = rt.state;
    const team = this.team[side];
    const face = side === 0 ? Math.PI : 0;
    P.push(X, drop * 0.8, Z, 0, face, 0, 1);
    // Flagstone base.
    for (let k = 0; k < 4; k++) P.part(BOX, col(k & 1 ? "#a9a9a2" : "#9a9890"), bright, k & 1 ? 0.48 : -0.48, 0.05 * sy, k & 2 ? 0.48 : -0.48, 0.9 * sx, 0.1, 0.9 * sx, 0, 0, 0);
    if (kind === K_TELESCOPE) {
      // Tripod, brass tube tracking its target.
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3;
        P.part(CAPSULE, col("#6b4a2c"), bright, Math.cos(a) * 0.32, 0.6 * sy, Math.sin(a) * 0.32, 0.05, 1.2 * sy, 0.05, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      }
      let aim = 0,
        pitch = -0.35;
      const t = s.target[i];
      if (t >= 0 && s.alive[t]) {
        const dx = s.x[t] - s.x[i],
          dy = s.y[t] - s.y[i];
        aim = Math.atan2(dx, dy) - face;
        pitch = -0.15;
      }
      P.push(0, 1.25 * sy, 0, pitch, aim, 0, 1);
      P.part(CAPSULE, col("#e8c26e"), bright * 1.05, 0, 0, 0.1, 0.17, 0.75, 0.17, Math.PI / 2, 0, 0);
      P.part(CAPSULE, col("#c9a24e"), bright, 0, 0, 0.55, 0.22, 0.12, 0.22, Math.PI / 2, 0, 0);
      P.pop();
      P.part(CAPSULE, col("#6b4a2c"), 1, 0.85, 0.7, 0.85, 0.025, 1.4, 0.025, 0, 0, 0);
      P.part(BOX, team, 1, 1.05, 1.25, 0.85, 0.4, 0.24, 0.02, 0, 0, Math.sin(now * 0.005 + i) * 0.1);
      // Beam.
      if (t >= 0 && s.alive[t] && s.rampT[i] > 0) {
        const stage = s.rampT[i] <= TELESCOPE.stepTicks ? 0 : s.rampT[i] <= TELESCOPE.stepTicks * 2 ? 1 : 2;
        const w = stage === 0 ? 0.06 : stage === 1 ? 0.12 : 0.22;
        const tx = s.x[t] - 8,
          tz = s.y[t] - 14;
        const sxp = X,
          szp = Z;
        const dx = tx - sxp,
          dz = tz - szp;
        const len = Math.sqrt(dx * dx + dz * dz);
        const pulse = 0.6 + 0.4 * Math.sin(now * 0.016);
        const k = (0.35 + stage * 0.25) * pulse;
        P.pop();
        this.fx.addPlane.add((sxp + tx) / 2, 1.1, (szp + tz) / 2, w * 2, len, Math.atan2(dx, dz), k * 0.8, k * 0.85, k);
        this.fx.addSoft.add(tx, 0.9, tz, 0.35 + stage * 0.15, 0.35 + stage * 0.15, 0, k * 0.7, k * 0.75, k, true);
        return;
      }
    } else if (kind === K_STALL) {
      // Counter, striped awning, pot and chimney.
      P.part(BOX, col("#8a603a"), bright, 0, 0.45 * sy, 0.2, 1.6 * sx, 0.7 * sy, 0.7, 0, 0, 0);
      P.part(BOX, col("#efe2bf"), bright, 0, 0.82 * sy, 0.2, 1.7 * sx, 0.06, 0.8, 0, 0, 0);
      for (let k = 0; k < 4; k++) P.part(CAPSULE, col("#6b4a2c"), bright, k & 1 ? 0.78 : -0.78, 1.0 * sy, k & 2 ? 0.55 : -0.3, 0.04, 1.6 * sy, 0.04, 0, 0, 0);
      for (let k = 0; k < 6; k++) P.part(BOX, k & 1 ? col("#f4ecd6") : team, bright, -0.75 + k * 0.3, 1.85 * sy, 0.15, 0.3, 0.06, 1.05, 0.25, 0, 0);
      P.part(CAPSULE, col("#4a4a48"), bright, 0.35, 0.95 * sy, 0.2, 0.22, 0.2, 0.22, 0, 0, 0);
      P.part(CAPSULE, col("#7a7268"), bright, -0.5, 1.6 * sy, -0.35, 0.09, 1.0, 0.09, 0, 0, 0);
      if (now % 1800 < 900) this.fx.addSoft.add(X - 0.5 * (side === 0 ? -1 : 1), 2.3 + (now % 900) / 900, Z + 0.35 * (side === 0 ? 1 : -1), 0.25, 0.25, 0, 0.2, 0.2, 0.19, true);
    }
    P.pop();
  }

  // @hot
  private drawCrews(rt: RushRuntime, dt: number, now: number) {
    const s = rt.state;
    for (let t = 0; t < 6; t++) {
      if (!s.alive[t]) continue;
      const side = t < 3 ? 0 : 1;
      const keep = t % 3 === KEEP;
      if (keep && s.asleep[t]) continue;
      const X = s.x[t] - 8,
        Z = s.y[t] - 14;
      const toward = side === 0 ? Math.PI : 0;
      let yaw = toward;
      const tg = s.target[t];
      if (tg >= 0 && s.alive[tg]) yaw = Math.atan2(s.x[tg] - s.x[t], s.y[tg] - s.y[t]);
      const g = this.gaits[G_CREW + t];
      const p = stepGait(g, dt, 0, 0, yaw, GAIT_STILL);
      const pose = poseCopy(this.pose, p);
      const sw = now - this.swingAt[t];
      if (sw >= 0 && sw < 330) {
        const e = easeOutBack(Math.min(1, sw / 150));
        pose.armR = -0.6 + 2.2 * e;
        pose.elbowR = 0.5 * (1 - e);
      }
      const H = keep ? 3.15 : 2.5;
      const out = keep ? 1.25 : 0.25;
      const fwd = side === 0 ? -1 : 1;
      this.troops.draw(this.crew[side], X, H, Z + fwd * out, yaw, 1, 1, 1, pose, 1, 0);
    }
  }

  // @hot
  private drawCommanders(rt: RushRuntime, dt: number, now: number) {
    for (let side = 0; side < 2; side++) {
      const X = 0,
        Z = side === 0 ? 29.4 - 14 : -1.4 - 14;
      const yaw = side === 0 ? Math.PI : 0;
      const g = this.gaits[G_CMD + side];
      const p = stepGait(g, dt, 0, 0, yaw, GAIT_STILL);
      const pose = poseCopy(this.pose, p);
      const mood = now < this.cmdUntil[side] ? this.cmdMood[side] : 0;
      let hop = 0;
      if (mood === 1) {
        pose.armL = pose.armR = 2.7;
        pose.spreadL = pose.spreadR = 0.5;
        hop = Math.abs(Math.sin(now * 0.0078)) * 0.25;
      } else if (mood === 2) {
        pose.headPitch = 0.45;
        pose.lean = 0.2;
        pose.armL = pose.armR = -0.1;
      } else if (mood === 3) {
        pose.armR = 2.6;
        pose.spreadR = 0.4 + Math.sin(now * 0.012) * 0.3;
      }
      this.troops.draw(this.commander[side], X, 0.55 + hop, Z, yaw, 1.15, 1.15, 1.15, pose, 1, 0);
    }
  }

  // @hot
  private drawPreview(rt: RushRuntime, dt: number, now: number) {
    const v = this.preview;
    if (!v.on || v.card < 0) return;
    const card = CARDS[CARD_IDS[v.card]];
    const fx = this.fx;
    const slide = clamp01((now - v.stepAt) / 60);
    const x = v.fromX + (v.x - v.fromX) * slide,
      y = v.fromY + (v.y - v.fromY) * slide;
    const X = x - 8,
      Z = y - 14;
    const building = card.type === "building";
    const w = building ? 2 : 1;
    // Tile cursor.
    if (v.ok) fx.tint.add(X, 0.04, Z, w * 0.96, w * 0.96, 0, 1, 0.95, 0.75);
    else fx.tint.add(X, 0.04, Z, w * 0.96, w * 0.96, 0, 0.75, 0.2, 0.15);
    fx.addRing.add(X, 0.05, Z, w * 0.62, w * 0.62, 0, v.ok ? 0.35 : 0.45, v.ok ? 0.3 : 0.08, v.ok ? 0.18 : 0.05);
    // Range ring (ranged troops, buildings, spells): 24 dashes.
    let range = 0;
    if (card.type === "spell") {
      const id = card.id;
      range = id === "gostone" ? SPELLS.gostone.radius : id === "comet" ? SPELLS.comet.radius : 0;
      if (id === "smash") {
        const dir = -1;
        fx.tint.add(X, 0.045, Z + dir * 3.5, 2.4, 7, 0, 1, 0.92, 0.7);
      }
    } else {
      const u = UNIT_SPECS[card.unit];
      if (u.proj > 0 || u.building) range = u.range;
    }
    if (range > 0) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        fx.addPlane.add(X + Math.sin(a) * range, 0.06, Z + Math.cos(a) * range, 0.06, (Math.PI * 2 * range) / 24 * 0.55, a + Math.PI / 2, 0.35, 0.33, 0.24);
      }
    }
    // Ghost figure(s) at 75% brightness (red when invalid).
    if (card.type === "troop") {
      const kind = card.unit;
      const look = this.looks[0][kind];
      const red = v.ok ? 0 : 0.45;
      if (look && !UNIT_SPECS[kind].air) {
        const g = this.gaits[G_GHOST];
        const p = stepGait(g, dt, 0, 0, Math.PI, GAIT_STILL);
        const pose = poseCopy(this.pose, p);
        const n = card.count;
        for (let m = 0; m < n; m++) {
          const ox = n === 1 ? 0 : n === 2 ? (m === 0 ? -0.55 : 0.55) : m === 0 ? 0 : m === 1 ? -0.45 : 0.45;
          const oz = n === 3 ? (m === 0 ? -0.45 : 0.35) : 0;
          this.troops.draw(look, X + ox, 0, Z + oz, Math.PI, 1, 1, 1, pose, 0.75, red);
        }
      } else if (UNIT_SPECS[kind].air) this.drawAir(kind, 0, X, Z, Math.PI, now, 0, v.ok ? 0.8 : 0.5, 0);
    } else if (building) this.drawBuilding(rt, card.unit, 0, 0, X, Z, now, 0, 1, 1, v.ok ? 0.8 : 0.55);
    void MAX_DRAWN;
  }

  // @hot
  private drawSpells(rt: RushRuntime, now: number) {
    const s = rt.state;
    const fx = this.fx;
    const P = this.props;
    const rm = this.reduced();
    for (let e = 0; e < MAX_EFFECTS; e++) {
      // Lingering Go Stone (sits 800 ms, sinks over 200 ms).
      const st = now - this.stoneAt[e];
      if (st >= 0 && st < 1000) {
        const sink = st > 800 ? (st - 800) / 200 : 0;
        const c = this.stoneSide[e] === 0 ? col("#22201e") : col("#f4f1e8");
        P.part(SPHERE, c, 1, this.stoneX[e] - 8, 0.25 - sink * 0.3, this.stoneY[e] - 14, 1.6 * (1 - sink * 0.5), 0.35, 1.6 * (1 - sink * 0.5), 0, 0, 0);
        if (st < 400) for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          fx.addSoft.add(this.stoneX[e] - 8 + Math.sin(a) * 2, 0.06, this.stoneY[e] - 14 + Math.cos(a) * 2, 0.12, 0.12, 0, 0.5, 0.45, 0.3, false);
        }
      }
      if (!s.eAlive[e]) continue;
      const kind = s.eKind[e];
      const X = s.eX[e] - 8,
        Z = s.eY[e] - 14;
      if (kind === 0) {
        const t = 1 - (s.eT[e] - 1 - rt.alpha) / SPELLS.gostone.delay;
        fx.addRing.add(X, 0.06, Z, SPELLS.gostone.radius, SPELLS.gostone.radius, 0, 0.4, 0.38, 0.3);
        const c = s.eSide[e] === 0 ? col("#22201e") : col("#f4f1e8");
        const h = rm ? 0.25 : 0.25 + 6 * (1 - t * t);
        P.part(SPHERE, c, 1, X, h, Z, 1.6, 0.35, 1.6, 0, 0, 0);
        fx.shadow.add(X, 0.03, Z, 1.6 * clamp01(t + 0.3), 1.6 * clamp01(t + 0.3), 0, 0.08, 0.1, 0.06);
      } else if (kind === 2) {
        const t = 1 - (s.eT[e] - 1 - rt.alpha) / SPELLS.comet.delay;
        const r = 0.4 + (SPELLS.comet.radius - 0.4) * t;
        fx.shadow.add(X, 0.03, Z, r, r, 0, 0.12, 0.08, 0.06);
        fx.addRing.add(X, 0.06, Z, SPELLS.comet.radius, SPELLS.comet.radius, 0, 0.45, 0.2, 0.12);
        if (t > 0.6) {
          const k = (1 - t) / 0.4;
          const cx = X + k * 4,
            cy = k * 7;
          P.part(SPHERE, col("#7a6e62"), 1, cx, cy + 0.3, Z, 0.55, 0.5, 0.55, now * 0.01, 0, 0);
          fx.addSoft.add(cx + 0.6, cy + 0.9, Z, 0.9, 0.9, 0, 0.6, 0.42, 0.2, true);
          fx.addPlane.add(cx + 1.4, cy + 1.8, Z, 0.35, 2.6, Math.PI / 2, 0.45, 0.3, 0.12, true);
        }
      } else if (kind === 1) {
        const dir = s.eDir[e];
        const prog = s.eProg[e] + SPELLS.smash.speed * rt.alpha;
        const y = Z + dir * prog;
        P.push(X, 0.7, y, dir < 0 ? 0 : Math.PI, 0, 0, 1);
        P.part(SPHERE, col("#f4ecd6"), 1.1, 0, 0, -0.3, 0.16, 0.16, 0.16, 0, 0, 0);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          P.part(CAPSULE, col("#fbf6ea"), 1.1, Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.15, 0.03, 0.55, 0.03, Math.PI / 2 - 0.35 * Math.cos(a) * 0, 0, 0);
        }
        P.pop();
        fx.addPlane.add(X, 0.65, y - dir * 1.2, 0.5, 2.4, 0, 0.45, 0.42, 0.32, true);
        fx.tint.add(X, 0.04, y - dir * 0.8, SPELLS.smash.width, 1.6, 0, 1, 0.92, 0.7);
      }
    }
    // Crater decals (3 s).
    for (let k = 0; k < 4; k++) {
      const t = now - this.craterAt[k];
      if (t < 0 || t > 3000) continue;
      const f = 1 - t / 3000;
      fx.shadow.add(this.craterX[k] - 8, 0.03, this.craterY[k] - 14, 2.2, 2.2, 0, 0.18 * f + 0.05, 0.14 * f + 0.05, 0.1 * f + 0.04);
    }
  }

  // @hot
  private drawTowers(rt: RushRuntime, now: number) {
    const s = rt.state;
    const P = this.props;
    const fx = this.fx;
    for (let t = 0; t < 6; t++) {
      const side = t < 3 ? 0 : 1;
      const keep = t % 3 === KEEP;
      const X = s.x[t] - 8,
        Z = s.y[t] - 14;
      const team = this.team[side];
      if (!s.alive[t]) continue;
      // Pennant on the pole (team colour; swallow-tail for you, triangle for them).
      const frac = s.hp[t] / s.maxHp[t];
      const droop = frac < 0.25 ? 0.9 : 0;
      const sway = Math.sin(now * 0.004 + t) * 0.12;
      if (!keep) {
        const top = 4.6;
        P.part(CAPSULE, col("#6b4a2c"), 1, X, top - 0.7, Z, 0.04, 1.4, 0.04, 0, 0, 0);
        P.push(X, top - 0.1, Z, 0, sway, droop, 1);
        if (side === 0) {
          P.part(BOX, team, 1, 0.3, 0.12, 0, 0.6, 0.12, 0.03, 0, 0, 0.15);
          P.part(BOX, team, 1, 0.3, -0.06, 0, 0.6, 0.12, 0.03, 0, 0, -0.15);
        } else P.part(CONE, team, 1, 0.32, 0, 0, 0.16, 0.65, 0.03, 0, 0, -Math.PI / 2);
        P.pop();
      } else {
        // Two long banners on the Keep's front.
        const fz = side === 0 ? -1.9 : 1.9;
        for (let k = -1; k <= 1; k += 2) {
          P.part(BOX, team, 1, X + k * 1.05, 2.5, Z + fz, 0.42, 1.5, 0.04, sway * 0.2, 0, 0);
          P.part(CONE, team, 1, X + k * 1.05, 1.6, Z + fz, 0.21, 0.3, 0.04, Math.PI, 0, 0);
        }
        if (s.asleep[t]) {
          // zzz: three small spheres bobbing.
          for (let k = 0; k < 3; k++) {
            const ph = (now * 0.0006 + k / 3) % 1;
            P.part(SPHERE, col("#efe2bf"), 1, X + 0.6 + ph * 0.5, 4.8 + ph * 1.2, Z, 0.08 + k * 0.03, 0.08 + k * 0.03, 0.08 + k * 0.03, 0, 0, 0);
          }
        } else {
          // Core glow: breathes ±12% over 4 s after a 1.3× overshoot on waking.
          const w = now - this.wakeAt[side];
          const on = w < 200 ? 0 : w < 700 ? ((w - 200) / 500) * 1.3 : w < 900 ? 1.3 - ((w - 700) / 200) * 0.3 : 1;
          const k = on * (1 + 0.12 * Math.sin(now * 0.00157));
          fx.addSoft.add(X, 2.0, Z + (side === 0 ? -2.05 : 2.05), 0.75 * k, 0.75 * k, 0, 0.55 * k, 0.42 * k, 0.15 * k, true);
          if (w < 600 && w > 0) {
            const r = 7 * (w / 600) + 1.9;
            fx.addRing.add(X, 0.07, Z, r, r, 0, 0.5 * (1 - w / 600), 0.42 * (1 - w / 600), 0.2 * (1 - w / 600));
          }
        }
      }
      // Tower HP bar: under the front edge, once damaged or an enemy is near.
      let near = s.hp[t] < s.maxHp[t];
      if (!near)
        for (let j = 6; j < MAX_ENTS && !near; j++)
          if (s.alive[j] && s.side[j] !== side) {
            const dx = s.x[j] - s.x[t],
              dy = s.y[j] - s.y[t];
            if (dx * dx + dy * dy < 81) near = true;
          }
      if (near) {
        const front = side === 0 ? (keep ? 2.35 : 1.85) : -(keep ? 2.35 : 1.85);
        const by = side === 0 ? 0.25 : (keep ? 5.9 : 4.2);
        this.bar(X, by, Z + (side === 0 ? front : -0.2), 2.6, 0.22, clamp01(frac), clamp01(frac), side, now - this.towerHitAt[t] < 90);
      }
    }
  }

  // @hot
  private drawField(rt: RushRuntime, dt: number, now: number) {
    const fx = this.fx;
    const s = rt.state;
    // Water glints drifting downstream (+X).
    for (let k = 0; k < 14; k++) {
      this.glintPhase[k] = (this.glintPhase[k] + dt * (0.6 / 20)) % 1;
      const x = -9.5 + this.glintPhase[k] * 19;
      if ((x > -6 && x < -4) || (x > 4 && x < 6)) continue;
      const z = -0.7 + ((k * 0.53) % 1.4);
      const fade = Math.sin(this.glintPhase[k] * Math.PI);
      const b = 0.25 * fade;
      fx.addPlane.add(x, -0.18, z, 0.5 + (k % 3) * 0.2, 0.06, Math.PI / 2, b, b * 1.05, b * 1.1);
    }
    // Pocket pulse: newly opened tiles flash gold three times.
    const pt = now - this.pocketAt;
    if (pt >= 600 && pt < 1800) {
      const k = Math.sin(((pt - 600) / 400) * Math.PI);
      if (k > 0) {
        const side = this.pocketSide;
        const ox0 = this.pocketRight ? 8 : 0;
        const cx = mirX(side, ox0 + 4) - 8;
        const cy = mirY(side, 10.5) - 14;
        fx.addPlane.add(cx, 0.05, cy, 8, 5, 0, 0.3 * k, 0.24 * k, 0.08 * k);
      }
    }
    // Zone tint while a card is selected: red over tiles you cannot deploy on.
    const card = this.selectedCard;
    if (card >= 0) {
      const c = CARDS[CARD_IDS[card]];
      if (c.type !== "spell") {
        const version = (s.alive[3] ? 1 : 0) | (s.alive[4] ? 2 : 0);
        if (this.zoneCard !== card || this.zoneVersion !== version) {
          this.zoneCard = card;
          this.zoneVersion = version;
          for (let y = 0; y < 28; y++)
            for (let x = 0; x < 16; x++) this.zoneRows[y * 16 + x] = inTroopZone(s, 0, x + 0.5, y + 0.5) ? (tileBlocked(s, x + 0.5, y + 0.5) ? 2 : 1) : 0;
        }
        const hc = this.highContrast ? 1.3 : 1;
        for (let y = 0; y < 28; y++) {
          let run = -1;
          for (let x = 0; x <= 16; x++) {
            const out = x < 16 && this.zoneRows[y * 16 + x] === 0 && !(y >= 13 && y < 15);
            if (out && run < 0) run = x;
            if (!out && run >= 0) {
              fx.tint.add(run + (x - run) / 2 - 8, 0.035, y + 0.5 - 14, x - run, 1, 0, Math.min(1, 0.85 * hc), 0.16, 0.1);
              run = -1;
            }
          }
        }
        // Hatched edge along the boundary (not red alone).
        for (let x = 0; x < 16; x++) {
          const y0 = this.zoneRows[14 * 16 + x] || this.zoneRows[12 * 16 + x] ? 8 : 15;
          void y0;
          fx.solid.add(x + 0.5 - 8, 0.04, 15 - 14, 0.5, 0.06, 0.6, 0.95, 0.9, 0.78);
        }
      }
    } else this.zoneCard = -2;
    void K_LOOKOUT;
  }
}

export { MAX_DRAWN };
