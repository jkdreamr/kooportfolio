/**
 * The peephole's physics: a pure, fixed-step model of the letter "o" being
 * pulled out of the page. No DOM, no three: everything here is in CSS pixels
 * relative to the letter's resting place and integrates at a fixed 120 Hz,
 * so feel is identical at 30, 60 or 144 frames per second.
 *
 * Model (all masses = 1):
 *  - Letter: a progressive spring toward its anchor, k = K·(1 + (|x|/L)²).
 *    While held the anchor is the rubber-banded pointer (ζ 0.9, follows the
 *    hand with weight); released it is the resting place (ζ 0.42, two or three
 *    visible overshoots).
 *  - Rubber band: pointer distance d maps to d / (1 + d / 2.2L), so the letter
 *    never travels further than 2.2L however far the hand goes, and every extra
 *    pixel costs more effort.
 *  - Tension T = |x| / L. T ≥ 1 held for 80 ms, or an outward flick released
 *    above T 0.85, commits the tear. Below that everything is reversible.
 *  - Angle: an angular spring whose target leans with lateral velocity and,
 *    a little, with the pull, so the letter swings like a hung card.
 *  - Page: a second, softer lagged follower (k 60, ζ 0.5) that the paper's
 *    wide displacement field rides on, so the sheet trails the letter.
 *  - Crack: the preview seam length, growing from T 0.6, closing again when
 *    tension drops; a faint crease remembers the deepest crack.
 */

export const STEP = 1 / 120;
/** Never integrate more than this much wall time in one call (tab switches). */
const MAX_FRAME = 1 / 12;

export type PeepholeTuning = {
  /** Base anchor stiffness (1/s²). */
  k: number;
  zetaHeld: number;
  zetaFree: number;
  /** Lagged page follower. */
  pageK: number;
  pageZeta: number;
  /** Angular spring. */
  angleK: number;
  angleZeta: number;
  /** Tension at which a held pull commits, after `commitHold` seconds. */
  commitT: number;
  commitHold: number;
  /** A release above this tension moving outward faster than flickSpeed·L/s commits. */
  flickT: number;
  flickSpeed: number;
  /** Tension where the preview crack starts. */
  crackT: number;
};

export const DEFAULT_TUNING: PeepholeTuning = {
  k: 180,
  zetaHeld: 0.9,
  zetaFree: 0.42,
  pageK: 60,
  pageZeta: 0.5,
  angleK: 110,
  angleZeta: 0.32,
  commitT: 1,
  commitHold: 0.08,
  flickT: 0.85,
  flickSpeed: 2.4,
  crackT: 0.6,
};

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
export function smoothstep(a: number, b: number, v: number) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The pull length L: the distance at which the page gives. Proportional to the
 * viewport so it costs the same gesture on a phone and a monitor; returning
 * visitors, who know the trick, get a shorter pull.
 */
export function pullLength(vw: number, vh: number, returning = false) {
  const L = clamp(0.28 * Math.min(vw, vh), 140, 260);
  return returning ? L * 0.6 : L;
}

/** Hand distance → letter distance. Monotonic, bounded by 2.2L. */
export function rubberBand(d: number, L: number) {
  return d / (1 + d / (2.2 * L));
}
/** Letter distance → the hand distance that would produce it. */
export function inverseRubberBand(r: number, L: number) {
  const max = 2.2 * L;
  const safe = Math.min(r, max * 0.999);
  return safe / (1 - safe / max);
}
/** Hand distance needed for tension T (T < 2.2). */
export function handDistanceForTension(T: number, L: number) {
  return inverseRubberBand(T * L, L);
}

export type PeepholeEvent = "commit" | "crack" | "settle";

export class PeepholeSim {
  /** Letter offset from rest, px. */
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Letter rotation, radians. */
  angle = 0;
  angVel = 0;
  /** Lagged page follower, px. */
  px = 0;
  py = 0;
  pvx = 0;
  pvy = 0;
  /** Preview crack 0..1 and the faint crease it leaves. */
  crack = 0;
  crease = 0;
  /** Direction (radians) the deepest crack ran in; the crease keeps it. */
  creaseAngle = 0;
  held = false;
  committed = false;
  /** Pull direction at commit, unit vector. */
  commitDirX = 1;
  commitDirY = 0;
  /** Seconds simulated; handy for tests and shader time. */
  time = 0;
  private targetX = 0;
  private targetY = 0;
  private handX = 0;
  private handY = 0;
  private grabX = 0;
  private grabY = 0;
  private over = 0;
  private acc = 0;
  private listeners = new Set<(e: PeepholeEvent) => void>();
  readonly tune: PeepholeTuning;
  L: number;

  constructor(L: number, tune: Partial<PeepholeTuning> = {}) {
    this.L = L;
    this.tune = { ...DEFAULT_TUNING, ...tune };
  }

  on(fn: (e: PeepholeEvent) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private emit(e: PeepholeEvent) {
    for (const fn of this.listeners) fn(e);
  }

  get tension() {
    return Math.hypot(this.x, this.y) / this.L;
  }
  /** True when nothing is moving and nothing is held. */
  get atRest() {
    return (
      !this.held &&
      Math.hypot(this.x, this.y) < 0.05 &&
      Math.hypot(this.vx, this.vy) < 0.5 &&
      Math.abs(this.angle) < 0.001 &&
      Math.abs(this.angVel) < 0.01 &&
      Math.hypot(this.px, this.py) < 0.05 &&
      Math.hypot(this.pvx, this.pvy) < 0.5 &&
      this.crack < 0.001
    );
  }

  /**
   * Take hold of the letter at a pointer position (any frame, e.g. client px).
   * If the letter is still moving the grab is continuous: the hand is placed
   * where it would have to be to hold the letter exactly where it is.
   */
  grab(pointerX: number, pointerY: number) {
    if (this.committed) return;
    const r = Math.hypot(this.x, this.y);
    const hand = inverseRubberBand(r, this.L);
    const s = r > 1e-6 ? hand / r : 1;
    this.grabX = pointerX - this.x * s;
    this.grabY = pointerY - this.y * s;
    this.held = true;
    this.over = 0;
    this.drag(pointerX, pointerY);
  }
  /** Move the held pointer. */
  drag(pointerX: number, pointerY: number) {
    if (!this.held) return;
    this.setHand(pointerX - this.grabX, pointerY - this.grabY);
  }
  /** Set the raw hand displacement from rest directly (keyboard auto-pull). */
  setHand(dx: number, dy: number) {
    this.handX = dx;
    this.handY = dy;
    const d = Math.hypot(dx, dy);
    const r = rubberBand(d, this.L);
    const s = d > 1e-6 ? r / d : 0;
    this.targetX = dx * s;
    this.targetY = dy * s;
  }
  /** Hand displacement the current target corresponds to. */
  get hand() {
    return { x: this.handX, y: this.handY };
  }
  /**
   * Let go. Returns true when the release itself committed (a flick).
   */
  release() {
    if (!this.held) return false;
    this.held = false;
    this.over = 0;
    if (this.committed) return false;
    const r = Math.hypot(this.x, this.y);
    if (r < 1e-6) return false;
    const out = (this.vx * this.x + this.vy * this.y) / r;
    if (r / this.L >= this.tune.flickT && out >= this.tune.flickSpeed * this.L) {
      this.commit();
      return true;
    }
    return false;
  }
  /** Keyboard nudge: an instantaneous velocity change, px/s. */
  impulse(dvx: number, dvy: number) {
    if (this.committed) return;
    this.vx += dvx;
    this.vy += dvy;
  }
  /** Drop everything back toward rest (Esc). */
  reseal() {
    if (this.committed) return;
    this.held = false;
    this.over = 0;
  }
  /** Force the commit (Play link, skip-to-enter). */
  commit() {
    if (this.committed) return;
    this.committed = true;
    const r = Math.hypot(this.x, this.y);
    if (r > 1e-3) {
      this.commitDirX = this.x / r;
      this.commitDirY = this.y / r;
    } else {
      // Unpulled commit (auto-tear): the natural down-right tug.
      const a = 0.42;
      this.commitDirX = Math.cos(a);
      this.commitDirY = Math.sin(a);
    }
    this.emit("commit");
  }
  /** Change L (resize) without a jump: tension is preserved by scaling state. */
  resize(L: number) {
    if (L === this.L || L <= 0) return;
    const s = L / this.L;
    this.x *= s;
    this.y *= s;
    this.vx *= s;
    this.vy *= s;
    this.px *= s;
    this.py *= s;
    this.pvx *= s;
    this.pvy *= s;
    this.grabX *= s;
    this.grabY *= s;
    this.L = L;
    this.setHand(this.handX * s, this.handY * s);
  }

  /** Advance by wall-clock seconds. Returns the number of fixed steps taken. */
  advance(dt: number) {
    this.acc += clamp(dt, 0, MAX_FRAME);
    let n = 0;
    while (this.acc >= STEP - 1e-9) {
      this.acc -= STEP;
      this.tick(STEP);
      n++;
    }
    return n;
  }
  /** Fraction of a step left in the accumulator, for render interpolation. */
  get alpha() {
    return this.acc / STEP;
  }

  private tick(h: number) {
    const t = this.tune;
    const L = this.L;
    this.time += h;
    const wasRest = this.atRest;
    // Letter.
    const r = Math.hypot(this.x, this.y);
    const k = t.k * (1 + (r / L) * (r / L));
    const zeta = this.held ? t.zetaHeld : t.zetaFree;
    const c = 2 * zeta * Math.sqrt(k);
    const ax = this.held ? this.targetX : 0;
    const ay = this.held ? this.targetY : 0;
    const prevVx = this.vx;
    this.vx += (-k * (this.x - ax) - c * this.vx) * h;
    this.vy += (-k * (this.y - ay) - c * this.vy) * h;
    this.x += this.vx * h;
    this.y += this.vy * h;
    // Angle: swing with lateral velocity and acceleration, lean into the pull.
    const T = Math.hypot(this.x, this.y) / L;
    const accelX = (this.vx - prevVx) / h;
    const lean = clamp(this.x / L, -1.2, 1.2) * 0.07 * Math.min(T, 1);
    const swing = clamp(-this.vx / (7 * L), -0.28, 0.28);
    const kick = clamp(-accelX / (220 * L), -0.08, 0.08);
    const target = lean + swing + kick;
    const ca = 2 * t.angleZeta * Math.sqrt(t.angleK);
    this.angVel += (-t.angleK * (this.angle - target) - ca * this.angVel) * h;
    this.angle += this.angVel * h;
    // Page follower.
    const cp = 2 * t.pageZeta * Math.sqrt(t.pageK);
    this.pvx += (-t.pageK * (this.px - this.x) - cp * this.pvx) * h;
    this.pvy += (-t.pageK * (this.py - this.y) - cp * this.pvy) * h;
    this.px += this.pvx * h;
    this.py += this.pvy * h;
    // Crack preview: opens fast, closes a touch slower.
    const want = smoothstep(t.crackT, t.commitT, T);
    const before = this.crack;
    this.crack += (want - this.crack) * (1 - Math.exp(-(want > this.crack ? 14 : 7) * h));
    if (this.crack > this.crease) {
      this.crease = this.crack;
      if (T > 1e-3) this.creaseAngle = Math.atan2(this.y, this.x);
    } else this.crease = Math.max(0, this.crease - h * 0.015);
    if (before < 0.02 && this.crack >= 0.02) this.emit("crack");
    // Commit.
    if (!this.committed) {
      if (this.held && T >= t.commitT) {
        this.over += h;
        if (this.over >= t.commitHold - 1e-9) this.commit();
      } else this.over = 0;
    }
    if (!wasRest && this.atRest) this.emit("settle");
  }
}
