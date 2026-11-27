/**
 * Road geometry (pure, no three.js): axis-aligned road rectangles become one
 * merged, crowned ribbon with kerbs, rounded junction fillets, entrance
 * aprons and (optionally) a dashed centre line.
 *
 * - Union: coordinate compression of every rectangle edge, so a junction is
 *   one polygon and nothing is coplanar with anything else.
 * - Surface: a rectilinear grid refined globally (no T-junctions, so no
 *   cracks), crowned by the distance to the nearest road edge across the
 *   road, vertex-coloured by the style (wear band, mottle).
 * - Kerbs: one strip per maximal straight boundary edge, trimmed at convex
 *   corners so two strips never overlap, joined at concave (junction) corners
 *   by a 0.6 m-radius fillet arc that also widens the surface.
 *
 * The joints, setts, bricks and alternating kerb stones are not geometry: a
 * per-part pattern code (Surface.ts, `ROAD_PATTERN`) draws them in the shared
 * bake program, so a road costs a few thousand triangles and no new program.
 */

export type RoadRect = readonly [cx: number, cz: number, width: number, depth: number];
export type RoadStyle = "lane" | "pavers" | "setts" | "spirit" | "asphalt";

/** Mesh part names; Roads.tsx gives each its own material (pattern code). */
/** `surface` holds the quads of roads running along x (and the fillets),
 * `surfaceZ` those of roads running along z, so patterns follow the road. */
export type RoadPartName = "surface" | "surfaceZ" | "kerbX" | "kerbZ" | "apron" | "marking";

export type RoadPart = {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
};

export type RoadLook = {
  /** Surface colour and the centre-strip colour (sRGB hex). */
  base: string;
  /** Darker wheel-worn band (lane) or the raised centre strip (spirit). */
  centre?: { color: string; width: number };
  kerb: { width: number; height: number; color: string };
  apron: string;
  marking?: { color: string; dash: number; gap: number; width: number };
};

export const ROAD_LOOKS: Record<RoadStyle, RoadLook> = {
  // Home: packed earth, wheel-worn centre, flush river-stone kerb.
  lane: {
    base: "#b3a488",
    centre: { color: "#9f9173", width: 0.38 },
    kerb: { width: 0.2, height: 0.026, color: "#d2c7ad" },
    apron: "#c4b89e",
  },
  // Stanford: sandstone pavers inside a red-brick soldier course.
  pavers: {
    base: "#d3bd8c",
    kerb: { width: 0.3, height: 0.014, color: "#a5553d" },
    apron: "#dcc89b",
  },
  // Korea: granite setts; the palace approach adds the raised spirit road.
  setts: {
    base: "#a9a9a2",
    kerb: { width: 0.18, height: 0.035, color: "#bdbcb3" },
    apron: "#b8b7ae",
  },
  spirit: {
    base: "#a9a9a2",
    centre: { color: "#c4c3bb", width: 0.34 },
    kerb: { width: 0.18, height: 0.035, color: "#bdbcb3" },
    apron: "#b8b7ae",
  },
  // Korea, modern Seoul: asphalt, granite kerb, one dashed centre line.
  asphalt: {
    base: "#4b4d50",
    kerb: { width: 0.2, height: 0.07, color: "#b3b2aa" },
    apron: "#b8b7ae",
    marking: { color: "#e8e2c8", dash: 1.2, gap: 1.8, width: 0.12 },
  },
};

export type RoadNetwork = {
  style: RoadStyle;
  rects: readonly RoadRect[];
  /** Height of the road edge (the crown adds `crown` at the centre). */
  y: number;
  /** Ground level the kerb's outer face drops to. */
  ground: number;
  crown?: number;
  /** Door aprons: centre, facing (+1/−1 along `axis`), axis. */
  aprons?: readonly Apron[];
  /** Grid density: span between rows along a road, rows across one. */
  grid?: { step: number; across: number };
  /** Subset of `rects` (by index) that carry the spirit strip / marking. */
  centreRects?: readonly number[];
};

export type Apron = { x: number; z: number; axis: "x" | "z"; facing: 1 | -1 };

/* ------------------------------------------------------------------ union */

export type UnionGrid = {
  xs: number[];
  zs: number[];
  /** covered[i * (zs.length - 1) + j]: cell between xs[i..i+1], zs[j..j+1]. */
  covered: Uint8Array;
};

const EPS = 1e-6;
const uniq = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (!out.length || v - out[out.length - 1] > 1e-4) out.push(v);
  return out;
};

export function unionGrid(rects: readonly RoadRect[]): UnionGrid {
  const xs = uniq(rects.flatMap(([cx, , w]) => [cx - w / 2, cx + w / 2]));
  const zs = uniq(rects.flatMap(([, cz, , d]) => [cz - d / 2, cz + d / 2]));
  const nz = zs.length - 1;
  const covered = new Uint8Array(Math.max(0, (xs.length - 1) * nz));
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < nz; j++) {
      const x = (xs[i] + xs[i + 1]) / 2,
        z = (zs[j] + zs[j + 1]) / 2;
      covered[i * nz + j] = rects.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2) ? 1 : 0;
    }
  return { xs, zs, covered };
}

const cellAt = (g: UnionGrid, i: number, j: number) =>
  i < 0 || j < 0 || i >= g.xs.length - 1 || j >= g.zs.length - 1 ? 0 : g.covered[i * (g.zs.length - 1) + j];

/** Area of the union (exact for axis-aligned rectangles). */
export function unionArea(g: UnionGrid) {
  let area = 0;
  for (let i = 0; i < g.xs.length - 1; i++)
    for (let j = 0; j < g.zs.length - 1; j++)
      if (cellAt(g, i, j)) area += (g.xs[i + 1] - g.xs[i]) * (g.zs[j + 1] - g.zs[j]);
  return area;
}

/** Inside the union (open set, so shared edges count once). */
export function insideUnion(rects: readonly RoadRect[], x: number, z: number, pad = 0) {
  return rects.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 + pad && Math.abs(z - cz) < d / 2 + pad);
}

/* ------------------------------------------------------------- boundary */

/** A maximal straight boundary edge. `side` points from the road outward. */
export type Edge = {
  axis: "x" | "z";
  /** Constant coordinate (z for an x-edge, x for a z-edge). */
  at: number;
  from: number;
  to: number;
  side: 1 | -1;
};

export function boundaryEdges(g: UnionGrid): Edge[] {
  const edges: Edge[] = [];
  const nx = g.xs.length - 1,
    nz = g.zs.length - 1;
  // x-edges: horizontal lines z = zs[j], between cells (i, j-1) and (i, j).
  for (let j = 0; j <= nz; j++)
    for (const side of [1, -1] as const) {
      let open: Edge | null = null;
      for (let i = 0; i < nx; i++) {
        const below = cellAt(g, i, j - 1),
          above = cellAt(g, i, j);
        // side +1: road below, outside above.
        const on = side === 1 ? below && !above : above && !below;
        if (on) {
          if (open && Math.abs(open.to - g.xs[i]) < EPS) open.to = g.xs[i + 1];
          else edges.push((open = { axis: "x", at: g.zs[j], from: g.xs[i], to: g.xs[i + 1], side }));
        } else open = null;
      }
    }
  for (let i = 0; i <= nx; i++)
    for (const side of [1, -1] as const) {
      let open: Edge | null = null;
      for (let j = 0; j < nz; j++) {
        const left = cellAt(g, i - 1, j),
          right = cellAt(g, i, j);
        const on = side === 1 ? left && !right : right && !left;
        if (on) {
          if (open && Math.abs(open.to - g.zs[j]) < EPS) open.to = g.zs[j + 1];
          else edges.push((open = { axis: "z", at: g.xs[i], from: g.zs[j], to: g.zs[j + 1], side }));
        } else open = null;
      }
    }
  return edges;
}

/** A junction corner: three of the four cells around (x, z) are road. The
 * open quadrant lies toward (sx, sz). */
export type Concave = { x: number; z: number; sx: 1 | -1; sz: 1 | -1; r: number };

export function concaveCorners(g: UnionGrid, edges: readonly Edge[], radius = 0.6): Concave[] {
  const out: Concave[] = [];
  for (let i = 1; i < g.xs.length - 1; i++)
    for (let j = 1; j < g.zs.length - 1; j++) {
      const q = [cellAt(g, i - 1, j - 1), cellAt(g, i, j - 1), cellAt(g, i - 1, j), cellAt(g, i, j)];
      if (q[0] + q[1] + q[2] + q[3] !== 3) continue;
      const open = q.indexOf(0);
      const sx = open === 1 || open === 3 ? 1 : -1,
        sz = open >= 2 ? 1 : -1;
      const x = g.xs[i],
        z = g.zs[j];
      // Room for the fillet: the open cell's size and the two edges leaving
      // this corner (each keeps at least half its length straight).
      const cellX = sx > 0 ? g.xs[i + 1] - x : x - g.xs[i - 1];
      const cellZ = sz > 0 ? g.zs[j + 1] - z : z - g.zs[j - 1];
      const along = (axis: "x" | "z") => {
        const e = edges.find((e) => e.axis === axis && Math.abs(e.at - (axis === "x" ? z : x)) < EPS &&
          (Math.abs(e.from - (axis === "x" ? x : z)) < EPS || Math.abs(e.to - (axis === "x" ? x : z)) < EPS));
        return e ? e.to - e.from : 0;
      };
      const r = Math.min(radius, cellX * 0.9, cellZ * 0.9, along("x") * 0.45, along("z") * 0.45);
      if (r > 0.05) out.push({ x, z, sx: sx as 1 | -1, sz: sz as 1 | -1, r });
    }
  return out;
}

/** Convex corners: exactly one of the four cells around a vertex is road. */
function convexAt(g: UnionGrid, x: number, z: number) {
  const i = g.xs.findIndex((v) => Math.abs(v - x) < EPS),
    j = g.zs.findIndex((v) => Math.abs(v - z) < EPS);
  if (i < 0 || j < 0) return false;
  const n = cellAt(g, i - 1, j - 1) + cellAt(g, i, j - 1) + cellAt(g, i - 1, j) + cellAt(g, i, j);
  return n === 1 || (n === 2 && cellAt(g, i - 1, j - 1) === cellAt(g, i, j));
}

/* ------------------------------------------------------------ utilities */

function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}

/** Smooth 1D value noise in [0, 1]. */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x),
    f = x - i;
  const h = (k: number) => {
    let v = Math.imul((k + seed * 7919) | 0, 0x27d4eb2d);
    v = Math.imul(v ^ (v >>> 15), 0x165667b1);
    return ((v ^ (v >>> 13)) >>> 0) / 4294967296;
  };
  const s = f * f * (3 - 2 * f);
  return h(i) + (h(i + 1) - h(i)) * s;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Refine the compressed coordinates: long spans every `step`, narrow spans
 * (a road's width) into at least `across` parts. */
export function refine(edges: number[], step = 1.1, across = 6, narrow = 4.6) {
  const out: number[] = [edges[0]];
  for (let k = 0; k < edges.length - 1; k++) {
    const a = edges[k],
      b = edges[k + 1],
      span = b - a;
    let n = Math.max(1, Math.ceil(span / step - 1e-6));
    if (span <= narrow) n = Math.max(n, Math.round(across * Math.min(1, span / 3)));
    for (let s = 1; s <= n; s++) out.push(a + (span * s) / n);
  }
  return out;
}

/** 0 at a road's edge, 1 on its centre line (max over the rectangles). */
export function crownAt(rects: readonly RoadRect[], x: number, z: number) {
  let best = 0;
  for (const [cx, cz, w, d] of rects) {
    const dx = Math.abs(x - cx),
      dz = Math.abs(z - cz);
    if (dx > w / 2 + EPS || dz > d / 2 + EPS) continue;
    const u = w < d ? 1 - dx / (w / 2) : 1 - dz / (d / 2);
    best = Math.max(best, u);
  }
  return Math.min(1, Math.max(0, best));
}

/** Along-road coordinate for noise (the long axis of the containing road). */
function alongAt(rects: readonly RoadRect[], x: number, z: number) {
  for (const [cx, cz, w, d] of rects)
    if (Math.abs(x - cx) <= w / 2 + EPS && Math.abs(z - cz) <= d / 2 + EPS) return w >= d ? x : z;
  return x + z;
}

/* ------------------------------------------------------------- the mesh */

export type RoadMesh = Record<RoadPartName, RoadPart> & { triangles: number; area: number };

const part = (): RoadPart => ({ positions: [], normals: [], colors: [], indices: [] });

export function buildRoadMesh(net: RoadNetwork): RoadMesh {
  const look = ROAD_LOOKS[net.style];
  const crown = net.crown ?? 0.02;
  const g = unionGrid(net.rects);
  const edges = boundaryEdges(g);
  const corners = concaveCorners(g, edges);
  const out: RoadMesh = { surface: part(), surfaceZ: part(), kerbX: part(), kerbZ: part(), apron: part(), marking: part(), triangles: 0, area: unionArea(g) };
  const base = hexToLinear(look.base);
  const centre = look.centre ? hexToLinear(look.centre.color) : base;
  const centreRects = net.centreRects ? net.centreRects.map((i) => net.rects[i]) : net.rects;
  const height = (x: number, z: number) => {
    const c = crownAt(net.rects, x, z);
    return net.y + crown * (1 - (1 - c) * (1 - c));
  };
  const surfaceColor = (x: number, z: number): [number, number, number] => {
    const along = alongAt(net.rects, x, z);
    // Low-contrast mottle at ~3 m, plus a little per-vertex grain.
    const mottle = 1 + (noise1(along / 3.1, 3) - 0.5) * 0.07 + (noise1(along / 0.7 + z * 0.37, 9) - 0.5) * 0.03;
    let mix = 0;
    if (look.centre) {
      const c = crownAt(centreRects, x, z);
      const half = look.centre.width; // of the full width → crown threshold
      const wobble = net.style === "lane" ? (noise1(along / 2.3, 5) - 0.5) * 0.16 : 0;
      const edge = 1 - half + wobble;
      mix = net.style === "lane" ? smoothstep(edge - 0.12, edge + 0.12, c) : smoothstep(edge - 0.03, edge + 0.03, c);
    }
    return [0, 1, 2].map((k) => (base[k] + (centre[k] - base[k]) * mix) * mottle) as [number, number, number];
  };

  /* --- surface: refined grid over covered cells --- */
  const grid = net.grid ?? { step: 1.1, across: 6 };
  const rx = refine(g.xs, grid.step, grid.across),
    rz = refine(g.zs, grid.step, grid.across);
  const nzr = rz.length;
  const s = out.surface;
  const vertexIds = new Map<RoadPart, Map<number, number>>();
  const cellOf = (coords: number[], v: number, edgesList: number[]) => {
    // Index of the compressed cell containing the refined interval at v.
    let k = 0;
    while (k < edgesList.length - 2 && v >= edgesList[k + 1] - EPS) k++;
    return k;
  };
  const vid = (p: RoadPart, a: number, b: number) => {
    const key = a * nzr + b;
    let ids = vertexIds.get(p);
    if (!ids) vertexIds.set(p, (ids = new Map()));
    let id = ids.get(key);
    if (id === undefined) {
      const x = rx[a],
        z = rz[b];
      id = p.positions.length / 3;
      p.positions.push(x, height(x, z), z);
      p.normals.push(0, 1, 0);
      p.colors.push(...surfaceColor(x, z));
      ids.set(key, id);
    }
    return id;
  };
  // Which way the road runs at a point: the longest road containing it.
  const runsAlongZ = (x: number, z: number) => {
    let best = -1,
      alongZ = false;
    for (const [cx, cz, w, d] of net.rects)
      if (Math.abs(x - cx) <= w / 2 + EPS && Math.abs(z - cz) <= d / 2 + EPS && Math.max(w, d) > best) {
        best = Math.max(w, d);
        alongZ = d > w;
      }
    return alongZ;
  };
  for (let a = 0; a < rx.length - 1; a++) {
    const ci = cellOf(rx, (rx[a] + rx[a + 1]) / 2, g.xs);
    for (let b = 0; b < rz.length - 1; b++) {
      const cj = cellOf(rz, (rz[b] + rz[b + 1]) / 2, g.zs);
      if (!cellAt(g, ci, cj)) continue;
      const p = runsAlongZ((rx[a] + rx[a + 1]) / 2, (rz[b] + rz[b + 1]) / 2) ? out.surfaceZ : s;
      const v00 = vid(p, a, b),
        v10 = vid(p, a + 1, b),
        v01 = vid(p, a, b + 1),
        v11 = vid(p, a + 1, b + 1);
      // Counter-clockwise seen from above (+y): x right, z toward the viewer.
      p.indices.push(v00, v01, v10, v10, v01, v11);
    }
  }
  // Fillets: a fan from the corner to the arc, widening the junction.
  const ARC = 6;
  for (const c of corners) {
    const ox = c.x + c.r * c.sx,
      oz = c.z + c.r * c.sz;
    const centreId = s.positions.length / 3;
    const y0 = height(c.x - c.sx * 0.01, c.z - c.sz * 0.01);
    s.positions.push(c.x, y0, c.z);
    s.normals.push(0, 1, 0);
    s.colors.push(...surfaceColor(c.x, c.z));
    for (let k = 0; k <= ARC; k++) {
      // From the x-edge tangent point (ox, c.z) to the z-edge one (c.x, oz).
      const t = (k / ARC) * (Math.PI / 2);
      const x = ox - c.sx * c.r * Math.sin(t),
        z = oz - c.sz * c.r * Math.cos(t);
      s.positions.push(x, net.y, z);
      s.normals.push(0, 1, 0);
      s.colors.push(...surfaceColor(c.x, c.z));
    }
    for (let k = 0; k < ARC; k++) {
      const a = centreId + 1 + k,
        b = centreId + 2 + k;
      // Keep the fan facing up whatever the corner's orientation.
      const P = s.positions;
      const ux = P[a * 3] - P[centreId * 3], uz = P[a * 3 + 2] - P[centreId * 3 + 2];
      const vx = P[b * 3] - P[centreId * 3], vz = P[b * 3 + 2] - P[centreId * 3 + 2];
      if (uz * vx - ux * vz >= 0) s.indices.push(centreId, a, b);
      else s.indices.push(centreId, b, a);
    }
  }
  computeNormals(s);
  computeNormals(out.surfaceZ);

  /* --- kerbs: straight strips + fillet arcs --- */
  const k = look.kerb;
  const kerbColor = hexToLinear(k.color);
  // The kerb stands `height` above the highest road surface along it (a road
  // end crosses the crown).
  const kerbTop = (e: Edge, from: number, to: number) => {
    let h = net.y;
    for (let t = 0; t <= 8; t++) {
      const v = from + ((to - from) * t) / 8;
      const x = e.axis === "x" ? v : e.at - e.side * 0.001,
        z = e.axis === "x" ? e.at - e.side * 0.001 : v;
      h = Math.max(h, height(x, z));
    }
    return h + k.height;
  };
  const top = net.y + k.height;
  // Trim kerb ends: concave corners lose the fillet length, convex corners
  // give the z-edges' strip ends to the x-edges (no overlap).
  for (const e of edges) {
    let from = e.from,
      to = e.to;
    for (const end of ["from", "to"] as const) {
      const v = end === "from" ? from : to;
      const x = e.axis === "x" ? v : e.at,
        z = e.axis === "x" ? e.at : v;
      const corner = corners.find((c) => Math.abs(c.x - x) < EPS && Math.abs(c.z - z) < EPS);
      let trim = 0;
      if (corner) trim = corner.r;
      else if (e.axis === "z" && convexAt(g, x, z)) trim = k.width;
      if (end === "from") from += trim;
      else to -= trim;
    }
    if (to - from < 0.02) continue;
    kerbStrip(e.axis === "x" ? out.kerbX : out.kerbZ, e, from, to, k.width, net.y, kerbTop(e, from, to), net.ground, kerbColor);
  }
  for (const c of corners) kerbArc(out, c, k.width, net.y, top, net.ground, kerbColor);

  /* --- door aprons: 3 × 2 larger slabs --- */
  const apronColor = hexToLinear(look.apron);
  for (const ap of net.aprons ?? []) {
    for (let col = 0; col < 3; col++)
      for (let row = 0; row < 2; row++) {
        const across = (col - 1) * 0.8,
          out1 = 0.4 + row * 0.8;
        const cx = ap.axis === "z" ? ap.x + across : ap.x + ap.facing * out1,
          cz = ap.axis === "z" ? ap.z + ap.facing * out1 : ap.z + across;
        const tone = 0.94 + noise1(col * 3.7 + row * 1.9 + ap.x, 11) * 0.12;
        box(out.apron, cx, cz, 0.39, 0.39, net.ground - 0.02, net.y + crown + 0.024, apronColor.map((v) => v * tone) as [number, number, number]);
      }
  }

  /* --- dashed centre line --- */
  if (look.marking) {
    const m = look.marking;
    const color = hexToLinear(m.color);
    for (const rect of centreRects) {
      const [cx, cz, w, d] = rect;
      const alongX = w >= d;
      const length = alongX ? w : d;
      const start = (alongX ? cx : cz) - length / 2;
      for (let t = 0.9; t + m.dash < length - 0.9; t += m.dash + m.gap) {
        const a = start + t,
          b = a + m.dash;
        const mid = (a + b) / 2;
        const px = alongX ? mid : cx,
          pz = alongX ? cz : mid;
        // Skip dashes crossing another road (the junction box).
        const others = net.rects.filter((r) => r !== rect);
        if (others.some((r) => insideUnion([r], alongX ? a : px, alongX ? pz : a, 0.6) || insideUnion([r], alongX ? b : px, alongX ? pz : b, 0.6))) continue;
        quad(out.marking, alongX ? a : cx - m.width / 2, alongX ? cz - m.width / 2 : a, alongX ? b : cx + m.width / 2, alongX ? cz + m.width / 2 : b, net.y + crown + 0.006, color);
      }
    }
  }
  out.triangles = (["surface", "surfaceZ", "kerbX", "kerbZ", "apron", "marking"] as const).reduce((n, name) => n + out[name].indices.length / 3, 0);
  return out;
}

function computeNormals(p: RoadPart) {
  const n = new Float64Array(p.positions.length);
  const P = p.positions;
  for (let i = 0; i < p.indices.length; i += 3) {
    const a = p.indices[i] * 3,
      b = p.indices[i + 1] * 3,
      c = p.indices[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) {
      n[o] += nx;
      n[o + 1] += ny;
      n[o + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    p.normals[i] = n[i] / l;
    p.normals[i + 1] = n[i + 1] / l;
    p.normals[i + 2] = n[i + 2] / l;
  }
}

/** Push a quad with its own four vertices and a flat normal. */
function face(p: RoadPart, v: number[][], normal: number[], color: readonly number[]) {
  const o = p.positions.length / 3;
  for (const q of v) {
    p.positions.push(q[0], q[1], q[2]);
    p.normals.push(normal[0], normal[1], normal[2]);
    p.colors.push(color[0], color[1], color[2]);
  }
  // Wind so the face points along `normal`.
  const [a, b, c] = v;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * normal[0] + ny * normal[1] + nz * normal[2] >= 0) p.indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  else p.indices.push(o, o + 2, o + 1, o, o + 3, o + 2);
}

function quad(p: RoadPart, x0: number, z0: number, x1: number, z1: number, y: number, color: readonly number[]) {
  face(p, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], color);
}

/** A slab: top and four sides (no bottom). */
function box(p: RoadPart, cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, color: readonly number[]) {
  const x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz;
  quad(p, x0, z0, x1, z1, y1, color);
  const side = color.map((v) => v * 0.9);
  face(p, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], side);
  face(p, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], side);
  face(p, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], side);
  face(p, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], side);
}

/** Kerb along a straight edge, inside the road: top, inner face, outer face. */
function kerbStrip(p: RoadPart, e: Edge, from: number, to: number, width: number, y: number, top: number, ground: number, color: readonly number[]) {
  const outer = e.at,
    inner = e.at - e.side * width;
  const P = (along: number, across: number, h: number) => (e.axis === "x" ? [along, h, across] : [across, h, along]);
  const out = e.axis === "x" ? [0, 0, e.side] : [e.side, 0, 0];
  const inward = out.map((v) => -v);
  const shade = color.map((v) => v * 0.86);
  face(p, [P(from, inner, top), P(to, inner, top), P(to, outer, top), P(from, outer, top)], [0, 1, 0], color);
  face(p, [P(from, inner, y - 0.01), P(to, inner, y - 0.01), P(to, inner, top), P(from, inner, top)], inward, shade);
  face(p, [P(from, outer, ground - 0.03), P(to, outer, ground - 0.03), P(to, outer, top), P(from, outer, top)], out, shade);
}

/** Fillet kerb: the band between radius r and r + width about the arc centre. */
function kerbArc(m: RoadMesh, c: Concave, width: number, y: number, top: number, ground: number, color: readonly number[]) {
  const ox = c.x + c.r * c.sx,
    oz = c.z + c.r * c.sz;
  const steps = 6;
  const p = m.kerbX;
  const at = (t: number, radius: number, h: number) => [ox - c.sx * radius * Math.sin(t), h, oz - c.sz * radius * Math.cos(t)];
  const shade = color.map((v) => v * 0.86);
  for (let k = 0; k < steps; k++) {
    const t0 = (k / steps) * (Math.PI / 2),
      t1 = ((k + 1) / steps) * (Math.PI / 2);
    const tm = (t0 + t1) / 2;
    // Radial direction (from the arc centre outward) at the segment middle.
    const radial = [-c.sx * Math.sin(tm), 0, -c.sz * Math.cos(tm)];
    face(p, [at(t0, c.r, top), at(t1, c.r, top), at(t1, c.r + width, top), at(t0, c.r + width, top)], [0, 1, 0], color);
    face(p, [at(t0, c.r + width, y - 0.01), at(t1, c.r + width, y - 0.01), at(t1, c.r + width, top), at(t0, c.r + width, top)], radial, shade);
    face(p, [at(t0, c.r, ground - 0.03), at(t1, c.r, ground - 0.03), at(t1, c.r, top), at(t0, c.r, top)], radial.map((v) => -v), shade);
  }
}

/** Rectangles that cover each fillet (grass and placement keep off them). */
export function filletFootprints(rects: readonly RoadRect[]): RoadRect[] {
  const g = unionGrid(rects);
  return concaveCorners(g, boundaryEdges(g)).map((c) => [c.x + (c.sx * c.r) / 2, c.z + (c.sz * c.r) / 2, c.r, c.r] as const);
}

/** The apron's footprint (2.4 × 1.6). */
export function apronFootprint(a: Apron): RoadRect {
  return a.axis === "z" ? [a.x, a.z + a.facing * 0.8, 2.4, 1.6] : [a.x + a.facing * 0.8, a.z, 1.6, 2.4];
}
