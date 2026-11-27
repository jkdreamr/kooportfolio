/**
 * Feedback kit, pure part: timings, motion curves, the node pool and the
 * haptic patterns. No DOM here (see Juice.tsx), so all of it is testable.
 */
export const POP_MS = 700;
export const POP_RISE = 28;
export const RING_MS = 350;
export const RING_FROM = 12;
export const RING_TO = 64;
export const CONFETTI_MS = 1400;
export const SHAKE_MS = 220;
export const SHAKE_PX = 6;
export const FLASH_MS = 90;
export const FLASH_OPACITY = 0.1;
export const MAX_NODES = 40;
export const EASE = "cubic-bezier(.2,.8,.2,1)";

export type Tone = "good" | "great" | "miss";
export const TONES: Readonly<Record<Tone, string>> = {
  good: "#c0dc91",
  great: "#ffd97a",
  miss: "#e89a8a",
};
export const CONFETTI_COLOURS = ["#ffd97a", "#c0dc91", "#8fc6e8", "#e89a8a", "#f5f4e9"] as const;

/**
 * Screen shake: three damped oscillations over SHAKE_MS. Returns the offset
 * in px at time `ms` for a strength 0–1 (0.3 a hit, 1 a big moment).
 */
export function shakeOffset(ms: number, strength: number): [number, number] {
  if (ms <= 0 || ms >= SHAKE_MS) return [0, 0];
  const u = ms / SHAKE_MS;
  const amp = Math.max(0, Math.min(1, strength)) * SHAKE_PX * (1 - u) * (1 - u);
  const phase = 2 * Math.PI * 3 * u;
  return [amp * Math.sin(phase), amp * 0.6 * Math.sin(phase * 1.3 + 1.1)];
}

/** Keyframes for a shake, sampled every ~16 ms (transforms only). */
export function shakeKeyframes(strength: number): Keyframe[] {
  const steps = Math.ceil(SHAKE_MS / 16);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const [x, y] = shakeOffset((i / steps) * SHAKE_MS, strength);
    return { transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, offset: i / steps };
  });
}

export type Piece = { vx: number; vy: number; spin: number; colour: string; x: number };
/** Confetti pieces: random horizontal speed ±220 px/s, spin ±540°/s. */
export function confettiPieces(n: number, width: number, rnd: () => number = Math.random): Piece[] {
  return Array.from({ length: Math.max(0, Math.min(n, MAX_NODES)) }, (_, i) => ({
    x: width * (0.15 + 0.7 * rnd()),
    vx: (rnd() * 2 - 1) * 220,
    vy: -(80 + rnd() * 160),
    spin: (rnd() * 2 - 1) * 540,
    colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
  }));
}

/** Where a piece is after `t` seconds: gravity 520 px/s², as a transform. */
export function pieceAt(p: Piece, t: number) {
  const x = p.vx * t,
    y = p.vy * t + 0.5 * 520 * t * t,
    r = p.spin * t;
  return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(0)}deg)`;
}

export function pieceKeyframes(p: Piece): Keyframe[] {
  const steps = 8,
    total = CONFETTI_MS / 1000;
  return Array.from({ length: steps + 1 }, (_, i) => ({
    transform: pieceAt(p, (i / steps) * total),
    opacity: i < steps - 2 ? 1 : (steps - i) / 2,
    offset: i / steps,
  }));
}

/**
 * A fixed pool of reusable slots. Acquiring past the limit recycles the
 * oldest slot, so the effects layer never holds more than `max` nodes.
 */
export class SlotPool<T> {
  private free: T[] = [];
  private busy: T[] = [];
  private made = 0;
  constructor(
    private make: () => T,
    private reset: (item: T) => void,
    readonly max = MAX_NODES,
  ) {}
  acquire(): T {
    let item = this.free.pop();
    if (!item) {
      if (this.made < this.max) {
        item = this.make();
        this.made++;
      } else {
        item = this.busy.shift()!;
        this.reset(item);
      }
    }
    this.busy.push(item);
    return item;
  }
  release(item: T) {
    const i = this.busy.indexOf(item);
    if (i < 0) return;
    this.busy.splice(i, 1);
    this.reset(item);
    this.free.push(item);
  }
  get size() {
    return this.made;
  }
  get inUse() {
    return this.busy.length;
  }
}

export type Haptic = "tap" | "score" | "win";
export const HAPTICS: Readonly<Record<Haptic, number | number[]>> = {
  tap: 8,
  score: [10, 30, 10],
  win: [20, 40, 60],
};

/** Projects normalised device coordinates to a point in a rectangle (px). */
export function ndcToScreen(ndc: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }): [number, number] {
  return [rect.left + ((ndc.x + 1) / 2) * rect.width, rect.top + ((1 - ndc.y) / 2) * rect.height];
}

/* ------------------------------------------------------ banner and clock */

/** A centred banner line ("Heating up", "It's good!"): on screen 900 ms. */
export const BANNER_MS = 900;
/** Slow-motion eases back to full speed over this long after its hold. */
export const SLOWMO_RELEASE_MS = 120;
/** Longest hold a single call may ask for (a stuck caller cannot freeze a game). */
export const SLOWMO_MAX_MS = 5000;
export const HITSTOP_MAX_MS = 250;

type ClockEffect = { scale: number; start: number; hold: number; release: number };

/** Time scale of one effect at `now`: `scale` for the hold, then a linear
 * ease back to 1 over `release`; 1 before the start and once it is over. */
export function effectScale(e: ClockEffect, now: number): number {
  const t = now - e.start;
  if (t < 0) return 1;
  if (t < e.hold) return e.scale;
  if (e.release > 0 && t < e.hold + e.release) return e.scale + (1 - e.scale) * ((t - e.hold) / e.release);
  return 1;
}

export type GameClock = {
  /** Current multiplier for a game's simulation `dt` (0 during a hit-stop). */
  readonly scale: number;
  /** `dt × scale`: what a game's step loop should advance by. */
  scaled(dt: number): number;
  /** Runs the game at `scale` (0–1) for `ms`, then eases back to 1 over
   * SLOWMO_RELEASE_MS. Overlapping calls: the slowest wins at each moment.
   * Returns a function that ends this one early. */
  slowMo(scale: number, ms: number): () => void;
  /** Freezes the simulation for `ms` (≤ 250), with no ease back. */
  hitStop(ms: number): () => void;
  /** Clears every effect (a game calls this when it ends or unmounts). */
  reset(): void;
};

/**
 * A game clock. `now` is in ms; `reduced()` true (prefers-reduced-motion)
 * makes every call a no-op, so the scale stays 1. Slow-motion and hit-stop
 * scale only the simulation that reads this; never the render loop, the
 * audio clock or the world clocks.
 */
export function createGameClock(
  now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  reduced: () => boolean = () => false,
): GameClock {
  let effects: ClockEffect[] = [];
  const add = (scale: number, ms: number, release: number) => {
    if (reduced() || !(ms > 0)) return () => {};
    const e: ClockEffect = { scale: Math.max(0, Math.min(1, Number.isFinite(scale) ? scale : 1)), start: now(), hold: ms, release };
    effects.push(e);
    return () => {
      effects = effects.filter((x) => x !== e);
    };
  };
  const scaleNow = () => {
    if (!effects.length) return 1;
    const t = now();
    let s = 1;
    for (const e of effects) s = Math.min(s, effectScale(e, t));
    effects = effects.filter((e) => t - e.start < e.hold + e.release);
    return s;
  };
  return {
    get scale() {
      return scaleNow();
    },
    scaled: (dt) => dt * scaleNow(),
    slowMo: (scale, ms) => add(scale, Math.min(ms, SLOWMO_MAX_MS), SLOWMO_RELEASE_MS),
    hitStop: (ms) => add(0, Math.min(ms, HITSTOP_MAX_MS), 0),
    reset: () => {
      effects = [];
    },
  };
}

const prefersReduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/**
 * The shared game clock. Game step loops multiply their `dt` by
 * `gameClock.scale` (or call `gameClock.scaled(dt)`); `juice.hitStop` and
 * `juice.slowMo` drive it.
 */
export const gameClock: GameClock = createGameClock(undefined, prefersReduced);

/** Banner keyframes: a short rise and fade in, hold, fade out (opacity only
 * with reduced motion). */
export function bannerKeyframes(still: boolean): Keyframe[] {
  const frames: Keyframe[] = [
    { opacity: 0, transform: "translateY(8px) scale(0.96)" },
    { opacity: 1, offset: 0.15, transform: "translateY(0px) scale(1)" },
    { opacity: 1, offset: 0.75, transform: "translateY(0px) scale(1)" },
    { opacity: 0, transform: "translateY(-6px) scale(1)" },
  ];
  return still ? frames.map(({ opacity, offset }) => (offset === undefined ? { opacity } : { opacity, offset })) : frames;
}
