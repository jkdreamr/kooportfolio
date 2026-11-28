import { DIVIDER_DEPTH, DIVIDER_DOOR, ROOM_DIVIDERS } from "../../../core/houseRooms";

const POST = 0.32,
  POST_H = 2.6;
import type { Kit } from "../kit";
import { shade } from "../furniture";

/** Wall and trim colours per room, picked from each room's own palette. */
const COLORS: Record<string, readonly [string, string]> = {
  office: ["#8a9d85", "#8d643a"],
  music: ["#4b5568", "#c9603f"],
  writing: ["#8c6f58", "#4e3327"],
  go: ["#b9b07a", "#4e3327"],
  gym: ["#567469", "#2a3d38"],
  boathouse: ["#6e8171", "#9f805b"],
  math: ["#7b8796", "#4a4034"],
};

/**
 * The dividing walls (core/houseRooms.ts ROOM_DIVIDERS) as kit pieces, so
 * they bake into the room's static batch: a low panelled wall with a cap and
 * a skirting board, and a timber arch over each opening.
 */
export function dividers(k: Kit, roomId: string) {
  const divider = ROOM_DIVIDERS[roomId];
  if (!divider) return;
  const [wall, trim] = COLORS[roomId] ?? ["#8a9d85", "#8d643a"];
  const { z } = divider;
  for (const [a, b] of divider.runs) {
    const x = (a + b) / 2,
      w = b - a;
    k.box([x, 0.72, z], [w, 1.44, DIVIDER_DEPTH], wall);
    k.slab([x, 1.47, z], [w + 0.06, 0.08, DIVIDER_DEPTH + 0.12], trim);
    k.slab([x, 0.12, z], [w + 0.02, 0.24, DIVIDER_DEPTH + 0.06], shade(trim, 0.8));
    // Panel stiles every 1.4 m on both faces.
    const n = Math.max(1, Math.floor(w / 1.4));
    for (let i = 0; i < n; i++) k.slab([a + ((i + 0.5) * w) / n, 0.78, z], [0.08, 1.06, DIVIDER_DEPTH + 0.04], shade(wall, 1.15));
  }
  // Each arch's posts stand on the wall ends either side of the opening
  // (the full DIVIDER_DOOR clear between them, matching the collision), and
  // the header rests on the posts' tops.
  const half = DIVIDER_DOOR / 2;
  for (const d of divider.doors)
    k.at(d, z, 0, () => {
      for (const side of [-1, 1]) {
        k.box([side * (half + POST / 2), POST_H / 2, 0], [POST, POST_H, 0.5], trim);
        k.slab([side * (half + POST / 2), 0.2, 0], [POST + 0.1, 0.4, 0.58], shade(trim, 1.25));
      }
      const span = DIVIDER_DOOR + POST * 2;
      k.box([0, POST_H + 0.15, 0], [span, 0.3, 0.5], trim);
      k.slab([0, POST_H + 0.34, 0], [span + 0.2, 0.08, 0.6], shade(trim, 1.3));
    });
}
