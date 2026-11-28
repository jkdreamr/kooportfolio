/**
 * Regatta Grand Prix courses (PLAN_GAMES §2.2), pure. A course is a list of
 * segments (length, curvature): a straight has κ = 0, an arc of radius R has
 * ±1/R (+ turns left). The boat lives in course coordinates: `s` along the
 * centre line, `d` across it (+ is left).
 *
 * The plan is 2D (X, Y) with heading ψ measured counter-clockwise from +X;
 * the scene maps it to the world as x = X, z = −Y.
 */
export const HALF_WIDTH = 9.0;
export const SHALLOWS = 7.5;
export const APEX_D = 7.4;
export const LINE_APEX_D = 6.4;
export const SAMPLE = 0.5;

export type Segment = { length: number; k: number };
export type Bend = { s0: number; s1: number; k: number; apexS: number; /** Signed apex buoy offset (inside). */ apexD: number };
export type Chevron = { s: number; d: number };
export type CourseId = "loop" | "river";
export type Course = {
  id: CourseId;
  name: string;
  closed: boolean;
  /** One lap (closed) or the whole run. */
  length: number;
  segments: readonly Segment[];
  n: number;
  x: Float32Array;
  y: Float32Array;
  h: Float32Array;
  k: Float32Array;
  bends: Bend[];
  /** Checkpoints within a lap (the start line is 0). */
  checkpoints: number[];
  chevrons: Chevron[];
  /** Bridge piers at d = ±3.2 at this s (one per course, on a straight). */
  bridge: number;
  /** Pedal boats: s of each crossing path. */
  pedals: number[];
};

const arc = (R: number, deg: number, left: boolean): Segment => ({
  length: (R * deg * Math.PI) / 180,
  k: (left ? 1 : -1) / R,
});
const straight = (length: number): Segment => ({ length, k: 0 });

const LOOP_HALF: Segment[] = [
  straight(60),
  arc(22, 90, true),
  straight(25),
  arc(14, 60, false),
  arc(14, 60, true),
  straight(20),
  arc(16, 90, true),
];
const RIVER: Segment[] = [
  straight(80),
  arc(30, 70, true),
  straight(40),
  arc(18, 110, false),
  straight(30),
  arc(14, 80, true),
  arc(14, 80, false),
  straight(60),
  arc(24, 60, false),
  arc(24, 100, true),
  straight(70),
];

function build(id: CourseId, name: string, closed: boolean, segments: Segment[], mirror = false): Course {
  const segs = mirror ? segments.map((s) => ({ length: s.length, k: -s.k })) : segments;
  const length = segs.reduce((a, s) => a + s.length, 0);
  const n = Math.ceil(length / SAMPLE) + 1;
  const x = new Float32Array(n),
    y = new Float32Array(n),
    h = new Float32Array(n),
    k = new Float32Array(n);
  // Integrate exactly per segment (arcs in closed form), sampled every SAMPLE.
  let X = 0,
    Y = 0,
    H = 0,
    seg = 0,
    segStart = 0,
    sx = 0,
    sy = 0,
    sh = 0;
  const bends: Bend[] = [];
  let acc = 0;
  for (const s of segs) {
    if (s.k !== 0) {
      const apexS = acc + s.length / 2;
      bends.push({ s0: acc, s1: acc + s.length, k: s.k, apexS, apexD: Math.sign(s.k) * APEX_D });
    }
    acc += s.length;
  }
  for (let i = 0; i < n; i++) {
    const s = Math.min(length, i * SAMPLE);
    while (seg < segs.length - 1 && s > segStart + segs[seg].length) {
      // Close the segment exactly, then start the next.
      const L = segs[seg].length,
        kk = segs[seg].k;
      [sx, sy, sh] = advance(sx, sy, sh, kk, L);
      segStart += L;
      seg++;
    }
    const u = s - segStart;
    [X, Y, H] = advance(sx, sy, sh, segs[seg].k, u);
    x[i] = X;
    y[i] = Y;
    h[i] = H;
    k[i] = segs[seg].k;
  }
  const cps = closed ? [length / 3, (2 * length) / 3] : [115, 230, 345];
  // Chevrons: on the two longest straights, off the centre line.
  const straights: { s0: number; len: number }[] = [];
  acc = 0;
  for (const s of segs) {
    if (s.k === 0) straights.push({ s0: acc, len: s.length });
    acc += s.length;
  }
  const longest = [...straights].sort((a, b) => b.len - a.len).slice(0, 2);
  const chevrons = longest.map((st, i) => ({ s: st.s0 + st.len * 0.55, d: i % 2 ? -4.5 : 4.5 }));
  const third = straights.length > 2 ? [...straights].sort((a, b) => b.len - a.len)[2] : longest[0];
  const bridge = third.s0 + third.len * 0.5;
  const pedals = bends.length >= 3 ? [bends[1].s1 + 8, bends[bends.length - 1].s0 - 10] : [];
  return { id, name, closed, length, segments: segs, n, x, y, h, k, bends, checkpoints: cps, chevrons, bridge, pedals };
}

function advance(x: number, y: number, h: number, k: number, u: number): [number, number, number] {
  if (k === 0) return [x + Math.cos(h) * u, y + Math.sin(h) * u, h];
  const R = 1 / k,
    h2 = h + k * u;
  return [x + R * (Math.sin(h2) - Math.sin(h)), y - R * (Math.cos(h2) - Math.cos(h)), h2];
}

const cache = new Map<string, Course>();
export function course(id: CourseId, mirror = false): Course {
  const key = `${id}${mirror ? "-m" : ""}`;
  let c = cache.get(key);
  if (!c) {
    c = id === "loop" ? build("loop", "Lagoon Loop", true, [...LOOP_HALF, ...LOOP_HALF], mirror) : build("river", "River Run", false, RIVER, mirror);
    cache.set(key, c);
  }
  return c;
}

/** s wrapped into one lap (closed) or clamped (open). */
export const wrapS = (c: Course, s: number) =>
  c.closed ? ((s % c.length) + c.length) % c.length : Math.max(0, Math.min(c.length, s));

function index(c: Course, s: number) {
  const f = wrapS(c, s) / SAMPLE;
  const i = Math.min(c.n - 2, Math.max(0, Math.floor(f)));
  return [i, f - i] as const;
}
/** Curvature at s (piecewise constant). */
export function kappa(c: Course, s: number): number {
  const [i, f] = index(c, s);
  return f < 0.5 ? c.k[i] : c.k[i + 1];
}
/** Centre-line heading at s. */
export function headingAt(c: Course, s: number): number {
  const [i, f] = index(c, s);
  return c.h[i] + (c.h[i + 1] - c.h[i]) * f;
}
export type Vec2 = { x: number; y: number };
/** World-plan point of (s, d), written into `out`. */
export function toPlan(c: Course, s: number, d: number, out: Vec2): Vec2 {
  const [i, f] = index(c, s);
  const cx = c.x[i] + (c.x[i + 1] - c.x[i]) * f,
    cy = c.y[i] + (c.y[i + 1] - c.y[i]) * f,
    h = c.h[i] + (c.h[i + 1] - c.h[i]) * f;
  out.x = cx - Math.sin(h) * d;
  out.y = cy + Math.cos(h) * d;
  return out;
}

/** The bend containing or next after s (within one lap), and its index. */
export function bendAhead(c: Course, s: number, within = Infinity): Bend | null {
  const w = wrapS(c, s);
  let best: Bend | null = null,
    gap = within;
  for (const b of c.bends) {
    let g = b.s0 - w;
    if (w >= b.s0 && w <= b.s1) g = 0;
    if (g < 0 && c.closed) g += c.length;
    if (g >= 0 && g < gap) {
      gap = g;
      best = b;
    }
  }
  return best;
}

/**
 * The racing line's offset at s: outside at entry, inside at the apex
 * (|d| = 5.4, a hull and its bow sweep clear of the buoy), outside at exit, blended with a cos² window reaching 14 u
 * beyond each bend. Bends close together (the chicane) add, then clamp.
 */
export function lineOffset(c: Course, s: number): number {
  const w = wrapS(c, s);
  let d = 0;
  for (const b of c.bends) {
    const half = (b.s1 - b.s0) / 2 + 14;
    let u = (w - b.apexS) / half;
    if (c.closed && u > 1) u = (w - c.length - b.apexS) / half;
    if (c.closed && u < -1) u = (w + c.length - b.apexS) / half;
    if (u <= -1 || u >= 1) continue;
    const win = Math.cos((u * Math.PI) / 2) ** 2;
    d += Math.sign(b.k) * LINE_APEX_D * Math.cos(u * Math.PI * 0.75) * win;
  }
  return Math.max(-LINE_APEX_D, Math.min(LINE_APEX_D, d));
}
