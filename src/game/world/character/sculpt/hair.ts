/**
 * Sculpted hair (head frame, head-local units). Hair is explicit geometry,
 * not an iso-surface: a scalp cap meshed up to a real hairline, an inner
 * curtain under long styles, and volumetric clumps swept along smooth
 * Catmull-Rom paths with an almond cross-section that tapers to a pointed
 * tip. Every triangle is spent on visible, well-shaped surface, every vertex
 * knows its root→tip position and strand direction (for the gradient and the
 * shader's anisotropic highlight), and the bake darkens the creases between
 * clumps with AO from an SDF stand-in. Blobby parts (buns, curls, braids,
 * ties) stay SDF in the head piece. Styles add partings, fringes or bangs,
 * side locks over the ears, ponytails, buns, braids and curls; hats cull
 * whatever they cover.
 */
import type { HairStyle } from "../outfit";
import { SLOT, type Mat, type Node, type Op, type V3 } from "./sdf";
import { emptyMesh, orient, vertexNormals, appendMesh, type AttrMesh } from "./head";

export const HC: V3 = [0, 0.33, 0.01];
/** Scalp ellipsoid (slightly over the analytic skin). */
const SR: V3 = [0.383, 0.366, 0.356];
export type HairSeg = { a: V3; b: V3; t0: number; t1: number; ra: number; rb: number };
type Curtain = { yEnd: number; back: number; front: number; flare: number };
/** Lock flow over the scalp cap: grooves radiate from a whorl (or converge
 * on a tie) at unit direction `w` from the head centre. */
export type Flow = { w: V3; locks: number; amp: number; swirl: number };
/** A closed hanging hair mass (bob, long, layered): grooved locks from the
 * crown down to scalloped, pointed tips, with an inner surface. */
export type Hood = {
  /** Front edge azimuth (radians from the face); the hood wraps the back. */
  span: number; yEnd: number; locks: number; flare: number; curl: number;
  rad: number; zb: number; tip: number; vary: number[]; thick: number;
};
/** Curl bulbs (curly): direction from the head centre and radius. */
export type Coil = { d: V3; r: number };
export type HairBuild = {
  /** SDF hair blobs for the head piece (buns, braids, ties). */
  ops: Op[];
  segs: HairSeg[];
  clumps: Lock[];
  cap: { thick: number; knots: number[]; shift: number };
  curtain: Curtain | null;
  flow?: Flow;
  hood?: Hood;
  coils?: Coil[];
  rough: number;
};

const len = (v: V3) => Math.hypot(v[0], v[1], v[2]);
const norm3 = (v: V3): V3 => { const l = len(v) || 1e-9; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v: V3): V3 => [+v[0].toFixed(4), +v[1].toFixed(4), +v[2].toFixed(4)];
const addv = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothf = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
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

/** A clump: control points, width and thickness at root and tip. */
type Lock = { pts: V3[]; r0: number; r1: number; th0?: number; th1?: number; lift?: number; per?: number; k?: number };

/**
 * Hair for a style. `hatClip` keeps hair outside a hat's volume; `hatted`
 * drops what a crowned hat would hide anyway (saves SDF work).
 */
export function buildHair(style: HairStyle, mat: Mat, hatClip: Node[], hatted: boolean, accent?: Mat): HairBuild {
  const segs: HairSeg[] = [];
  const locks: Lock[] = [];
  const extra: Op[] = [];
  const L = (pts: V3[], w0: number, w1: number, o: Partial<Lock> = {}) => locks.push({ pts, r0: w0, r1: w1, ...o });
  let thick = 0.03;
  // Hairline knots: [|theta|, phi] pairs (phi = polar angle from the top).
  let knots = [0, 1.06, 0.42, 0.98, 0.85, 1.16, 1.2, 1.46, 1.42, 1.4, 1.75, 1.4, 2.2, 1.9, Math.PI, 2.08];
  let shift = 0;
  const PI = Math.PI;
  let flow: Flow | undefined;
  let hood: Hood | undefined;
  let coils: Coil[] | undefined;
  const curtain: Curtain | null = null;
  switch (style) {
    case "buzz":
      thick = 0.016;
      knots = [0, 1.02, 0.42, 0.95, 0.85, 1.12, 1.2, 1.42, 1.42, 1.36, 1.75, 1.36, 2.2, 1.85, PI, 2.02];
      flow = { w: sdir(PI, 0.45), locks: 22, amp: 0.3, swirl: 0.3 };
      break;
    case "topknot": {
      thick = 0.024;
      const T = addv(HC, [0, 0.39, -0.02]);
      // Combed up to the knot: the cap's grooves converge on it.
      flow = { w: norm3([0, 1, -0.05]), locks: 16, amp: 0.55, swirl: 0 };
      if (!hatted) extra.push({ op: "add", k: 0.03, n: { t: "ell", c: addv(T, [0, 0.03, 0]), r: [0.085, 0.075, 0.085], m: mat, disp: { kind: "locks", amp: 0.006, freq: 14, c: addv(T, [0, 0.03, 0]) } } });
      break;
    }
    case "crop": {
      thick = 0.022;
      // Textured crop: chunky clumps from the crown forward with lifted
      // tips, combed down at the back and sides.
      // Under headwear the grooved cap alone shows (clumps would emerge
      // from under the brim as flat stubs).
      if (!hatted) for (let i = 0; i < 6; i++) {
        const t = i / 5, a = lerp(-0.85, 0.85, t);
        L([S(a * 0.35 + PI, 0.35, 0), S(a * 0.3, 0.12, 0.035), S(a * 0.8 + 0.08, 0.7, 0.05), S(a + 0.18, 1.06, 0.045)], 0.15, 0.04, { th0: 0.05, th1: 0.03 });
      }
      flow = { w: sdir(PI, 0.42), locks: 18, amp: 0.55, swirl: 0.25 };
      if (!hatted) for (const sd of [1, -1]) for (let i = 0; i < 3; i++) {
        const a = sd * (1.0 + i * 0.45);
        L([S(a * 0.6, 0.45, 0), S(a, 0.95, 0.035), S(a + sd * 0.15, 1.42, 0.022)], 0.15, 0.05, { th0: 0.042, th1: 0.022 });
      }
      if (!hatted) {
        for (const a of [-0.32, 0.02, 0.36]) L([S(a * 0.6, 0.7, 0.02), S(a + 0.08, 0.98, 0.06), S(a + 0.2, 1.12, 0.07)], 0.12, 0.035, { th0: 0.045, th1: 0.03 });
        for (const a of [0.4, -0.6]) L([S(a + PI, 0.28, 0.02), S(a * 0.6 + PI * 0.92, 0.1, 0.07), S(a * 0.3, 0.2, 0.09)], 0.06, 0.018, { th0: 0.03, th1: 0.016 });
      }
      break;
    }
    case "side": {
      thick = 0.026;
      const part = 0.5;
      // Long top swept from the side parting over to the far side.
      if (!hatted) for (let i = 0; i < 6; i++) {
        const ph = 0.28 + i * 0.13;
        L([S(part, ph, 0), S(part * 0.3 - 0.2, ph + 0.05, 0.06), S(-0.75 - i * 0.12, ph + 0.42 + i * 0.05, 0.055), S(-1.15 - i * 0.1, ph + 0.75 + i * 0.05, 0.035)], 0.16, 0.045, { th0: 0.055, th1: 0.026 });
      }
      if (!hatted) for (let i = 0; i < 4; i++) L([S(part + 0.05, 0.3 + i * 0.18, 0), S(part + 0.5, 0.62 + i * 0.16, 0.045), S(1.3 + i * 0.08, 1.12 + i * 0.1, 0.028)], 0.14, 0.04, { th0: 0.045, th1: 0.022 });
      flow = { w: sdir(part + 0.4, 0.42), locks: 18, amp: 0.55, swirl: -0.2 };
      if (!hatted) for (let i = 0; i < 3; i++) L([S(part - 0.05, 0.75 + i * 0.06, 0.01), S(0.15 - i * 0.15, 0.98, 0.065), S(-0.32 - i * 0.18, 1.1 + i * 0.03, 0.05)], 0.14 - i * 0.02, 0.035, { th0: 0.05, th1: 0.028 });
      break;
    }
    case "bob":
    case "layered": {
      const lay = style === "layered";
      thick = 0.03;
      knots = [0, 1.1, 0.5, 1.02, 0.9, 1.3, 1.25, 1.7, 1.6, 1.85, PI, 2.15];
      shift = lay ? 0 : 0.12;
      const part = lay ? 0 : 0.12;
      const yEnd = lay ? -0.38 : -0.33;
      flow = { w: sdir(part, 0.3), locks: 16, amp: 0.5, swirl: 0 };
      hood = lay
        ? { span: 0.85, yEnd, locks: 12, flare: 0.05, curl: 0.045, rad: 0.352, zb: 0, tip: 0.07, vary: [0.07, 0.0, 0.1, 0.02, 0.05], thick: 0.046 }
        : { span: 0.95, yEnd, locks: 11, flare: 0.03, curl: -0.035, rad: 0.352, zb: 0, tip: 0.035, vary: [0.0, 0.015, 0.005, 0.02], thick: 0.05 };
      if (!hatted) {
        if (lay) {
          // Curtain bangs split at the centre, framing the face.
          for (const sd of [1, -1]) for (let i = 0; i < 2; i++)
            L([S(sd * 0.05, 0.62 + i * 0.06, 0.01), S(sd * (0.16 + i * 0.12), 1.0, 0.065), S(sd * (0.45 + i * 0.15), 1.28 + i * 0.06, 0.055), S(sd * (0.7 + i * 0.12), 1.6 + i * 0.05, 0.05)], 0.14, 0.04, { th0: 0.045, th1: 0.026 });
        } else for (let i = 0; i < 5; i++) {
          const a = lerp(-0.62, 0.62, i / 4);
          L([S(a * 0.5 + part * 0.3, 0.58, 0.01), S(a * 0.95, 0.96, 0.06), S(a, 1.22, 0.05)], 0.15, 0.06, { th0: 0.05, th1: 0.03 });
        }
      }
      break;
    }
    case "long": {
      thick = 0.03;
      knots = [0, 1.08, 0.5, 1.0, 0.9, 1.28, 1.25, 1.7, 1.6, 1.85, PI, 2.15];
      shift = 0.35;
      const part = 0.35;
      flow = { w: sdir(part, 0.3), locks: 16, amp: 0.5, swirl: 0 };
      hood = { span: 0.82, yEnd: -0.8, locks: 12, flare: 0.035, curl: 0.03, rad: 0.352, zb: -0.05, tip: 0.06, vary: [0.04, 0.0, 0.07, 0.02], thick: 0.05 };
      if (!hatted) {
        for (let i = 0; i < 3; i++) L([S(part - 0.05, 0.7 + i * 0.07, 0.01), S(0.05 - i * 0.15, 1.0, 0.065), S(-0.4 - i * 0.15, 1.22 + i * 0.05, 0.05), S(-0.68 - i * 0.1, 1.55 + i * 0.05, 0.05)], 0.15, 0.04, { th0: 0.05, th1: 0.026 });
        L([S(part + 0.1, 0.75, 0.01), S(0.62, 1.05, 0.06), S(0.82, 1.42, 0.05)], 0.13, 0.04, { th0: 0.045, th1: 0.026 });
      }
      break;
    }
    case "ponytail":
    case "bun":
    case "braids": {
      thick = 0.022;
      knots = [0, 1.06, 0.42, 0.98, 0.85, 1.16, 1.2, 1.46, 1.42, 1.4, 1.75, 1.42, 2.2, 1.98, PI, 2.14];
      const braids = style === "braids";
      const tie = style === "bun" ? S(PI, 0.62, 0.02) : braids ? S(PI, 1.2, 0.0) : S(PI, 0.85, 0.02);
      // Combed back from the hairline to the tie: the cap's grooves
      // converge on it (a centre parting with locks for braids).
      flow = { w: norm3([tie[0] - HC[0], tie[1] - HC[1], tie[2] - HC[2]]), locks: 18, amp: 0.6, swirl: 0 };
      if (braids) {
        flow = { w: sdir(0, 0.18), locks: 18, amp: 0.55, swirl: 0 };
        for (let i = 0; i < 10; i++) {
          const th = -PI + (i + 0.5) * (2 * PI / 10);
          if (Math.abs(th) > 2.4) continue;
          const ph = 1.02 + 0.5 * Math.min(1, Math.abs(th) / 1.7) ** 2;
          const sd = th >= 0 ? 1 : -1;
          L([S(sd * 0.05, 0.4 + 0.25 * Math.abs(Math.sin(i)), 0), S(th, Math.min(ph - 0.1, 1.35), 0.03), S(sd * 2.0, 1.72, 0.03)], 0.2, 0.1, { th0: 0.03, th1: 0.03 });
        }
      }
      if (style === "ponytail") {
        const T = addv(tie, [0, 0, -0.03]);
        extra.push({ op: "add", k: 0.008, n: { t: "tor", c: T, R: 0.045, r: 0.02, rot: [Math.PI / 2 - 0.5, 0, 0], m: accent ?? mat } });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const ox = Math.cos(a) * 0.03, oz = Math.sin(a) * 0.022;
          L([addv(T, [ox * 0.5, 0, -0.02]), addv(T, [ox, -0.05, -0.13 + oz]), addv(T, [ox * 1.6, -0.25, -0.18 + oz]), addv(T, [ox * 1.3 + 0.02, -0.46, -0.11 + oz]), addv(T, [ox * 0.6 + 0.05, -0.6, -0.05])], 0.09, 0.025, { th0: 0.06, th1: 0.02, per: 3, lift: 0 });
        }
      }
      if (style === "bun") {
        const B = addv(tie, [0, 0.03, -0.08]);
        extra.push({ op: "add", k: 0.03, n: { t: "ell", c: B, r: [0.135, 0.12, 0.1], m: mat, disp: { kind: "locks", amp: 0.008, freq: 12, c: B } } });
        extra.push({ op: "add", k: 0.012, n: { t: "tor", c: addv(B, [0, 0, 0.02]), R: 0.1, r: 0.032, rot: [Math.PI / 2 - 0.25, 0, 0], m: mat, disp: { kind: "rib", amp: 0.006, freq: 9, c: B } } });
      }
      if (braids)
        for (const sd of [1, -1]) {
          // Plaits: alternating tilted beads down over the front of the shoulder.
          const top = S(sd * 2.0, 1.72, 0.03);
          const pts: V3[] = [];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            pts.push([top[0] + sd * (0.0 + 0.03 * t), top[1] - 0.04 - t * 0.46, top[2] + 0.05 + t * 0.16]);
          }
          pts.forEach((p, i) => {
            if (i === pts.length - 1) return;
            const q = pts[i + 1];
            const c: V3 = r3([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
            const r = 0.058 * (1 - i * 0.04);
            extra.push({ op: "add", k: 0.012, n: { t: "ell", c, r: [+r.toFixed(4), 0.044, +(r * 0.85).toFixed(4)], rot: [0.3, 0, (i % 2 ? 0.55 : -0.55)], m: mat } });
            segs.push({ a: p, b: q, t0: 0.3 + i * 0.07, t1: 0.37 + i * 0.07, ra: r, rb: r });
          });
          const end = pts[pts.length - 1];
          extra.push({ op: "add", k: 0.006, n: { t: "tor", c: end, R: 0.03, r: 0.013, m: accent ?? mat } });
          L([end, addv(end, [sd * 0.01, -0.06, 0.02]), addv(end, [sd * 0.02, -0.12, 0.015])], 0.07, 0.025, { th0: 0.05, th1: 0.02, lift: 0 });
        }
      // Loose face-framing strands.
      if (!hatted && !braids) for (const sd of [1, -1]) L([S(sd * 0.72, 1.0, 0.01), S(sd * 0.92, 1.3, 0.03), S(sd * 1.02, 1.64, 0.035)], 0.06, 0.018, { th0: 0.03, th1: 0.016 });
      if (braids && !hatted) for (const sd of [1, -1]) L([S(sd * 0.05, 0.72, 0.01), S(sd * 0.4, 1.0, 0.05), S(sd * 0.78, 1.18, 0.045)], 0.13, 0.04, { th0: 0.045, th1: 0.026 });
      break;
    }
    case "curly": {
      thick = 0.058;
      knots = [0, 1.06, 0.45, 1.0, 0.9, 1.22, 1.25, 1.5, 1.45, 1.45, 1.75, 1.45, 2.2, 1.9, PI, 2.08];
      // Soft rounded curl clumps: smooth bulbs evenly spread over the
      // scalp (golden-angle spiral) at one height, so the silhouette stays
      // an even rounded shape; smaller and lower at the hairline.
      flow = { w: sdir(PI, 0.45), locks: 20, amp: 0.4, swirl: 0.3 };
      coils = [];
      const N = 66;
      for (let i = 0; i < N; i++) {
        const y = 1 - ((i + 0.5) / N) * 2;
        const ph = Math.acos(Math.max(-1, Math.min(1, y)));
        const th = Math.atan2(Math.sin(i * 2.39996), Math.cos(i * 2.39996));
        const lim = hlPhi(knots, th);
        if (ph > lim + 0.02) continue;
        const edge = smoothf(lim - 0.32, lim + 0.02, ph);
        const r = (0.096 - 0.03 * edge) * (0.94 + 0.12 * Math.abs(Math.sin(i * 3.7)));
        coils.push({ d: sdir(th, ph), r: +r.toFixed(4) });
        segs.push({ a: S(th, ph, thick), b: S(th, ph, thick + r), t0: 0.35 + 0.3 * edge, t1: 0.7, ra: r, rb: r });
      }
      break;
    }
  }
  const body: Node = { t: "grp", ops: extra.length ? extra : [{ op: "add", k: 0, n: { t: "sph", c: [0, -9, 0], r: 0.001 } }], m: mat };
  const ops: Op[] = extra.length ? [{ op: "add", k: 0.01, n: hatClip.length ? { t: "shell", of: body, d: 0, m: mat, clip: hatClip } : body }] : [];
  return { ops, segs, clumps: locks, cap: { thick, knots, shift }, curtain, flow, hood, coils, rough: mat.rough };
}

// --- explicit hair geometry ---------------------------------------------------------
const hairB = (rough: number, dir: V3) => {
  const l = Math.abs(dir[0]) + Math.abs(dir[1]) + Math.abs(dir[2]) || 1;
  let u = dir[0] / l, v = dir[1] / l;
  if (dir[2] < 0) { const pu = u; u = (1 - Math.abs(v)) * (pu >= 0 ? 1 : -1); v = (1 - Math.abs(pu)) * (v >= 0 ? 1 : -1); }
  return [Math.round(rough * 255), 0, Math.round(u * 127) + 128, Math.round(v * 127) + 128];
};
const hairA = (t: number) => [SLOT.hair, SLOT.hairLight, Math.round((0.06 + 0.5 * Math.pow(t, 1.25)) * 255), Math.round((0.8 + 0.2 * Math.min(1, t * 2)) * 255)];
function hlPhi(knots: number[], th: number) {
  let a = Math.abs(th);
  if (a > Math.PI) a = 2 * Math.PI - a;
  for (let i = 2; i < knots.length; i += 2)
    if (a <= knots[i]) {
      const t = (a - knots[i - 2]) / (knots[i] - knots[i - 2] || 1);
      const s = t * t * (3 - 2 * t);
      return knots[i - 1] + (knots[i + 1] - knots[i - 1]) * s;
    }
  return knots[knots.length - 1];
}
/** `hat(p)`: signed distance to the headwear (head frame); geometry inside is culled. */
/** Detail levels (sides, ring spacing) for hero; the bake picks the finest
 * that fits the character's budget. */
const LEVELS: [number, number][] = [[6, 0.06], [5, 0.075], [4, 0.095]];
export function hairMesh(h: HairBuild, hi: boolean, hat: (p: V3) => number, level = 0): { mesh: AttrMesh; segs: HairSeg[] } {
  const [KH, stepH] = LEVELS[Math.min(LEVELS.length - 1, level)];
  const out = emptyMesh();
  const segs: HairSeg[] = [];
  const inside = (p: V3, m = 0) => hat(p) < -m;
  // Scalp cap up to the hairline, grooved into locks that follow the flow.
  appendMesh(out, flowCap(h, hi, level, inside));
  if (h.hood) appendMesh(out, hoodMesh(h, hi, level, inside));
  if (h.coils) appendMesh(out, coilMesh(h, hi, level, inside));
  // Inner curtain under long styles.
  if (h.curtain) {
    const c = h.curtain;
    const m = emptyMesh();
    const cols = hi ? 22 - level * 4 : 9 - level, rows = hi ? 7 - level : 3;
    const span = Math.PI * 2 - c.front * 2;
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const th = c.front + span * (i / cols);
        const y = 0.04 + (c.yEnd + 0.06 - 0.04) * (j / rows);
        const below = Math.max(0, Math.min(1, (-y - 0.05) / 0.25));
        const rad = 0.36 + c.flare * below;
        const dir: V3 = [Math.sin(th), 0, Math.cos(th)];
        const p = hug([HC[0] + dir[0] * rad, HC[1] + y, HC[2] + dir[2] * rad - c.back * below], 0.028);
        m.pos.push(...p);
        m.nrm.push(dir[0], 0, dir[2]);
        m.a.push(...hairA(0.15 + 0.6 * (j / rows)));
        m.b.push(...hairB(h.rough, [0, -1, 0]));
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i, b = a + 1, cc = a + cols + 1, d = cc + 1;
        m.tri.push(a, cc, d, a, d, b);
      }
    orient(m);
    vertexNormals(m);
    appendMesh(out, m);
  }
  // Clumps.
  for (const lk of h.clumps) {
    const smp = catmull(lk.pts, 4);
    const prof = (t: number) => 1 + 0.18 * Math.sin(Math.PI * Math.min(1, t * 1.7)) * (1 - t);
    const wid = (t: number) => lerp(lk.r0, lk.r1, Math.pow(t, 0.9)) * prof(t);
    const thk = (t: number) => Math.max(0.022, lerp(lk.th0 ?? lk.r0 * 0.5, lk.th1 ?? lk.r1 * 0.7, Math.pow(t, 0.8)) * prof(t));
    const raw = smp.map((p, i) => (lk.lift === 0 ? p : hug(p, thk(i / (smp.length - 1)) * 0.5 + 0.004)));
    // Resample by arc length.
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + len([raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1], raw[i][2] - raw[i - 1][2]]));
    const L = cum[cum.length - 1];
    const R = Math.max(hi ? 4 : 3, Math.min(hi ? 10 : 5, Math.round(L / (hi ? stepH : 0.12 + level * 0.02)))) + 1;
    const P: V3[] = [];
    for (let r = 0; r < R; r++) {
      const d = (r / (R - 1)) * L;
      let k = 1;
      while (k < cum.length - 1 && cum[k] < d) k++;
      const u = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
      P.push([0, 1, 2].map((c) => raw[k - 1][c] + (raw[k][c] - raw[k - 1][c]) * u) as V3);
    }
    // Under a hat: start at the last ring still inside it (hidden end).
    let s0 = 0;
    for (let r = 0; r < R; r++) if (inside(P[r], wid(r / (R - 1)) * 0.2)) s0 = r;
    // A clump mostly hidden under headwear would show only a stub: the
    // grooved cap already covers that hair.
    if (s0 >= R - 2 || (s0 > 0 && R - s0 < R * 0.6)) continue;
    const K = hi ? KH : level >= 2 ? 3 : 4;
    const m = emptyMesh();
    const ringIds: number[][] = [];
    for (let r = s0; r < R; r++) {
      const t = r / (R - 1);
      const p = P[r];
      const a = P[Math.max(0, r - 1)], b = P[Math.min(R - 1, r + 1)];
      const T = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const below = Math.max(0, Math.min(1, (HC[1] - 0.05 - p[1]) / 0.2));
      let N: V3 = [p[0] - HC[0], (p[1] - HC[1]) * (1 - below), p[2] - HC[2]];
      const dt = N[0] * T[0] + N[1] * T[1] + N[2] * T[2];
      N = norm3([N[0] - T[0] * dt, N[1] - T[1] * dt, N[2] - T[2] * dt]);
      const Bv = norm3([T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]]);
      const w = r === R - 1 ? 0 : wid(t) * 0.5, th = r === R - 1 ? 0 : thk(t) * 0.5;
      const ids: number[] = [];
      const n = r === R - 1 ? 1 : K;
      for (let k = 0; k < n; k++) {
        const ang = (k / K) * Math.PI * 2 + 0.3;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        // Almond section, flatter underneath, with a soft ridge on top.
        const x = Math.sign(ca) * Math.pow(Math.abs(ca), 0.8) * w;
        const y = sa * th * (sa < 0 ? 0.55 : 1 + 0.15 * (1 - Math.abs(ca)));
        ids.push(m.pos.length / 3);
        m.pos.push(p[0] + Bv[0] * x + N[0] * y, p[1] + Bv[1] * x + N[1] * y, p[2] + Bv[2] * x + N[2] * y);
        const nn = norm3([Bv[0] * ca / Math.max(w, 1e-3) * th + N[0] * sa, Bv[1] * ca / Math.max(w, 1e-3) * th + N[1] * sa, Bv[2] * ca / Math.max(w, 1e-3) * th + N[2] * sa]);
        m.nrm.push(...(r === R - 1 ? T : nn));
        m.a.push(...hairA(t));
        m.b.push(...hairB(h.rough, T));
      }
      ringIds.push(ids);
      if (r < R - 1) segs.push({ a: p, b: P[r + 1], t0: t, t1: (r + 1) / (R - 1), ra: Math.max(w, th) * 0.8, rb: Math.max(wid((r + 1) / (R - 1)), thk((r + 1) / (R - 1))) * 0.4 });
    }
    // Root cap.
    const r0 = ringIds[0];
    const cIdx = m.pos.length / 3;
    const p0 = P[s0];
    m.pos.push(...p0); m.nrm.push(0, 0, 0); m.a.push(...hairA(0)); m.b.push(...hairB(h.rough, [0, -1, 0]));
    for (let k = 0; k < K; k++) m.tri.push(cIdx, r0[(k + 1) % K], r0[k]);
    for (let r = 0; r < ringIds.length - 1; r++) {
      const A = ringIds[r], Bn = ringIds[r + 1];
      for (let k = 0; k < K; k++) {
        if (Bn.length === 1) m.tri.push(A[k], A[(k + 1) % K], Bn[0]);
        else m.tri.push(A[k], A[(k + 1) % K], Bn[(k + 1) % K], A[k], Bn[(k + 1) % K], Bn[k]);
      }
    }
    // Orient by the section normals, then smooth.
    const nrm0 = m.nrm.slice();
    m.nrm.length = 0; m.nrm.push(...nrm0);
    orient(m);
    vertexNormals(m);
    appendMesh(out, m);
  }
  return { mesh: out, segs };
}

const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function frameOf(w: V3): [V3, V3] {
  const u = norm3(cross3(Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], w));
  return [u, cross3(w, u)];
}
const inHairline = (h: HairBuild, d: V3) => Math.acos(Math.max(-1, Math.min(1, d[1]))) <= hlPhi(h.cap.knots, Math.atan2(d[0], d[2]) - h.cap.shift);
/** Hair vertex attributes: root→tip parameter, groove shade, strand direction. */
function pushHair(m: AttrMesh, p: V3, n: V3, t: number, shade: number, rough: number, dir: V3) {
  m.pos.push(p[0], p[1], p[2]);
  m.nrm.push(n[0], n[1], n[2]);
  m.a.push(SLOT.hair, SLOT.hairLight, Math.round((0.06 + 0.5 * Math.pow(Math.min(1, t), 1.25)) * 255), Math.round(Math.max(0, Math.min(1, shade)) * 255));
  m.b.push(...hairB(rough, dir));
}
/** Keep triangles that are not (mostly) inside the headwear. */
function cullAdd(m: AttrMesh, inside: (p: V3, m?: number) => boolean, ...v: number[]) {
  const P = (k: number): V3 => [m.pos[k * 3], m.pos[k * 3 + 1], m.pos[k * 3 + 2]];
  // One corner outside is enough: the edge then tucks under the headwear
  // instead of showing a sawtooth of culled triangles.
  if (v.some((k) => !inside(P(k), -0.006))) m.tri.push(...v);
}

/**
 * The scalp cap as one smooth surface meshed in polar coordinates about the
 * flow's whorl (or tie): grid columns are the locks' own lines, so the
 * grooves between locks run cleanly from the whorl to the hairline, the
 * strand direction is exact, and there are no gaps anywhere.
 */
function flowCap(h: HairBuild, hi: boolean, level: number, inside: (p: V3, m?: number) => boolean): AttrMesh {
  const F = h.flow ?? { w: [0, 1, 0] as V3, locks: 16, amp: 0, swirl: 0 };
  const w = norm3(F.w);
  const [u, v] = frameOf(w);
  const P = hi ? (level === 0 ? 4 : level === 1 ? 3 : 2) : 2;
  const locks = hi ? F.locks : Math.max(8, Math.round(F.locks * 0.6));
  const cols = locks * P, R = hi ? 11 - level * 2 : 4;
  const thick = h.cap.thick;
  const dirAt = (al: number, be: number): V3 => {
    const b2 = be + F.swirl * al;
    const ca = Math.cos(al), sa = Math.sin(al), cb = Math.cos(b2), sb = Math.sin(b2);
    return norm3([w[0] * ca + (u[0] * cb + v[0] * sb) * sa, w[1] * ca + (u[1] * cb + v[1] * sb) * sa, w[2] * ca + (u[2] * cb + v[2] * sb) * sa]);
  };
  const alMax = (be: number) => {
    let a = 0.02;
    while (a < 3.1 && inHairline(h, dirAt(a, be))) a += 0.04;
    let lo = Math.max(0, a - 0.04), hiA = a;
    for (let i = 0; i < 7; i++) { const mid = (lo + hiA) / 2; if (inHairline(h, dirAt(mid, be))) lo = mid; else hiA = mid; }
    return lo;
  };
  const m = emptyMesh();
  const at = (d: V3, off: number): V3 => { const r = ellR(d) + off; return [HC[0] + d[0] * r, HC[1] + d[1] * r, HC[2] + d[2] * r]; };
  pushHair(m, at(w, thick * 0.62), w, 0.2, 0.92, h.rough, u);
  const grid: number[][] = [];
  for (let i = 0; i < cols; i++) {
    const be = (i / cols) * Math.PI * 2;
    const am = alMax(be);
    const x = ((i % P) / P) * 2 - 1;
    const bul = Math.sqrt(Math.max(0, 1 - x * x));
    const col: number[] = [];
    for (let j = 1; j <= R; j++) {
      const tt = j / R;
      const al = am * tt;
      const d = dirAt(al, be);
      const fadeW = smoothf(0.05, 0.55, al), fadeE = 1 - smoothf(0.8, 1.0, tt);
      const g = F.amp * thick * (bul - 1) * fadeW * (0.45 + 0.55 * fadeE);
      const off = (j === R ? thick * 0.22 : thick * 0.62) + g;
      const d2 = dirAt(al + 0.03, be);
      col.push(m.pos.length / 3);
      pushHair(m, at(d, off), d, 0.16 + 0.32 * tt, 0.8 + 0.2 * (1 - fadeW + fadeW * bul), h.rough, norm3([d2[0] - d[0], d2[1] - d[1], d2[2] - d[2]]));
    }
    grid.push(col);
  }
  for (let i = 0; i < cols; i++) {
    const A = grid[i], B = grid[(i + 1) % cols];
    cullAdd(m, inside, 0, A[0], B[0]);
    for (let j = 0; j < R - 1; j++) {
      cullAdd(m, inside, A[j], A[j + 1], B[j + 1]);
      cullAdd(m, inside, A[j], B[j + 1], B[j]);
    }
  }
  orient(m);
  vertexNormals(m);
  return compactMesh(m);
}

/** Centre line of a hood column at azimuth th, down to yEnd. */
function hoodPath(H: Hood, th: number, yE: number, capOff: number): V3[] {
  const dir: V3 = [Math.sin(th), 0, Math.cos(th)];
  const at = (y: number, r: number): V3 => {
    const bl = Math.max(0, Math.min(1, -y / 0.25));
    return [HC[0] + dir[0] * r, HC[1] + y, HC[2] + dir[2] * r + H.zb * bl];
  };
  const fl = H.flare, span = yE + 0.08;
  const pts: V3[] = [S(th, 0.2, capOff), S(th, 0.75, capOff), S(th, 1.25, capOff), at(-0.06, H.rad + fl * 0.15)];
  if (yE < -0.16) pts.push(at(-0.08 + span * 0.5, H.rad + fl * 0.6));
  pts.push(at(yE + 0.05, H.rad + fl), at(yE, H.rad + fl + H.curl));
  return catmull(pts, 5);
}

/**
 * Hanging styles (bob, long, layered): one closed hair mass from the crown
 * down, grooved into rounded locks that separate toward scalloped, pointed
 * tips, with an inner surface underneath. It cannot open gaps, sprout
 * strays or show the scalp, from any side.
 */
function hoodMesh(h: HairBuild, hi: boolean, level: number, inside: (p: V3, m?: number) => boolean): AttrMesh {
  const H = h.hood!;
  const P = hi ? (level === 0 ? 4 : 3) : 2;
  const cols = H.locks * P, R = hi ? 13 - level * 2 : 6;
  const capOff = h.cap.thick * 0.62;
  const m = emptyMesh();
  const outer: number[][] = [], inner: number[][] = [];
  for (let i = 0; i <= cols; i++) {
    const th = H.span + (Math.PI * 2 - 2 * H.span) * (i / cols);
    const x = ((i % P) / P) * 2 - 1;
    const bul = Math.sqrt(Math.max(0, 1 - x * x));
    const k = Math.floor(i / P);
    const e = Math.min(i, cols - i);
    const edge = smoothf(0, P * 0.75, e), face = smoothf(0, P * 2.5, e);
    const yE = H.yEnd + 0.07 * (1 - face) - (H.tip + H.vary[k % H.vary.length]) * (1 - x * x) * (0.35 + 0.65 * edge);
    const raw = hoodPath(H, th, yE, 0);
    const cum = [0];
    for (let j = 1; j < raw.length; j++) cum.push(cum[j - 1] + len([raw[j][0] - raw[j - 1][0], raw[j][1] - raw[j - 1][1], raw[j][2] - raw[j - 1][2]]));
    const Lp = cum[cum.length - 1];
    const sample = (sp: number): V3 => {
      const d = sp * Lp;
      let q = 1;
      while (q < cum.length - 1 && cum[q] < d) q++;
      const f = (d - cum[q - 1]) / (cum[q] - cum[q - 1] || 1);
      return [0, 1, 2].map((c) => raw[q - 1][c] + (raw[q][c] - raw[q - 1][c]) * f) as V3;
    };
    const oc: number[] = [], ic: number[] = [];
    for (let r = 0; r <= R; r++) {
      const sp = 1 - Math.pow(1 - r / R, 1.25);
      const c0 = sample(sp), cN = sample(Math.min(1, sp + 0.02)), cP = sample(Math.max(0, sp - 0.02));
      const T = norm3([cN[0] - cP[0], cN[1] - cP[1], cN[2] - cP[2]]);
      const hang = smoothf(HC[1] + 0.02, HC[1] - 0.12, c0[1]);
      let N: V3 = [c0[0] - HC[0], (c0[1] - HC[1]) * (1 - hang), c0[2] - HC[2]];
      const dt = N[0] * T[0] + N[1] * T[1] + N[2] * T[2];
      N = norm3([N[0] - T[0] * dt, N[1] - T[1] * dt, N[2] - T[2] * dt]);
      const tipF = 1 - smoothf(0.72, 1.0, sp);
      const th0 = (h.cap.thick * 0.7 + (H.thick - h.cap.thick * 0.7) * hang) * Math.pow(tipF, 0.6) * edge;
      const g = H.thick * 0.42 * (0.3 + 0.7 * sp) * (bul - 1) * edge * (1 - smoothf(0.86, 1.0, sp));
      // On the scalp the layer sits over the cap (under it at the front edges).
      const lift = (capOff * (0.35 + 0.65 * edge) + th0 * 0.5 + 0.003) * (1 - hang);
      const c = hang < 1 ? hug(c0, lift) : hug(c0, 0.012 + th0 * 0.5);
      const o: V3 = [c[0] + N[0] * (th0 * 0.5 + g), c[1] + N[1] * (th0 * 0.5 + g), c[2] + N[2] * (th0 * 0.5 + g)];
      oc.push(m.pos.length / 3);
      pushHair(m, o, N, 0.12 + 0.62 * sp, (0.8 + 0.2 * bul) * (0.9 + 0.1 * sp), h.rough, T);
      const ip: V3 = [c[0] - N[0] * th0 * 0.5, c[1] - N[1] * th0 * 0.5, c[2] - N[2] * th0 * 0.5];
      ic.push(m.pos.length / 3);
      pushHair(m, ip, [-N[0], -N[1], -N[2]], 0.25 + 0.4 * sp, 0.55, h.rough, T);
    }
    outer.push(oc); inner.push(ic);
  }
  // Inner surface only where the hair hangs free of the head.
  const r0 = Math.max(1, Math.round(R * 0.3));
  for (let i = 0; i < cols; i++)
    for (let r = 0; r < R; r++) {
      const A = outer[i], B = outer[i + 1];
      cullAdd(m, inside, A[r], A[r + 1], B[r + 1]);
      cullAdd(m, inside, A[r], B[r + 1], B[r]);
      if (r >= r0) {
        const C = inner[i], D = inner[i + 1];
        cullAdd(m, inside, C[r], D[r + 1], C[r + 1]);
        cullAdd(m, inside, C[r], D[r], D[r + 1]);
      }
    }
  orient(m);
  vertexNormals(m);
  return compactMesh(m);
}

/** Curly hair: smooth rounded curl bulbs over the grooved cap, each with a
 * coil-shaped highlight; an even, rounded silhouette. */
function coilMesh(h: HairBuild, hi: boolean, level: number, inside: (p: V3, m?: number) => boolean): AttrMesh {
  const m = emptyMesh();
  const segs = hi ? (level === 0 ? 8 : level === 1 ? 7 : 6) : 5;
  const polar = hi && level === 0 ? [0, 0.27, 0.62] : [0, 0.32, 0.62];
  for (const c of h.coils ?? []) {
    const d = norm3(c.d);
    const ctr: V3 = [HC[0] + d[0] * (ellR(d) + h.cap.thick * 0.5 + c.r * 0.3), HC[1] + d[1] * (ellR(d) + h.cap.thick * 0.5 + c.r * 0.3), HC[2] + d[2] * (ellR(d) + h.cap.thick * 0.5 + c.r * 0.3)];
    if (inside(ctr, -0.01)) continue;
    const [u, v] = frameOf(d);
    const ring = (a: number) => {
      const ids: number[] = [];
      for (let k = 0; k < (a === 0 ? 1 : segs); k++) {
        const b = (k / segs) * Math.PI * 2 + (a > 0.5 ? Math.PI / segs : 0);
        const sa = Math.sin(a * Math.PI), ca = Math.cos(a * Math.PI);
        const rad: V3 = [(u[0] * Math.cos(b) + v[0] * Math.sin(b)), (u[1] * Math.cos(b) + v[1] * Math.sin(b)), (u[2] * Math.cos(b) + v[2] * Math.sin(b))];
        const n = norm3([d[0] * ca + rad[0] * sa, d[1] * ca + rad[1] * sa, d[2] * ca + rad[2] * sa]);
        const p: V3 = [ctr[0] + rad[0] * sa * c.r + d[0] * ca * c.r * 0.92, ctr[1] + rad[1] * sa * c.r + d[1] * ca * c.r * 0.92, ctr[2] + rad[2] * sa * c.r + d[2] * ca * c.r * 0.92];
        // Strand direction runs over the bulb: its highlight is a soft ring
        // (a rounded curl), never a streak down to a point.
        const tan = norm3([rad[0] * ca - d[0] * sa, rad[1] * ca - d[1] * sa, rad[2] * ca - d[2] * sa]);
        ids.push(m.pos.length / 3);
        pushHair(m, p, n, 0.42 - 0.1 * a, 1 - 0.16 * a, h.rough, a === 0 ? u : tan);
      }
      return ids;
    };
    const rings = polar.map(ring);
    for (let k = 0; k < segs; k++) m.tri.push(rings[0][0], rings[1][k], rings[1][(k + 1) % segs]);
    for (let r = 1; r < rings.length - 1; r++)
      for (let k = 0; k < segs; k++) {
        const a0 = rings[r][k], a1 = rings[r][(k + 1) % segs], b0 = rings[r + 1][k], b1 = rings[r + 1][(k + 1) % segs];
        m.tri.push(a0, b0, b1, a0, b1, a1);
      }
  }
  orient(m);
  return m;
}

/** Drop vertices no triangle uses (culled under a hat). */
function compactMesh(m: AttrMesh): AttrMesh {
  const map = new Map<number, number>();
  const o = emptyMesh();
  for (const v of m.tri) {
    let n = map.get(v);
    if (n === undefined) {
      n = o.pos.length / 3;
      map.set(v, n);
      o.pos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
      o.nrm.push(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]);
      o.a.push(m.a[v * 4], m.a[v * 4 + 1], m.a[v * 4 + 2], m.a[v * 4 + 3]);
      o.b.push(m.b[v * 4], m.b[v * 4 + 1], m.b[v * 4 + 2], m.b[v * 4 + 3]);
    }
    o.tri.push(n);
  }
  return o;
}

/** SDF stand-in of the clumps (AO between them; never meshed). */
export function hairAO(h: HairBuild): Op[] {
  const ops: Op[] = [{ op: "add", k: 0, n: { t: "ell", c: HC, r: [SR[0] + h.cap.thick * 0.6, SR[1] + h.cap.thick * 0.6, SR[2] + h.cap.thick * 0.6] } }];
  for (const c of h.coils ?? []) {
    const d = norm3(c.d), r = ellR(d) + h.cap.thick * 0.5 + c.r * 0.3;
    ops.push({ op: "add", k: 0, n: { t: "sph", c: r3([HC[0] + d[0] * r, HC[1] + d[1] * r, HC[2] + d[2] * r]), r: +(c.r * 0.8).toFixed(4) } });
  }
  if (h.hood) {
    const H = h.hood;
    for (let i = 0; i <= 8; i++) {
      const th = H.span + (Math.PI * 2 - 2 * H.span) * (i / 8);
      const P = hoodPath(H, th, H.yEnd, h.cap.thick).filter((_, k) => k % 3 === 0);
      for (let k = 0; k < P.length - 1; k++)
        if (P[k][1] < HC[1] + 0.05) ops.push({ op: "add", k: 0, n: { t: "cap", a: r3(P[k]), b: r3(P[k + 1]), r: +(H.thick * 0.35).toFixed(4) } });
    }
  }
  for (const lk of h.clumps) {
    const P = catmull(lk.pts, 2).map((p) => (lk.lift === 0 ? p : hug(p, (lk.th0 ?? 0.04) * 0.5)));
    for (let i = 0; i < P.length - 1; i++) {
      const t = i / (P.length - 1);
      ops.push({ op: "add", k: 0, n: { t: "cone", a: r3(P[i]), b: r3(P[i + 1]), ra: +(lerp(lk.r0, lk.r1, t) * 0.3).toFixed(4), rb: +(lerp(lk.r0, lk.r1, t + 1 / (P.length - 1)) * 0.3).toFixed(4) } });
    }
  }
  return ops;
}
