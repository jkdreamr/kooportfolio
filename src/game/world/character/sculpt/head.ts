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
  // Small soft button nose.
  const ang = Math.acos(Math.max(-1, Math.min(1, x * NOSE_DIR[0] + y * NOSE_DIR[1] + z * NOSE_DIR[2])));
  r += 0.026 * Math.exp(-((ang / 0.08) ** 2));
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
export function headSkin(hc: V3, rings: number, segs: number, paint: (p: V3) => { slotB: number; mix: number }): AttrMesh {
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
    m.a.push(SLOT.skin, pt.slotB, Math.round(pt.mix * 255), 255);
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
  vertexNormals(m);
  return m;
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
  return m;
}

export type EyeSpec = { cx: number; cy: number; rx: number; ry: number; iris: [number, number] };
/** Both eyes (exact mirror, level): conforming domed caps + lash bands. */
export function eyes(hc: V3, spec: EyeSpec, flick: boolean, hi: boolean): AttrMesh {
  const out = emptyMesh();
  for (const s of [1, -1]) {
    const cx = s * spec.cx;
    // Eye cap: polar grid, slight glossy dome.
    const cap = decal(
      hc, hi ? 24 : 10, hi ? 6 : 3,
      (_, t) => 0.002 + 0.007 * (1 - t * t),
      (a, t) => {
        const ang = a * Math.PI * 2;
        return [cx + Math.cos(ang) * spec.rx * t, spec.cy + Math.sin(ang) * spec.ry * t];
      },
      (a, t) => {
        const ang = a * Math.PI * 2;
        // Eye UV relative to the iris centre (nudged toward the nose).
        const u = Math.cos(ang) * t + s * spec.iris[0];
        const v = Math.sin(ang) * t - spec.iris[1];
        const eu = Math.round(Math.max(0, Math.min(255, (u * 0.5 + 0.5) * 255)));
        const ev = Math.round(Math.max(0, Math.min(255, (v * 0.5 + 0.5) * 255)));
        return { a: [SLOT.iris, SLOT.iris, 0, 245], b: B(0.08, 0, eu, ev) };
      },
    );
    appendMesh(out, cap);
    // Soft upper lash line: a tapered band over the top contour (+ flick).
    const a0 = 172, a1 = flick ? -8 : 12;
    const lash = decal(
      hc, hi ? 22 : 8, 1,
      () => 0.0105,
      (q, t) => {
        const deg = a0 + (a1 - a0) * q;
        const ang = (deg * Math.PI) / 180;
        const taper = Math.pow(Math.sin(Math.PI * Math.min(1, q * 1.05)), 0.7);
        const outer = flick && q > 0.85 ? (q - 0.85) * 1.2 : 0;
        const rr = 1.0 + (t - 0.35) * 0.16 * taper + outer;
        return [cx + s * Math.cos(ang) * spec.rx * rr, spec.cy + Math.sin(ang) * spec.ry * rr + outer * spec.ry * 0.35];
      },
      () => ({ a: [SLOT.dark, SLOT.dark, 0, 235], b: B(0.5) }),
    );
    appendMesh(out, lash);
  }
  return out;
}

/** Brows: thin soft arches in the hair colour, inner end slightly up. */
export function brows(hc: V3, lift: number, liftRight: number, hi: boolean): AttrMesh {
  const out = emptyMesh();
  for (const s of [1, -1]) {
    const l = lift + (s < 0 ? liftRight : 0);
    appendMesh(out, decal(
      hc, hi ? 14 : 6, 1,
      () => 0.0025,
      (q, t) => {
        const x = s * (0.1 + 0.15 * q);
        const y = 0.112 + l + 0.012 * Math.sin(Math.PI * q) - 0.02 * q;
        const half = 0.009 * Math.pow(Math.sin(Math.PI * (0.15 + 0.85 * q)), 0.6);
        return [x, y + (t - 0.5) * 2 * half];
      },
      () => ({ a: [SLOT.brow, SLOT.brow, 0, 240], b: B(0.6) }),
    ));
  }
  return out;
}

/** Mouth: flush smile band, or an open D-shaped grin with teeth and tongue. */
export function mouth(hc: V3, expr: Expression, hi: boolean): AttrMesh {
  const MY = -0.222;
  if (expr === "grin" || expr === "excited") {
    const w = expr === "excited" ? 0.062 : 0.055;
    const depth = expr === "excited" ? 0.05 : 0.042;
    return decal(
      hc, hi ? 18 : 8, hi ? 6 : 3,
      () => 0.0018,
      (q, t) => {
        const x = (q * 2 - 1) * w;
        const k = x / w;
        const top = MY + 0.012 + 0.008 * k * k;
        const bottom = top - depth * Math.sqrt(Math.max(0, 1 - k * k));
        return [x, top + (bottom - top) * t];
      },
      (q, t) => {
        const k = q * 2 - 1;
        const slot = t < 0.18 ? SLOT.white : t > 0.62 && Math.abs(k) < 0.55 ? SLOT.lip : SLOT.mouth;
        return { a: [slot, slot, 0, 230], b: B(0.4) };
      },
    );
  }
  const w = 0.056, up = expr === "proud" ? 0.022 : 0.018;
  return decal(
    hc, hi ? 18 : 8, 1,
    () => 0.0016,
    (q, t) => {
      const k = q * 2 - 1;
      const x = k * w;
      const half = 0.0058 * (1 - 0.55 * k * k);
      return [x, MY + up * k * k - 0.004 + (t - 0.5) * 2 * half];
    },
    () => ({ a: [SLOT.mouth, SLOT.mouth, 0, 235], b: B(0.45) }),
  );
}
