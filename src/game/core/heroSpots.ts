/**
 * First-landing pose per world and the obstacles flights must clear. Owned
 * by the world-art workstream; this is the shared contract.
 */
import type { WorldId } from "../../shared/worlds";
import { DEFAULT_EXPLORE_DISTANCE } from "./worldView";

export type HeroSpot = { position: [number, number]; heading: number; exploreDistance: number };

/** [centre x, centre z, half extent x, half extent z, top y] */
export type FlightObstacle = readonly [cx: number, cz: number, halfX: number, halfZ: number, topY: number];

/** Facing three-quarters away from the explore camera (which looks from
 * +x/+z), so the first frame shows the player's back and the street ahead. */
const AWAY = -2.0;

export const HERO_SPOTS: Record<WorldId, HeroSpot> = {
  home: { position: [-2.5, 5], heading: AWAY, exploreDistance: DEFAULT_EXPLORE_DISTANCE },
  korea: { position: [-21.3, 48.4], heading: AWAY, exploreDistance: DEFAULT_EXPLORE_DISTANCE },
  stanford: { position: [-18, 42], heading: AWAY, exploreDistance: DEFAULT_EXPLORE_DISTANCE },
};

/** The national flag every island flies (Landscape), its pole 4.5 m tall. */
const FLAG: FlightObstacle = [2.4, -4.3, 0.35, 0.35, 4.9];

/** Tall props that are not doors: pergolas, flagpoles, the bulletin boards,
 * columns, statues and towers. Doors are added by the flight itself. */
export const FLIGHT_OBSTACLES: Record<WorldId, readonly FlightObstacle[]> = {
  home: [
    // The reading pergola (posts at ±5.3, ±4.3; beams to 4.83).
    [10, 2, 5.5, 4.5, 4.85],
    FLAG,
    // Bulletin board (4.3 wide, roof at 3.8).
    [0, -6.6, 2.3, 0.6, 4.0],
    // The garden column and its basin.
    [-26, 0, 0.9, 0.9, 2.2],
  ],
  korea: [
    FLAG,
    [0, -6.6, 2.3, 0.6, 4.0],
    // N Seoul Tower, Gyeongbokgung's hall and the King Sejong statue.
    [-35, -30.6, 2.1, 2.1, 26.6],
    [-22, -19.6, 6.2, 2.45, 7.6],
    [-18.8, -2.4, 2.05, 1.7, 5.6],
  ],
  stanford: [
    FLAG,
    // Bulletin board by the frontage.
    [6, 3, 2.3, 0.6, 4.0],
  ],
};
