/**
 * The match director: dispatches sim events to the 3D pools, the HUD store,
 * sound, juice and the live region (§5), and syncs the HUD at most when a
 * value changes. Owns the scripted moments (intro, tower falls, phases,
 * ceremonies) on the runtime's real-time clock.
 */
import { CARDS, CARD_IDS, UNIT_SPECS, K_BALLOON, type CardId } from "../../core/bannerRush/cards";
import { GLOW_UNIT, KEEP, PH_OVER } from "../../core/bannerRush/constants";
import {
  EV_DEATH,
  EV_DEPLOY,
  EV_END,
  EV_GLOW_FULL,
  EV_HEAL,
  EV_HIT,
  EV_IMPACT,
  EV_KEEP_WAKE,
  EV_KNOCK,
  EV_PHASE,
  EV_POCKET_OPEN,
  EV_REFUSED,
  EV_SHOT,
  EV_SPAWN,
  EV_SPAWN_COOK,
  EV_SPELL,
  EV_SWING,
  EV_TOWER_DOWN,
  HF_KILL,
  HF_SPELL,
  HF_SPLASH,
  HF_SWISH,
  OUTCOME_REASONS,
} from "../../core/bannerRush/types";
import { clockText, fallCallout, fallMessage, refusalText } from "../../core/bannerRush/viewModel";
import { screenOut, tileToScreen } from "./camera";
import { col } from "./Props";
import type { RushKit } from "./kit";
import type { RushRuntime } from "./runtime";
import { camMove } from "./Stage";
import { callout, useRushHud } from "./store";
import { Sfx } from "./sfx";
import type { RushView } from "./view";
import type { A11y } from "./a11y";

const LEAF = col("#7aa04a");
const LEAF2 = col("#c9b25a");
const GRANITE = col("#a9a9a2");
const GRANITE2 = col("#8c8a82");
const ROCK = col("#7a6e62");
const SCALE_Y = Array.from({ length: 101 }, (_, q) => `scaleY(${q / 100})`);
const SCALE_X = Array.from({ length: 101 }, (_, q) => `scaleX(${q / 100})`);

export type MatchEnd = { winner: 0 | 1 | null; reason: string; banners: [number, number]; seconds: number; lowestTheirs: number; tip: string };

export class Director {
  readonly sfx: Sfx;
  /** Glow lantern fill elements (set by the HUD) and the last quantised value. */
  fillEls: (HTMLElement | null)[] = new Array(10).fill(null);
  private fillQ = -1;
  private lanternIndex = -1;
  /** Elements for the cooldown sweep / need ring (affordability) per card. */
  needEls: (HTMLElement | null)[] = [null, null, null, null];
  private needQ = new Int16Array([-1, -1, -1, -1]);
  private lastSecond = -1;
  private lastGlow = -1;
  private lastCards = new Int8Array([-2, -2, -2, -2, -2]);
  private lastBanners = -1;
  private lastPhase = -1;
  private lastTowers = new Int32Array(6).fill(-1);
  private numbers = 0;
  private numberAt = new Float64Array(72);
  private numberAmt = new Int32Array(72);
  private patch: Record<string, unknown> = {};
  ended = false;
  onEnd: ((end: MatchEnd) => void) | null = null;
  tutorial = false;
  firstAir = true;
  capSince = -1;
  hints: { cap: boolean; air: boolean } = { cap: false, air: false };
  constructor(
    private rt: RushRuntime,
    private view: RushView,
    private kit: RushKit,
    private a11y: A11y,
  ) {
    this.sfx = new Sfx(kit);
    rt.sinks.push(this.onEvent);
  }

  private reduced() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** Damage number at a tile (merged per target within 250 ms, ≤ 10 alive). */
  private number(slot: number, x: number, y: number, h: number, amount: number, tone: "great" | "miss" | "good", force = false) {
    if (!this.view.showNumbers || camMove.push > 0.001) return;
    const now = this.rt.now;
    if (!force && now - this.numberAt[slot] < 250) {
      this.numberAmt[slot] += amount;
      return;
    }
    if (this.numbers >= 10) return;
    this.numberAt[slot] = now;
    const total = amount + (now - this.numberAt[slot] < 250 ? 0 : 0);
    this.numberAmt[slot] = 0;
    tileToScreen(x, y, h);
    this.numbers++;
    this.kit.juice.pop(`${total}`, screenOut.x, screenOut.y, tone);
    window.setTimeout(() => this.numbers--, 700);
  }

  // @hot
  private onEvent = (rt: RushRuntime, type: number, a: number, b: number, c: number, d: number, x: number, y: number) => {
    const s = rt.state;
    const now = rt.now;
    const v = this.view;
    const sfx = this.sfx;
    switch (type) {
      case EV_DEPLOY: {
        const card = CARDS[CARD_IDS[b]];
        if (a === 0) {
          this.a11y.say(`You placed ${card.name}, ${x < 8 ? "left" : "right"} side`, 1);
          this.kit.cue("ui-confirm");
        } else this.a11y.say(`They placed ${card.name}, ${x > 8 ? "your left" : "your right"}`, 1);
        if (card.type === "building") {
          window.setTimeout(() => {
            v.dust(x, y, 2.2, rt.now);
            sfx.play("br-deploy", rt.now, x, 1, 1, a);
            if (a === 0) this.kit.juice.shake(0.15);
          }, 220);
        }
        if (a === 1 && UNIT_SPECS[card.unit]?.air && this.firstAir && !this.tutorial) {
          this.firstAir = false;
          if (!this.hints.air) callout("Flying troops: Slingers, Hoopers and Beekeepers can reach them", "info", 2400);
        }
        break;
      }
      case EV_SPAWN:
      case EV_SPAWN_COOK: {
        v.spawnAt[a] = now + (type === EV_SPAWN ? d * 100 : 0);
        const delay = type === EV_SPAWN ? d * 100 + 280 : 280;
        window.setTimeout(() => {
          v.dust(x, y, UNIT_SPECS[b].building ? 2.2 : 1.3, rt.now);
          sfx.play("br-deploy", rt.now, x, 0.9, 1, c);
        }, this.reduced() ? 0 : delay);
        break;
      }
      case EV_SWING:
        v.swingAt[a] = now;
        break;
      case EV_SHOT:
        if (d === 0 || d === 1) sfx.play("br-tower", now, x, 1, 1, s.pSide[a]);
        else if (d === 5) sfx.play("paper", now, x, 0.5, 1, s.pSide[a]);
        else if (d === 7) sfx.play("bounce", now, x, 0.6, 1, s.pSide[a]);
        break;
      case EV_IMPACT: {
        const splash = d / 100;
        if (splash > 0) {
          v.puff(x, y, 0.08, 0.3, splash, 0, 220, 0.55, 0.45, 0.25, true, now);
          sfx.play("br-hit", now, x, 1.2);
        } else v.puff(x, y, 0.08, 0.2, 0.7, 0, 200, 0.4, 0.36, 0.25, true, now);
        if (b === 7) {
          if (c & HF_SWISH) {
            sfx.play("swish", now, x, 0.8);
            v.puff(x, y, 0.1, 0.3, 1.2, 0, 300, 0.8, 0.62, 0.15, true, now);
            tileToScreen(x, y, 1.6);
            this.kit.juice.pop("Swish!", screenOut.x, screenOut.y, "great");
          } else sfx.play("rim", now, x, 0.5);
        }
        break;
      }
      case EV_HIT: {
        v.hitAt[a] = now;
        if (d >= 0 && s.alive[d] && a >= 6) {
          const dx = s.x[a] - s.x[d],
            dy = s.y[a] - s.y[d];
          const n = Math.sqrt(dx * dx + dy * dy) || 1;
          v.hitX[a] = dx / n;
          v.hitY[a] = dy / n;
        }
        if (a < 6) {
          v.towerHitAt[a] = now;
          const mine = s.side[a] === 1;
          this.number(a, x, y, a % 3 === KEEP ? 5.6 : 4.0, b, mine ? "great" : "miss", true);
        } else {
          const show = c & (HF_SPELL | HF_SPLASH | HF_SWISH | HF_KILL);
          if (show) this.number(a, x, y, 1.8, b, s.side[a] === 1 ? "great" : "miss");
          if (!this.reduced() && !(c & HF_SPELL)) for (let k = 0; k < 4; k++) v.puff(x + (k - 1.5) * 0.12, y, 0.8, 0.08, 0.2, 0.2, 120, 0.6, 0.5, 0.3, false, now);
        }
        if (!(c & HF_SPELL)) sfx.play("br-hit", now, x, 1, 1, s.side[a]);
        break;
      }
      case EV_HEAL:
        if (s.hp[a] - b < s.maxHp[a] * 0.6) {
          tileToScreen(x, y, 1.8);
          if (this.view.showNumbers) this.kit.juice.pop(`+${b}`, screenOut.x, screenOut.y, "good");
        }
        break;
      case EV_KNOCK:
        if (!this.reduced()) v.puff(x, y, 0.3, 0.15, 0.4, 0, 250, 0.3, 0.28, 0.2, false, now);
        sfx.play("whoosh", now, x, 0.4);
        break;
      case EV_DEATH: {
        if (a < 6) break;
        const u = UNIT_SPECS[b];
        if (!u.building && !u.air) v.ghost(b, c, x, y, Math.atan2(s.fx[a], s.fy[a]), now);
        const big = u.radius > 0.7;
        if (!this.reduced()) {
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            v.puff(x + Math.cos(ang) * 0.25, y + Math.sin(ang) * 0.25, 0.4, 0.2, big ? 0.6 : 0.4, 0.5, 420, 0.28, 0.27, 0.22, false, now);
          }
          v.burst(x, y, u.air ? 2.4 : 0.6, b === K_BALLOON ? 14 : 6, 1.6, b === K_BALLOON ? col("#c89a5e") : LEAF, 0.12, now);
          if (u.building) v.burst(x, y, 0.5, 10, 1.4, GRANITE, 0.22, now);
        }
        if (b === K_BALLOON) {
          v.puff(x, y, 2.8, 0.4, 2.0, 0, 300, 0.7, 0.55, 0.3, true, now);
          sfx.play("br-crumble", now, x, 0.6);
        }
        sfx.play("br-poof", now, x, 1, big ? 0.6 : 1, c);
        break;
      }
      case EV_TOWER_DOWN:
        this.towerDown(a, b, c, x, y);
        break;
      case EV_KEEP_WAKE:
        v.wakeAt[a] = now;
        callout(a === 0 ? "Your Keep is awake" : "Their Keep is awake", a === 0 ? "bad" : "info", 1400);
        this.a11y.say(a === 0 ? "Your Keep is awake" : "Their Keep is awake", 3);
        sfx.play("br-wake", now, x);
        sfx.haptic("tap");
        break;
      case EV_POCKET_OPEN:
        v.pocketAt = now;
        v.pocketSide = a;
        v.pocketRight = b;
        break;
      case EV_PHASE:
        this.phase(a);
        break;
      case EV_GLOW_FULL:
        if (a === 0) {
          sfx.play("br-glow", now, 8, 1.4, 1);
          this.capSince = now;
        }
        break;
      case EV_SPELL:
        this.spell(a, b, c, d, x, y);
        break;
      case EV_REFUSED:
        if (a === 0 && b !== 7) {
          const need = Math.max(0, Math.ceil(CARDS[CARD_IDS[s.cards[c]]]?.cost - s.glow[0] / GLOW_UNIT));
          callout(refusalText(rt.reasonName(b), need), "bad", 1200);
          this.kit.cue("ui-error");
        }
        break;
      case EV_END:
        this.end(a, b);
        break;
    }
  };

  private towerDown(t: number, scorer: number, banners: number, x: number, y: number) {
    const rt = this.rt;
    const v = this.view;
    const now = rt.now;
    const rm = this.reduced();
    const keep = t % 3 === KEEP;
    const owner = t < 3 ? 0 : 1;
    if (!rm) {
      rt.dip = keep ? 0.25 : 0.35;
      rt.dipUntil = now + (keep ? 500 : 250);
      const n = keep ? 40 : 22;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + k * 0.3;
        const sp = 0.8 + ((k * 7) % 5) * 0.4;
        v.debris(x, y, 1.5 + (k % 4) * 0.5, Math.cos(a) * sp, 2 + (k % 3), Math.sin(a) * sp, 0.3 + (k % 3) * 0.08, k & 1 ? GRANITE : GRANITE2, 0.9, now);
      }
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        v.puff(x + Math.cos(a) * 0.8, y + Math.sin(a) * 0.8, 0.5, 0.5, 1.4, 1.2, 700, 0.3, 0.28, 0.22, false, now);
      }
      this.kit.juice.shake(keep ? 1 : 0.6);
      // Camera push toward the tower.
      const start = now;
      const hold = keep;
      const push = keep ? 0.08 : 0.04;
      camMove.toX = x - 8;
      camMove.toZ = y - 14;
      const tick = () => {
        const tt = rt.now - start;
        if (tt < (keep ? 500 : 250)) camMove.push = push * (tt / (keep ? 500 : 250));
        else if (hold) camMove.push = push;
        else if (tt < 850) camMove.push = push * (1 - (tt - 250) / 600);
        else {
          camMove.push = 0;
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else v.puff(x, y, 0.1, 1, 2.5, 0, 300, 0.3, 0.28, 0.22, true, now);
    this.sfx.play("br-crumble", now, x, keep ? 1.3 : 1);
    const viewer = 0;
    this.a11y.say(fallMessage(viewer, owner as 0 | 1, t % 3, banners), 4);
    window.setTimeout(() => callout(fallCallout(viewer, owner as 0 | 1, t % 3), scorer === 0 ? "gold" : "bad", 1600), 300);
    if (scorer === 0) {
      window.setTimeout(() => this.kit.sound("cheer", { intensity: 0.5 }), 300);
      window.setTimeout(() => this.kit.sound("score"), 1050);
      this.sfx.haptic("score");
      this.view.cmdMood[0] = 1;
      this.view.cmdUntil[0] = now + 1600;
      this.view.cmdMood[1] = 2;
      this.view.cmdUntil[1] = now + 1600;
    } else {
      window.setTimeout(() => this.kit.sound("groan", { intensity: 0.4 }), 300);
      this.sfx.haptic("tower");
      this.view.cmdMood[1] = 1;
      this.view.cmdUntil[1] = now + 1600;
      this.view.cmdMood[0] = 2;
      this.view.cmdUntil[0] = now + 1600;
    }
    // The banner flies from the tower to the score row.
    tileToScreen(x, y, keep ? 5.4 : 4);
    flyBanner(screenOut.x, screenOut.y, scorer, banners, keep, rm);
    // Tower HP labels update through syncHud.
  }

  private phase(p: number) {
    const now = this.rt.now;
    const hud = useRushHud;
    if (p === 1) {
      hud.setState((s) => ({ banner: { text: "Double Glow", sub: "Final minute", key: (s.banner?.key ?? 0) + 1, tone: "gold" } }));
      this.kit.sound("chime");
      window.setTimeout(() => this.kit.sound("whoosh", { gain: 0.6 }), 200);
      this.sfx.haptic("score");
      this.a11y.say("Double Glow: final minute", 3);
    } else if (p === 2) {
      this.rt.freezeUntil = now + 900;
      hud.setState((s) => ({ banner: { text: "Overtime", sub: "Next banner wins", key: (s.banner?.key ?? 0) + 1, tone: "coral" } }));
      this.kit.sound("whistle");
      window.setTimeout(() => this.sfx.play("br-sting", this.rt.now, 8), 350);
      this.sfx.haptic("overtime");
      this.a11y.say("Overtime: next banner wins", 4);
    } else if (p === 3) {
      hud.setState((s) => ({ banner: { text: "Triple Glow", sub: "", key: (s.banner?.key ?? 0) + 1, tone: "gold" } }));
      this.kit.sound("chime", { gain: 0.8 });
    }
  }

  private spell(side: number, card: number, stage: number, e: number, x: number, y: number) {
    const v = this.view;
    const now = this.rt.now;
    const rm = this.reduced();
    if (stage === 0) {
      if (card === 15) {
        this.kit.sound("shuttle", { intensity: 1 });
        this.sfx.play("whoosh", now, x, 0.6);
        this.sfx.haptic("score");
      } else if (card === 16) window.setTimeout(() => this.sfx.play("whoosh", this.rt.now, x, 0.8), 600);
      return;
    }
    if (card === 14) {
      v.stone(e, x, y, side, now);
      v.puff(x, y, 0.06, 0.4, 2.0, 0, 250, 0.45, 0.42, 0.32, true, now);
      this.kit.sound("stone", { gain: 1.6 });
      this.sfx.play("br-hit", now, x);
      if (!rm) this.kit.juice.shake(0.2);
      this.sfx.haptic("tap");
    } else if (card === 16) {
      v.crater(x, y, now);
      v.puff(x, y, 0.08, 0.5, 3.2, 0, 300, 0.8, 0.55, 0.3, true, now);
      if (!rm) {
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          v.puff(x + Math.cos(a) * 1.2, y + Math.sin(a) * 1.2, 0.4, 0.6, 1.3, 0.8, 500, 0.35, 0.3, 0.24, false, now);
        }
        v.burst(x, y, 0.4, 14, 2.4, ROCK, 0.25, now);
        this.kit.juice.shake(0.5);
        this.kit.juice.flash("great");
      }
      this.sfx.play("br-crumble", now, x, 0.8);
      this.sfx.haptic("score");
    } else if (card === -1) {
      v.puff(x, y, 2.6, 0.5, 2.0, 0, 300, 0.7, 0.5, 0.25, true, now);
    }
    void LEAF2;
  }

  private end(winner: number, reason: number) {
    if (this.ended) return;
    this.ended = true;
    const s = this.rt.state;
    const theirs = [3, 4, 5].filter((t) => s.alive[t]).map((t) => s.hp[t]);
    this.onEnd?.({
      winner: winner < 0 ? null : (winner as 0 | 1),
      reason: OUTCOME_REASONS[reason],
      banners: [s.banners[0], s.banners[1]],
      seconds: Math.round(s.endTick / 20),
      lowestTheirs: theirs.length ? Math.min(...theirs) : 0,
      tip: "",
    });
  }

  /** New HUD elements: rewrite every transform on the next frame. */
  refill() {
    this.lanternIndex = -1;
    this.fillQ = -1;
    this.needQ.fill(-1);
  }

  /** Per frame: Glow fill (precomputed transforms, only when changed) and the HUD store (only on change). */
  // @hot
  frame() {
    const rt = this.rt;
    const s = rt.state;
    const glow = s.glow[0] / GLOW_UNIT;
    const whole = Math.floor(glow);
    if (whole !== this.lanternIndex) {
      // Whole lanterns change rarely: write all ten once.
      for (let k = 0; k < 10; k++) {
        const el = this.fillEls[k];
        if (el && k !== whole) el.style.transform = SCALE_Y[k < whole ? 100 : 0];
      }
      this.lanternIndex = whole;
      this.fillQ = -1;
    }
    if (whole < 10) {
      const el = this.fillEls[whole];
      const q = Math.floor((glow - whole) * 100);
      if (el && q !== this.fillQ) {
        this.fillQ = q;
        el.style.transform = SCALE_Y[q];
      }
    }
    for (let k = 0; k < 4; k++) {
      const el = this.needEls[k];
      if (!el) continue;
      const c = s.cards[k];
      const cost = c >= 0 ? CARDS[CARD_IDS[c]].cost : 0;
      const q = cost ? Math.min(100, Math.floor((glow / cost) * 100)) : 100;
      if (q !== this.needQ[k]) {
        this.needQ[k] = q;
        el.style.transform = SCALE_X[q];
      }
    }
    // Text values, at most when they change.
    const regSeconds = s.phase >= 2 ? Math.max(0, (s.otEnd - s.tick) / 20) : Math.max(0, (s.regEnd - s.tick) / 20);
    const second = Math.ceil(regSeconds);
    let changed = false;
    const patch = this.patch;
    for (const k in patch) delete patch[k];
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      patch.seconds = second;
      changed = true;
      if (s.phase !== PH_OVER && s.tick > 0) {
        if (second <= 10 && second > 0) this.sfx.play("br-tick", rt.now, 8, 1);
        if (second === 30 || second === 10) this.a11y.say(`${second} seconds left`, 3);
      }
    }
    if (whole !== this.lastGlow) {
      if (whole > this.lastGlow && this.lastGlow >= 0 && whole <= 10) this.sfx.play("br-glow", rt.now, 8, 0.35, (whole - 1) / 9);
      this.lastGlow = whole;
      patch.glow = whole;
      changed = true;
    }
    let handChanged = false;
    for (let k = 0; k < 5; k++)
      if (this.lastCards[k] !== s.cards[k]) {
        this.lastCards[k] = s.cards[k];
        handChanged = true;
      }
    if (handChanged) {
      patch.hand = [0, 1, 2, 3].map((k) => (s.cards[k] >= 0 ? (CARD_IDS[s.cards[k]] as CardId) : null));
      patch.next = s.hideNext || s.cards[4] < 0 ? null : CARD_IDS[s.cards[4]];
      changed = true;
    }
    const banners = s.banners[0] * 10 + s.banners[1];
    if (banners !== this.lastBanners) {
      this.lastBanners = banners;
      patch.banners = [s.banners[0], s.banners[1]];
      changed = true;
    }
    if (s.phase !== this.lastPhase) {
      this.lastPhase = s.phase;
      patch.phase = s.phase;
      changed = true;
    }
    let towersChanged = false;
    for (let t = 0; t < 6; t++)
      if (this.lastTowers[t] !== s.hp[t]) {
        this.lastTowers[t] = s.hp[t];
        towersChanged = true;
      }
    if (towersChanged) {
      patch.towers = [0, 1, 2, 3, 4, 5].map((t) => (s.alive[t] ? s.hp[t] : 0));
      patch.towerMax = [0, 1, 2, 3, 4, 5].map((t) => s.maxHp[t]);
      changed = true;
    }
    if (changed) useRushHud.setState({ ...patch });
    // First three matches: Glow full for 2 s.
    if (this.capSince > 0 && s.glow[0] >= 1680 && rt.now - this.capSince > 2000 && !this.hints.cap) {
      this.hints.cap = true;
      callout("Glow is full: play a card", "info", 1800);
    }
    if (s.glow[0] < 1680) this.capSince = -1;
    void clockText;
  }
}

/** The DOM pennant that flies from a fallen tower to its slot in the score row. */
function flyBanner(x: number, y: number, scorer: number, banners: number, keep: boolean, reduced: boolean) {
  const slot = document.querySelector<HTMLElement>(`.br-banners[data-side="${scorer}"] .br-pennant:nth-child(${Math.min(3, banners)})`);
  const root = document.querySelector<HTMLElement>(".br-root");
  if (!slot || !root) return;
  const count = keep ? 3 : 1;
  for (let k = 0; k < count; k++) {
    const el = document.createElement("div");
    el.className = `br-fly ${scorer === 0 ? "mine" : "theirs"}`;
    el.setAttribute("aria-hidden", "true");
    root.append(el);
    const target = (keep ? document.querySelector<HTMLElement>(`.br-banners[data-side="${scorer}"] .br-pennant:nth-child(${k + 1})`) : slot) ?? slot;
    const r = target.getBoundingClientRect();
    const tx = r.left + r.width / 2,
      ty = r.top + r.height / 2;
    const mx = (x + tx) / 2,
      my = Math.min(y, ty) - 120;
    const frames: Keyframe[] = reduced
      ? [
          { transform: `translate(${tx}px, ${ty}px)`, opacity: 0 },
          { transform: `translate(${tx}px, ${ty}px)`, opacity: 1 },
        ]
      : [0, 0.25, 0.5, 0.75, 1].map((t) => {
          const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * mx + t * t * tx;
          const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * my + t * t * ty;
          const sc = t < 0.5 ? 1 + 1.2 * t : 1.6 - 1.2 * (t - 0.5);
          return { transform: `translate(${px}px, ${py}px) scale(${sc})`, opacity: t === 0 ? 0 : 1 };
        });
    const anim = el.animate(frames, { duration: reduced ? 300 : 900, delay: 150 + k * 200, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
    anim.onfinish = () => {
      el.remove();
      target.animate([{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
      target.classList.add("won");
    };
  }
}
