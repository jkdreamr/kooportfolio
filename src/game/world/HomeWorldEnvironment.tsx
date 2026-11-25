import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
import { HomeCommunity } from "./CommunityScenery";
import { GroundGrass } from "./Scenery";
import type { GroundFootprint } from "../core/scenery";
import { HOME_GARDEN_FOOTPRINTS } from "../core/homeGardens";
import { HomeGardens } from "./HomeGardens";
import { HOME_DESTINATION_CENTERS } from "../core/homeLayout";
import { HomeWindowLighting } from "./HomeBuildingArt";

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

// The short entrance walks feed two shared streets, not an island-wide grid.
for (const id of ["theater", "music", "writing", "office"] as const) {
  const [x, z] = HOME_DESTINATION_CENTERS[id];
  const entry = z + (id === "theater" ? 5.2 : id === "writing" ? 3.5 : 4.5);
  path(x, (entry - 18) / 2, 2.6, -18 - entry);
}
for (const id of ["go", "kitchen", "stadium"] as const) {
  const [x, z] = HOME_DESTINATION_CENTERS[id];
  const entry = z + (id === "go" ? 4.2 : id === "kitchen" ? 4.35 : 4.5);
  path(x, (entry - 5) / 2, 2.6, -5 - entry);
}
path(-35.5, -18, 7, 3.2); // Station feeds the same village street.
path(-17, -25, 2.2, 14); // Rear lane to the telescope, between the buildings.
path(-8, -32, 20, 2.4);
path(22.5, -12, 9, 2.6); // Short airport approach, not an island-wide road.

// Limestone at the Study and kitchen entrances; timber on the Go approach.
for (let i = 0; i < 9; i++) {
  paths.push({
    p: [-11 + (i % 3) * 0.9 - 0.9, 0.216, -6.5 + Math.floor(i / 3) * 0.65],
    s: [0.84, 0.02, 0.74],
    c: i % 3 ? "#c5b79c" : "#b7aa91",
    shape: "stone",
  });
}
for (let i = 0; i < 16; i++) {
  paths.push({
    p: [-24, 0.22, -6.5 + i * 0.1],
    s: [2.2, 0.045, 0.075],
    c: i % 3 ? "#88745b" : "#9b8467",
  });
}
export const HOME_PATH_FOOTPRINTS: GroundFootprint[] = [
  ...HOME_GARDEN_FOOTPRINTS,
  ...paths.map<GroundFootprint>(({ p, s }) => [p[0], p[2], s[0], s[2]]),
];

/** Home yard dressing only: no duplicate rooms, ground, travel or telescope. */
export function HomeWorldEnvironment() {
  return (
    <group name="home-environment">
      <HomeWindowLighting />
      <HomeGardens />
      <WorldSceneryParts parts={paths} />
      <GroundGrass avoid={HOME_PATH_FOOTPRINTS} world="home" />
      <HomeCommunity />
    </group>
  );
}
