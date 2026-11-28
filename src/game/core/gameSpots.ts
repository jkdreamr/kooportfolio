/**
 * Where each room's game lives on the floor, so the room can mark it (a
 * pulsing ring with a floating "Play" label) and the header can offer to
 * walk there. Plain data: the 3D marker (scenes/GameSpot.tsx) and the HUD
 * both read it.
 *
 * `walk: true` means the game only starts once you stand on the spot (the
 * boathouse race picker, the gym bench, the two labs); otherwise the room's
 * launcher starts it from anywhere and the label is a shortcut to it.
 */
import { TOWN_HALL_TABLE } from "./houseRooms";
import type { Scene } from "./store";

export type GameSpot = {
  x: number;
  z: number;
  /** Height of the floor the ring lies on. */
  y: number;
  /** Ring radius, metres. */
  radius: number;
  /** The game's name on the floating label. */
  title: string;
  /** Distance from (x, z) at which the game is in reach. */
  reach: number;
  walk: boolean;
};

export const GAME_SPOTS: Partial<Record<Scene, GameSpot>> = {
  boathouse: { x: 0, z: -2, y: 0.15, radius: 1.2, title: "Regatta", reach: 2.5, walk: true },
  gym: { x: 0, z: -2, y: 0.15, radius: 1.2, title: "Bench press", reach: 2.5, walk: true },
  music: { x: 0, z: -2, y: 0.28, radius: 1.3, title: "Beat Lab", reach: 8, walk: true },
  math: { x: 0, z: -2, y: 0.33, radius: 1.3, title: "Math Lab", reach: 8, walk: true },
  // Launcher games: the ring marks where the game happens; the label starts it.
  basketball: { x: 0, z: -0.5, y: 0.2, radius: 1.1, title: "Basketball", reach: 2, walk: false },
  badminton: { x: 0, z: 3, y: 0.2, radius: 1.1, title: "Badminton", reach: 2, walk: false },
  skate: { x: 0, z: 18, y: 0.1, radius: 1.1, title: "Skate", reach: 2, walk: false },
  stadium: { x: 0, z: 19, y: 0.06, radius: 1.3, title: "Field goal", reach: 2.5, walk: false },
  townhall: {
    x: TOWN_HALL_TABLE.x,
    z: TOWN_HALL_TABLE.z + TOWN_HALL_TABLE.depth / 2 + 1.6,
    y: 0.105,
    // Inside the hall's own static launcher ring (r 1.36).
    radius: 1.05,
    title: "Banner Rush",
    reach: 2,
    walk: false,
  },
};

export const gameSpotFor = (scene: Scene): GameSpot | undefined => GAME_SPOTS[scene];

/** True while the player stands within reach of the room's game spot. */
export const atGameSpot = (spot: GameSpot, x: number, z: number) => Math.hypot(x - spot.x, z - spot.z) < spot.reach;

const SEEN_KEY = "koo-spot-seen";
/** Rooms whose game spot the visitor has already reached (per browser). */
export function spotSeen(scene: Scene): boolean {
  try {
    return (localStorage.getItem(SEEN_KEY) ?? "").split(",").includes(scene);
  } catch {
    return false;
  }
}
export function markSpotSeen(scene: Scene) {
  try {
    const seen = (localStorage.getItem(SEEN_KEY) ?? "").split(",").filter(Boolean);
    if (!seen.includes(scene)) localStorage.setItem(SEEN_KEY, [...seen, scene].join(","));
  } catch {
    /* storage blocked: the beacon simply shows again next visit */
  }
}

/**
 * The floating label's element (ui/GameSpotLabel.tsx, a HUD node) for the
 * 3D marker (scenes/GameSpot.tsx) to move each frame. A DOM node can't be
 * portalled out of the R3F tree, so the two meet here.
 */
export const spotLabel: { el: HTMLElement | null } = { el: null };
