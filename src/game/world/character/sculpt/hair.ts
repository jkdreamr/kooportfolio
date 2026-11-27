/**
 * Sculpted hair (head frame, head-local units): a thin scalp cap clipped by a
 * real hairline, with volumetric locks laid over it. Every lock is a smooth
 * Catmull-Rom path swept by tapered round cones that hug the skull, so the
 * hair reads as clumps with creases between them (the bake's AO darkens the
 * creases) and tapered tips. Styles add partings, fringes or bangs, side
 * locks over the ears, ponytails, buns, braids and curls. Every lock segment
 * is reported so the bake can paint a root→tip gradient and store the strand
 * direction for the shader's anisotropic highlight.
 */
import type { HairStyle } from "../outfit";
import type { Mat, Node, Op, V3 } from "./sdf";

export const HC: V3 = [0, 0.33, 0.01];
/** Scalp ellipsoid (slightly over the analytic skin). */
const SR: V3 = [0.383, 0.366, 0.356];
export type HairSeg = { a: V3; b: V3; t0: number; t1: number; ra: number; rb: number };
export type HairBuild = { ops: Op[]; segs: HairSeg[] };

const len = (v: V3) => Math.hypot(v[0], v[1], v[2]);
const addv = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sdir = (th: number, ph: number): V3 => [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
const ellR = (d: V3) => 1 / Math.sqrt((d[0] / SR[0]) ** 2 + (d[1] / SR[1]) ** 2 + (d[2] / SR[2]) ** 2);
/** Point over the scalp at azimuth th (from +z toward +x), polar ph (from +y). */
export function S(th: number, ph: number, off = 0): V3 {
  const d = sdir(th, ph);
  const r = ellR(d) + off;
  return [HC[0] + d[0] * r, HC[1] + d[1] * r, HC[2] + d[2] * r];
}
/** Push a point out of the scalp (and the jaw/neck column) by `off`. */
function hug(p: V3, off: number): V3 {
  const v: V3 = [p[0] - HC[0], p[1] - HC[1], p[2] - HC[2]];
  const l = len(v) || 1e-6;
  const d: V3 = [v[0] / l, v[1] / l, v[2] / l];
  const r = ellR(d) + off;
  let q: V3 = l < r ? [HC[0] + d[0] * r, HC[1] + d[1] * r, HC[2] + d[2] * r] : p;
  // Below the head, keep clear of the neck and the jaw line.
  if (q[1] < HC[1] - 0.2) {
    const hx = q[0] - HC[0], hz = q[2] - HC[2] + 0.02;
    const hr = Math.hypot(hx, hz) || 1e-6;
    const need = (q[1] < HC[1] - 0.36 ? 0.2 : 0.3) + off;
    if (hr < need) q = [HC[0] + (hx / hr) * need, q[1], HC[2] - 0.02 + (hz / hr) * need];
  }
  return q;
}
function catmull(pts: V3[], per: number): V3[] {
  const out: V3[] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++)
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      out.push([0, 1, 2].map((c) =>
        0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3),
      ) as V3);
    }
  out.push(pts[pts.length - 1]);
  return out;
}

type Lock = { pts: V3[]; r0: number; r1: number; lift?: number; per?: number; k?: number };

/**
 * Hair for a style. `hatClip` keeps hair outside a hat's volume; `hatted`
 * drops what a crowned hat would hide anyway (saves SDF work).
 */
export function buildHair(style: HairStyle, mat: Mat, hatClip: Node[], hatted: boolean, accent?: Mat): HairBuild {
  const segs: HairSeg[] = [];
  const locks: Lock[] = [];
  const lockOps: Op[] = [];
  const extra: Op[] = [];
  const L = (pts: V3[], r0: number, r1: number, o: Partial<Lock> = {}) => locks.push({ pts, r0, r1, ...o });
  let thick = 0.03;
  // Hairline knots: [|theta|, phi] pairs (phi = polar angle from the top).
  let knots = [0, 1.06, 0.42, 0.98, 0.85, 1.16, 1.2, 1.46, 1.42, 1.4, 1.75, 1.4, 2.2, 1.86, Math.PI, 2.06];
  let shift = 0;
  const PI = Math.PI;
  const fringe = (xs: number[], o: { sweep?: number; len?: number; r?: number; lift?: number } = {}) => {
    const sw = o.sweep ?? 0.12, ln = o.len ?? 1.16, r = o.r ?? 0.045, lf = o.lift ?? 0.05;
    for (const th of xs) L([S(th * 0.75, 0.62, 0.0), S(th * 0.95 + sw * 0.4, 0.92, lf), S(th + sw, ln, lf * 0.75)], r, 0.011);
  };
  // Short locks flowing from the crown toward a target band.
  const crown = (n: number, from: [number, number], to: [number, number], ph0: number, ph1: number, r0: number, off = 0.035, tw = 0) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = lerp(from[0], from[1], t), b = lerp(to[0], to[1], t);
      L([S(a, ph0, 0), S(lerp(a, b, 0.55) + tw, lerp(ph0, ph1, 0.55), off * 1.15), S(b + tw, ph1, off * 0.8)], r0, 0.013);
    }
  };
  // A lock that falls from the scalp at azimuth th and hangs to height yEnd
  // (head-frame y relative to HC), flaring out by `flare` and curling the tip
  // in (curl > 0) or out (curl < 0).
  const hang = (th: number, phStart: number, yEnd: number, r0: number, o: { flare?: number; curl?: number; sweep?: number; root?: V3; zb?: number } = {}) => {
    const fl = o.flare ?? 0.05, cu = o.curl ?? 0.02, sw = o.sweep ?? 0;
    const pts: V3[] = [o.root ?? S(th * 0.35, phStart, 0)];
    pts.push(S(th * 0.8, lerp(phStart, 1.25, 0.6), 0.05));
    pts.push(S(th + sw * 0.5, 1.45, 0.06));
    const dir: V3 = [Math.sin(th + sw), 0, Math.cos(th + sw)];
    const zb = o.zb ?? 0;
    const at = (y: number, rad: number): V3 => [HC[0] + dir[0] * rad, HC[1] + y, HC[2] + dir[2] * rad + zb];
    const top = -0.05;
    if (yEnd < top) {
      const mid = (top + yEnd) / 2;
      pts.push(at(mid, 0.4 + fl * 0.6));
      pts.push(at(yEnd + 0.05, 0.4 + fl - cu * 0.3));
      pts.push(at(yEnd, 0.4 + fl - cu));
    }
    L(pts, r0, 0.014, { per: 3 });
  };
  switch (style) {
    case "buzz":
      thick = 0.014;
      knots = [0, 1.02, 0.42, 0.95, 0.85, 1.12, 1.2, 1.42, 1.42, 1.36, 1.75, 1.36, 2.2, 1.8, PI, 2.0];
      break;
    case "crop":
    case "topknot": {
      thick = 0.026;
      if (style === "topknot") {
        // Pulled up into a sangtu topknot.
        const T = addv(HC, [0, 0.39, -0.02]);
        for (let i = 0; i < 12; i++) {
          const th = -PI + (i + 0.5) * (2 * PI / 12);
          const ph = 1.25 + 0.5 * Math.max(0, -Math.cos(th));
          L([S(th, ph - 0.1, 0.005), S(th, ph * 0.55, 0.03), T], 0.05, 0.03);
        }
        if (!hatted) extra.push({ op: "add", k: 0.03, n: { t: "ell", c: addv(T, [0, 0.03, 0]), r: [0.085, 0.075, 0.085], m: mat, disp: { kind: "locks", amp: 0.006, freq: 14, c: addv(T, [0, 0.03, 0]) } } });
        break;
      }
      // Textured crop: chunky locks from the crown forward, short sides.
      crown(7, [-0.5, 0.5], [-0.95, 0.95], 0.28, 1.04, 0.058, 0.04, 0.08);
      crown(5, [PI - 0.9, PI + 0.9], [PI - 1.3, PI + 1.3], 0.32, 1.78, 0.06, 0.03);
      for (const s of [1, -1]) crown(3, [s * 0.65, s * 1.6], [s * 1.05, s * 2.1], 0.45, 1.36, 0.055, 0.03);
      if (!hatted) fringe([-0.38, -0.12, 0.14, 0.4], { sweep: 0.16, len: 1.14, r: 0.044 });
      // A couple of flyaway tips on the crown.
      if (!hatted) for (const th of [0.3, -0.5]) L([S(th + PI, 0.25, 0.01), S(th + PI * 0.9, 0.08, 0.07), S(th * 0.5, 0.18, 0.08)], 0.026, 0.009);
      break;
    }
    case "side": {
      thick = 0.034;
      shift = 0;
      const part = 0.48;
      // Over the top from the parting toward the far side.
      for (let i = 0; i < 7; i++) {
        const ph = 0.3 + i * 0.11;
        L([S(part + 0.02, ph, 0), S(part * 0.2 - 0.35, ph + 0.18, 0.055), S(-0.85 - i * 0.12, ph + 0.5 + i * 0.05, 0.045)], 0.06, 0.014);
      }
      // Short side of the part.
      for (let i = 0; i < 4; i++) L([S(part + 0.08, 0.3 + i * 0.18, 0), S(part + 0.55, 0.62 + i * 0.16, 0.04), S(1.35 + i * 0.1, 1.08 + i * 0.12, 0.03)], 0.05, 0.013);
      crown(5, [PI - 0.9, PI + 0.9], [PI - 1.25, PI + 1.25], 0.35, 1.8, 0.06, 0.035);
      crown(2, [-1.4, -1.9], [-1.5, -2.2], 0.6, 1.4, 0.055, 0.035);
      // Swept fringe crossing the forehead.
      if (!hatted) for (let i = 0; i < 4; i++) L([S(part - 0.05, 0.72 + i * 0.05, 0.01), S(0.1 - i * 0.12, 0.98, 0.06), S(-0.35 - i * 0.18, 1.12 + i * 0.03, 0.04)], 0.05 - i * 0.004, 0.011);
      break;
    }
    case "bob":
    case "layered": {
      const lay = style === "layered";
      thick = 0.042;
      knots = [0, 1.1, 0.5, 1.02, 0.9, 1.3, 1.25, 1.7, 1.6, 1.85, PI, 2.15];
      shift = lay ? 0 : 0.1;
      const part = lay ? 0 : 0.1;
      const yEnd = lay ? -0.42 : -0.34;
      // Locks fall from the parting all round, ending at the jaw.
      const n = lay ? 15 : 13;
      for (let i = 0; i < n; i++) {
        const th = -2.75 + (i / (n - 1)) * 5.5;
        if (Math.abs(th) < 0.7) continue;
        const ph0 = Math.abs(th) > 2.2 ? 0.35 : 0.3 + 0.12 * Math.abs(Math.sin(i * 1.7));
        const longer = lay ? (i % 3 === 0 ? -0.12 : i % 3 === 1 ? 0.04 : -0.04) : Math.abs(th) > 2.4 ? 0.03 : 0;
        hang(th, ph0, yEnd + longer, lay ? 0.058 : 0.064, { root: S(part + Math.sign(th) * 0.05, ph0, 0), flare: lay ? 0.07 : 0.045, curl: lay ? -0.04 : 0.05, sweep: Math.sign(th) * 0.05 });
      }
      for (let i = 0; i < 5; i++) {
        const th = PI - 0.6 + i * 0.3;
        hang(th, 0.25, yEnd - (lay ? 0.1 : 0) + 0.02, 0.066, { flare: 0.04, curl: lay ? -0.03 : 0.05 });
      }
      if (!hatted) {
        if (lay) {
          // Curtain bangs split at the centre.
          for (const s of [1, -1]) for (let i = 0; i < 3; i++)
            L([S(s * 0.06, 0.66 + i * 0.05, 0.01), S(s * (0.18 + i * 0.12), 1.02, 0.06), S(s * (0.5 + i * 0.16), 1.3 + i * 0.07, 0.05), S(s * (0.72 + i * 0.12), 1.55 + i * 0.05, 0.05)], 0.046, 0.012);
        } else fringe([-0.55, -0.33, -0.11, 0.11, 0.33, 0.55], { sweep: 0.03, len: 1.2, r: 0.05, lift: 0.055 });
      }
      break;
    }
    case "long": {
      thick = 0.04;
      knots = [0, 1.08, 0.5, 1.0, 0.9, 1.28, 1.25, 1.7, 1.6, 1.85, PI, 2.15];
      shift = 0.35;
      const part = 0.35;
      for (let i = 0; i < 15; i++) {
        const th = -2.85 + (i / 14) * 5.7;
        if (Math.abs(th - 0.1) < 0.72) continue;
        const front = Math.abs(th) < 1.4;
        const yEnd = front ? -0.62 + 0.05 * (i % 2) : -0.78 + 0.06 * (i % 3);
        hang(th, 0.3 + 0.1 * (i % 2), yEnd, 0.066, { root: S(part + (th > part ? 0.05 : -0.05), 0.3 + 0.1 * (i % 2), 0), flare: front ? 0.0 : 0.05, curl: -0.05, sweep: front ? 0 : 0.0, zb: front ? -0.02 : -0.06 });
      }
      for (let i = 0; i < 4; i++) hang(PI - 0.45 + i * 0.3, 0.3, -0.82 + 0.05 * (i % 2), 0.07, { flare: 0.05, curl: -0.05, zb: -0.08 });
      // Face-framing locks and a soft side-swept fringe.
      if (!hatted) {
        for (let i = 0; i < 3; i++) L([S(part - 0.05, 0.7 + i * 0.06, 0.01), S(0.05 - i * 0.15, 1.0, 0.06), S(-0.42 - i * 0.14, 1.2 + i * 0.05, 0.045), S(-0.72 - i * 0.1, 1.5 + i * 0.05, 0.05)], 0.05, 0.012);
        L([S(part + 0.1, 0.75, 0.01), S(0.65, 1.05, 0.055), S(0.85, 1.4, 0.05)], 0.046, 0.012);
      }
      break;
    }
    case "ponytail":
    case "bun":
    case "braids": {
      thick = 0.026;
      knots = [0, 1.06, 0.42, 0.98, 0.85, 1.16, 1.2, 1.46, 1.42, 1.4, 1.75, 1.42, 2.2, 1.95, PI, 2.12];
      const braids = style === "braids";
      const tie = style === "bun" ? S(PI, 0.62, 0.02) : braids ? S(PI, 1.2, 0.0) : S(PI, 0.82, 0.02);
      // Combed back from the hairline to the tie (a centre parting for braids).
      const n = 14;
      for (let i = 0; i < n; i++) {
        const th = -PI + (i + 0.5) * (2 * PI / n);
        const ph = 1.05 + 0.45 * Math.min(1, Math.abs(th) / 1.6) ** 2;
        const back = Math.abs(th) > 2.4;
        if (braids) {
          const s = th >= 0 ? 1 : -1;
          L([S(s * 0.04, 0.5 + 0.4 * Math.abs(Math.sin(i)), 0), S(th, Math.min(ph - 0.15, 1.3), 0.035), S(s * 2.0, 1.72, 0.03)], 0.05, 0.03);
          continue;
        }
        L([S(th, back ? 1.75 : ph - 0.06, 0.004), S(th * (back ? 1 : 1.12), back ? 1.3 : ph * 0.62, 0.032), tie], 0.05, 0.028);
      }
      if (style === "ponytail") {
        const T = addv(tie, [0, 0, -0.03]);
        extra.push({ op: "add", k: 0.01, n: { t: "tor", c: T, R: 0.042, r: 0.018, rot: [Math.PI / 2 - 0.5, 0, 0], m: accent ?? mat } });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const ox = Math.cos(a) * 0.028, oz = Math.sin(a) * 0.02;
          L([addv(T, [ox * 0.5, 0, -0.02]), addv(T, [ox, -0.06, -0.12 + oz]), addv(T, [ox * 1.5, -0.25, -0.17 + oz]), addv(T, [ox * 1.2 + 0.02, -0.45, -0.1 + oz]), addv(T, [ox * 0.6 + 0.04, -0.58, -0.05])], 0.048, 0.012, { per: 3, lift: 0 });
        }
      }
      if (style === "bun") {
        const B = addv(tie, [0, 0.03, -0.08]);
        extra.push({ op: "add", k: 0.03, n: { t: "ell", c: B, r: [0.135, 0.12, 0.1], m: mat, disp: { kind: "locks", amp: 0.008, freq: 12, c: B } } });
        extra.push({ op: "add", k: 0.012, n: { t: "tor", c: addv(B, [0, 0, 0.02]), R: 0.1, r: 0.032, rot: [Math.PI / 2 - 0.25, 0, 0], m: mat, disp: { kind: "rib", amp: 0.006, freq: 9, c: B } } });
      }
      if (braids)
        for (const s of [1, -1]) {
          // Plaits: alternating tilted beads down over the front of the shoulder.
          const top = S(s * 2.0, 1.72, 0.03);
          const pts: V3[] = [];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            pts.push([top[0] + s * (0.03 + 0.04 * t), top[1] - 0.06 - t * 0.5, top[2] + 0.06 + t * 0.2]);
          }
          pts.forEach((p, i) => {
            if (i === pts.length - 1) return;
            const q = pts[i + 1];
            const c: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
            const r = 0.048 * (1 - i * 0.04);
            extra.push({ op: "add", k: 0.012, n: { t: "ell", c, r: [r, 0.042, r * 0.85], rot: [0.3, 0, (i % 2 ? 0.5 : -0.5)], m: mat } });
            segs.push({ a: p, b: q, t0: 0.3 + i * 0.07, t1: 0.37 + i * 0.07, ra: r, rb: r });
          });
          const end = pts[pts.length - 1];
          extra.push({ op: "add", k: 0.006, n: { t: "tor", c: end, R: 0.03, r: 0.012, m: accent ?? mat } });
          L([end, addv(end, [s * 0.01, -0.06, 0.02]), addv(end, [s * 0.02, -0.11, 0.015])], 0.034, 0.012, { lift: 0 });
        }
      // Loose face-framing strands.
      if (!hatted && !braids) for (const s of [1, -1]) L([S(s * 0.75, 1.0, 0.01), S(s * 0.95, 1.3, 0.03), S(s * 1.05, 1.62, 0.035)], 0.026, 0.009);
      if (braids && !hatted) for (const s of [1, -1]) L([S(s * 0.05, 0.75, 0.01), S(s * 0.4, 1.0, 0.045), S(s * 0.8, 1.2, 0.04)], 0.045, 0.012);
      break;
    }
    case "curly": {
      thick = 0.05;
      knots = [0, 1.06, 0.45, 1.0, 0.9, 1.22, 1.25, 1.5, 1.45, 1.45, 1.75, 1.45, 2.2, 1.9, PI, 2.08];
      // Coils spread over the scalp (golden-angle spiral), smaller at the hairline.
      const N = 46;
      for (let i = 0; i < N; i++) {
        const y = 1 - (i + 0.5) / N * 1.15;
        const ph = Math.acos(Math.max(-1, Math.min(1, y)));
        const th = i * 2.39996;
        const wth = Math.atan2(Math.sin(th), Math.cos(th));
        const lim = 1.0 + 0.5 * Math.min(1, Math.abs(wth) / 1.6) ** 2;
        if (ph > lim + 0.08) continue;
        const edge = ph > lim - 0.2;
        const c = S(wth, ph, edge ? 0.03 : 0.05);
        extra.push({ op: "add", k: 0.02, n: { t: "sph", c, r: edge ? 0.045 : 0.062, m: mat, disp: { kind: "bumps", amp: 0.007, freq: 70 } } });
        segs.push({ a: c, b: addv(c, [0, -0.02, 0]), t0: edge ? 0.7 : 0.4, t1: 0.6, ra: 0.06, rb: 0.06 });
      }
      break;
    }
  }
  // Scalp cap under the locks, clipped by the hairline.
  const capNode: Node = {
    t: "shell",
    of: { t: "ell", c: HC, r: [SR[0] + thick - 0.02, SR[1] + thick - 0.02, SR[2] + thick - 0.02] },
    d: 0,
    m: mat,
    clip: [{ t: "hl", c: HC, knots, shift }],
    disp: style === "buzz" ? { kind: "bumps", amp: 0.003, freq: 90 } : undefined,
  };
  lockOps.push({ op: "add", k: 0, n: capNode });
  for (const lk of locks) {
    const smp = catmull(lk.pts, lk.per ?? 3);
    const n = smp.length;
    const rad = (t: number) => lerp(lk.r0, lk.r1, Math.pow(t, 0.85)) * (1 + 0.18 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t));
    const P = smp.map((p, i) => {
      const t = i / (n - 1);
      return lk.lift === 0 ? p : hug(p, rad(t) * 0.45 + 0.006);
    });
    for (let i = 0; i < n - 1; i++) {
      const t0 = i / (n - 1), t1 = (i + 1) / (n - 1);
      const ra = rad(t0), rb = rad(t1);
      lockOps.push({ op: "add", k: i === 0 ? (lk.k ?? 0.014) : 0.002, n: { t: "cone", a: P[i], b: P[i + 1], ra, rb, m: mat } });
      segs.push({ a: P[i], b: P[i + 1], t0, t1, ra, rb });
    }
  }
  const body: Node = { t: "grp", ops: [...lockOps, ...extra], m: mat };
  const ops: Op[] = [{ op: "add", k: 0.01, n: hatClip.length ? { t: "shell", of: body, d: 0, m: mat, clip: hatClip } : body }];
  return { ops, segs };
}
