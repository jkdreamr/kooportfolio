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
