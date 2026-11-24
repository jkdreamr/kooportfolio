import { moveWorld } from "./world";
import type { WorldId } from "./worlds";

/** Follow each A* corner exactly; rounding one early can cut into a collider. */
export function moveJourneyApproach(
  x: number,
  z: number,
  route: [number, number][],
  delta: number,
  world: WorldId,
): [number, number] {
  const target = route[0];
  if (!target) return [x, z];
  const dx = target[0] - x,
    dz = target[1] - z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.0001) {
    route.shift();
    return [...target];
  }
  const step = Math.min(distance, Math.max(0, Math.min(delta, 0.1)) * 10);
  return moveWorld(x, z, (dx / distance) * step, (dz / distance) * step, world);
}
