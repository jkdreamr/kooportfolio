import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
import { HomeCommunity } from "./CommunityScenery";
import { RegionalTerrain } from "./RegionalTerrain";
import { GroundGrass } from "./Scenery";
import type { GroundFootprint } from "../core/scenery";

const paths: SceneryPart[] = [];
function path(x: number, z: number, width: number, depth: number) {
  paths.push({
    p: [x, 0.185, z],
    s: [width, 0.045, depth],
    c: "#ad9f82",
    shape: "block",
  });
  // Flush inset edges add thickness without invisible ankle-high collision.
  if (width > depth) {
    for (const side of [-1, 1])
      paths.push({
        p: [x, 0.211, z + side * (depth / 2 - 0.15)],
        s: [width, 0.018, 0.22],
        c: "#d1c5aa",
        shape: "block",
      });
  } else {
    for (const side of [-1, 1])
      paths.push({
        p: [x + side * (width / 2 - 0.15), 0.211, z],
        s: [0.22, 0.018, depth],
        c: "#d1c5aa",
        shape: "block",
      });
  }
}

// Quiet domestic garden lanes connect the existing Home room thresholds.
path(0, -12, 3.6, 66);
path(-19, -34, 38, 3.4);
path(-38, -34.5, 3.4, 9);
path(-5.5, -18, 11, 3.4);
path(-11, -20, 3.4, 4);
path(-21, 10, 42, 3.6);
path(-42, 24, 3.4, 7);
path(-21, 29, 42, 3.6);
path(21.5, -9, 43, 3.6);
path(43, -12.5, 3.6, 7);
path(-4, 16, 8, 3.6);
path(-8, 16, 3.4, 3.6);
path(-59, 12, 32, 3.6);
path(28, 29, 56, 3.6);
path(58, 43.5, 3.6, 35);
path(58, 61, 10, 3.4);
path(-19, -30, 38, 3.4);

// Limestone at the Study and kitchen entrances; timber on the Go approach.
for (let i = 0; i < 9; i++) {
  paths.push({
    p: [-8 + (i % 3) * 0.9 - 0.9, 0.216, 15.5 + Math.floor(i / 3) * 0.8],
    s: [0.84, 0.02, 0.74],
    c: i % 3 ? "#c5b79c" : "#b7aa91",
    shape: "stone",
  });
}
for (let i = 0; i < 16; i++) {
  paths.push({
    p: [-42, 0.22, 22.1 + i * 0.39],
    s: [3.2, 0.045, 0.34],
    c: i % 3 ? "#88745b" : "#9b8467",
  });
}
export const HOME_PATH_FOOTPRINTS = paths.map<GroundFootprint>(({ p, s }) => [
  p[0],
  p[2],
  s[0],
  s[2],
]);

// Low garden beds remain below the movement plane. Planting is kept behind
// existing walls/room footprints; the world retains all solid-object ownership.
const gardens: SceneryPart[] = [];
for (const [x, z, width, depth] of [
  [-20, 1, 18, 12],
  [18, 19, 21, 13],
  [-18, 24, 13, 5],
  [22, -22, 14, 12],
] as const) {
  gardens.push({
    p: [x, 0.16, z],
    s: [width, 0.045, depth],
    c: "#78845b",
    shape: "stone",
  });
  // Broad irregular patches replace high-frequency lawn checkerboards.
  for (let i = 0; i < 6; i++) {
    gardens.push({
      p: [
        x + Math.sin(i * 2.4) * width * 0.29,
        0.19,
        z + Math.cos(i * 2.4) * depth * 0.28,
      ],
      s: [width * 0.17, 0.02, depth * 0.14],
      c: i % 2 ? "#7f8b61" : "#738057",
      shape: "rock",
    });
  }
}

/** Home yard dressing only: no duplicate rooms, ground, travel or telescope. */
export function HomeWorldEnvironment() {
  return (
    <group name="home-environment">
      <WorldSceneryParts parts={gardens} />
      <WorldSceneryParts parts={paths} />
      <GroundGrass avoid={HOME_PATH_FOOTPRINTS} />
      <RegionalTerrain region="bay" />
      <HomeCommunity />
    </group>
  );
}
