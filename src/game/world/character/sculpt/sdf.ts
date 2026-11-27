/**
 * Signed distance fields for the offline character sculpt (pure maths, no
 * three.js). A piece is a list of ops (smooth union / subtraction /
 * intersection) over primitive nodes; every node carries a material (palette
 * slot + surface), and evaluation reports the material of the surface that
 * wins, so colour regions follow the sculpt exactly.
 */
export type V3 = [number, number, number];

/** Palette slots (one row of the runtime palette texture per instance). */
export const SLOT = {
  skin: 0,
  blush: 1,
  lip: 2,
  hair: 3,
  hairLight: 4,
  brow: 5,
  iris: 6, // eye vertices (sclera/iris/pupil are shaded procedurally)
  top: 7,
  topTrim: 8,
  bottom: 9,
  bottomTrim: 10,
  outer: 11,
  outerTrim: 12,
  shoe: 13,
  sole: 14,
  leather: 15,
  metal: 16,
  hat: 17,
  hatBand: 18,
  glove: 19,
  white: 20,
  dark: 21,
  mouth: 22,
  skinShade: 23,
  // 24..31: per-extra accent colours (two per extra, up to four extras)
  accent: 24,
} as const;

export type Mat = {
  slot: number;
  /** Surface: roughness / metalness (0..1). */
  rough: number;
  metal?: number;
  /** Procedural paint applied at bake time. */
  paint?: "face" | "hair" | "eye";
};
export type Disp =
  | { kind: "folds"; amp: number; freq: number; c: V3 } // vertical folds around c
  | { kind: "locks"; amp: number; freq: number; c: V3 } // hair clumps around c
  | { kind: "rib"; amp: number; freq: number; c: V3 } // horizontal knit ribs
  | { kind: "bumps"; amp: number; freq: number };

type Base = { m?: Mat; disp?: Disp };
export type Node = Base &
  (
    | { t: "sph"; c: V3; r: number }
    | { t: "ell"; c: V3; r: V3; rot?: V3 }
    | { t: "cap"; a: V3; b: V3; r: number }
    | { t: "cone"; a: V3; b: V3; ra: number; rb: number }
    | { t: "box"; c: V3; h: V3; r: number; rot?: V3 }
    | { t: "tor"; c: V3; R: number; r: number; rot?: V3; sx?: number; sz?: number }
    | { t: "cyl"; c: V3; h: number; r: number; rr: number; rot?: V3 }
    | {
        t: "skirt";
        c: V3;
        len: number;
        rTop: number;
        rHem: number;
        zs: number;
        thick: number;
        wave: number;
        waves: number;
        /** Open front: removes |angle| < gap (radians) around +z. */
        gap?: number;
        /** Front only: keeps |angle| < front. */
        front?: number;
      }
    | { t: "plane"; n: V3; o: number }
    | { t: "grp"; ops: Op[] }
    /** Offset shell of a group (garment layer), clipped by regions. */
    | { t: "shell"; of: Node; d: number; clip?: Node[] }
    | { t: "not"; n: Node }
  );
export type Op = { op: "add" | "sub" | "int"; k: number; n: Node };
export type Piece = { ops: Op[] };

// --- vector helpers ------------------------------------------------------------
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

type M3 = Float64Array;
const rotCache = new WeakMap<object, M3>();
/** Inverse rotation (transpose of Euler XYZ) for a node, cached. */
function invRot(node: object, rot: V3): M3 {
  let m = rotCache.get(node);
  if (m) return m;
  const [a, b, c] = rot;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rx * Ry * Rz (three.js "XYZ")
  const r = [
    cb * cc, -cb * sc, sb,
    ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb,
    sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb,
  ];
  m = new Float64Array([r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]]);
  rotCache.set(node, m);
  return m;
}
const tmp: V3 = [0, 0, 0];
function local(p: V3, c: V3, rot: V3 | undefined, node: object): V3 {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  if (!rot) {
    tmp[0] = x; tmp[1] = y; tmp[2] = z;
    return tmp;
  }
  const m = invRot(node, rot);
  tmp[0] = m[0] * x + m[1] * y + m[2] * z;
  tmp[1] = m[3] * x + m[4] * y + m[5] * z;
  tmp[2] = m[6] * x + m[7] * y + m[8] * z;
  return tmp;
}

function dispValue(d: Disp, p: V3) {
  switch (d.kind) {
    case "folds": {
      const a = Math.atan2(p[0] - d.c[0], p[2] - d.c[2]);
      return d.amp * Math.sin(a * d.freq + (p[1] - d.c[1]) * 4);
    }
    case "locks": {
      const a = Math.atan2(p[0] - d.c[0], p[2] - d.c[2]);
      const s = Math.abs(Math.sin(a * d.freq * 0.5 + (p[1] - d.c[1]) * 2.5));
      // Sharp creases between rounded clumps.
      return d.amp * (1 - s) * (1 - s) * 2 - d.amp * 0.4;
    }
    case "rib": {
      const a = Math.atan2(p[0] - d.c[0], p[2] - d.c[2]);
      return d.amp * Math.abs(Math.sin(a * d.freq));
    }
    case "bumps":
      return d.amp * (Math.sin(p[0] * d.freq) * Math.sin(p[1] * d.freq * 1.13 + 1) * Math.sin(p[2] * d.freq * 0.91 + 2));
  }
}

export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

/** Distance to a node (material ignored). */
export function dist(n: Node, p: V3): number {
  let d: number;
  switch (n.t) {
    case "sph":
      d = len3(p[0] - n.c[0], p[1] - n.c[1], p[2] - n.c[2]) - n.r;
      break;
    case "ell": {
      const L = local(p, n.c, n.rot, n);
      const x = L[0], y = L[1], z = L[2];
      const k0 = len3(x / n.r[0], y / n.r[1], z / n.r[2]);
      const k1 = len3(x / (n.r[0] * n.r[0]), y / (n.r[1] * n.r[1]), z / (n.r[2] * n.r[2]));
      d = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(n.r[0], n.r[1], n.r[2]);
      break;
    }
    case "cap": {
      const bx = n.b[0] - n.a[0], by = n.b[1] - n.a[1], bz = n.b[2] - n.a[2];
      const px = p[0] - n.a[0], py = p[1] - n.a[1], pz = p[2] - n.a[2];
      const h = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
      d = len3(px - bx * h, py - by * h, pz - bz * h) - n.r;
      break;
    }
    case "cone": {
      // Round cone (iq): spheres ra at a, rb at b, tangent hull.
      const bx = n.b[0] - n.a[0], by = n.b[1] - n.a[1], bz = n.b[2] - n.a[2];
      const l2 = bx * bx + by * by + bz * bz;
      const rr = n.ra - n.rb, a2 = l2 - rr * rr, il2 = 1 / l2;
      const px = p[0] - n.a[0], py = p[1] - n.a[1], pz = p[2] - n.a[2];
      const y = px * bx + py * by + pz * bz, z = y - l2;
      const qx = px * l2 - bx * y, qy = py * l2 - by * y, qz = pz * l2 - bz * y;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(z) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - n.rb;
      else if (Math.sign(y) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - n.ra;
      else d = (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - n.ra;
      break;
    }
    case "box": {
      const q = local(p, n.c, n.rot, n);
      const qx = Math.abs(q[0]) - n.h[0] + n.r, qy = Math.abs(q[1]) - n.h[1] + n.r, qz = Math.abs(q[2]) - n.h[2] + n.r;
      d = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - n.r;
      break;
    }
    case "tor": {
      const q = local(p, n.c, n.rot, n);
      const x = q[0] / (n.sx ?? 1), z = q[2] / (n.sz ?? 1);
      const qx = Math.sqrt(x * x + z * z) - n.R;
      d = Math.sqrt(qx * qx + q[1] * q[1]) - n.r;
      break;
    }
    case "cyl": {
      const q = local(p, n.c, n.rot, n);
      const dx = Math.sqrt(q[0] * q[0] + q[2] * q[2]) - n.r + n.rr;
      const dy = Math.abs(q[1]) - n.h + n.rr;
      d = Math.min(Math.max(dx, dy), 0) + len3(Math.max(dx, 0), Math.max(dy, 0), 0) - n.rr;
      break;
    }
    case "skirt": {
      const x = p[0] - n.c[0], y = p[1] - n.c[1], z = (p[2] - n.c[2]) / n.zs;
      const ang = Math.atan2(x, z);
      const r = Math.sqrt(x * x + z * z);
      const t = clamp(-y / n.len, 0, 1);
      const wav = Math.cos(ang * n.waves);
      const R = n.rTop + (n.rHem - n.rTop) * Math.pow(t, 0.85) + n.wave * wav * t * t;
      // Solid bell (robust to mesh) unless it is an open/partial panel.
      let s = n.gap || n.front ? Math.abs(r - R) - n.thick : (r - R) * 0.9;
      const hem = -n.len + n.wave * 0.5 * wav;
      s = smax(s, y, 0.01);
      s = smax(s, hem - y, 0.012);
      if (n.gap) s = smax(s, (n.gap - Math.abs(ang)) * Math.max(r, 0.05), 0.01);
      if (n.front) s = smax(s, (Math.abs(ang) - n.front) * Math.max(r, 0.05), 0.01);
      d = s;
      break;
    }
    case "plane":
      d = p[0] * n.n[0] + p[1] * n.n[1] + p[2] * n.n[2] - n.o;
      break;
    case "grp":
      d = evalOps(n.ops, p, null);
      break;
    case "shell": {
      d = dist(n.of, p) - n.d;
      for (const c of n.clip ?? []) d = smax(d, dist(c, p), 0.008);
      break;
    }
    case "not":
      d = -dist(n.n, p);
      break;
  }
  if (n.disp) d += dispValue(n.disp, p);
  return d;
}

// --- bounding boxes (conservative), for culling ops away from a point -------------
export type BB = { min: V3; max: V3 };
const INF_BB: BB = { min: [-1e9, -1e9, -1e9], max: [1e9, 1e9, 1e9] };
const bbCache = new WeakMap<object, BB>();
export function bbox(n: Node): BB {
  const hit = bbCache.get(n);
  if (hit) return hit;
  let b: BB;
  const grow = (c: V3, r: number): BB => ({ min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r] });
  switch (n.t) {
    case "sph": b = grow(n.c, n.r); break;
    case "ell": b = grow(n.c, Math.max(...n.r)); break;
    case "cap": b = union(grow(n.a, n.r), grow(n.b, n.r)); break;
    case "cone": b = union(grow(n.a, n.ra), grow(n.b, n.rb)); break;
    case "box": b = grow(n.c, len3(n.h[0], n.h[1], n.h[2])); break;
    case "tor": b = grow(n.c, n.R * Math.max(n.sx ?? 1, n.sz ?? 1) + n.r); break;
    case "cyl": b = grow(n.c, Math.sqrt(n.r * n.r + n.h * n.h)); break;
    case "skirt": {
      const R = n.rHem + Math.abs(n.wave) + n.thick;
      b = { min: [n.c[0] - R, n.c[1] - n.len - Math.abs(n.wave), n.c[2] - R * n.zs], max: [n.c[0] + R, n.c[1] + 0.02, n.c[2] + R * n.zs] };
      break;
    }
    case "grp": {
      const adds = n.ops.filter((o) => o.op !== "sub");
      b = adds.length ? adds.map((o) => pad(bbox(o.n), o.k)).reduce(union) : INF_BB;
      break;
    }
    case "shell": b = pad(bbox(n.of), n.d); break;
    default: b = INF_BB;
  }
  if (n.disp) b = pad(b, Math.abs(n.disp.amp) * 2);
  bbCache.set(n, b);
  return b;
}
export function union(a: BB, b: BB): BB {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}
export const pad = (b: BB, r: number): BB => ({
  min: [b.min[0] - r, b.min[1] - r, b.min[2] - r],
  max: [b.max[0] + r, b.max[1] + r, b.max[2] + r],
});
function bbDist(b: BB, p: V3) {
  const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]);
  const dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]);
  const dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export type Hit = { d: number; m: Mat | null };
const DEFAULT_MAT: Mat = { slot: SLOT.skin, rough: 0.6 };
/** Evaluate an op list; with `hit`, also reports the winning material. */
export function evalOps(ops: Op[], p: V3, hit: Hit | null): number {
  let d = 1e9;
  let m: Mat | null = null;
  for (const o of ops) {
    const b = bbox(o.n);
    if (o.op === "add") {
      if (d < 1e8 && bbDist(b, p) > d + o.k) continue;
      const dn = hit && o.n.t === "grp" ? evalSub(o.n.ops, p, hit) : dist(o.n, p);
      const mn = hit && o.n.t === "grp" ? hit.m : (o.n.m ?? null);
      if (hit && (dn < d || m === null)) m = mn ?? m;
      d = d >= 1e8 ? dn : smin(d, dn, o.k);
    } else if (o.op === "sub") {
      if (bbDist(b, p) > o.k + 0.001 && b !== INF_BB) continue;
      const dn = dist(o.n, p);
      const nd = smax(d, -dn, o.k);
      if (hit && o.n.m && -dn > d - o.k * 0.25) m = o.n.m;
      d = nd;
    } else {
      const dn = dist(o.n, p);
      d = smax(d, dn, o.k);
    }
  }
  if (hit) {
    hit.d = d;
    hit.m = m ?? DEFAULT_MAT;
  }
  return d;
}
function evalSub(ops: Op[], p: V3, hit: Hit) {
  const inner: Hit = { d: 0, m: null };
  const d = evalOps(ops, p, inner);
  hit.m = inner.m;
  return d;
}

export function pieceBounds(piece: Piece): BB {
  return piece.ops.filter((o) => o.op === "add").map((o) => pad(bbox(o.n), o.k)).reduce(union);
}
