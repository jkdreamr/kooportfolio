import {
  campusDistrictArcadePillars,
  campusDistrictBuildings as buildings,
  campusDistrictPalms,
} from "../core/campusDistrict";
import type { CampusPart, CampusShape } from "./CampusDistrictParts";
import type { TreePlacement } from "./TreeArt";

export const campusDistrictTrees: TreePlacement[] = [];

const parts: CampusPart[] = [];
const sandstone = ["#d4b780", "#dfc38e", "#c5a46b", "#e5cb9b"];
const tiles = ["#b64b2b", "#c85e35", "#a33d26", "#d66b3e"];
function part(
  shape: CampusShape,
  p: CampusPart["p"],
  s: CampusPart["s"],
  c: string,
  r?: CampusPart["r"],
) {
  parts.push({ shape, p, s, c, r });
}
function box(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  c: string,
  angle = 0,
) {
  part("stone", [x, y, z], [w, h, d], c, [0, angle, 0]);
}
function roof(
  x: number,
  z: number,
  width: number,
  depth: number,
  y: number,
  rise: number,
  turn = 0,
) {
  const point = (px: number, py: number, pz: number): CampusPart["p"] => [
    x + px * Math.cos(turn) + pz * Math.sin(turn),
    py,
    z - px * Math.sin(turn) + pz * Math.cos(turn),
  ];
  part("roof", [x, y, z], [width, rise, depth], tiles[0], [0, turn, 0]);
  // Broad, overlapping ceramic rows: readable relief without tiny noisy tiles.
  const run = width / 2,
    pitch = Math.atan2(rise, run),
    rows = Math.ceil(run / 0.7);
  const cols = Math.ceil(depth / 0.9);
  for (const side of [-1, 1])
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const t = (row + 0.5) / rows;
        part(
          "stone",
          point(
            side * run * (1 - t),
            y + rise * t + 0.06,
            -depth / 2 + ((col + 0.5) * depth) / cols,
          ),
          [(Math.hypot(run, rise) / rows) * 1.06, 0.12, (depth / cols) * 0.96],
          tiles[(col + row * 3) % tiles.length],
          [0, turn, side * pitch],
        );
      }
  for (let col = 0; col < cols; col++)
    part(
      "stone",
      point(0, y + rise + 0.12, -depth / 2 + ((col + 0.5) * depth) / cols),
      [0.38, 0.25, (depth / cols) * 1.04],
      tiles[(col + 1) % tiles.length],
      [0, turn, 0],
    );
}
function footing(x: number, z: number, w: number, d: number) {
  box(x, 0.28, z, w + 0.45, 0.55, d + 0.45, "#a68a5c");
  for (const side of [-1, 1]) {
    const n = Math.ceil(w / 1.2);
    for (let i = 0; i < n; i++)
      box(
        x - w / 2 + ((i + 0.5) * w) / n,
        0.62,
        z + (side * d) / 2,
        w / n - 0.06,
        0.35,
        0.25,
        sandstone[i % 4],
      );
  }
}
function hall(
  name: keyof typeof buildings,
  height: number,
  cross = false,
  rise = 1.2,
) {
  const [x, z, hx, hz] = buildings[name],
    w = hx * 2,
    d = hz * 2;
  footing(x, z, w, d);
  box(x, height / 2 + 0.25, z, w, height, d, sandstone[0]);
  box(x, height - 0.08, z, w + 0.35, 0.35, d + 0.35, sandstone[3]);
  roof(
    x,
    z,
    (cross ? d : w) + 0.8,
    (cross ? w : d) + 0.9,
    height,
    rise,
    cross ? Math.PI / 2 : 0,
  );
  const n = Math.floor(w / 2);
  // The fixed world camera sees the north/west elevations after the Yπ mount.
  // Finish every elevation, rather than treating the entry facade as a backdrop.
  for (const side of [-1, 1]) {
    box(x, 1.05, z + side * hz, w + 0.12, 0.15, 0.14, sandstone[2]);
    box(x + side * hx, 1.05, z, 0.14, 0.15, d + 0.12, sandstone[2]);
    for (let i = 0; i < n; i++) {
      const wx = x - w / 2 + ((i + 0.5) * w) / n;
      if (name === "church" && Math.abs(wx) < 1.5) continue;
      box(wx, 2.4, z + side * (hz + 0.04), 0.8, 1.55, 0.12, "#48685c");
      box(wx, 1.56, z + side * (hz + 0.12), 1.1, 0.2, 0.32, sandstone[3]);
      box(wx, 2.4, z + side * (hz + 0.13), 0.08, 1.55, 0.08, sandstone[1]);
      box(wx, 2.4, z + side * (hz + 0.13), 0.8, 0.08, 0.08, sandstone[1]);
    }
    const m = Math.max(1, Math.floor(d / 2.4));
    for (let i = 0; i < m; i++) {
      const wz = z - hz + ((i + 0.5) * d) / m;
      box(x + side * (hx + 0.04), 2.4, wz, 0.12, 1.55, 0.8, "#48685c");
      box(x + side * (hx + 0.12), 1.56, wz, 0.32, 0.2, 1.1, sandstone[3]);
      box(x + side * (hx + 0.13), 2.4, wz, 0.08, 1.55, 0.08, sandstone[1]);
      box(x + side * (hx + 0.13), 2.4, wz, 0.08, 0.08, 0.8, sandstone[1]);
    }
  }
}
function column(x: number, z: number, height = 3) {
  box(x, 0.46, z, 0.65, 0.45, 0.65, sandstone[2]);
  part("column", [x, height / 2 + 0.4, z], [0.24, height, 0.24], sandstone[1]);
  box(x, height + 0.4, z, 0.68, 0.32, 0.68, sandstone[3]);
}
function bench(x: number, z: number, angle = 0) {
  const point = (px: number, py: number, pz: number): CampusPart["p"] => [
    x + px * Math.cos(angle) + pz * Math.sin(angle),
    py,
    z - px * Math.sin(angle) + pz * Math.cos(angle),
  ];
  for (const side of [-1, 1])
    part("stone", point(side * 0.85, 0.48, 0), [0.22, 0.55, 0.65], "#6a6950", [
      0,
      angle,
      0,
    ]);
  part("stone", point(0, 0.8, 0), [2.6, 0.18, 0.8], "#987047", [0, angle, 0]);
  part("stone", point(0, 1.3, -0.36), [2.6, 0.75, 0.16], "#ae8351", [
    0,
    angle,
    0,
  ]);
}
function broadleaf(x: number, z: number, h = 5) {
  campusDistrictTrees.push({
    p: [x, 0.22, z],
    size: (h + 1.6) / 5.1,
    variant: Math.abs(Math.round(x * 7 + z * 3)),
    species: "oak",
  });
}
function palm(x: number, z: number) {
  campusDistrictTrees.push({ p: [x, 0.22, z], size: 1.27, species: "palm" });
}
function table(x: number, z: number) {
  part("column", [x, 0.8, z], [0.12, 1.2, 0.12], "#637564");
  part("column", [x, 1.4, z], [0.95, 0.18, 0.95], "#b18e5b");
  part("column", [x, 2.4, z], [0.055, 2.2, 0.055], "#726747");
  part("dome", [x, 3.45, z], [1.75, 0.7, 1.75], "#8c3230");
  for (const side of [-1, 1]) {
    box(x + side * 1.4, 0.6, z, 0.65, 0.18, 0.75, "#aa8555");
    box(x + side * 1.4, 0.35, z, 0.12, 0.5, 0.6, "#637564");
  }
}

// The open sandstone carpet unifies the district without a bulky floating plinth.
box(0, 0.1, 0, 59, 0.18, 70, "#7fa34d");
box(0, 0.2, -8.5, 34, 0.18, 35, "#d2bd8d");
box(0, 0.24, 14, 3.4, 0.15, 43, "#e1d0a4");
box(0, 0.24, 8, 54, 0.15, 3, "#dec99b");
box(-19, 0.22, -6, 2.2, 0.12, 37, "#d2bd8d");
box(19, 0.22, -6, 2.2, 0.12, 37, "#d2bd8d");

// Quad: sandstone wings, a continuous roofed arcade, and a framed open entrance.
hall("westWing", 3.8);
hall("eastWing", 3.8);
hall("northWest", 3.8, true);
hall("northEast", 3.8, true);
for (const [x, z] of campusDistrictArcadePillars) column(x, z, 2.8);
for (const side of [-1, 1]) {
  roof(side * 11.7, -7.8, 4.6, 26, 3.5, 0.7);
  for (let i = 0; i < 8; i++)
    part(
      "arch",
      [side * 11.3, 2.15, -17.6 + i * 2.8],
      [1.2, 1.2, 1],
      sandstone[1],
      [0, Math.PI / 2, 0],
    );
  for (const x of [side * 4, side * 7, side * 10]) column(x, 5.3, 2.8);
  roof(side * 7.2, 5.3, 3.2, 10.4, 3.5, 0.7, Math.PI / 2);
  for (const x of [side * 5.5, side * 8.5])
    part("arch", [x, 2.15, 5.3], [1.3, 1.2, 1], sandstone[1]);
}
// Four low planting courts leave broad central/cross-axes for walking.
for (const x of [-6, 6])
  for (const z of [-14, 0]) {
    box(x, 0.35, z, 5.4, 0.3, 4.4, "#b79c6c");
    box(x, 0.56, z, 5, 0.15, 4, "#6c9746");
    for (let i = 0; i < 7; i++)
      part(
        "round",
        [x - 2.1 + i * 0.7, 0.68, z - 1.65],
        [0.35, 0.3, 0.35],
        i % 2 ? "#ce794a" : "#d7b453",
      );
  }
for (const x of [-6, 6]) bench(x, -7, x > 0 ? Math.PI / 2 : -Math.PI / 2);
// A low blue fountain, rather than an oversized obstacle in the main sight line.
part("column", [0, 0.45, -7], [1.8, 0.45, 1.8], "#b79c6c");
part("column", [0, 0.72, -7], [1.6, 0.12, 1.6], "#4daba6");
part("column", [0, 1.02, -7], [0.22, 0.7, 0.22], "#e3c68d");
part("column", [0, 1.4, -7], [0.8, 0.16, 0.8], "#74beb0");

// Memorial Church: broad gable, inset entry, rose window and warm mosaic bands.
hall("church", 6.5, false, 2.4);
box(0, 2.1, -18.65, 2.1, 3, 0.13, "#69543e");
part("arch", [0, 3, -18.5], [1.12, 1.12, 1], "#e7cb94");
part("column", [0, 5.5, -18.57], [1.15, 0.1, 1.15], "#aa7946", [
  Math.PI / 2,
  0,
  0,
]);
part("column", [0, 5.5, -18.48], [0.88, 0.12, 0.88], "#5b9184", [
  Math.PI / 2,
  0,
  0,
]);
for (let i = 0; i < 8; i++) {
  const a = (i * Math.PI) / 4;
  part(
    "round",
    [Math.cos(a) * 0.57, 5.5 + Math.sin(a) * 0.57, -18.35],
    [0.19, 0.19, 0.08],
    i % 2 ? "#e6c16d" : "#aa5639",
  );
}
for (const side of [-1, 1])
  for (let i = 0; i < 4; i++)
    box(
      side * 2.9,
      2.3 + i * 0.6,
      -18.6,
      1.2,
      0.38,
      0.12,
      ["#b97848", "#c3a95e", "#668b78", "#d7b571"][i],
    );
box(0, 0.35, -18.1, 6.5, 0.3, 0.8, "#d5bc89");
// The rear apse has its own rose window and recessed sandstone arch.
part("column", [0, 5.5, -27.36], [1.15, 0.1, 1.15], "#aa7946", [
  Math.PI / 2,
  0,
  0,
]);
part("column", [0, 5.5, -27.44], [0.88, 0.12, 0.88], "#5b9184", [
  Math.PI / 2,
  0,
  0,
]);
for (let i = 0; i < 8; i++) {
  const a = (i * Math.PI) / 4;
  part(
    "round",
    [Math.cos(a) * 0.57, 5.5 + Math.sin(a) * 0.57, -27.54],
    [0.19, 0.19, 0.08],
    i % 2 ? "#e6c16d" : "#aa5639",
  );
}
box(0, 2, -27.35, 2.1, 2.9, 0.12, "#927b57");
part("arch", [0, 2.9, -27.48], [1.12, 1.12, 1], "#e7cb94");

// Hoover Tower is a separate, tall landmark with a setback octagonal carillon.
footing(23, -16, 5, 5);
box(23, 7.2, -16, 4.2, 14.4, 4.2, "#d9bd8b");
box(23, 13.4, -16, 4.8, 0.6, 4.8, "#e6cd9a");
box(23, 14.3, -16, 3.9, 1.2, 3.9, "#bfa174");
for (const side of [-1, 1]) {
  for (const x of [-0.85, 0.85])
    box(23 + x, 12.3, -16 + side * 2.12, 0.55, 1.4, 0.08, "#675b45");
  for (const z of [-0.85, 0.85])
    box(23 + side * 2.12, 12.3, -16 + z, 0.08, 1.4, 0.55, "#675b45");
  box(23, 6.7, -16 + side * 2.12, 0.45, 6.3, 0.08, "#bc9b6b");
}
part("column", [23, 15, -16], [1.7, 1.5, 1.7], "#dfc593");
for (let i = 0; i < 8; i++) {
  const a = (i * Math.PI) / 4;
  box(
    23 + Math.sin(a) * 1.4,
    15.1,
    -16 + Math.cos(a) * 1.4,
    0.48,
    0.9,
    0.12,
    "#5f604d",
    a,
  );
}
part("dome", [23, 15.8, -16], [1.9, 1.3, 1.9], "#b75632");
part("column", [23, 17.3, -16], [0.13, 0.5, 0.13], "#d7b67b");
hall("towerAnnex", 3.3, true);

// Green Library-inspired west block with a portico and book-colored windows.
hall("library", 5);
for (const x of [-25.8, -23.1, -20.4]) column(x, -6.3, 3.5);
roof(-23.1, -6.3, 3.2, 9.3, 4.3, 1.3, Math.PI / 2);
box(-23.1, 2.2, -7.55, 1.6, 2.9, 0.12, "#6c785b");
for (let i = 0; i < 4; i++)
  box(
    -24.3 + i * 0.75,
    4,
    -7.5,
    0.45,
    0.7,
    0.12,
    ["#8d4732", "#b79852", "#4f7969", "#bd7b46"][i],
  );

// Oval: a real elliptical lawn with an encircling path and open central approach.
part("column", [0, 0.25, 21], [12.7, 0.14, 9.4], "#cfba8a");
part("column", [0, 0.36, 21], [10.9, 0.14, 7.7], "#6c9c45");
for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI) / 6;
  part(
    "round",
    [Math.cos(a) * 8.9, 0.46, 21 + Math.sin(a) * 5.7],
    [0.7, 0.1, 0.55],
    i % 2 ? "#7ca54f" : "#75a249",
  );
}
for (const [x, z] of campusDistrictPalms) palm(x, z);
for (const side of [-1, 1]) {
  bench(side * 15.7, 22, side > 0 ? Math.PI / 2 : -Math.PI / 2);
  box(side * 5.4, 1.4, 35, 1.2, 2.7, 1.2, "#ccae77");
  box(side * 5.4, 2.8, 35, 1.5, 0.25, 1.5, "#e5cb98");
  part("column", [side * 6.8, 2.9, 34.7], [0.07, 5.3, 0.07], "#87724b");
  box(side * 6.8 + 0.65, 4.7, 34.7, 1.3, 1.6, 0.08, "#96382e");
  box(side * 6.8 + 0.65, 4.7, 34.76, 0.16, 1, 0.05, "#e2c48d");
}

// Cafe and study grove: awning, parasols, shared table, bicycle parking.
hall("cafe", 3.5, true);
for (let i = 0; i < 7; i++)
  box(
    -26.6 + i * 1.2,
    2.8,
    7.3,
    1.17,
    0.18,
    1.8,
    i % 2 ? "#e7d1a0" : "#6d8c63",
  );
table(-23, 11);
table(-23, 16);
box(-21.5, 1.3, 23.5, 4.8, 0.22, 1.6, "#aa8553");
for (const x of [-23.5, -19.5]) box(x, 0.75, 23.5, 0.28, 1.1, 1.3, "#776445");
bench(-21.5, 25);
bench(-21.5, 22, Math.PI);
for (const [x, z] of [
  [-27, 25],
  [-27, 18],
  [-18, 28],
  [27, 27],
  [27, 10],
  [-26, -30],
  [14, -31],
])
  broadleaf(x, z, 4.6);
// Small original bicycle silhouettes; no sports logos or borrowed meshes.
for (let i = 0; i < 3; i++) {
  const x = -27.2,
    z = -1 + i * 1.35;
  for (const wx of [-0.65, 0.65]) {
    part("column", [x + wx, 0.68, z], [0.54, 0.12, 0.54], "#465c51", [
      Math.PI / 2,
      0,
      0,
    ]);
    part("column", [x + wx, 0.68, z + 0.08], [0.39, 0.13, 0.39], "#cbb985", [
      Math.PI / 2,
      0,
      0,
    ]);
  }
  box(x, 1.1, z, 1.3, 0.12, 0.12, "#9b4633");
  box(x + 0.5, 1.35, z, 0.12, 0.8, 0.12, "#9b4633", -0.2);
  box(x - 0.2, 1.3, z, 0.55, 0.12, 0.2, "#565b46");
}

// Arts courtyard: original abstract sculptures, not reproductions of Rodin works.
hall("arts", 4.2, true);
box(23, 0.24, 15, 11, 0.16, 16, "#c9b88d");
box(22, 0.65, 12, 2, 0.85, 2, "#aaa084");
part("arch", [22, 2.3, 12], [1.2, 1.7, 1.2], "#658d7c", [0, 0.5, -0.3]);
box(25, 0.65, 19, 2.4, 0.85, 2.4, "#aaa084");
part("round", [25, 2.3, 19], [1.1, 1.7, 0.8], "#766751", [0, 0.4, 0.3]);
bench(20, 23);
bench(26, 23);

export const campusDistrictParts = parts;
