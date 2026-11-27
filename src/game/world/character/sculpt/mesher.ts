/**
 * Offline meshing for the character sculpt: sparse surface nets over an SDF,
 * quadric-error decimation to a triangle budget, then per-vertex attributes
 * re-evaluated from the SDF (smooth normals, material, baked AO, paint).
 */
import type { V3 } from "./sdf";

export type Field = (x: number, y: number, z: number) => number;
export type RawMesh = { pos: Float64Array; tri: Uint32Array };

/** Surface nets on a grid of cell size h over [min, max]. Only cells near the
 * surface (from a 4× coarser pass) are evaluated exactly. */
export function surfaceNets(f: Field, min: V3, max: V3, h: number): RawMesh {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const C = 4;
  const cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++)
        coarse[i + cx * (j + cy * k)] = f(min[0] + i * C * h, min[1] + j * C * h, min[2] + k * C * h);
  const v = new Float32Array(nx * ny * nz);
  const H = C * h;
  const near = H * 1.9;
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let K = 0; K < cz - 1; K++)
    for (let J = 0; J < cy - 1; J++)
      for (let I = 0; I < cx - 1; I++) {
        const c000 = coarse[I + cx * (J + cy * K)], c100 = coarse[I + 1 + cx * (J + cy * K)];
        const c010 = coarse[I + cx * (J + 1 + cy * K)], c110 = coarse[I + 1 + cx * (J + 1 + cy * K)];
        const c001 = coarse[I + cx * (J + cy * (K + 1))], c101 = coarse[I + 1 + cx * (J + cy * (K + 1))];
        const c011 = coarse[I + cx * (J + 1 + cy * (K + 1))], c111 = coarse[I + 1 + cx * (J + 1 + cy * (K + 1))];
        const exact =
          Math.min(Math.abs(c000), Math.abs(c100), Math.abs(c010), Math.abs(c110), Math.abs(c001), Math.abs(c101), Math.abs(c011), Math.abs(c111)) < near;
        for (let k = K * C; k <= Math.min(nz - 1, K * C + C); k++)
          for (let j = J * C; j <= Math.min(ny - 1, J * C + C); j++)
            for (let i = I * C; i <= Math.min(nx - 1, I * C + C); i++) {
              const idx = at(i, j, k);
              if (exact) {
                v[idx] = f(min[0] + i * h, min[1] + j * h, min[2] + k * h);
              } else if (v[idx] === 0) {
                const u = (i - I * C) / C, w = (j - J * C) / C, t = (k - K * C) / C;
                const a = c000 + (c100 - c000) * u, b = c010 + (c110 - c010) * u;
                const c = c001 + (c101 - c001) * u, d = c011 + (c111 - c011) * u;
                const e = a + (b - a) * w, g = c + (d - c) * w;
                v[idx] = (e + (g - e) * t) || 1e-6;
              }
            }
      }
  // Vertices: one per sign-changing cell, at the mean of its edge crossings.
  const cells = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos: number[] = [];
  const corner = new Float32Array(8);
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cIdx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const val = v[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          corner[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of E) {
          const va = corner[a], vb = corner[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cells[cIdx(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
      }
  // Faces: a quad around every sign-changing grid edge.
  const tri: number[] = [];
  const P = pos;
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    const d1 = dist2(P, a, c), d2 = dist2(P, b, d);
    if (d1 < d2) tri.push(a, b, c, a, c, d);
    else tri.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = v[at(i, j, k)] < 0;
        if (i < nx - 1 && (v[at(i + 1, j, k)] < 0) !== v0)
          quad(cells[cIdx(i, j - 1, k - 1)], cells[cIdx(i, j, k - 1)], cells[cIdx(i, j, k)], cells[cIdx(i, j - 1, k)], !v0);
        if (j < ny - 1 && (v[at(i, j + 1, k)] < 0) !== v0)
          quad(cells[cIdx(i - 1, j, k - 1)], cells[cIdx(i - 1, j, k)], cells[cIdx(i, j, k)], cells[cIdx(i, j, k - 1)], !v0);
        if (k < nz - 1 && (v[at(i, j, k + 1)] < 0) !== v0)
          quad(cells[cIdx(i - 1, j - 1, k)], cells[cIdx(i, j - 1, k)], cells[cIdx(i, j, k)], cells[cIdx(i - 1, j, k)], !v0);
      }
  return { pos: Float64Array.from(pos), tri: Uint32Array.from(tri) };
}
function dist2(P: number[] | Float64Array, a: number, b: number) {
  const x = P[a * 3] - P[b * 3], y = P[a * 3 + 1] - P[b * 3 + 1], z = P[a * 3 + 2] - P[b * 3 + 2];
  return x * x + y * y + z * z;
}

/** Project vertices onto the zero set (a couple of Newton steps). */
export function project(f: Field, pos: Float64Array, eps: number, steps = 2) {
  for (let i = 0; i < pos.length; i += 3) {
    for (let s = 0; s < steps; s++) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      const d = f(x, y, z);
      const gx = (f(x + eps, y, z) - f(x - eps, y, z)) / (2 * eps);
      const gy = (f(x, y + eps, z) - f(x, y - eps, z)) / (2 * eps);
      const gz = (f(x, y, z + eps) - f(x, y, z - eps)) / (2 * eps);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-8) break;
      const step = Math.max(-eps * 4, Math.min(eps * 4, d / g2));
      pos[i] = x - gx * step;
      pos[i + 1] = y - gy * step;
      pos[i + 2] = z - gz * step;
    }
  }
}

// --- Quadric edge-collapse decimation ---------------------------------------------
class Heap {
  cost: number[] = [];
  a: number[] = [];
  b: number[] = [];
  sa: number[] = [];
  sb: number[] = [];
  size = 0;
  push(c: number, a: number, b: number, sa: number, sb: number) {
    let i = this.size++;
    this.cost[i] = c; this.a[i] = a; this.b[i] = b; this.sa[i] = sa; this.sb[i] = sb;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[p] <= this.cost[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number, number, number, number] | null {
    if (!this.size) return null;
    const r: [number, number, number, number, number] = [this.cost[0], this.a[0], this.b[0], this.sa[0], this.sb[0]];
    this.size--;
    if (this.size) {
      this.swap(0, this.size);
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, rr = l + 1;
        let m = i;
        if (l < this.size && this.cost[l] < this.cost[m]) m = l;
        if (rr < this.size && this.cost[rr] < this.cost[m]) m = rr;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return r;
  }
  private swap(i: number, j: number) {
    for (const arr of [this.cost, this.a, this.b, this.sa, this.sb]) {
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }
}

/** Decimate to `targets` (descending triangle counts); returns a mesh per
 * target. `weight(x,y,z)` scales the error (preserve faces, hands). */
export function decimate(
  mesh: RawMesh,
  targets: number[],
  weight: (x: number, y: number, z: number, v?: number) => number,
  /** Material id per vertex: colour borders are kept in place. */
  slots?: Int32Array,
): RawMesh[] {
  const nV = mesh.pos.length / 3;
  const P = Float64Array.from(mesh.pos);
  const T = Int32Array.from(mesh.tri);
  const nT = T.length / 3;
  const alive = new Uint8Array(nT).fill(1);
  const vAlive = new Uint8Array(nV).fill(1);
  const stamp = new Int32Array(nV);
  const vf: number[][] = Array.from({ length: nV }, () => []);
  for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) vf[T[t * 3 + c]].push(t);
  const Q = new Float64Array(nV * 10);
  const slot = slots ? Int32Array.from(slots) : new Int32Array(nV);
  const border = new Uint8Array(nV);
  if (slots)
    for (let t = 0; t < nT; t++)
      for (let c = 0; c < 3; c++) {
        const u = T[t * 3 + c], w = T[t * 3 + ((c + 1) % 3)];
        if (slot[u] !== slot[w]) { border[u] = 1; border[w] = 1; }
      }
  const nrm = (t: number, out: number[]) => {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return Math.hypot(out[0], out[1], out[2]);
  };
  const n3 = [0, 0, 0];
  for (let t = 0; t < nT; t++) {
    const area2 = nrm(t, n3);
    if (area2 < 1e-14) continue;
    const a = n3[0] / area2, b = n3[1] / area2, c = n3[2] / area2;
    const v0 = T[t * 3];
    const d = -(a * P[v0 * 3] + b * P[v0 * 3 + 1] + c * P[v0 * 3 + 2]);
    const w = area2 * 0.5;
    const q = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    for (let k = 0; k < 3; k++) {
      const v = T[t * 3 + k];
      const vw = w * weight(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], v);
      for (let i = 0; i < 10; i++) Q[v * 10 + i] += q[i] * vw;
    }
  }
  const opt = [0, 0, 0];
  let penalty = false;
  const edgeCost = (a: number, b: number): number => {
    const q = new Array(10);
    for (let i = 0; i < 10; i++) q[i] = Q[a * 10 + i] + Q[b * 10 + i];
    const err = (x: number, y: number, z: number) =>
      q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
    if (border[a] || border[b]) {
      if (border[a] && border[b] && slot[a] !== slot[b] && !penalty) return Infinity;
      let best = Infinity;
      for (const v of border[a] && border[b] ? [a, b] : [border[a] ? a : b]) {
        const e = err(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        if (e < best) { best = e; opt[0] = P[v * 3]; opt[1] = P[v * 3 + 1]; opt[2] = P[v * 3 + 2]; }
      }
      return Math.max(0, best) + dist2(P, a, b) * 1e-6 + (penalty && slot[a] !== slot[b] ? 1 + dist2(P, a, b) * 1e3 : 0);
    }
    // Solve the 3×3 system for the optimal point.
    const A = [q[0], q[1], q[2], q[1], q[4], q[5], q[2], q[5], q[7]];
    const det = A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
    const mx = (P[a * 3] + P[b * 3]) / 2, my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2, mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2;
    let best = Infinity;
    if (Math.abs(det) > 1e-12) {
      const bx = -q[3], by = -q[6], bz = -q[8];
      const x = (bx * (A[4] * A[8] - A[5] * A[7]) - A[1] * (by * A[8] - A[5] * bz) + A[2] * (by * A[7] - A[4] * bz)) / det;
      const y = (A[0] * (by * A[8] - A[5] * bz) - bx * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * bz - by * A[6])) / det;
      const z = (A[0] * (A[4] * bz - by * A[7]) - A[1] * (A[3] * bz - by * A[6]) + bx * (A[3] * A[7] - A[4] * A[6])) / det;
      // Keep the solution near the edge (ill-conditioned flats run away).
      const L = Math.sqrt(dist2(P, a, b));
      if (Math.hypot(x - mx, y - my, z - mz) < L * 1.5) {
        best = err(x, y, z);
        opt[0] = x; opt[1] = y; opt[2] = z;
      }
    }
    for (const [x, y, z] of [[mx, my, mz], [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]]]) {
      const e = err(x, y, z);
      if (e < best) { best = e; opt[0] = x; opt[1] = y; opt[2] = z; }
    }
    return Math.max(0, best) + dist2(P, a, b) * 1e-6;
  };
  const heap = new Heap();
  const pushEdges = (v: number) => {
    const seen = new Set<number>();
    for (const t of vf[v]) {
      if (!alive[t]) continue;
      for (let c = 0; c < 3; c++) {
        const u = T[t * 3 + c];
        if (u === v || seen.has(u)) continue;
        seen.add(u);
        const cost = edgeCost(v, u);
        if (cost !== Infinity) heap.push(cost, v, u, stamp[v], stamp[u]);
      }
    }
  };
  for (let v = 0; v < nV; v++) {
    const seen = new Set<number>();
    for (const t of vf[v]) for (let c = 0; c < 3; c++) {
      const u = T[t * 3 + c];
      if (u > v && !seen.has(u)) {
        seen.add(u);
        const c = edgeCost(v, u);
        if (c !== Infinity) heap.push(c, v, u, 0, 0);
      }
    }
  }
  let faces = nT;
  for (let t = 0; t < nT; t++) if (nrm(t, n3) < 1e-14) { /* keep degenerate; removed by collapses */ }
  const out: RawMesh[] = [];
  const nOld = [0, 0, 0], nNew = [0, 0, 0];
  const neighbours = (v: number) => {
    const s = new Set<number>();
    for (const t of vf[v]) if (alive[t]) for (let c = 0; c < 3; c++) s.add(T[t * 3 + c]);
    s.delete(v);
    return s;
  };
  let force = false;
  const tryCollapse = (a: number, b: number, cost?: number): boolean => {
      // Link condition (keeps the surface manifold).
      const na = neighbours(a), nb = neighbours(b);
      let common = 0;
      for (const u of na) if (nb.has(u)) common++;
      if (common !== 2 && !(force && common > 0)) { if (cost !== undefined) retry(a, b, cost); return false; }
      if (edgeCost(a, b) === Infinity) return false;
      const nx = opt[0], ny = opt[1], nz = opt[2];
      // Reject collapses that flip a face.
      let ok = true;
      for (const v of [a, b]) {
        for (const t of vf[v]) {
          if (!alive[t]) continue;
          const i0 = T[t * 3], i1 = T[t * 3 + 1], i2 = T[t * 3 + 2];
          if ((i0 === a || i1 === a || i2 === a) && (i0 === b || i1 === b || i2 === b)) continue;
          nrm(t, nOld);
          const sv = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
          P[v * 3] = nx; P[v * 3 + 1] = ny; P[v * 3 + 2] = nz;
          const l = nrm(t, nNew);
          P[v * 3] = sv[0]; P[v * 3 + 1] = sv[1]; P[v * 3 + 2] = sv[2];
          const lo = Math.hypot(nOld[0], nOld[1], nOld[2]);
          if (l < 1e-14 || (nOld[0] * nNew[0] + nOld[1] * nNew[1] + nOld[2] * nNew[2]) / (lo * l) < 0.25) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (!ok) { if (cost !== undefined) retry(a, b, cost); return false; }
      // Collapse b into a (a takes b's border identity when it moves there).
      if (border[b] && !border[a]) { border[a] = 1; slot[a] = slot[b]; }
      P[a * 3] = nx; P[a * 3 + 1] = ny; P[a * 3 + 2] = nz;
      for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
      vAlive[b] = 0;
      for (const t of vf[b]) {
        if (!alive[t]) continue;
        let hasA = false;
        for (let c = 0; c < 3; c++) if (T[t * 3 + c] === a) hasA = true;
        if (hasA) { alive[t] = 0; faces--; continue; }
        for (let c = 0; c < 3; c++) if (T[t * 3 + c] === b) T[t * 3 + c] = a;
        vf[a].push(t);
      }
      vf[a] = vf[a].filter((t) => alive[t]);
      stamp[a]++;
      pushEdges(a);
      for (const u of neighbours(a)) { stamp[u]++; pushEdges(u); }
      return true;
  };
  const tries = new Map<number, number>();
  const retry = (a: number, b: number, cost: number) => {
    const key = a * nV + b;
    const n = (tries.get(key) ?? 0) + 1;
    tries.set(key, n);
    if (n <= 4) heap.push(cost * 2 + 1e-9, a, b, stamp[a], stamp[b]);
  };
  for (const target of targets) {
    while (faces > target) {
      const e = heap.pop();
      if (!e) break;
      const [, a, b, sa, sb] = e;
      if (!vAlive[a] || !vAlive[b] || stamp[a] !== sa || stamp[b] !== sb) continue;
      tryCollapse(a, b, e[0]);
    }
    if (faces > target && slots) {
      // Colour borders blocked the budget: allow the cheapest colour merges
      // last (small details shrink before big areas change colour).
      penalty = !env_nopen();
      for (let v = 0; v < nV; v++) if (vAlive[v]) { stamp[v]++; pushEdges(v); }
      while (faces > target) {
        const e = heap.pop();
        if (!e) break;
        const [, a, b, sa, sb] = e;
        if (!vAlive[a] || !vAlive[b] || stamp[a] !== sa || stamp[b] !== sb) continue;
        if (!tryCollapse(a, b)) continue;
      }
    }
    if (faces > target * 1.03 && (globalThis as { __forceDecimate?: boolean }).__forceDecimate) {
      // Still blocked (tangled thin features): relax the link condition.
      force = true;
      border.fill(0);
      for (let v = 0; v < nV; v++) if (vAlive[v]) { stamp[v]++; pushEdges(v); }
      while (faces > target) {
        const e = heap.pop();
        if (!e) break;
        const [, a, b, sa, sb] = e;
        if (!vAlive[a] || !vAlive[b] || stamp[a] !== sa || stamp[b] !== sb) continue;
        tryCollapse(a, b);
      }
      force = false;
    }
    out.push(compact(P, T, alive));
  }
  return out;
}
function compact(P: Float64Array, T: Int32Array, alive: Uint8Array): RawMesh {
  const map = new Map<number, number>();
  const pos: number[] = [], tri: number[] = [];
  for (let t = 0; t < alive.length; t++) {
    if (!alive[t]) continue;
    for (let c = 0; c < 3; c++) {
      const v = T[t * 3 + c];
      let n = map.get(v);
      if (n === undefined) { n = pos.length / 3; map.set(v, n); pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
      tri.push(n);
    }
  }
  return { pos: Float64Array.from(pos), tri: Uint32Array.from(tri) };
}
function env_nopen() {
  return !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BAKE_NOPEN;
}
