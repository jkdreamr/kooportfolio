import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash, tone, type KitPiece, type V3 } from "./ArchitectureKit";
import { TOWN_HALL_KEEP_Z } from "../core/townHall";

/**
 * The Town Hall's art as data (pure): an original round stone keep in the
 * village's own palette. Two courses of big rounded granite blocks in the
 * street grey with lighter caps, a steep conical roof in the village's green
 * tile with deep eaves on a timber ring beam, a lantern cupola, an arched
 * timber door with iron straps, two banners in the visitor's colour, four
 * lashed timber buttress posts and a notice board by the steps.
 *
 * Deliberately not a tiered or stepped mass, no battlements, no front gable
 * or emblem, no blue-and-gold or lava colouring.
 *
 * Local frame: origin at the footprint centre, door facing +z, ground y = 0.
 */

export const KZ = TOWN_HALL_KEEP_Z;
const PLINTH_TOP = 0.53;
const WALL_R = 3.98;
export const GRANITE = "#a9a9a2";
const CAP = "#c6c4ba";
const MORTAR = "#7f7e78";
const TIMBER = "#6b4a2c";
const TIMBER_DARK = "#4f3a28";
const IRON = "#3b3d3c";
const ROPE = "#c8ad78";
export const ROOF_GREEN = "#3f6a52";
const ROOF_DARK = "#345a46";
const ROOF_LIGHT = "#4d7c5f";
export const ROOF = { base: 5.75, height: 5.2, bottom: 5.5, top: 0.95 } as const;
export const CUPOLA_BASE = ROOF.base + ROOF.height;

/** A point on the keep: `angle` from +z (the door), radius `r`, height `y`. */
const around = (angle: number, r: number, y: number): V3 => [
  Math.sin(angle) * r,
  y,
  KZ + Math.cos(angle) * r,
];

const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
/** Euler angles (the kit's XYZ order) for "turn by `yaw`, then dip the far
 * end by `pitch`". */
export function yawPitch(yaw: number, pitch: number): V3 {
  quat.setFromEuler(euler.set(pitch, yaw, 0, "YXZ"));
  euler.setFromQuaternion(quat, "XYZ");
  return [euler.x, euler.y, euler.z];
}

export type HallPieces = { stone: KitPiece[]; wood: KitPiece[]; metal: KitPiece[]; paint: KitPiece[] };

/** Every kit piece of the keep. `banner` is the visitor's colour. */
export function townHallPieces(banner: string): HallPieces {
  const stone: KitPiece[] = [],
    wood: KitPiece[] = [],
    metal: KitPiece[] = [],
    paint: KitPiece[] = [];
  const granite = (seed: number) => tone(GRANITE, 0.9 + hash(seed, 3.1) * 0.16);

  // Three wide steps down from the plinth to the lane.
  const front = KZ + 4.6;
  [
    [3.4, 0.4, 0.55],
    [3.8, 0.27, 0.5],
    [4.2, 0.14, 0.5],
  ].forEach(([w, h, d], i) => {
    const z = front + [0.175, 0.7, 1.2][i];
    stone.push({ p: [0, h / 2, z], s: [w, h, d], c: i % 2 ? "#b3b1a7" : "#c0beb3" });
  });

  // Two courses of fourteen big granite blocks; the upper course is set half
  // a block over. The door takes the front block of the lower course; a
  // single wide lintel spans it in the upper course.
  const N = 14,
    stepA = (Math.PI * 2) / N;
  for (let i = 1; i < N; i++) {
    const a = i * stepA;
    stone.push({ p: around(a, WALL_R, PLINTH_TOP + 1.15), s: [1.62, 2.24, 0.62], r: [0, a, 0], c: granite(i) });
  }
  for (let i = 0; i < N; i++) {
    const a = (i + 0.5) * stepA;
    if (i === 0 || i === N - 1) continue; // The lintel's place.
    stone.push({ p: around(a, WALL_R, PLINTH_TOP + 3.45), s: [1.62, 2.2, 0.62], r: [0, a, 0], c: granite(i + 40) });
  }
  stone.push({ p: around(0, WALL_R + 0.06, PLINTH_TOP + 3.45), s: [2.62, 2.2, 0.74], c: tone(CAP, 0.94) });
  // Cap stones in a lighter granite, a little proud of the wall.
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.25) * Math.PI * 2) / 12;
    stone.push({ p: around(a, WALL_R + 0.05, PLINTH_TOP + 4.73), s: [2.0, 0.28, 0.82], r: [0, a, 0], c: tone(CAP, 0.95 + hash(i, 9) * 0.08) });
  }
  // Arched timber door with iron straps and a ring pull, filling the
  // opening; a ring of seven pale voussoirs stands proud around its head.
  const doorZ = KZ + 3.78;
  const springY = PLINTH_TOP + 1.52;
  wood.push({ p: [0, PLINTH_TOP + 0.76, doorZ], s: [1.5, 1.52, 0.16], c: TIMBER });
  wood.push({ p: [0, springY, doorZ], s: [1.5, 0.16, 1.5], r: [Math.PI / 2, 0, 0], c: TIMBER, shape: "cyl" });
  for (const x of [-0.37, 0.37]) wood.push({ p: [x, PLINTH_TOP + 1.05, doorZ + 0.09], s: [0.035, 2.05, 0.03], c: TIMBER_DARK });
  for (const y of [0.42, 1.0, 1.52]) metal.push({ p: [0, PLINTH_TOP + y, doorZ + 0.1], s: [1.44, 0.09, 0.05], c: IRON });
  metal.push({ p: [0.42, PLINTH_TOP + 0.98, doorZ + 0.16], s: [0.16, 0.16, 0.05], c: "#7d6a46", shape: "cyl", r: [Math.PI / 2, 0, 0] });
  for (let k = 0; k <= 6; k++) {
    const t = (Math.PI * k) / 6;
    stone.push({
      p: [Math.cos(t) * 0.95, springY + Math.sin(t) * 0.95, KZ + 4.28],
      s: [0.34, 0.3, 0.3],
      r: [0, 0, t - Math.PI / 2],
      c: tone(CAP, 0.9 + hash(k, 2) * 0.1),
    });
  }
  // Jamb stones down both sides of the opening.
  for (const side of [-1, 1])
    stone.push({ p: [side * 0.95, PLINTH_TOP + 0.7, KZ + 4.26], s: [0.3, 1.4, 0.3], c: tone(CAP, 0.92) });

  // Round window over the door: a timber ring and a cross of mullions.
  const winZ = KZ + WALL_R + 0.44;
  const winY = PLINTH_TOP + 3.5;
  // The frame disc sits behind the glowing pane (z + 0.09); only its rim shows.
  wood.push({ p: [0, winY, winZ - 0.02], s: [1.24, 0.1, 1.24], r: [Math.PI / 2, 0, 0], c: TIMBER, shape: "cyl" });
  wood.push({ p: [0, winY, winZ + 0.16], s: [1.0, 0.07, 0.06], c: TIMBER_DARK });
  wood.push({ p: [0, winY, winZ + 0.16], s: [0.07, 1.0, 0.06], c: TIMBER_DARK });

  // Two long banners either side of the door, hung from iron brackets.
  for (const side of [-1, 1]) {
    const x = side * 1.88;
    const z = KZ + Math.sqrt(4.3 * 4.3 - x * x) + 0.1;
    const turn = side * Math.atan2(1.88, 3.86);
    const at = (dx: number, y: number, dz = 0): V3 => [
      x + Math.cos(turn) * dx + Math.sin(turn) * dz,
      y,
      z - Math.sin(turn) * dx + Math.cos(turn) * dz,
    ];
    metal.push({ p: at(0, 4.92, -0.2), s: [0.08, 0.08, 0.52], r: [0, turn, 0], c: IRON });
    wood.push({ p: at(0, 4.84, 0.04), s: [0.07, 1.06, 0.07], r: [0, turn, Math.PI / 2], c: TIMBER_DARK, shape: "cyl" });
    paint.push({ p: at(0, 3.55, 0.06), s: [0.9, 2.5, 0.06], r: [0, turn, 0], c: banner });
    for (const dx of [-0.23, 0.23])
      paint.push({ p: at(dx, 2.18, 0.06), s: [0.44, 0.42, 0.06], r: [0, turn, dx > 0 ? -0.42 : 0.42], c: banner });
    for (const y of [4.55, 2.62]) paint.push({ p: at(0, y, 0.1), s: [0.92, 0.09, 0.03], r: [0, turn, 0], c: "#efe2bf" });
    paint.push({ p: at(0, 3.75, 0.11), s: [0.36, 0.03, 0.36], r: [Math.PI / 2, 0, -turn], c: "#efe2bf", shape: "cyl" });
  }

  // Four stubby buttress posts, lashed with rope, leaning on the keep.
  for (const a of [0.84, -0.84, 2.3, -2.3]) {
    const base = around(a, 4.72, PLINTH_TOP + 0.16);
    stone.push({ p: base, s: [0.86, 0.32, 0.86], r: [0, a, 0], c: "#9a988f" });
    const post = around(a, 4.56, PLINTH_TOP + 2.0);
    // A round log, its top leaning in toward the wall.
    wood.push({ p: post, s: [0.5, 3.6, 0.5], r: [-0.1 * Math.cos(a), 0, 0.1 * Math.sin(a)], c: "#6e4d2f", shape: "cyl" });
    wood.push({ p: around(a, 4.38, PLINTH_TOP + 3.9), s: [0.62, 0.18, 0.62], r: [0, a, 0], c: TIMBER_DARK });
    for (const y of [2.2]) paint.push({ p: around(a, 4.6 - y * 0.03, PLINTH_TOP + y), s: [0.62, 0.13, 0.62], c: ROPE, shape: "cyl" });
  }

  // Rafter ends under the eaves.
  for (let i = 0; i < 10; i++) {
    const a = ((i + 0.5) * Math.PI * 2) / 10;
    wood.push({ p: around(a, 4.72, ROOF.base + 0.08), s: [0.17, 0.17, 0.95], r: yawPitch(a, 0.33), c: TIMBER_DARK });
  }

  // Lantern cupola: six posts round the glowing core, a green cap, a finial.
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6 + Math.PI / 6;
    wood.push({ p: around(a, 0.86, CUPOLA_BASE + 0.72), s: [0.14, 0.86, 0.14], r: [0, a, 0], c: TIMBER_DARK });
  }
  metal.push({ p: [0, CUPOLA_BASE + 2.16, KZ], s: [0.26, 0.26, 0.26], c: "#b08a4e", shape: "sphere" });
  metal.push({ p: [0, CUPOLA_BASE + 2.48, KZ], s: [0.05, 0.5, 0.05], c: IRON, shape: "cyl" });

  // Notice board by the steps; it carries the plaque.
  const board = { x: 3.0, z: KZ + 5.8, turn: -0.42 };
  const b = (dx: number, y: number, dz = 0): V3 => [
    board.x + Math.cos(board.turn) * dx + Math.sin(board.turn) * dz,
    y,
    board.z - Math.sin(board.turn) * dx + Math.cos(board.turn) * dz,
  ];
  for (const dx of [-0.72, 0.72]) wood.push({ p: b(dx, 0.98, 0), s: [0.16, 1.96, 0.16], r: [0, board.turn, 0], c: TIMBER });
  wood.push({ p: b(0, 1.36, 0), s: [1.62, 1.0, 0.1], r: [0, board.turn, 0], c: "#8b6b45" });
  wood.push({ p: b(0, 1.9, 0), s: [1.74, 0.09, 0.14], r: [0, board.turn, 0], c: TIMBER_DARK });
  for (const side of [-1, 1])
    paint.push({ p: b(side * 0.44, 2.08, 0), s: [0.98, 0.07, 0.46], r: [0, board.turn, side * -0.42], c: ROOF_GREEN });
  metal.push({ p: b(0, 1.68, 0.07), s: [0.78, 0.2, 0.03], r: [0, board.turn, 0], c: "#c49a50" });
  [
    [-0.42, 1.28, 0.38, 0.48],
    [0.08, 1.22, 0.42, 0.54],
    [0.52, 1.32, 0.34, 0.42],
  ].forEach(([dx, y, w, h]) =>
    paint.push({ p: b(dx, y, 0.065), s: [w, h, 0.02], r: [0, board.turn, 0], c: "#efe6cf" }),
  );
  return { stone, wood, metal, paint };
}

/* --------------------------------------------------- custom round pieces */

function placed(geometry: THREE.BufferGeometry, y: number, z = KZ, rotateX = 0) {
  geometry.deleteAttribute("uv");
  if (rotateX) geometry.rotateX(rotateX);
  geometry.translate(0, y, z);
  return geometry;
}
function frustum(rBottom: number, rTop: number, y0: number, h: number, segments = 28, open = false) {
  return placed(new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open), y0 + h / 2);
}
/** Roof radius at height `y` (on the cone's slope). */
export const roofRadius = (y: number) =>
  ROOF.bottom + ((ROOF.top - ROOF.bottom) * (y - ROOF.base)) / ROOF.height;

export type RoundPiece = { geometry: THREE.BufferGeometry; color: string; kind: "stone" | "wood" | "shingle"; cast: boolean };

/** The turned pieces (plinth, wall core, ring beam, roof, cupola), as ready
 * geometries in the local frame. Built once per page. */
export function townHallRounds(): RoundPiece[] {
  const out: RoundPiece[] = [
    { geometry: frustum(4.75, 4.6, 0, 0.45), color: "#8c8a82", kind: "stone", cast: true },
    { geometry: frustum(4.62, 4.62, 0.44, 0.09, 28, true), color: "#b4b2a8", kind: "stone", cast: false },
    { geometry: frustum(3.76, 3.7, PLINTH_TOP, 5.0), color: MORTAR, kind: "stone", cast: true },
    { geometry: frustum(4.32, 4.3, ROOF.base - 0.42, 0.38), color: TIMBER, kind: "wood", cast: false },
    {
      geometry: placed(new THREE.RingGeometry(4.2, ROOF.bottom, 28), ROOF.base - 0.02, KZ, Math.PI / 2),
      color: TIMBER_DARK,
      kind: "wood",
      cast: false,
    },
    { geometry: frustum(ROOF.bottom, ROOF.top, ROOF.base, ROOF.height, 28, true), color: ROOF_GREEN, kind: "shingle", cast: true },
  ];
  // Tile courses: thin bands standing just proud of the slope, and a drip
  // edge at the eaves.
  out.push({
    geometry: frustum(ROOF.bottom + 0.07, roofRadius(ROOF.base + 0.26) + 0.07, ROOF.base, 0.26, 28, true),
    color: ROOF_LIGHT,
    kind: "shingle",
    cast: false,
  });
  for (const t of [0.22, 0.44, 0.66]) {
    const y = ROOF.base + ROOF.height * t;
    out.push({
      geometry: frustum(roofRadius(y) + 0.05, roofRadius(y + 0.24) + 0.05, y, 0.24, 28, true),
      color: ROOF_DARK,
      kind: "shingle",
      cast: false,
    });
  }
  // Cupola drum and cap.
  out.push({ geometry: frustum(1.12, 1.05, CUPOLA_BASE - 0.06, 0.3, 16), color: TIMBER, kind: "wood", cast: false });
  out.push({ geometry: placed(new THREE.ConeGeometry(1.28, 1.0, 16), CUPOLA_BASE + 1.65), color: ROOF_GREEN, kind: "shingle", cast: false });
  out.push({ geometry: frustum(1.3, 1.24, CUPOLA_BASE + 1.1, 0.06, 16), color: TIMBER_DARK, kind: "wood", cast: false });
  return out;
}

/** The glowing core as one geometry: the lantern's light in the cupola and
 * the round window over the door (one draw). */
export function townHallCoreGeometry() {
  const lantern = placed(new THREE.CylinderGeometry(0.6, 0.6, 0.82, 12), CUPOLA_BASE + 0.71);
  const window = placed(new THREE.CircleGeometry(0.5, 20), PLINTH_TOP + 3.5, KZ + WALL_R + 0.53);
  const merged = mergeGeometries([lantern.toNonIndexed(), window.toNonIndexed()]);
  lantern.dispose();
  window.dispose();
  return merged!;
}

/** Triangles a kit piece list costs (chamfer box 44, cylinder 48, sphere 168). */
export function pieceTriangles(pieces: readonly KitPiece[], box = 44) {
  return pieces.reduce((n, p) => n + (p.shape === "cyl" ? 48 : p.shape === "sphere" ? 168 : box), 0);
}
export const geometryTriangles = (g: THREE.BufferGeometry) =>
  (g.index ? g.index.count : g.attributes.position.count) / 3;
