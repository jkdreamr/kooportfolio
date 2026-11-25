import { Vector3 } from "three";
import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import { KOREA_SHORE } from "./koreaDistrict";
import { KOREA_LANDMARKS } from "./koreaLandmarks";
import type { WorldId } from "./worlds";

// Stay behind the entire island; the old close camera clipped the foreground
// when zoomed out because orthographic zoom does not change viewing distance.
export const ISLAND_CAMERA_OFFSET = [70, 85, 95] as const;
const direction = new Vector3(...ISLAND_CAMERA_OFFSET).normalize();
const right = new Vector3()
  .crossVectors(new Vector3(0, 1, 0), direction)
  .normalize();
const up = new Vector3().crossVectors(direction, right);
const koreaView: [number, number] = [7, 16];
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
export const islandCenter = (world: WorldId): readonly [number, number] =>
  world === "korea" ? koreaView : [0, WORLD_ELLIPSE.centerZ];

/** Project the island's ellipse, coastal rail, lake and tallest landmark.
 * Fit against the usable viewport, not a hard-coded desktop zoom. */
export function islandZoom(width: number, height: number, world?: WorldId) {
  const rx = WORLD_ELLIPSE.radiusX + 9;
  const rz = WORLD_ELLIPSE.radiusZ + 16;
  const projectedWidth =
    world === "korea"
      ? koreaExtent.width
      : 2 * Math.hypot(rx * right.x, rz * right.z);
  const projectedHeight =
    world === "korea"
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
