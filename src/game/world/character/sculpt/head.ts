/**
 * Analytic face (no SDF, no carving): the head skin is a dense smooth
 * parametric surface (a deformed ellipsoid with the mesh pole at the nose,
 * so the face gets the finest triangles), and the eyes, lash lines, brows
 * and mouth are thin decal meshes conforming to that surface. Vinyl-toy
 * smooth, mirrored exactly, nothing protrudes but the soft nose bump.
 */
import type { Expression } from "../outfit";
import { SLOT, type V3 } from "./sdf";

export type AttrMesh = { pos: number[]; nrm: number[]; a: number[]; b: number[]; tri: number[] };
export const emptyMesh = (): AttrMesh => ({ pos: [], nrm: [], a: [], b: [], tri: [] });
export function appendMesh(into: AttrMesh, m: AttrMesh) {
  const base = into.pos.length / 3;
  into.pos.push(...m.pos);
  into.nrm.push(...m.nrm);
  into.a.push(...m.a);
  into.b.push(...m.b);
  for (const t of m.tri) into.tri.push(t + base);
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const NOSE_DIR = norm([0, -0.39, 0.92]);
const R = [0.375, 0.362, 0.352];

/** Head radius along a unit direction (head-centre frame). */
export function headRadius(d: V3) {
  const [x, y, z] = d;
  // Slightly wider cranium, softly tapered jaw.
  const ax = R[0] * (1 + 0.03 * smooth(-0.1, 0.7, y)) * (1 - 0.15 * smooth(-0.35, -0.95, y));
  const az = R[2] * (1 - 0.06 * smooth(-0.5, -0.95, y) * smooth(0, -0.6, z));
  let r = 1 / Math.sqrt((x / ax) ** 2 + (y / R[1]) ** 2 + (z / az) ** 2);
  // Full cheeks and a soft round chin.
  r += 0.022 * Math.exp(-(((y + 0.36) / 0.22) ** 2)) * smooth(0.1, 0.7, z) * smooth(0.15, 0.55, Math.abs(x));
  r += 0.012 * Math.exp(-(((y + 0.78) / 0.16) ** 2)) * smooth(0.3, 0.9, z);
  // Very slight flattening of the face plane.
  r *= 1 - 0.03 * smooth(0.72, 1.0, z);
  // Small soft button nose on a soft bridge.
  const ang = Math.acos(Math.max(-1, Math.min(1, x * NOSE_DIR[0] + y * NOSE_DIR[1] + z * NOSE_DIR[2])));
  r += 0.026 * Math.exp(-((ang / 0.08) ** 2));
  r += 0.006 * Math.exp(-((x / 0.085) ** 2)) * smooth(-0.43, -0.35, y) * smooth(-0.07, -0.19, y) * smooth(0.8, 0.95, z);
  // Soft cheekbones under the eyes.
  r += 0.008 * Math.exp(-(((y + 0.3) / 0.13) ** 2)) * Math.exp(-(((Math.abs(x) - 0.5) / 0.16) ** 2)) * smooth(0.4, 0.8, z);
  return r;
}
const surfDir = (d: V3, hc: V3): V3 => {
  const r = headRadius(d);
  return [hc[0] + d[0] * r, hc[1] + d[1] * r, hc[2] + d[2] * r];
};
/** Surface point with head-local (x, y) on the front of the face. */
export function facePoint(x: number, y: number, hc: V3): V3 {
  let d = norm([x, y, 0.3]);
  for (let i = 0; i < 6; i++) {
    const r = headRadius(d);
    d = norm([x, y, Math.sqrt(Math.max(1e-4, r * r - x * x - y * y))]);
  }
  return surfDir(d, hc);
}
/** Outward normal of the face surface at head-local (x, y). */
export function faceNormal(x: number, y: number, hc: V3): V3 {
  const e = 0.002;
  const px0 = facePoint(x - e, y, hc), px1 = facePoint(x + e, y, hc);
  const py0 = facePoint(x, y - e, hc), py1 = facePoint(x, y + e, hc);
  const u = [px1[0] - px0[0], px1[1] - px0[1], px1[2] - px0[2]];
  const v = [py1[0] - py0[0], py1[1] - py0[1], py1[2] - py0[2]];
  return norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
}

const B = (rough: number, metal = 0, eu = 128, ev = 128) => [Math.round(rough * 255), Math.round(metal * 255), eu, ev];

/** The head skin: rings around the nose, `rings` × `segs`. */
export function headSkin(hc: V3, rings: number, segs: number, paint: (p: V3) => { slotB: number; mix: number; light?: number }): AttrMesh {
  const m = emptyMesh();
  // Frame with the pole at the nose.
  const w = NOSE_DIR;
  const u = norm([1, 0, 0]);
  const v = norm([w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]]);
  const vid: number[][] = [];
  const push = (d: V3) => {
    const p = surfDir(d, hc);
    m.pos.push(...p);
    m.nrm.push(0, 0, 0);
    const pt = paint(p);
    m.a.push(SLOT.skin, pt.slotB, Math.round(pt.mix * 255), Math.round(232 + 23 * (pt.light ?? 0)));
    m.b.push(...B(0.5));
    return m.pos.length / 3 - 1;
  };
  const front = push(w);
  for (let i = 1; i < rings; i++) {
    // Rings are denser near the nose (the face).
    const t = i / rings;
    const a = Math.PI * (0.6 * t + 0.4 * t * t);
    const row: number[] = [];
    for (let j = 0; j < segs; j++) {
      const b = (j / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      row.push(push(norm([w[0] * ca + (u[0] * cb + v[0] * sb) * sa, w[1] * ca + (u[1] * cb + v[1] * sb) * sa, w[2] * ca + (u[2] * cb + v[2] * sb) * sa])));
    }
    vid.push(row);
  }
  const back = push([-w[0], -w[1], -w[2]]);
  for (let j = 0; j < segs; j++) m.tri.push(front, vid[0][(j + 1) % segs], vid[0][j]);
  for (let i = 0; i < vid.length - 1; i++)
    for (let j = 0; j < segs; j++) {
      const a0 = vid[i][j], a1 = vid[i][(j + 1) % segs], b0 = vid[i + 1][j], b1 = vid[i + 1][(j + 1) % segs];
      m.tri.push(a0, a1, b1, a0, b1, b0);
    }
  const last = vid[vid.length - 1];
  for (let j = 0; j < segs; j++) m.tri.push(back, last[j], last[(j + 1) % segs]);
  for (let i = 0; i < m.pos.length; i += 3) {
    const d = norm([m.pos[i] - hc[0], m.pos[i + 1] - hc[1], m.pos[i + 2] - hc[2]]);
    m.nrm[i] = d[0]; m.nrm[i + 1] = d[1]; m.nrm[i + 2] = d[2];
  }
  orient(m);
  vertexNormals(m);
  return m;
}

/** Make every triangle face along its vertices' normals (outward). */
export function orient(m: AttrMesh) {
  const P = m.pos, N = m.nrm;
  for (let t = 0; t < m.tri.length; t += 3) {
    const a = m.tri[t] * 3, b = m.tri[t + 1] * 3, c = m.tri[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const d = nx * (N[a] + N[b] + N[c]) + ny * (N[a + 1] + N[b + 1] + N[c + 1]) + nz * (N[a + 2] + N[b + 2] + N[c + 2]);
    if (d < 0) { const k = m.tri[t + 1]; m.tri[t + 1] = m.tri[t + 2]; m.tri[t + 2] = k; }
  }
}

/** Area-weighted smooth vertex normals. */
export function vertexNormals(m: AttrMesh) {
  const n = m.nrm;
  n.fill(0);
  const P = m.pos;
  for (let t = 0; t < m.tri.length; t += 3) {
    const a = m.tri[t] * 3, b = m.tri[t + 1] * 3, c = m.tri[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
}

/** A decal conforming to the face: `shape(s, t)` → head-local (x, y) for
 * s, t ∈ [0, 1]; `attr(s, t)` gives slot/surface. */
function decal(
  hc: V3, cols: number, rows: number, offset: (s: number, t: number) => number,
  shape: (s: number, t: number) => [number, number],
  attr: (s: number, t: number) => { a: number[]; b: number[] },
): AttrMesh {
  const m = emptyMesh();
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const s = i / cols, t = j / rows;
      const [x, y] = shape(s, t);
      const p = facePoint(x, y, hc), nn = faceNormal(x, y, hc), o = offset(s, t);
      m.pos.push(p[0] + nn[0] * o, p[1] + nn[1] * o, p[2] + nn[2] * o);
      m.nrm.push(...nn);
      const at = attr(s, t);
      m.a.push(...at.a);
      m.b.push(...at.b);
    }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      m.tri.push(a, b, d, a, d, c);
    }
  orient(m);
  return m;
}

export type EyeSpec = { cx: number; cy: number; rx: number; ry: number; iris: [number, number] };
/** A thin tapered band along an arc of the eye ellipse (angles in degrees,
 * radius factors rr0 → rr1 across the band, `half(q)` its half-width). */
function eyeArc(hc: V3, spec: EyeSpec, s: number, a0: number, a1: number, rr: number, half: (q: number) => number, slot: number, cols: number, lift: number, rough = 0.5, dy = (q: number) => 0 * q): AttrMesh {
  const cx = s * spec.cx;
  return decal(
    hc, cols, 1, () => lift,
    (q, t) => {
      const ang = ((a0 + (a1 - a0) * q) * Math.PI) / 180;
      const k = rr + (t - 0.5) * 2 * half(q);
      return [cx + s * Math.cos(ang) * spec.rx * k, spec.cy + Math.sin(ang) * spec.ry * k + dy(q)];
    },
    () => ({ a: [slot, slot, 0, 235], b: B(rough) }),
  );
}
/** Both eyes (exact mirror, level): domed caps shaded procedurally (iris
 * gradient, pupil, two catchlights), an upper lash line that thickens to the
 * outer corner (with a flick and lash tips on some characters), a soft lid
 * crease above and a fine lower lash line. */
export function eyes(hc: V3, spec: EyeSpec, flick: boolean, hi: boolean, lashes = 0, lid = 0): AttrMesh {
  const out = emptyMesh();
  for (const s of [1, -1]) {
    const cx = s * spec.cx;
    const cap = decal(
      hc, hi ? 22 : 8, hi ? 5 : 2,
      (_, t) => 0.002 + 0.007 * (1 - t * t),
      (a, t) => {
        const ang = a * Math.PI * 2;
        return [cx + s * Math.cos(ang) * spec.rx * t, spec.cy + Math.sin(ang) * spec.ry * t];
      },
      (a, t) => {
        const ang = a * Math.PI * 2;
        const u = s * Math.cos(ang) * t + s * spec.iris[0];
        const v = Math.sin(ang) * t - spec.iris[1];
        const eu = Math.round(Math.max(0, Math.min(255, (u * 0.5 + 0.5) * 255)));
        const ev = Math.round(Math.max(0, Math.min(255, (v * 0.5 + 0.5) * 255)));
        return { a: [SLOT.iris, SLOT.iris, 0, 245], b: B(0.08, 0, eu, ev) };
      },
    );
    appendMesh(out, cap);
    if (lid > 0.01) {
      // Relaxed upper lid (expression): skin over the top of the eye, the
      // lash line along its edge.
      const edge = (k: number) => spec.cy + spec.ry * (1 - 2 * lid) + spec.ry * 0.12 * (1 - k * k) - spec.ry * 0.05 * k * s;
      const top = (k: number) => spec.cy + spec.ry * Math.sqrt(Math.max(0, 1 - k * k));
      appendMesh(out, decal(hc, hi ? 14 : 6, 2, () => 0.0102, (q, t) => {
        const k = (q * 2 - 1) * 1.04;
        const kk = Math.max(-1, Math.min(1, k));
        const e = Math.min(edge(kk), top(kk));
        return [cx + s * k * spec.rx, e + (top(kk) + 0.008 - e) * t];
      }, () => ({ a: [SLOT.skin, SLOT.skin, 0, 238], b: B(0.5) })));
      appendMesh(out, decal(hc, hi ? 16 : 6, 1, () => 0.0108, (q, t) => {
        const k = (q * 2 - 1) * 1.02;
        const kk = Math.max(-1, Math.min(1, k));
        const half = 0.004 + 0.006 * (0.5 + 0.5 * k * s) ;
        return [cx + s * k * spec.rx, Math.min(edge(kk), top(kk)) + (t - 0.35) * 2 * half];
      }, () => ({ a: [SLOT.dark, SLOT.dark, 0, 235], b: B(0.55) })));
      appendMesh(out, eyeArc(hc, spec, s, 150, 32, 1.3, (q) => 0.022 * Math.sin(Math.PI * q), SLOT.skinShade, hi ? 14 : 6, 0.0035, 0.6));
      appendMesh(out, eyeArc(hc, spec, s, -100, -12, 1.03, (q) => 0.028 * Math.sin(Math.PI * q), SLOT.brow, hi ? 12 : 5, 0.006, 0.6));
      continue;
    }
    // Upper lash line: thin at the inner corner, bold at the outer one.
    const a1 = flick ? -12 : 6;
    appendMesh(out, eyeArc(hc, spec, s, 176, a1, 1.02, (q) => 0.03 + 0.1 * Math.pow(Math.sin(Math.PI * Math.min(1, q * 0.92)), 0.6) * (0.55 + 0.45 * q), SLOT.dark, hi ? 22 : 8, 0.0105, 0.55,
      (q) => (flick && q > 0.86 ? (q - 0.86) * 0.12 : 0)));
    if (lashes && hi)
      for (const [deg, l] of [[30, 0.05], [14, 0.065], [0, 0.07]] as const) {
        const ang = (deg * Math.PI) / 180;
        const bx = cx + s * Math.cos(ang) * spec.rx * 1.06, by = spec.cy + Math.sin(ang) * spec.ry * 1.06;
        const dx = s * Math.cos(ang) * 0.6 + s * 0.6, dy = Math.sin(ang) * 0.5 + 0.5;
        const dl = Math.hypot(dx, dy);
        appendMesh(out, decal(hc, 1, 3, () => 0.0105, (q, t) => {
          const w = 0.006 * (1 - t);
          return [bx + (dx / dl) * l * t + (q - 0.5) * 2 * w * (-dy / dl), by + (dy / dl) * l * t + (q - 0.5) * 2 * w * (dx / dl)];
        }, () => ({ a: [SLOT.dark, SLOT.dark, 0, 235], b: B(0.55) })));
      }
    // Lid crease and a fine lower lash line (outer half).
    appendMesh(out, eyeArc(hc, spec, s, 150, 32, 1.3, (q) => 0.022 * Math.sin(Math.PI * q), SLOT.skinShade, hi ? 14 : 6, 0.0035, 0.6));
    appendMesh(out, eyeArc(hc, spec, s, -100, -12, 1.03, (q) => 0.028 * Math.sin(Math.PI * q), SLOT.brow, hi ? 12 : 5, 0.006, 0.6));
  }
  return out;
}

/** Brows: soft tapered arches in the hair colour, full at the inner end. */
export function brows(hc: V3, lift: number, liftRight: number, hi: boolean): AttrMesh {
  const out = emptyMesh();
  for (const s of [1, -1]) {
    const l = lift + (s < 0 ? liftRight : 0);
    appendMesh(out, decal(
      hc, hi ? 14 : 6, 1,
      () => 0.0028,
      (q, t) => {
        const x = s * (0.095 + 0.16 * q);
        const y = 0.112 + l + 0.016 * Math.sin(Math.PI * Math.min(1, q * 1.15)) - 0.024 * q;
        const half = (0.0125 - 0.0075 * q) * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * q)), 0.35);
        return [x, y + (t - 0.5) * 2 * half];
      },
      () => ({ a: [SLOT.brow, SLOT.brow, 0, 240], b: B(0.6) }),
    ));
  }
  return out;
}

export type MouthKind = Expression | "talk1" | "talk2" | "talk3";
/** Mouth decals (one per mouth piece, swapped while talking): a closed
 * smile with defined lips, or an open mouth with lips, teeth and tongue. */
export function mouth(hc: V3, kind: MouthKind, hi: boolean): AttrMesh {
  const MY = -0.222;
  // Outline per kind: half width, smile curvature, opening depth, roundness.
  const spec: Record<MouthKind, { w: number; up: number; depth: number; round?: number }> = {
    smile: { w: 0.054, up: 0.016, depth: 0 },
    proud: { w: 0.058, up: 0.022, depth: 0 },
    thoughtful: { w: 0.044, up: 0.01, depth: 0 },
    grin: { w: 0.056, up: 0.012, depth: 0.042 },
    excited: { w: 0.062, up: 0.012, depth: 0.052 },
    talk1: { w: 0.05, up: 0.01, depth: 0.022 },
    talk2: { w: 0.05, up: 0.008, depth: 0.046 },
    talk3: { w: 0.034, up: 0.002, depth: 0.04, round: 1 },
  };
  const m = spec[kind];
  if (!m.depth) {
    // Closed smile: dark line, thin upper lip, fuller lower lip, corner ticks.
    return decal(
      hc, hi ? 20 : 8, hi ? 6 : 2,
      () => 0.0016,
      (q, t) => {
        const k = q * 2 - 1;
        const x = k * (m.w + 0.006);
        const line = MY + m.up * k * k - 0.004;
        const upT = 0.006 * (1 - k * k * 0.8), loT = 0.011 * (1 - k * k) ;
        return [x, line + upT - t * (upT + loT)];
      },
      (q, t) => {
        const k = Math.abs(q * 2 - 1);
        const upT = 0.006 * (1 - k * k * 0.8), loT = 0.011 * (1 - k * k);
        const tl = upT / (upT + loT || 1);
        const lineHalf = 0.12 + 0.25 * k;
        const slot = Math.abs(t - tl) < lineHalf * 0.5 || k > 0.9 ? SLOT.mouth : SLOT.lip;
        return { a: [slot, slot, 0, slot === SLOT.lip && t > tl + 0.2 && t < 0.8 && k < 0.5 ? 255 : 232], b: B(slot === SLOT.lip ? 0.35 : 0.45) };
      },
    );
  }
  // Open mouth: outline top/bottom curves, lips around a dark opening.
  return decal(
    hc, hi ? 20 : 8, hi ? 8 : 3,
    () => 0.0018,
    (q, t) => {
      const k = q * 2 - 1;
      const x = k * m.w;
      const top = MY + 0.012 + m.up * k * k + (m.round ? 0.012 * (1 - k * k) : 0);
      const bottom = top - m.depth * Math.pow(Math.max(0, 1 - k * k), m.round ? 0.5 : 0.62) - 0.004;
      return [x, top + (bottom - top) * t];
    },
    (q, t) => {
      const k = Math.abs(q * 2 - 1);
      const edge = Math.min(t, 1 - t) * (m.depth / 0.04) + (1 - k) * 0.4;
      let slot: number = SLOT.mouth;
      if (t < 0.14 || t > 0.8 || k > 0.92 || edge < 0.1) slot = SLOT.lip;
      else if (t < 0.32 && k < 0.78 && !m.round) slot = SLOT.white;
      else if (t > 0.6 && k < 0.55) slot = SLOT.lip;
      const tongue = slot === SLOT.lip && t > 0.6 && t <= 0.8 && k < 0.55;
      return { a: [slot, tongue ? SLOT.mouth : slot, tongue ? 90 : 0, slot === SLOT.lip && t > 0.8 && k < 0.5 ? 255 : 232], b: B(slot === SLOT.white ? 0.3 : 0.4) };
    },
  );
}

/** A round tube along a polyline-generated loop or path (analytic, smooth). */
function tube(path: V3[], radius: number, closed: boolean, sides: number, slot: number, rough: number, metal: number): AttrMesh {
  const m = emptyMesh();
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const q = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], o = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const t = norm([q[0] - o[0], q[1] - o[1], q[2] - o[2]]);
    let a = norm([t[1] * 0 - t[2] * 1, t[2] * 0 - t[0] * 0, t[0] * 1 - t[1] * 0]);
    if (Math.hypot(...a) < 0.5) a = [1, 0, 0];
    const b = norm([t[1] * a[2] - t[2] * a[1], t[2] * a[0] - t[0] * a[2], t[0] * a[1] - t[1] * a[0]]);
    a = norm([b[1] * t[2] - b[2] * t[1], b[2] * t[0] - b[0] * t[2], b[0] * t[1] - b[1] * t[0]]);
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      const nx = a[0] * Math.cos(ang) + b[0] * Math.sin(ang), ny = a[1] * Math.cos(ang) + b[1] * Math.sin(ang), nz = a[2] * Math.cos(ang) + b[2] * Math.sin(ang);
      m.pos.push(p[0] + nx * radius, p[1] + ny * radius, p[2] + nz * radius);
      m.nrm.push(nx, ny, nz);
      m.a.push(slot, slot, 0, 235);
      m.b.push(...B(rough, metal));
    }
  }
  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sides; j++) {
      const a0 = i * sides + j, a1 = i * sides + ((j + 1) % sides), b0 = ((i + 1) % n) * sides + j, b1 = ((i + 1) % n) * sides + ((j + 1) % sides);
      m.tri.push(a0, a1, b1, a0, b1, b0);
    }
  orient(m);
  return m;
}

/** Round glasses floating just off the face (+ dark lenses for sunglasses). */
export function glasses(hc: V3, spec: EyeSpec, slot: number, sun: boolean, hi: boolean): AttrMesh {
  const out = emptyMesh();
  const lift = 0.03;
  const at = (x: number, y: number, extra = 0): V3 => {
    const p = facePoint(x, y, hc), n = faceNormal(x, y, hc);
    return [p[0] + n[0] * (lift + extra), p[1] + n[1] * (lift + extra), p[2] + n[2] * (lift + extra)];
  };
  const R = spec.ry * 1.12, segs = hi ? 22 : 10, sides = hi ? 5 : 3;
  for (const s of [1, -1]) {
    const loop: V3[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      loop.push(at(s * spec.cx + Math.cos(a) * R, spec.cy + Math.sin(a) * R));
    }
    appendMesh(out, tube(loop, 0.0075, true, sides, slot, 0.25, 0.8));
    if (sun)
      appendMesh(out, decal(hc, segs, 2, () => lift, (q, t) => [s * spec.cx + Math.cos(q * Math.PI * 2) * R * t, spec.cy + Math.sin(q * Math.PI * 2) * R * t], () => ({ a: [SLOT.dark, SLOT.dark, 0, 200], b: B(0.08) })));
    // Temple arm back toward the ear.
    const o = at(s * (spec.cx + R), spec.cy + 0.01);
    appendMesh(out, tube([o, [s * 0.33, hc[1] + spec.cy + 0.03, hc[2] + 0.12], [s * 0.37, hc[1] + spec.cy + 0.04, hc[2] - 0.04]], 0.006, false, sides, slot, 0.25, 0.8));
  }
  const bridge: V3[] = [];
  for (let i = 0; i <= 6; i++) { const x = -spec.cx + R + (2 * (spec.cx - R)) * (i / 6); bridge.push(at(x, spec.cy + 0.02 + 0.012 * Math.sin(Math.PI * i / 6), 0.004)); }
  appendMesh(out, tube(bridge, 0.0065, false, sides, slot, 0.25, 0.8));
  return out;
}
