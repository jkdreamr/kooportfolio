import { useMemo } from "react";
import * as THREE from "three";
import { KOREA_SIGHTS } from "../../core/koreaSights";
import { terrainHeightAt } from "../../core/terrain";
import { sculptedMaterial } from "../Surface";
import { StaticBatch } from "../StaticBatch";
import { WorldSceneryParts } from "../WorldSceneryParts";
import { curtainWall, makeParts, roofGeometry, tiled, type V3 } from "./kit";
import {
  LIGHT,
  SignBuilder,
  signMaterial,
  windowLight,
} from "./signs";

/**
 * Modern Seoul, scaled to the diorama: a Lotte World Tower-style supertall
 * and numbered apartment blocks on the north hillside, a DDP-style curved
 * hall in the market court, a convenience store with plastic patio tables,
 * a pojangmacha tent, a subway entrance and two bus shelters. Static parts
 * bake in one StaticBatch; every sign and lit window is one extra draw.
 */

const S = KOREA_SIGHTS;
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Lowest terrain under a footprint: hillside buildings sit on a plinth. */
function groundUnder(x: number, z: number, hx: number, hz: number) {
  let low = Infinity;
  for (let dx = -hx; dx <= hx + 1e-6; dx += hx / 2)
    for (let dz = -hz; dz <= hz + 1e-6; dz += hz / 2)
      low = Math.min(low, terrainHeightAt(x + dx, z + dz, "korea"));
  return Number.isFinite(low) ? low : 0;
}

const signs = new SignBuilder();

/* ---------------------------------------------------------- supertall */
const L = S.lotte;
const lotteY = groundUnder(L.x, L.z, L.base, L.base) + 0.85;
const lotteHalf = (t: number) => L.base * (1 - 0.72 * t ** 1.45);
function lotteGeometry() {
  const around = 32,
    rows = 42,
    positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const glass = new THREE.Color("#93abb8"),
    seam = new THREE.Color("#5f7684"),
    band = new THREE.Color("#c6d3d8"),
    c = new THREE.Color();
  const shaft = L.height * 0.9;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const half = lotteHalf(t * 0.9);
    for (let a = 0; a <= around; a++) {
      const th = (a / around) * Math.PI * 2 + Math.PI / 4;
      const cs = Math.cos(th),
        sn = Math.sin(th);
      // Rounded square (superellipse) section.
      const x = half * Math.sign(cs) * Math.abs(cs) ** 0.62;
      const z = half * Math.sign(sn) * Math.abs(sn) ** 0.62;
      positions.push(x, t * shaft, z);
      // A slender seam down the middle of each face, floor bands every 3 rows.
      const faceMid = a % (around / 4) === around / 8;
      c.copy(faceMid ? seam : r % 3 === 0 ? band : glass);
      c.multiplyScalar(0.92 + 0.14 * t);
      colors.push(c.r, c.g, c.b);
      if (r === rows || a === around) continue;
      const i = r * (around + 1) + a;
      indices.push(i, i + around + 1, i + 1, i + 1, i + around + 1, i + around + 2);
    }
  }
  const top = positions.length / 3;
  positions.push(0, shaft + 0.05, 0);
  colors.push(band.r, band.g, band.b);
  for (let a = 0; a < around; a++) {
    const i = rows * (around + 1) + a;
    indices.push(i, top, i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const lotteShaft = lotteGeometry();
const lotte = makeParts();
{
  const { add } = lotte;
  add([0, -0.5, 0], [3.6, 0.9, 3.2], "#b8b3a8");
  add([0, -0.02, 0], [3.4, 0.12, 3.0], "#d4d0c6", "block");
  // The open crown: four ribs leaning in above the shaft, two light rings.
  const shaft = L.height * 0.9;
  const crown = L.height - shaft;
  const h0 = lotteHalf(0.9);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const r0 = h0 * 0.95,
      r1 = h0 * 0.25;
    const from = new THREE.Vector3(Math.cos(a) * r0, shaft, Math.sin(a) * r0);
    const to = new THREE.Vector3(Math.cos(a) * r1, L.height + 0.6, Math.sin(a) * r1);
    const dir = to.clone().sub(from);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    const e = new THREE.Euler().setFromQuaternion(q);
    add(
      from.clone().add(to).multiplyScalar(0.5).toArray() as V3,
      [0.16, dir.length(), 0.16],
      "#c9d4d8",
      "block",
      [e.x, e.y, e.z],
    );
  }
  for (const [y, s] of [
    [shaft + crown * 0.35, 0.7],
    [shaft + crown * 0.75, 0.42],
  ] as const)
    add([0, y, 0], [h0 * 2 * s, 0.08, h0 * 2 * s], "#dfe6e8", "block");
  add([0, L.height + 0.85, 0], [0.05, 0.6, 0.05], "#9aa4a8", "column");
}
{
  // Crown glow and four faint seam lines after dark; a red beacon on top.
  const shaft = L.height * 0.9;
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    const nx = Math.sin(rot),
      nz = Math.cos(rot);
    // The seam follows the taper in short runs.
    for (let s = 0; s < 8; s++) {
      const f = 0.14 + s * 0.1;
      const r = lotteHalf(f * 0.9) + 0.015;
      signs.quad(
        L.x + nx * r,
        lotteY + shaft * f,
        L.z + nz * r,
        0.05,
        shaft * 0.1,
        rot,
        "white",
        "#dce8ee",
        LIGHT.strip,
      );
    }
    const rc = lotteHalf(0.9) * 0.62;
    signs.quad(
      L.x + nx * rc,
      lotteY + shaft + (L.height - shaft) * 0.45,
      L.z + nz * rc,
      rc * 1.3,
      (L.height - shaft) * 0.8,
      rot,
      "white",
      "#f3efe2",
      LIGHT.strip,
    );
  }
  signs.quad(L.x, lotteY + L.height + 1.17, L.z + 0.04, 0.12, 0.12, 0, "white", "#ff5a4a", LIGHT.sign);
}

/* ---------------------------------------------------------- apartments */
const BLOCK = { w: 5.6, d: 1.8, floors: 10, floor: 0.68 };
const apartments = S.apartments.map(({ x, z, number }, b) => {
  const y = groundUnder(x, z, 2.8, 1.1);
  const { parts, add } = makeParts();
  const top = 0.2 + BLOCK.floors * BLOCK.floor;
  const front = BLOCK.d / 2 - 0.1;
  add([0, -0.55, 0], [6, 1.5, 2.4], "#b9b2a4");
  add([0, 0.2 + (top - 0.2) / 2, -0.1], [BLOCK.w, top - 0.2, BLOCK.d], "#ece6da");
  for (let f = 1; f <= BLOCK.floors; f++)
    add([0, 0.2 + f * BLOCK.floor, front + 0.12], [BLOCK.w - 0.1, 0.07, 0.24], "#f5f0e6", "block");
  for (const dx of [-2.8, -1.4, 0, 1.4, 2.8])
    add([dx, 0.2 + (top - 0.2) / 2, front + 0.1], [0.12, top - 0.2, 0.2], "#e1dbce", "block");
  // A soft accent stripe and the parapet / roof housings.
  const accent = ["#8fb4a2", "#d9a37a", "#93a9c8"][b % 3];
  add([BLOCK.w / 2 + 0.01, top * 0.45, -0.86], [0.03, top * 0.75, 0.14], accent, "block");
  add([0, top + 0.08, -0.1], [BLOCK.w + 0.1, 0.18, BLOCK.d + 0.1], "#d9d2c4", "block");
  add([1.5, top + 0.45, -0.3], [1.2, 0.62, 0.9], "#e4ded2");
  add([1.5, top + 0.8, -0.3], [1.35, 0.08, 1.05], "#7d8a8c", "block");
  add([-1.6, top + 0.4, -0.3], [0.42, 0.5, 0.42], "#c9cfd1", "column");
  // Lit windows (balcony glass) on the south face; painted block number.
  for (let f = 0; f < BLOCK.floors; f++)
    for (let u = 0; u < 4; u++) {
      const lit = hash(b * 31 + f, u) > 0.45 ? 0.5 + hash(f, u + b) * 0.5 : 0;
      signs.quad(
        x - 2.1 + u * 1.4,
        y + 0.2 + f * BLOCK.floor + 0.36,
        z + front + 0.005,
        1.2,
        0.46,
        0,
        "white",
        "#6c8590",
        windowLight(lit),
      );
    }
  signs.quad(
    x + BLOCK.w / 2 + 0.012,
    y + top - 0.9,
    z - 0.1,
    1.25,
    0.75,
    Math.PI / 2,
    `n${number}` as "n101",
    "#ffffff",
    LIGHT.paint,
  );
  return { x, y, z, parts };
});

/* ---------------------------------------------------------- DDP */
const DDP = S.ddp;
function ddpGeometry() {
  const n = 72,
    a = DDP.width / 2 - 0.2,
    b = DDP.depth / 2 - 0.2,
    h = 2.2,
    R = 0.8;
  const outline: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    outline.push([
      a * Math.cos(th) * (1 + 0.06 * Math.sin(3 * th)),
      b * Math.sin(th) * (1 + 0.12 * Math.cos(th)),
    ]);
  }
  const normals = outline.map((_, i) => {
    const [px, pz] = outline[(i + n - 1) % n],
      [qx, qz] = outline[(i + 1) % n];
    const tx = qx - px,
      tz = qz - pz,
      l = Math.hypot(tx, tz);
    return [tz / l, -tx / l] as const;
  });
  // [height, inset]: a recessed glazed base, a wall leaning gently out, then
  // a big soft roll into the roof.
  const rows: [number, number][] = [
    [0.02, 0.1],
    [0.72, 0.1],
    [0.78, 0],
    [h - R, -0.08],
  ];
  for (let j = 1; j <= 7; j++) {
    const phi = (j / 7) * (Math.PI / 2);
    rows.push([h - R + R * Math.sin(phi), -0.08 + R * (1 - Math.cos(phi))]);
  }
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const c = new THREE.Color();
  // Aluminium panel courses: bands of three panels, alternating tone.
  const silver = ["#d3d6d3", "#c9cdcb", "#aab0b0", "#b4b9b9"];
  rows.forEach(([y, inset], r) => {
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const [ox, oz] = outline[k],
        [nx, nz] = normals[k];
      positions.push(ox - nx * inset, y, oz - nz * inset);
      c.set(r < 2 ? "#3c4a52" : silver[(Math.floor(i / 3) % 2) * 2 + (r % 2)]);
      colors.push(c.r, c.g, c.b);
      if (r === rows.length - 1 || i === n) continue;
      const v = r * (n + 1) + i;
      indices.push(v, v + n + 1, v + 1, v + 1, v + n + 1, v + n + 2);
    }
  });
  // Flat roof cap inside the last row.
  const [capY, capInset] = rows[rows.length - 1];
  const cap = outline.map(
    ([ox, oz], i) =>
      new THREE.Vector2(ox - normals[i][0] * capInset, oz - normals[i][1] * capInset),
  );
  const start = positions.length / 3;
  for (const p of cap) {
    positions.push(p.x, capY, p.y);
    c.set("#c6cac8");
    colors.push(c.r, c.g, c.b);
  }
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(cap, []))
    indices.push(start + i, start + k, start + j);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, outline, normals, capY };
}
const ddp = ddpGeometry();
const ddpMaterial = sculptedMaterial({
  vertexColors: true,
  roughness: 0.42,
  metalness: 0.25,
});
const ddpParts = makeParts();
{
  const { add } = ddpParts;
  add([0, 0.19, 0], [DDP.width + 1.2, 0.05, DDP.depth + 1.2], "#bdb7ab", "block");
  // A green roof garden patch and a few round skylights.
  add([-0.6, ddp.capY + 0.02, -0.2], [2.4, 0.06, 1.2], "#7f9a6a", "column");
  for (const [x, z] of [
    [1.4, 0.3],
    [2.0, -0.4],
  ])
    add([x, ddp.capY + 0.03, z], [0.32, 0.06, 0.32], "#e7ecea", "column");
  // Glazed base: lit by night along the camera-facing curve.
  ddp.outline.forEach(([ox, oz], i) => {
    if (i % 4 || oz < 0.5) return;
    const [nx, nz] = ddp.normals[i];
    const inset = 0.1 - 0.012;
    signs.quad(
      DDP.x + ox - nx * inset,
      0.6,
      DDP.z + oz - nz * inset,
      0.88,
      0.5,
      Math.atan2(nx, nz),
      "white",
      "#3d4d55",
      windowLight(0.9),
    );
  });
}

/* ---------------------------------------------------------- street life */
const parasol = roofGeometry({
  corners: Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return [Math.cos(a), -Math.sin(a)] as const;
  }),
  profile: [
    [1, 0, 1],
    [0.55, 0.3, 0.55],
    [0.05, 0.42, 0.05],
  ],
  color: "#eef0e6",
  relief: 0,
  lift: 0.02,
  tilesPerSide: 2,
});
const tarp = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true, -Math.PI / 2, Math.PI);
  // Half cylinder on its side: an arch over the depth, axis along x.
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI / 2);
  const p = g.getAttribute("position");
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.set(i % 4 < 2 ? "#e2622e" : "#d7562a");
    c.toArray(colors, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
})();
const tarpMaterial = sculptedMaterial({
  vertexColors: true,
  roughness: 0.7,
  side: THREE.DoubleSide,
});

const street = makeParts();
{
  const { add } = street;
  // Convenience store: glass front, teal fascia, recycling bins.
  const st = S.store;
  const at = (dx: number, y: number, dz: number): V3 => [st.x + dx, y, st.z + dz];
  add(at(0, 0.2, 0.15), [4.3, 0.06, 2.8], "#bdb7aa", "block");
  add(at(0, 1.22, -0.3), [4, 2.0, 1.8], "#e9e4da");
  for (const dx of [-1.95, -0.65, 0.65, 1.95])
    add(at(dx, 1.0, 0.63), [0.07, 1.6, 0.07], "#5c6466", "block");
  add(at(0, 1.82, 0.63), [4.0, 0.08, 0.08], "#5c6466", "block");
  add(at(0, 2.26, 0.64), [4.1, 0.44, 0.12], "#1f6f73", "block");
  add(at(0, 2.5, -0.3), [4.15, 0.07, 1.95], "#d8d2c6", "block");
  add(at(-1.1, 2.62, -0.7), [0.8, 0.22, 0.5], "#c9cccd");
  add(at(2.28, 0.48, 0.15), [0.38, 0.52, 0.38], "#7a9c6a");
  add(at(2.28, 0.48, -0.35), [0.38, 0.52, 0.38], "#4c7ea6");
  signs.quad(st.x, 1.0, st.z + 0.605, 3.85, 1.55, 0, "white", "#7f98a0", windowLight(1));
  signs.quad(st.x, 2.26, st.z + 0.705, 3.9, 0.38, 0, "store", "#ffffff", LIGHT.sign);
  // Plastic tables, chairs and parasols.
  S.storeTables.forEach(([tx, tz], i) => {
    add([tx, 0.72, tz], [0.62, 0.05, 0.62], "#2f7d5b", "column");
    add([tx, 0.45, tz], [0.07, 0.52, 0.07], "#2f7d5b", "column");
    add([tx, 1.35, tz], [0.04, 1.3, 0.04], "#c9c9c4", "column");
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4 + i;
      const cx = tx + Math.cos(a) * 0.48,
        cz = tz + Math.sin(a) * 0.48;
      const color = k % 2 ? "#c8463a" : "#3e8a63";
      add([cx, 0.44, cz], [0.32, 0.05, 0.32], color, "block", [0, -a, 0]);
      add(
        [tx + Math.cos(a) * 0.63, 0.62, tz + Math.sin(a) * 0.63],
        [0.05, 0.34, 0.32],
        color,
        "block",
        [0, -a, 0],
      );
      add([cx, 0.24, cz], [0.26, 0.36, 0.26], color, "column");
    }
  });
  // Pojangmacha: orange tarp tent, counter, red stools, a lit sign.
  const pc = S.pojangmacha;
  const pt = (dx: number, y: number, dz: number): V3 => [pc.x + dx, y, pc.z + dz];
  for (const dx of [-1.3, 1.3])
    for (const dz of [-1.0, 1.0])
      add(pt(dx, 0.95, dz), [0.05, 1.9, 0.05], "#8c9196", "column");
  add(pt(0, 1.2, -1.07), [2.75, 1.5, 0.04], "#e0602d", "block");
  for (const dx of [-1.36, 1.36])
    add(pt(dx, 1.55, 0), [0.04, 0.75, 2.05], "#e66a35", "block");
  add(pt(0, 0.72, -0.5), [2.3, 0.66, 0.55], "#c4a27a");
  add(pt(0, 1.08, -0.5), [2.4, 0.05, 0.66], "#e6dfd2", "block");
  add(pt(-0.6, 1.2, -0.55), [0.28, 0.18, 0.28], "#b9bcc0", "column");
  for (const dx of [-0.9, -0.3, 0.3, 0.9])
    add(pt(dx, 0.36, 0.25), [0.2, 0.36, 0.2], "#c8312a", "column");
  add(pt(0, 2.12, 1.08), [1.75, 0.44, 0.05], "#8d2a22", "block");
  signs.quad(pc.x, 2.12, pc.z + 1.11, 1.6, 0.38, 0, "pocha", "#ffffff", LIGHT.sign);
  signs.quad(pc.x, 1.45, pc.z - 1.04, 2.5, 0.7, 0, "white", "#d8653a", windowLight(1));
  for (let k = 0; k < 6; k++)
    signs.quad(pc.x - 1.15 + k * 0.46, 1.84, pc.z + 1.02, 0.07, 0.07, 0, "white", "#ffd88a", LIGHT.sign);
  // Subway entrance: granite walls, steps sinking into shadow, canopy, sign.
  const sw = S.subway;
  const sp = (dx: number, y: number, dz: number): V3 => [sw.x + dx, y, sw.z + dz];
  for (const dx of [-1.0, 1.0])
    add(sp(dx, 0.5, 0), [0.2, 0.7, 3.6], "#9aa0a0");
  add(sp(0, 0.5, -1.7), [2.2, 0.7, 0.2], "#9aa0a0");
  add(sp(0, 0.17, 0), [1.8, 0.03, 3.2], "#2a2d31", "block");
  for (let k = 0; k < 7; k++) {
    const shade = new THREE.Color("#c9c6bd").multiplyScalar(1 - k * 0.12);
    add(sp(0, 0.2, 1.4 - k * 0.36), [1.78, 0.02, 0.16], `#${shade.getHexString()}`, "block");
  }
  for (const dx of [-1.0, 1.0])
    for (const dz of [-1.6, 1.6])
      add(sp(dx, 1.35, dz), [0.07, 1.7, 0.07], "#59606a", "column");
  add(sp(0, 2.22, 0), [2.4, 0.08, 3.8], "#56666e", "block");
  add(sp(0, 2.29, 0), [2.2, 0.05, 3.6], "#8fb2bd", "block");
  add(sp(1.0, 1.2, 1.7), [0.06, 2.4, 0.06], "#59606a", "column");
  add(sp(1.0, 2.6, 1.7), [0.95, 0.38, 0.1], "#23314f", "block");
  signs.quad(sw.x + 1.0, 2.6, sw.z + 1.756, 0.9, 0.34, 0, "subway", "#ffffff", LIGHT.sign);
  // Bus shelters facing the main street.
  for (const [bx, bz] of S.busStops) {
    const bp = (dx: number, y: number, dz: number): V3 => [bx + dx, y, bz + dz];
    for (const dx of [-1.2, 1.2])
      add(bp(dx, 1.05, 0.2), [0.08, 2.1, 0.08], "#4a5560", "block");
    add(bp(0, 2.13, -0.02), [2.75, 0.08, 0.95], "#3d4852", "block");
    add(bp(0, 2.2, -0.02), [2.6, 0.04, 0.82], "#8fb2bd", "block");
    add(bp(0.2, 0.9, 0.3), [2.0, 1.0, 0.04], "#a9bcc4", "block");
    add(bp(0.2, 1.62, 0.3), [1.75, 0.9, 0.1], "#3d4852", "block");
    add(bp(0.1, 0.48, 0.05), [1.9, 0.06, 0.36], "#b98c5a", "block");
    for (const dx of [-0.75, 0.95])
      add(bp(dx, 0.3, 0.12), [0.06, 0.3, 0.3], "#4a5560", "block");
    add(bp(1.36, 1.72, 0.2), [0.5, 0.32, 0.05], "#2f68b0", "block");
    signs.quad(bx + 0.2, 1.62, bz + 0.356, 1.6, 0.8, 0, "ad", "#ffffff", LIGHT.sign);
    signs.quad(bx + 1.36, 1.72, bz + 0.226, 0.46, 0.28, 0, "bus", "#ffffff", LIGHT.sign);
  }
}

const signGeometry = signs.geometry();

/* ---------------------------------------------------------- component */
export function KoreaModernSeoul() {
  const material = useMemo(() => signMaterial(), []);
  return (
    <group name="korea-modern-seoul">
      <StaticBatch id="korea-modern">
        <group name="lotte-world-tower" position={[L.x, lotteY, L.z]}>
          <mesh
            geometry={lotteShaft}
            material={curtainWall}
            castShadow
            receiveShadow
            dispose={null}
          />
          <WorldSceneryParts parts={lotte.parts} />
        </group>
        {apartments.map(({ x, y, z, parts }, i) => (
          <group key={i} name="apartment-block" position={[x, y, z]}>
            <WorldSceneryParts parts={parts} />
          </group>
        ))}
        <group name="dongdaemun-design-plaza" position={[DDP.x, 0.2, DDP.z]}>
          <mesh
            geometry={ddp.geometry}
            material={ddpMaterial}
            castShadow
            receiveShadow
            dispose={null}
          />
        </group>
        <group position={[DDP.x, 0, DDP.z]}>
          <WorldSceneryParts parts={ddpParts.parts} />
        </group>
        <WorldSceneryParts parts={street.parts} />
        {S.storeTables.map(([x, z], i) => (
          <mesh
            key={i}
            position={[x, 2.0, z]}
            scale={[1.0, 0.7, 1.0]}
            geometry={parasol}
            material={tiled}
            castShadow
            dispose={null}
          />
        ))}
        <mesh
          position={[S.pojangmacha.x, 1.9, S.pojangmacha.z]}
          scale={[2.85, 0.55, 1.1]}
          geometry={tarp}
          material={tarpMaterial}
          castShadow
          receiveShadow
          dispose={null}
        />
      </StaticBatch>
      <mesh
        name="korea-signs"
        geometry={signGeometry}
        material={material}
        dispose={null}
      />
    </group>
  );
}
