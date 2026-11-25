import { canWalk, moveWorld } from "./world";
import type { WorldId } from "./worlds";

/** Follow each A* corner exactly; rounding one early can cut into a collider. */
export function moveJourneyApproach(
  x: number,
  z: number,
  route: [number, number][],
  delta: number,
  world: WorldId,
): [number, number] {
  // Spend the frame's whole movement budget, continuing into the next
  // waypoint in the same frame instead of pausing one frame per node.
  let remaining = Math.max(0, Math.min(delta, 0.1)) * 10;
  while (remaining > 0) {
    const target = route[0];
    if (!target) break;
    // A diagonal first leg can approach an axis asymptotically while the
    // other axis is blocked. Finish sub-pixel alignment instead of rounding
    // to zero.
    if (Math.abs(target[0] - x) < 1e-7 && canWalk(target[0], z, world))
      x = target[0];
    if (Math.abs(target[1] - z) < 1e-7 && canWalk(x, target[1], world))
      z = target[1];
    const dx = target[0] - x,
      dz = target[1] - z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.0001) {
      route.shift();
      [x, z] = target;
      continue;
    }
    const step = Math.min(distance, remaining);
    const [nx, nz] = moveWorld(
      x,
      z,
      (dx / distance) * step,
      (dz / distance) * step,
      world,
    );
    const moved = Math.hypot(nx - x, nz - z);
    x = nx;
    z = nz;
    remaining -= moved;
    if (moved < 0.0001) break;
  }
  return [x, z];
}
