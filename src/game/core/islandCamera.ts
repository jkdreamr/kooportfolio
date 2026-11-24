import { Vector3 } from "three";
import { WORLD_ELLIPSE } from "../../shared/world-bounds";

const direction = new Vector3(28, 34, 38).normalize();
const right = new Vector3()
  .crossVectors(new Vector3(0, 1, 0), direction)
  .normalize();
const up = new Vector3().crossVectors(direction, right);

/** Project the island's ellipse, coastal rail, lake and tallest landmark.
 * Fit against the usable viewport, not a hard-coded desktop zoom. */
export function islandZoom(width: number, height: number) {
  const rx = WORLD_ELLIPSE.radiusX + 9;
  const rz = WORLD_ELLIPSE.radiusZ + 16;
  const projectedWidth = 2 * Math.hypot(rx * right.x, rz * right.z);
  const projectedHeight = 2 * Math.hypot(rx * up.x, rz * up.z) + 26 * up.y;
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
