import { roomFor } from "../../../core/room";
import type { Kit } from "../kit";

/** Inner faces of the two visible walls, and the walkable rectangle. */
export function wallsOf(scene: string) {
  const room = roomFor(scene);
  return {
    ...room,
    /** z of the back wall's inner face. */
    backZ: -room.depth / 2 + 0.4,
    /** x of the left wall's inner face. */
    leftX: -room.width / 2 + 0.4,
  };
}
export type Walls = ReturnType<typeof wallsOf>;

/** Draw on the back wall at (x, y): local x runs right, +z into the room. */
export const onBack = (k: Kit, w: Walls, x: number, y: number, draw: () => void) => k.at(x, w.backZ, 0, draw, y);
/** Draw on the left wall at (z, y): local x runs toward the back wall. */
export const onLeft = (k: Kit, w: Walls, z: number, y: number, draw: () => void) => k.at(w.leftX, z, Math.PI / 2, draw, y);
/** Furniture standing against the left wall, facing into the room. */
export const byLeft = (k: Kit, w: Walls, z: number, depth: number, draw: () => void) => k.at(w.leftX + depth / 2 + 0.05, z, Math.PI / 2, draw);
/** Furniture standing against the back wall, facing the door. */
export const byBack = (k: Kit, w: Walls, x: number, depth: number, draw: () => void) => k.at(x, w.backZ + depth / 2 + 0.25, 0, draw);

export type RoomBuilder = (k: Kit) => void;
