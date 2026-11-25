import { Vector3 } from "three";
import { islandForWorld } from "./homeIsland";
import type { WorldId } from "./worlds";
import { KOREA_SHORE } from "./koreaDistrict";
import { KOREA_LANDMARKS } from "./koreaLandmarks";
import {
  STANFORD_RAIL_POINTS,
  STANFORD_RAIL_PROFILE,
} from "../../shared/stanford-transport";

// Stay behind the entire island; the old close camera clipped the foreground
// when zoomed out because orthographic zoom does not change viewing distance.
export const ISLAND_CAMERA_OFFSET = [70, 85, 95] as const;
const direction = new Vector3(...ISLAND_CAMERA_OFFSET).normalize();
const right = new Vector3()
  .crossVectors(new Vector3(0, 1, 0), direction)
  .normalize();
const up = new Vector3().crossVectors(direction, right);
const koreaView: [number, number] = [7, 16];
const stanfordView: [number, number] = [
  STANFORD_RAIL_PROFILE.centerX,
  STANFORD_RAIL_PROFILE.centerZ,
];
const stanfordExtent = {
  width:
    2 *
      Math.max(
        ...STANFORD_RAIL_POINTS.map(([x, z]) =>
          Math.abs(
            (x - stanfordView[0]) * right.x + (z - stanfordView[1]) * right.z,
          ),
        ),
      ) +
    10,
  height:
    2 *
      Math.max(
        ...STANFORD_RAIL_POINTS.map(([x, z]) =>
          Math.abs((x - stanfordView[0]) * up.x + (z - stanfordView[1]) * up.z),
        ),
        Math.abs(
          (4.82 - stanfordView[0]) * up.x +
            (54.6125 - stanfordView[1]) * up.z +
            30 * up.y,
        ),
      ) +
    10,
};
const {
  origin: [towerX, towerZ],
  height: towerHeight,
} = KOREA_LANDMARKS.namsan;
const koreaExtent = {
  width:
    2 *
      Math.max(
        ...KOREA_SHORE.map(([x, z]) =>
          Math.abs((x - koreaView[0]) * right.x + (z - koreaView[1]) * right.z),
        ),
      ) +
    10,
  height:
    2 *
      Math.max(
        ...KOREA_SHORE.map(([x, z]) =>
          Math.abs((x - koreaView[0]) * up.x + (z - koreaView[1]) * up.z),
        ),
        Math.abs(
          (towerX - koreaView[0]) * up.x +
            (towerZ - koreaView[1]) * up.z +
            towerHeight * up.y,
        ),
      ) +
    8,
};
export const islandCenter = (world: WorldId): readonly [number, number] => {
  const island = islandForWorld(world);
  return world === "stanford"
    ? stanfordView
    : world === "korea"
      ? koreaView
      : [island.centerX, island.centerZ];
};

/** Project the island's ellipse, coastal rail, lake and tallest landmark.
 * Fit against the usable viewport, not a hard-coded desktop zoom. */
export function islandZoom(width: number, height: number, world?: WorldId) {
  const island = islandForWorld(world);
  const rx = island.radiusX + (world === "home" ? 6 : 9);
  const rz = island.radiusZ + (world === "home" ? 8 : 16);
  const projectedWidth =
    world === "stanford"
      ? stanfordExtent.width
      : world === "korea"
        ? koreaExtent.width
        : 2 * Math.hypot(rx * right.x, rz * right.z);
  const projectedHeight =
    world === "stanford"
      ? stanfordExtent.height
      : world === "korea"
        ? koreaExtent.height
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

/** Overview stays fixed; closer views smoothly resume ordinary player follow. */
export function islandFollow(zoom: number) {
  const t = Math.max(0, Math.min(1, (zoom - 1.4) / 2));
  return t * t * (3 - 2 * t);
}
