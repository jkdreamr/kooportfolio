import type { SceneryPart } from "../WorldSceneryParts";
import type { GroundFootprint } from "../../core/scenery";
import { HOME_GARDEN_FOOTPRINTS } from "../../core/homeGardens";
import { HOME_DESTINATION_CENTERS } from "../../core/homeLayout";

// Home's streets and entrance walks as data (pure: placement and tests read
// it without the scene graph). The lanes are drawn by env/Roads.tsx from
// HOME_ROAD_RECTS; HomeWorldEnvironment draws the entrance dressing
// (HOME_PATH_PARTS).
export const HOME_PATH_PARTS: SceneryPart[] = [];
const paths = HOME_PATH_PARTS;
/** [centre x, centre z, width, depth] of every lane and entrance walk. */
export const HOME_ROAD_RECTS: (readonly [number, number, number, number])[] = [];
function path(x: number, z: number, width: number, depth: number) {
  HOME_ROAD_RECTS.push([x, z, Math.abs(width), Math.abs(depth)]);
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
  ...HOME_ROAD_RECTS,
  ...paths.map<GroundFootprint>(({ p, s }) => [p[0], p[2], s[0], s[2]]),
];

