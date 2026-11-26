import { HOME_ISLAND, HOME_RAIL_POINTS, islandForWorld } from "./homeIsland";
import type { WorldId } from "./worlds";
import { KOREA_COAST } from "./koreaDistrict";
import { STANFORD_MESA } from "../../shared/stanford-ground";
import { TERRAIN } from "./terrain";
import { KOREA_LANDMARKS } from "./koreaLandmarks";
import {
  STANFORD_RAIL_POINTS,
  STANFORD_RAIL_PROFILE,
} from "../../shared/stanford-transport";

import {
  ISLAND_CAMERA_OFFSET,
  ISLAND_SCREEN_RIGHT,
  ISLAND_SCREEN_UP,
} from "./islandView";
import { undersideFrame } from "./islandUnderside";

// Stay behind the entire island; the old close camera clipped the foreground
// when zoomed out because orthographic zoom does not change viewing distance.
export { ISLAND_CAMERA_OFFSET };
const [rightX, , rightZ] = ISLAND_SCREEN_RIGHT;
const right = { x: rightX, z: rightZ };
const [upX, upY, upZ] = ISLAND_SCREEN_UP;
const up = { x: upX, y: upY, z: upZ };
const koreaView: [number, number] = [7, 16];
const stanfordView: [number, number] = [
  STANFORD_RAIL_PROFILE.centerX,
  STANFORD_RAIL_PROFILE.centerZ,
];
const homeView: [number, number] = [HOME_ISLAND.centerX, HOME_ISLAND.centerZ];

type Tall = readonly [x: number, z: number, height: number];
/** Projected size of a coastline, its relief and its tallest landmarks about
 * the view centre, in screen units at zoom 1 with a margin all round. */
function extent(
  view: readonly [number, number],
  coast: readonly (readonly [number, number])[],
  tall: readonly Tall[],
  margin: readonly [number, number],
) {
  const across = (x: number, z: number) =>
    Math.abs((x - view[0]) * right.x + (z - view[1]) * right.z);
  const upward = (x: number, z: number, y = 0) =>
    (x - view[0]) * up.x + (z - view[1]) * up.z + y * up.y;
  return {
    width:
      2 *
        Math.max(
          ...coast.map(([x, z]) => across(x, z)),
          ...tall.map(([x, z]) => across(x, z)),
        ) +
      margin[0],
    height:
      2 *
        Math.max(
          ...coast.map(([x, z]) => Math.abs(upward(x, z))),
          ...tall.map(([x, z, height]) => Math.abs(upward(x, z, height))),
        ) +
      margin[1],
  };
}
/** Hills, peaks and the trees on them, as points the frame must hold. */
const relief = (world: WorldId): Tall[] =>
  TERRAIN[world]
    .filter(({ height }) => height > 0)
    .map(({ focus, height, trees }) => [
      focus[0],
      focus[1],
      height + (trees.length ? 6 : 1),
    ]);
const stanfordExtent = extent(
  stanfordView,
  [...STANFORD_RAIL_POINTS, ...STANFORD_MESA],
  // Hoover Tower's lantern.
  [[4.82, 54.6125, 30], ...relief("stanford")],
  [10, 10],
);
const {
  origin: [towerX, towerZ],
  height: towerHeight,
} = KOREA_LANDMARKS.namsan;
const koreaExtent = extent(
  koreaView,
  KOREA_COAST,
  [[towerX, towerZ, towerHeight], ...relief("korea")],
  [7, 6],
);
// Rooftops and canopies stand up to 13 above the lawn anywhere on the island.
const homeExtent = extent(
  homeView,
  HOME_RAIL_POINTS,
  [
    ...HOME_RAIL_POINTS.filter((_, i) => i % 8 === 0).map(
      ([x, z]): Tall => [x, z, 13],
    ),
    ...relief("home"),
  ],
  [9, 5],
);
const extents = { home: homeExtent, korea: koreaExtent, stanford: stanfordExtent };

/** Above and below the view centre, in screen units at zoom 1. The rock that
 * hangs under each island may need more room below than its rooftops above. */
function verticalExtent(world?: WorldId) {
  if (world !== "home" && world !== "korea" && world !== "stanford") return null;
  const above = extents[world].height / 2;
  const below = Math.max(above, undersideFrame(world).bottom);
  return { above, below };
}

export const islandCenter = (world: WorldId): readonly [number, number] =>
  world === "stanford" ? stanfordView : world === "korea" ? koreaView : homeView;

/** Project the island's ellipse, coastal rail, lake and tallest landmark.
 * Fit against the usable viewport, not a hard-coded desktop zoom. */
export function islandZoom(width: number, height: number, world?: WorldId) {
  const island = islandForWorld(world);
  const rx = island.radiusX + 9;
  const rz = island.radiusZ + 16;
  const known =
    world === "home" || world === "korea" || world === "stanford"
      ? extents[world]
      : null;
  const projectedWidth = known
    ? known.width
    : 2 * Math.hypot(rx * right.x, rz * right.z);
  const vertical = verticalExtent(world);
  const projectedHeight = vertical
    ? vertical.above + vertical.below
    : 2 * Math.hypot(rx * up.x, rz * up.z) + 26 * up.y;
  const compact = height < 500;
  const verticalSpace = compact ? 125 : width < 700 ? 220 : 170;
  return Math.max(
    0.6,
    Math.min(
      (width - (width < 700 ? 24 : 70)) / projectedWidth,
      (height - verticalSpace) / projectedHeight,
    ),
  );
}

/** World-space pan of the overview target so the frame holds the hanging rock:
 * a pure screen-down move, so depth and clipping stay unchanged. */
export function islandViewShift(world?: WorldId): readonly [number, number, number] {
  const vertical = verticalExtent(world);
  const s = vertical ? (vertical.below - vertical.above) / 2 : 0;
  return [-up.x * s, -up.y * s, -up.z * s];
}

/** Overview stays fixed; closer views smoothly resume ordinary player follow. */
export function islandFollow(zoom: number) {
  const t = Math.max(0, Math.min(1, (zoom - 1.4) / 2));
  return t * t * (3 - 2 * t);
}
