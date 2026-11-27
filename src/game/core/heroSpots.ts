/**
 * First-landing pose per world and the obstacles flights must clear. Owned
 * by the world-art workstream; this is the shared contract.
 */
import type { WorldId } from "../../shared/worlds";
import { DEFAULT_EXPLORE_DISTANCE } from "./worldView";

export type HeroSpot = { position: [number, number]; heading: number; exploreDistance: number };

/** [centre x, centre z, half extent x, half extent z, top y] */
export type FlightObstacle = readonly [cx: number, cz: number, halfX: number, halfZ: number, topY: number];

const DEFAULT_SPOT: HeroSpot = { position: [0, 5], heading: 0, exploreDistance: DEFAULT_EXPLORE_DISTANCE };

export const HERO_SPOTS: Record<WorldId, HeroSpot> = {
  home: DEFAULT_SPOT,
  korea: DEFAULT_SPOT,
  stanford: DEFAULT_SPOT,
};

export const FLIGHT_OBSTACLES: Record<WorldId, readonly FlightObstacle[]> = {
  home: [],
  korea: [],
  stanford: [],
};
