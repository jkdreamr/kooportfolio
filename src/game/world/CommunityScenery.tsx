import * as THREE from "three";
import { KOREA_MARKET, KOREA_PICNIC } from "../core/koreaDistrict";
import { KOREA_EXERCISE_YARD } from "../core/regionalActivities";
import { beam, WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
import { Glazing, type Pane } from "./ArchitectureDetail";

type Footprint = readonly [number, number, number, number];
const home: SceneryPart[] = [],
  korea: SceneryPart[] = [];
const homeSolids: Footprint[] = [],
  koreaSolids: Footprint[] = [];
export const HOME_COMMUNITY_OBSTACLES: readonly Footprint[] = homeSolids;
export const KOREA_ACTIVITY_OBSTACLES: readonly Footprint[] = koreaSolids;

function part(
  a: SceneryPart[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  c: string,
  shape: SceneryPart["shape"] = "block",
  r?: [number, number, number],
) {
  a.push({ p: [x, y, z], s: [w, h, d], c, shape, r });
}
function rod(
  a: SceneryPart[],
  start: [number, number, number],
  end: [number, number, number],
  w: number,
  c: string,
) {
  beam(a, new THREE.Vector3(...start), new THREE.Vector3(...end), w, c);
}
function picnic(a: SceneryPart[], solids: Footprint[], x: number, z: number) {
  solids.push([x, z, 2, 1.6]);
  for (let i = 0; i < 5; i++)
    part(a, x, 1.35, z - 0.64 + i * 0.32, 3.7, 0.16, 0.29, "#a48a62");
  for (const side of [-1, 1]) {
    part(a, x, 0.78, z + side * 1.2, 3.7, 0.17, 0.46, "#9b815d");
    for (const dx of [-1.25, 1.25])
      rod(
        a,
        [x + dx, 0.2, z + side * 1.45],
        [x + dx, 1.3, z + side * 0.4],
        0.15,
        "#56665e",
      );
  }
}
function bicycle(a: SceneryPart[], x: number, z: number, c: string) {
  for (const dx of [-0.8, 0.8]) {
    part(a, x + dx, 0.82, z, 1.22, 1.22, 1.22, "#394a47", "ring");
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 4;
      rod(
        a,
        [x + dx - Math.cos(angle) * 0.57, 0.82 - Math.sin(angle) * 0.57, z],
        [x + dx + Math.cos(angle) * 0.57, 0.82 + Math.sin(angle) * 0.57, z],
        0.025,
        "#c1c6b7",
      );
    }
  }
  for (const [start, end] of [
    [
      [-0.8, 0.82],
      [0, 0.75],
    ],
    [
      [0, 0.75],
      [-0.3, 1.55],
    ],
    [
      [-0.3, 1.55],
      [-0.8, 0.82],
    ],
    [
      [-0.3, 1.55],
      [0.55, 1.5],
    ],
    [
      [0.55, 1.5],
      [0, 0.75],
    ],
    [
      [0.55, 1.5],
      [0.8, 0.82],
    ],
  ])
    rod(a, [x + start[0], start[1], z], [x + end[0], end[1], z], 0.09, c);
  part(a, x - 0.3, 1.65, z, 0.5, 0.12, 0.3, "#424d47");
  rod(a, [x + 0.55, 1.5, z], [x + 0.45, 1.88, z], 0.075, "#c1c6b7");
  part(a, x + 0.45, 1.88, z, 0.12, 0.08, 0.65, "#424d47");
}

homeSolids.push([-35, -7, 1.6, 2.2]);
for (let i = 0; i < 3; i++)
  bicycle(home, -35, -8.3 + i * 1.3, ["#8b5d4e", "#657e70", "#b29a68"][i]);

// Kitchen-adjacent allotments have a working central aisle, water barrel and
// timber trellises; beds are separate solids so the whole garden is explorable.
part(home, -13, 0.185, 3.5, 2.2, 0.06, 17, "#b3a586");
part(home, -13, 0.19, 3.5, 24, 0.065, 1.6, "#b3a586");
for (const x of [-19, -7])
  for (const z of [0, 7]) {
    homeSolids.push([x, z, 3.8, 2.3]);
    part(home, x, 0.38, z, 7.6, 0.45, 4.6, "#806b4a");
    part(home, x, 0.62, z, 7.2, 0.08, 4.2, "#63573f");
    for (const side of [-1, 1]) {
      part(home, x + side * 3.75, 0.63, z, 0.16, 0.18, 4.7, "#b19b70");
      part(home, x, 0.63, z + side * 2.25, 7.6, 0.18, 0.16, "#b19b70");
    }
    const tomatoes = z === 7;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        const px = x - 2.8 + i * 1.1,
          pz = z - 1.4 + j * 1.4;
        if (tomatoes) part(home, px, 1.65, pz, 0.055, 2.05, 0.055, "#ad9870");
        for (let k = 0; k < 4; k++)
          part(
            home,
            px + Math.sin(k * 1.7) * 0.22,
            tomatoes ? 1.1 + k * 0.22 : 0.85,
            pz + Math.cos(k * 1.7) * 0.22,
            0.16,
            tomatoes ? 0.65 : 0.5,
            0.55,
            k % 2 ? "#69824c" : "#82945e",
            "block",
            [0.4, k * 1.7, 0.3],
          );
      }
    if (tomatoes) part(home, x, 2.35, z, 7.3, 0.1, 0.1, "#a99266");
  }
homeSolids.push([-26, 0, 0.9, 0.9]);
part(home, -26, 1.1, 0, 1.5, 1.9, 1.5, "#6b8275", "column");
part(home, -26, 2.1, 0, 1.6, 0.16, 1.6, "#9ba78b", "column");
rod(home, [-26, 1.5, 0], [-25, 1.5, 0], 0.12, "#b4a577");
part(home, 10, 0.22, 2, 13, 0.15, 11, "#b5a78a");
part(home, 10, 0.19, -3, 3, 0.06, 4, "#b3a586");
for (const dx of [-5.3, 5.3])
  for (const dz of [-4.3, 4.3]) {
    part(home, 10 + dx, 2.4, 2 + dz, 0.26, 4.4, 0.26, "#8e7857");
    homeSolids.push([10 + dx, 2 + dz, 0.2, 0.2]);
  }
for (let i = 0; i < 13; i++)
  part(home, 4 + i, 4.7, 2, 0.18, 0.26, 10.4, "#a38a61");
for (const dz of [-4.3, 4.3])
  part(home, 10, 4.5, 2 + dz, 12, 0.25, 0.22, "#806d52");
picnic(home, homeSolids, 10, 2);

// A glazed cold frame at the allotments' west end: timber box, seedling trays and
// a propped lid whose panes are real glass (see HomeCommunity).
const coldFrame = [-26.6, 8.2] as const;
const coldFramePanes: Pane[] = [];
{
  const [x, z] = coldFrame;
  homeSolids.push([x, z, 1.05, 0.65]);
  part(home, x, 0.36, z, 2.1, 0.44, 1.3, "#8a6f4c");
  part(home, x, 0.5, z - 0.6, 2.1, 0.7, 0.1, "#7b6243");
  part(home, x, 0.6, z, 1.9, 0.06, 1.1, "#5d5140");
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 2; j++)
      part(
        home,
        x - 0.75 + i * 0.3,
        0.7,
        z - 0.2 + j * 0.4,
        0.1,
        0.16,
        0.2,
        (i + j) % 2 ? "#7c9a58" : "#93ab66",
        "block",
        [0.3, i * 1.3, 0.2],
      );
  const tilt = -0.42;
  for (const dx of [-1, 0, 1])
    part(home, x + dx * 0.98, 0.98, z - 0.02, 0.09, 0.08, 1.36, "#a98a5e", "block", [tilt, 0, 0]);
  for (const dz of [-1, 1])
    part(
      home,
      x,
      0.98 + dz * Math.sin(tilt) * -0.64,
      z - 0.02 + dz * Math.cos(tilt) * 0.64,
      2.05,
      0.08,
      0.09,
      "#a98a5e",
      "block",
      [tilt, 0, 0],
    );
  part(home, x + 0.6, 0.86, z + 0.5, 0.06, 0.5, 0.06, "#6f5a3e");
  for (const dx of [-0.49, 0.49])
    coldFramePanes.push({
      p: [x + dx, 0.975, z - 0.02],
      s: [0.9, 0.03, 1.22],
      r: [tilt, 0, 0],
    });
}

const { z: marketZ } = KOREA_MARKET;
for (const [i, x] of KOREA_MARKET.stalls.entries()) {
  koreaSolids.push([x, marketZ, 4.7, 3.2]);
  part(korea, x, 0.22, marketZ, 9.6, 0.12, 6.6, "#b6ada0");
  for (const dx of [-4.4, 4.4])
    for (const dz of [-2.8, 2.8])
      part(korea, x + dx, 1.95, marketZ + dz, 0.14, 3.5, 0.14, "#5e6e65");
  for (const side of [-1, 1])
    part(
      korea,
      x,
      3.8,
      marketZ + side * 1.65,
      10,
      0.13,
      3.8,
      i === 1 ? "#bd9861" : "#b76d52",
      "block",
      [side * 0.22, 0, 0],
    );
  part(korea, x, 1.2, marketZ + 2.2, 8.5, 1.6, 1.25, "#a28c69");
  part(korea, x, 2.03, marketZ + 2.2, 8.8, 0.13, 1.5, "#c7bda6");
  part(korea, x, 1.6, marketZ - 2.3, 8.5, 0.18, 1.3, "#879389");
  for (let j = 0; j < 4; j++) {
    part(
      korea,
      x - 2.7 + j * 1.8,
      1.99,
      marketZ - 2.3,
      1.15,
      0.65,
      1.15,
      "#a8b3a8",
      "column",
    );
    part(
      korea,
      x - 2.7 + j * 1.8,
      2.35,
      marketZ - 2.3,
      1.28,
      0.1,
      1.28,
      "#c5cbbd",
      "column",
    );
    part(
      korea,
      x - 2.7 + j * 1.8,
      2.46,
      marketZ - 2.3,
      0.2,
      0.2,
      0.2,
      "#556b63",
      "column",
    );
    part(
      korea,
      x - 2.7 + j * 1.8,
      2.19,
      marketZ + 2.2,
      0.85,
      0.25,
      0.85,
      "#d1c6aa",
      "column",
    );
    part(
      korea,
      x - 2.7 + j * 1.8,
      2.32,
      marketZ + 2.2,
      0.72,
      0.04,
      0.72,
      "#ba774e",
      "column",
    );
    part(
      korea,
      x - 2.7 + j * 1.8,
      2.38,
      marketZ + 2.2,
      0.6,
      0.04,
      0.08,
      "#d5b477",
    );
  }
}
picnic(korea, koreaSolids, 31, -6.5);
picnic(korea, koreaSolids, 43, -6.5);

// A calisthenics yard faces the main east-west path. Only the actual apparatus
// is solid: visitors can enter the exercise pad instead of hitting a large box.
const [yardX, yardZ, yardWidth, yardDepth] = KOREA_EXERCISE_YARD;
part(korea, yardX, 0.2, yardZ, yardWidth, 0.1, yardDepth, "#718986");
part(korea, -43, 0.26, 3, 13, 0.025, 7.7, "#81958e");
part(korea, -43, 0.19, 10, 3, 0.05, 4, "#aaa99e");
for (const [x, z, h] of [
  [-48, 1, 3.8],
  [-44, 1, 3.8],
  [-40, 1, 2.9],
  [-36, 1, 2.9],
]) {
  part(korea, x, h / 2 + 0.25, z, 0.18, h, 0.18, "#516b64");
  part(korea, x, 0.3, z, 0.6, 0.15, 0.6, "#b8b9a6");
  koreaSolids.push([x, z, 0.24, 0.24]);
}
rod(korea, [-48, 4, 1], [-44, 4, 1], 0.16, "#b2b9a5");
rod(korea, [-44, 3, 1], [-40, 3, 1], 0.16, "#b2b9a5");
rod(korea, [-40, 3, 1], [-36, 3, 1], 0.16, "#b2b9a5");
for (const x of [-46, -40]) {
  for (const dz of [-1.1, 1.1]) {
    rod(korea, [x - 1, 0.3, 6 + dz], [x - 1, 1.7, 6 + dz], 0.12, "#5f7870");
    rod(korea, [x + 1, 0.3, 6 + dz], [x + 1, 1.7, 6 + dz], 0.12, "#5f7870");
    rod(korea, [x - 1, 1.7, 6 + dz], [x + 1, 1.7, 6 + dz], 0.13, "#b3bba9");
  }
  koreaSolids.push([x, 6, 1.2, 1.35]);
}

const [deckX, deckZ] = KOREA_PICNIC;
part(korea, deckX, 0.22, deckZ, 14, 0.15, 15, "#a69371");
// The market's picnic shelter is open on all four sides.
const shelterZ = deckZ + 3.25;
for (const dx of [-5.45, 5.45]) {
  for (const dz of [-2.65, 2.65]) {
    part(korea, deckX + dx, 1.93, shelterZ + dz, 0.25, 3.22, 0.25, "#73563f");
    part(korea, deckX + dx, 0.46, shelterZ + dz, 0.57, 0.26, 0.57, "#99958a");
    koreaSolids.push([deckX + dx, shelterZ + dz, 0.29, 0.29]);
  }
  part(korea, deckX + dx, 3.35, shelterZ, 0.28, 0.24, 5.65, "#765b48");
}
for (const side of [-1, 1]) {
  for (const [offset, y, depth, pitch, color] of [
    [1.25, 4.1, 2.8, 0.42, "#4d6461"],
    [3, 3.51, 1.25, 0.16, "#415755"],
  ] as const) {
    part(
      korea,
      deckX,
      y,
      shelterZ + side * offset,
      12.5,
      0.17,
      depth,
      color,
      "block",
      [side * pitch, 0, 0],
    );
  }
  part(korea, deckX, 3.31, shelterZ + side * 2.65, 11.5, 0.29, 0.19, "#8e6150");
}
part(korea, deckX, 4.68, shelterZ, 12.6, 0.23, 0.37, "#3d5450");
// Dancheong: painted rafter ends under both eaves, a jade band with cinnabar
// lozenges on the purlins, and gilded ridge ends. Colour, not new structure.
const dancheong = ["#3f8a70", "#c9483b", "#2f62ad", "#f0e8d2", "#e0a93f"];
for (const side of [-1, 1]) {
  for (let i = 0; i < 17; i++) {
    const x = deckX - 5.76 + i * 0.72;
    part(korea, x, 3.3, shelterZ + side * 3.5, 0.2, 0.2, 0.42, dancheong[i % 4]);
    part(korea, x, 3.3, shelterZ + side * 3.73, 0.24, 0.24, 0.05, dancheong[4]);
  }
  part(korea, deckX, 3.31, shelterZ + side * 2.76, 11.5, 0.2, 0.03, dancheong[0]);
  for (let i = 0; i < 8; i++)
    part(
      korea,
      deckX - 5.04 + i * 1.44,
      3.31,
      shelterZ + side * 2.78,
      0.2,
      0.2,
      0.03,
      dancheong[1],
      "block",
      [0, 0, Math.PI / 4],
    );
  part(korea, deckX + side * 6.38, 4.72, shelterZ, 0.12, 0.42, 0.5, dancheong[4]);
}
// Market canopies carry the same five colours as a scalloped front valance.
for (const x of KOREA_MARKET.stalls)
  for (let i = 0; i < 13; i++)
    part(
      korea,
      x - 4.5 + i * 0.75,
      3.26 - (i % 2) * 0.07,
      marketZ + 3.52,
      0.7,
      0.3 + (i % 2) * 0.12,
      0.06,
      dancheong[i % 4],
    );
for (let i = 0; i < 19; i++)
  part(
    korea,
    deckX - 6.5 + i * 0.72,
    0.31,
    deckZ,
    0.055,
    0.015,
    14.8,
    "#8b7c60",
  );
for (const [dx, dz] of [
  [-2, -3],
  [3, 3],
]) {
  const x = deckX + dx,
    z = deckZ + dz;
  part(korea, x, 0.33, z, 3.6, 0.045, 2.8, "#9f7967");
  for (let i = 0; i < 4; i++)
    part(korea, x - 1.4 + i * 0.9, 0.36, z, 0.08, 0.025, 2.7, "#c1ac8b");
  part(korea, x + 0.8, 0.64, z + 0.5, 0.9, 0.55, 0.65, "#b29b6e");
  part(korea, x - 0.7, 0.44, z - 0.3, 0.7, 0.18, 0.7, "#d3c7a7", "column");
  part(korea, x - 0.7, 0.55, z - 0.3, 0.58, 0.08, 0.58, "#bb8157", "column");
  koreaSolids.push([x + 0.8, z + 0.5, 0.55, 0.4]);
}
for (let i = 0; i < 5; i++) {
  bicycle(korea, deckX - 9, deckZ - 6 + i * 1.5, i % 2 ? "#618b77" : "#bf9d5c");
  part(korea, deckX - 9, 0.4, deckZ - 6 + i * 1.5, 3.4, 0.12, 0.12, "#677e75");
}
koreaSolids.push([deckX - 9, deckZ - 3, 1.8, 3.9]);
koreaSolids.push([deckX + 3, deckZ + 4, 0.6, 0.6]);
for (const x of [deckX - 5.5, deckX + 5.5]) {
  part(korea, x, 0.65, deckZ + 7, 2.1, 0.8, 1.5, "#8d947e");
  koreaSolids.push([x, deckZ + 7, 1.15, 0.85]);
  for (let i = 0; i < 7; i++)
    part(
      korea,
      x - 0.75 + i * 0.25,
      1.35,
      deckZ + 7,
      0.1,
      1.2,
      0.65,
      i % 2 ? "#6a835c" : "#8b9a68",
      "block",
      [0.3, i, 0],
    );
}

export function HomeCommunity() {
  return (
    <group name="neighborhood-main-street-and-allotments">
      <WorldSceneryParts parts={home} />
      <Glazing panes={coldFramePanes} />
    </group>
  );
}
export function KoreaRiversideLife() {
  return (
    <group name="hangang-food-exercise-and-picnic-park">
      <WorldSceneryParts parts={korea} />
    </group>
  );
}
