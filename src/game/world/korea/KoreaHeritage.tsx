import * as THREE from "three";
import { KOREA_SIGHTS } from "../../core/koreaSights";
import { sculptedMaterial } from "../Surface";
import { StaticBatch } from "../StaticBatch";
import { WorldSceneryParts } from "../WorldSceneryParts";
import {
  bracketBand,
  DANCHEONG as D,
  glazedStone,
  hexRoof,
  lathe,
  makeParts,
  stoneCap,
  tiled,
  type V3,
} from "./kit";
import { Roofs } from "./Roofs";

/**
 * Traditional Korea, as hand-sized miniatures: a Geunjeongjeon-style throne
 * hall on its stone terrace, Cheomseongdae, a Seokgatap-style pagoda, the
 * Hyangwonjeong pond pavilion, Sungnyemun over the west promenade, a hanok
 * lane with a dol-dam wall and jangdokdae jars, and jangseung guardians.
 * All static: one StaticBatch bakes the lot into a few draws.
 */

const S = KOREA_SIGHTS;
const granite = sculptedMaterial({ color: "#bdb29d" });

/* ---------------------------------------------------------- throne hall */
const hall = makeParts();
{
  const { add, roof } = hall;
  const { width: w } = S.hall;
  // Two-tier granite terrace (woldae) with balustrades and front stairs.
  add([0, 0.22, -0.3], [w, 0.44, 5.4], "#b3a993");
  add([0, 0.47, -0.3], [w + 0.1, 0.07, 5.5], "#cbc1ad", "block");
  const rail = (x0: number, x1: number, z: number) => {
    add([(x0 + x1) / 2, 0.8, z], [x1 - x0, 0.06, 0.08], "#d6cdb9", "block");
    for (let x = x0; x <= x1 + 1e-6; x += 0.62)
      add([x, 0.68, z], [0.12, 0.36, 0.12], "#d6cdb9");
  };
  rail(-4.4, -1.15, 2.33);
  rail(1.15, 4.4, 2.33);
  rail(-4.4, 4.4, -2.93);
  for (const x of [-4.45, 4.45])
    for (let z = -2.6; z <= 2.1; z += 0.62)
      add([x, 0.68, z], [0.12, 0.36, 0.12], "#d6cdb9");
  for (const x of [-4.45, 4.45])
    add([x, 0.8, -0.3], [0.08, 0.06, 5.2], "#d6cdb9", "block");
  for (const [i, z] of [2.58, 2.83].entries())
    add([0, 0.36 - i * 0.15, z], [2, 0.16, 0.26], "#c9bfab", "block");
  add([0, 0.66, -0.6], [7.2, 0.44, 4.2], "#b9af9a");
  add([0, 0.9, -0.6], [7.3, 0.06, 4.3], "#cfc5b1", "block");
  for (const [i, z] of [1.62, 1.86].entries())
    add([0, 0.8 - i * 0.15, z], [1.7, 0.16, 0.24], "#c9bfab", "block");
  // Bronze cauldrons (deumu) stand on the lower terrace.
  for (const x of [-3.7, 3.7]) {
    add([x, 0.68, 1.75], [0.42, 0.34, 0.42], "#6b5a3d", "column");
    add([x, 0.86, 1.75], [0.46, 0.04, 0.46], "#806b47", "column");
  }
  // Hall body: red columns, green lattice doors, painted beams.
  const hz = -0.9;
  add([0, 1.62, hz], [6, 1.46, 2.7], "#4f6f5d");
  for (let i = 0; i <= 5; i++) {
    const x = -3 + i * 1.2;
    for (const z of [hz - 1.38, hz + 1.38]) {
      add([x, 0.95, z], [0.32, 0.1, 0.32], "#d3c9b4", "column");
      add([x, 1.64, z], [0.2, 1.42, 0.2], D.column, "column");
    }
    if (i === 5) continue;
    const bx = x + 0.6;
    add([bx, 1.56, hz + 1.36], [0.98, 1.16, 0.05], "#6f8f7a", "block");
    for (const k of [-0.25, 0, 0.25])
      add([bx + k, 1.56, hz + 1.4], [0.03, 1.1, 0.03], "#ddd3b8", "block");
    for (const k of [-0.3, 0.05, 0.4])
      add([bx, 1.56 + k, hz + 1.4], [0.96, 0.03, 0.03], "#ddd3b8", "block");
  }
  for (const x of [-3, 3]) add([x, 1.64, hz], [0.2, 1.42, 0.2], D.column, "column");
  add([0, 2.38, hz], [6.4, 0.16, 3.0], D.green, "block");
  bracketBand(add, 0, 2.56, hz, 6.4, 3.0);
  roof([0, 2.84, hz], [8.7, 1.0, 5.1]);
  // Upper storey (the hall reads as two storeys from outside).
  add([0, 3.36, hz], [4.6, 0.7, 1.8], "#4f6f5d");
  for (let i = 0; i <= 4; i++)
    for (const z of [hz - 0.9, hz + 0.9])
      add([-2.3 + i * 1.15, 3.36, z], [0.16, 0.7, 0.16], D.column, "column");
  bracketBand(add, 0, 3.8, hz, 4.8, 2.0, 0.4);
  roof([0, 4.06, hz], [6.6, 1.15, 3.8]);
  // Name board under the upper eave.
  add([0, 3.42, hz + 0.95], [1.05, 0.5, 0.05], "#c79a4b", "block");
  add([0, 3.42, hz + 0.98], [0.9, 0.38, 0.04], "#2e2b2d", "block");
}
// Forecourt: stone tiles and the raised royal path (eodo).
const hallCourt = makeParts();
{
  const { add } = hallCourt;
  add([0, 0.19, 4.9], [10, 0.05, 3.9], "#bbb19d", "block");
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 9; col++)
      add(
        [-4.4 + col * 1.1, 0.22, 3.4 + row * 0.95],
        [1.06, 0.012, 0.91],
        ["#c8bdaa", "#c2b7a3", "#cdc2ae"][(row + col * 2) % 3],
        "block",
      );
  add([0, 0.245, 4.9], [1.3, 0.04, 3.9], "#d6ccb8", "block");
}

/* ---------------------------------------------------------- Cheomseongdae */
const COURSES = 27;
const cheomProfile: [number, number][] = [[0.001, 0]];
for (let i = 0; i < COURSES; i++) {
  const r = (t: number) => 0.6 + 0.36 * (1 - t) ** 1.7;
  const t0 = i / COURSES,
    t1 = (i + 1) / COURSES;
  // Each course sits a hair proud of the one above: soft stone ledges.
  cheomProfile.push([r(t0) + 0.014, t0 * 2.6], [r(t1) + 0.002, t1 * 2.6 - 0.012]);
}
cheomProfile.push([0.001, 2.6]);
const stoneTones = ["#c9bea8", "#bdb29c", "#d2c8b3", "#c3b8a2"];
const cheomBody = lathe(cheomProfile, 22, (row) =>
  stoneTones[Math.floor((row - 1) / 2 + 0.5) % stoneTones.length],
);
const cheom = makeParts();
{
  const { add } = cheom;
  add([0, 0.12, 0], [2.2, 0.24, 2.2], "#b4aa95");
  add([0, 0.33, 0], [1.95, 0.18, 1.95], "#c4baa5");
  // South-facing window opening, about halfway up.
  add([0, 1.72, 0.7], [0.36, 0.36, 0.14], "#3a332d", "block");
  add([0, 1.53, 0.74], [0.46, 0.05, 0.12], "#d0c6b1", "block");
  // The two-layer "井" frame on top.
  for (const z of [-0.36, 0.36])
    add([0, 3.08, z], [1.38, 0.12, 0.16], "#c5bba6");
  for (const x of [-0.36, 0.36])
    add([x, 3.2, 0], [0.16, 0.12, 1.38], "#cbc1ad");
  add([0, 3.0, 0], [0.62, 0.04, 0.62], "#7d756a", "column");
}

/* ---------------------------------------------------------- pagoda */
const pagoda = makeParts();
const pagodaCaps: { p: V3; s: V3 }[] = [];
{
  const { add } = pagoda;
  const pilasters = (y: number, h: number, half: number, n: number) => {
    for (let f = 0; f < 4; f++) {
      const rot = (f * Math.PI) / 2;
      for (let k = 0; k < n; k++) {
        const off = -half + (k * 2 * half) / (n - 1);
        const nx = Math.sin(rot),
          nz = Math.cos(rot);
        add(
          [nx * (half + 0.012) + nz * off, y, nz * (half + 0.012) - nx * off],
          [Math.abs(nz) > 0.5 ? 0.11 : 0.03, h, Math.abs(nz) > 0.5 ? 0.03 : 0.11],
          "#cfc6b2",
          "block",
        );
      }
    }
  };
  add([0, 0.3, 0], [2.1, 0.6, 2.1], "#b7ad99");
  pilasters(0.3, 0.5, 1.0, 3);
  add([0, 0.64, 0], [2.25, 0.1, 2.25], "#c4bba7");
  add([0, 0.72, 0], [1.9, 0.07, 1.9], "#cbc2ae", "block");
  add([0, 1.06, 0], [1.55, 0.6, 1.55], "#bdb39f");
  pilasters(1.06, 0.52, 0.74, 3);
  add([0, 1.42, 0], [1.75, 0.12, 1.75], "#c6bdaa");
  add([0, 1.5, 0], [1.45, 0.06, 1.45], "#cbc2ae", "block");
  const stories: [number, number, number, number][] = [
    // y bottom, body width, body height, cap width
    [1.53, 0.95, 0.62, 1.78],
    [2.68, 0.78, 0.34, 1.46],
    [3.36, 0.66, 0.3, 1.22],
  ];
  for (const [y, bw, bh, cw] of stories) {
    add([0, y + bh / 2, 0], [bw, bh, bw], "#c3baa6");
    pilasters(y + bh / 2, bh * 0.9, bw / 2, 2);
    add([0, y + bh + 0.03, 0], [bw * 1.18, 0.06, bw * 1.18], "#b9b09c", "block");
    add([0, y + bh + 0.08, 0], [bw * 1.34, 0.05, bw * 1.34], "#c0b7a3", "block");
    pagodaCaps.push({ p: [0, y + bh + 0.1, 0], s: [cw, 0.3, cw] });
  }
  // Finial: base, inverted bowl, stacked rings and spire.
  add([0, 3.98, 0], [0.34, 0.12, 0.34], "#b6ad99");
  add([0, 4.1, 0], [0.16, 0.12, 0.16], "#a99f8c", "rock");
  for (let k = 0; k < 4; k++)
    add([0, 4.24 + k * 0.11, 0], [0.15 - k * 0.015, 0.05, 0.15 - k * 0.015], "#a49a87", "column");
  add([0, 4.85, 0], [0.035, 0.5, 0.035], "#8f8676", "column");
}

/* ---------------------------------------------------------- Sungnyemun */
const gateShape = new THREE.Shape();
{
  const half = S.sungnyemun.depth / 2,
    tunnel = S.sungnyemun.tunnel / 2;
  gateShape.moveTo(-half, 0);
  gateShape.lineTo(-tunnel, 0);
  gateShape.lineTo(-tunnel, 0.95);
  gateShape.absarc(0, 0.95, tunnel, Math.PI, 0, true);
  gateShape.lineTo(tunnel, 0);
  gateShape.lineTo(half, 0);
  gateShape.lineTo(half * 0.97, 2.3);
  gateShape.lineTo(-half * 0.97, 2.3);
  gateShape.closePath();
}
const gateBase = new THREE.ExtrudeGeometry(gateShape, {
  depth: S.sungnyemun.width,
  bevelEnabled: false,
  curveSegments: 14,
});
gateBase.translate(0, 0, -S.sungnyemun.width / 2);
gateBase.rotateY(Math.PI / 2);
const gate = makeParts();
{
  const { add, roof } = gate;
  const halfW = S.sungnyemun.width / 2;
  // Ashlar courses proud of both faces (skipping the arch).
  for (let row = 0; row < 5; row++) {
    const y = 0.25 + row * 0.44;
    for (let k = -4; k <= 4; k++) {
      const z = k * 0.74 + (row % 2) * 0.37;
      if (Math.abs(z) > 3.0) continue;
      if (Math.abs(z) < 1.25 && y < 2.05) continue;
      for (const side of [-1, 1])
        add(
          [side * (halfW + 0.012), y, z],
          [0.04, 0.38, 0.7],
          ["#c4b9a4", "#b5aa95", "#bfb49f"][(row + k + 9) % 3],
        );
    }
  }
  // Arch voussoirs.
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (i / 8);
    for (const side of [-1, 1])
      add(
        [side * (halfW + 0.014), 0.95 + Math.sin(a) * 1.05, Math.cos(a) * 1.05],
        [0.05, 0.26, 0.3],
        "#d2c8b4",
        "stone",
        [a - Math.PI / 2, 0, 0],
      );
  }
  // Parapet along the top.
  for (let z = -2.95; z <= 2.96; z += 0.59)
    for (const side of [-1, 1])
      add([side * 1.58, 2.44, z], [0.16, 0.28, 0.42], "#c7bda9");
  // Two-storey gatehouse.
  add([0, 2.36, 0], [3.0, 0.12, 6.0], "#c9bfab", "block");
  add([0, 2.96, 0], [2.1, 1.08, 4.7], "#4f6f5d");
  for (let k = 0; k <= 5; k++)
    for (const x of [-1.15, 1.15])
      add([x, 2.98, -2.5 + k], [0.17, 1.12, 0.17], D.column, "column");
  bracketBand(add, 0, 3.6, 0, 2.5, 5.2, 0.4);
  roof([0, 3.82, 0], [3.9, 0.82, 6.8], Math.PI / 2);
  add([0, 4.16, 0], [1.7, 0.62, 3.9], "#4f6f5d");
  for (let k = 0; k <= 4; k++)
    for (const x of [-0.88, 0.88])
      add([x, 4.16, -2 + k], [0.14, 0.62, 0.14], D.column, "column");
  bracketBand(add, 0, 4.58, 0, 1.9, 4.2, 0.38);
  roof([0, 4.8, 0], [3.2, 0.95, 5.7], Math.PI / 2);
}

/* ---------------------------------------------------------- Hyangwonjeong */
const pavilion = makeParts();
{
  const { add } = pavilion;
  add([0, 0.12, 0], [1.3, 0.22, 1.3], "#8c887a", "rock");
  add([0, 0.27, 0], [1.12, 0.07, 1.12], "#6d8c5c", "column");
  add([0, 0.39, 0], [0.78, 0.14, 0.78], "#c7bda8", "column");
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add([Math.cos(a) * 0.56, 0.86, Math.sin(a) * 0.56], [0.09, 0.82, 0.09], D.column, "column");
  }
  add([0, 1.3, 0], [0.78, 0.1, 0.78], D.green, "column");
  add([0, 1.37, 0], [1.42, 1.42, 1.42], "#7a4a39", "ring", [Math.PI / 2, 0, 0]);
  add([0, 1.58, 0], [0.62, 0.42, 0.62], "#4f6f5d", "column");
  add([0, 1.83, 0], [0.74, 0.08, 0.74], D.green, "column");
  add([0, 2.73, 0], [0.09, 0.16, 0.09], "#4c443d", "column");
  add([0, 2.86, 0], [0.11, 0.11, 0.11], "#5e5246", "rock");
}

/* ---------------------------------------------------------- jangseung */
function jangseung(male: boolean) {
  const { parts, add } = makeParts();
  add([0, 1.05, 0], [0.24, 2.1, 0.24], "#8b6c4f", "column");
  add([0, 2.12, 0], [0.27, 0.34, 0.27], "#9a7a5a", "rock");
  for (const side of [-1, 1]) {
    add([side * 0.1, 2.2, 0.22], [0.1, 0.075, 0.05], "#f3ead8", "block");
    add([side * 0.1, 2.2, 0.245], [0.045, 0.045, 0.02], "#1d1a18", "block");
    add([side * 0.11, 2.31, 0.22], [0.14, 0.04, 0.04], "#1d1a18", "block", [0, 0, side * -0.4]);
  }
  add([0, 2.1, 0.26], [0.075, 0.13, 0.07], "#7f6045");
  add([0, 1.99, 0.22], [0.18, 0.055, 0.04], "#f3ead8", "block");
  if (male) {
    add([0, 2.03, 0.245], [0.24, 0.035, 0.03], "#1d1a18", "block");
    add([0, 2.36, 0], [0.42, 0.03, 0.42], "#232020", "column");
    add([0, 2.5, 0], [0.22, 0.27, 0.22], "#232020", "column");
  } else {
    add([0, 2.36, 0], [0.29, 0.12, 0.29], "#2a2422", "rock");
    add([0.17, 2.0, 0.2], [0.05, 0.05, 0.03], "#c4523f", "block");
    add([-0.17, 2.0, 0.2], [0.05, 0.05, 0.03], "#c4523f", "block");
  }
  // Painted inscription band down the front of the post.
  add([0, 1.12, 0.215], [0.12, 1.25, 0.02], "#e6d9bf", "block");
  for (let k = 0; k < 5; k++)
    add([0, 1.62 - k * 0.24, 0.228], [0.07, 0.11, 0.012], male ? "#2a2522" : "#a33e2f", "block");
  return parts;
}
const jangseungMale = jangseung(true),
  jangseungFemale = jangseung(false);

/* ---------------------------------------------------------- hanok lane */
function hanok(w: number, d: number, tone: string) {
  const { parts, roofs, add, roof } = makeParts();
  add([0, 0.3, 0], [w, 0.42, d], "#918a7c");
  for (let col = 0; col < Math.round(w / 0.56); col++)
    for (let row = 0; row < 2; row++)
      add(
        [-w / 2 + 0.28 + col * 0.56, 0.2 + row * 0.2, d / 2 + 0.01],
        [0.53, 0.18, 0.05],
        ["#b6aa95", "#a59a87", "#ada291"][(col + row) % 3],
      );
  add([0, 1.16, 0], [w - 0.16, 1.3, d - 0.16], tone);
  for (const x of [-w / 2 + 0.07, -0.75, 0.75, w / 2 - 0.07])
    add([x, 1.16, d / 2 - 0.06], [0.14, 1.32, 0.14], D.timber);
  for (const x of [-w / 2 + 0.07, w / 2 - 0.07])
    add([x, 1.16, -d / 2 + 0.06], [0.14, 1.32, 0.14], D.timber);
  for (const x of [-1.5, 1.5]) {
    add([x, 1.3, d / 2 - 0.02], [1.05, 0.62, 0.08], D.timber);
    add([x, 1.3, d / 2 + 0.01], [0.94, 0.5, 0.03], "#e8dcc2", "block");
    for (const bar of [-0.3, -0.1, 0.1, 0.3])
      add([x + bar, 1.3, d / 2 + 0.03], [0.03, 0.5, 0.02], D.timber, "block");
    add([x, 1.3, d / 2 + 0.03], [0.94, 0.03, 0.02], D.timber, "block");
  }
  add([0, 1.0, d / 2 - 0.02], [0.86, 1.34, 0.09], D.timber);
  add([0, 1.0, d / 2 + 0.02], [0.7, 1.16, 0.03], "#b79f78", "block");
  add([0, 0.12, d / 2 + 0.22], [1.0, 0.16, 0.32], "#b6ab94");
  add([0, 1.86, 0], [w + 0.04, 0.16, d + 0.08], D.timber);
  for (let k = -8; k <= 8; k++)
    for (const side of [-1, 1])
      add([k * (w / 17), 1.95, side * (d / 2 + 0.12)], [0.07, 0.08, 0.26], "#8a7058");
  roof([0, 1.9, 0], [w + 0.55, 0.95, d + 0.62]);
  return { parts, roofs };
}
const lane = makeParts();
{
  const { add, roof } = lane;
  const [wx, wz, len] = S.laneWall;
  const ox = -40.8,
    oz = -6.2;
  // Courtyard paving.
  add([0, 0.19, 0], [15.2, 0.05, 4.6], "#aaa396", "block");
  for (let i = 0; i < 12; i++)
    add([-6.6 + i * 1.2, 0.225, 1.95], [1.15, 0.012, 0.36], i % 3 ? "#bcb29f" : "#c8bfac", "block");
  // Dol-dam: two courses of rounded field stones under a tiled coping.
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 26; k++) {
      const x = wx - ox - len / 2 + 0.3 + k * 0.58 + (row % 2) * 0.29;
      if (x > wx - ox + len / 2 - 0.2) continue;
      add(
        [x, 0.32 + row * 0.24, wz - oz],
        [0.54, 0.24, 0.34],
        ["#a39b8c", "#8f897d", "#b0a797", "#99917f"][(k * 3 + row) % 4],
        row === 1 ? "rock" : "stone",
      );
    }
  add([wx - ox, 0.98, wz - oz], [len, 0.08, 0.3], "#c3b9a5", "block");
  roof([wx - ox, 1.0, wz - oz], [len + 0.2, 0.3, 0.62]);
  // Jangdokdae: a raised stone stand of onggi jars.
  const [jx, jz] = S.jars;
  add([jx - ox, 0.28, jz - oz], [1.4, 0.24, 0.8], "#a69e8f");
}
const onggi = lathe(
  [
    [0.001, 0],
    [0.16, 0.01],
    [0.27, 0.16],
    [0.31, 0.32],
    [0.26, 0.5],
    [0.17, 0.58],
    [0.18, 0.62],
    [0.001, 0.63],
  ],
  14,
  (row) => (row >= 6 ? "#3f2d22" : row % 2 ? "#6a4630" : "#5c3d2a"),
);
const jars: { p: V3; s: number }[] = [
  [-0.45, -0.18, 0.9],
  [0.05, -0.2, 1.05],
  [0.5, -0.15, 0.8],
  [-0.25, 0.2, 0.7],
  [0.3, 0.22, 0.75],
].map(([x, z, s]) => ({
  p: [S.jars[0] + x, 0.4, S.jars[1] + z],
  s,
}));

const hanokTones = ["#d6c6a8", "#ccb998", "#dccdb2"];
const hanoks = S.hanoks.map((h, i) => ({
  ...h,
  ...hanok(h.width, h.depth, hanokTones[i % hanokTones.length]),
}));

/* ---------------------------------------------------------- component */
export function KoreaHeritage() {
  const H = S.hall,
    C = S.cheomseongdae,
    P = S.pagoda,
    G = S.sungnyemun,
    V = S.pavilion;
  return (
    <StaticBatch id="korea-heritage">
      <group name="korea-heritage">
        <group name="geunjeongjeon-hall" position={[H.x, 0, H.z]}>
          <WorldSceneryParts parts={hallCourt.parts} />
          <WorldSceneryParts parts={hall.parts} />
          <Roofs roofs={hall.roofs} />
        </group>
        <group name="cheomseongdae" position={[C.x, 0, C.z]}>
          <WorldSceneryParts parts={cheom.parts} />
          <mesh
            geometry={cheomBody}
            material={tiled}
            position-y={0.42}
            castShadow
            receiveShadow
            dispose={null}
          />
        </group>
        <group name="seokgatap-pagoda" position={[P.x, 0, P.z]}>
          <WorldSceneryParts parts={pagoda.parts} />
          {pagodaCaps.map(({ p, s }, i) => (
            <mesh
              key={i}
              position={p}
              scale={s}
              geometry={stoneCap}
              material={tiled}
              castShadow
              receiveShadow
              dispose={null}
            />
          ))}
        </group>
        <group name="sungnyemun" position={[G.x, 0, G.z]}>
          <mesh
            geometry={gateBase}
            material={granite}
            castShadow
            receiveShadow
            dispose={null}
          />
          <WorldSceneryParts parts={gate.parts} />
          <Roofs roofs={gate.roofs} />
        </group>
        <group name="hyangwonjeong" position={[V.x, 0, V.z]}>
          <WorldSceneryParts parts={pavilion.parts} />
          <mesh
            position={[0, 1.86, 0]}
            scale={[1.95, 0.86, 1.95]}
            geometry={hexRoof}
            material={tiled}
            castShadow
            receiveShadow
            dispose={null}
          />
        </group>
        {S.jangseung.map(([x, z], i) => (
          <group
            key={i}
            name="jangseung"
            position={[x, 0, z]}
            rotation-y={Math.PI / 2 + (i ? 0.25 : -0.25)}
          >
            <WorldSceneryParts parts={i ? jangseungFemale : jangseungMale} />
          </group>
        ))}
        <group name="hanok-lane" position={[-40.8, 0, -6.2]}>
          <WorldSceneryParts parts={lane.parts} />
          <Roofs roofs={lane.roofs} />
        </group>
        {jars.map(({ p, s }, i) => (
          <mesh
            key={i}
            position={p}
            scale={s}
            geometry={onggi}
            material={glazedStone}
            castShadow
            receiveShadow
            dispose={null}
          />
        ))}
        {hanoks.map(({ x, z, facing, parts, roofs }, i) => (
          <group
            key={i}
            name="hanok"
            position={[x, 0, z]}
            rotation-y={facing ? 0 : Math.PI / 2}
          >
            <WorldSceneryParts parts={parts} />
            <Roofs roofs={roofs} />
          </group>
        ))}
      </group>
    </StaticBatch>
  );
}
