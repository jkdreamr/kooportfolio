export { WORLD_IDS, WORLDS, isWorld, validJourney } from "../../shared/worlds";
export type { WorldId, TravelMode } from "../../shared/worlds";
import type { WorldId } from "../../shared/worlds";

const places: Record<WorldId, readonly string[]> = {
  stanford: [
    "kappa",
    "gym",
    "boathouse",
    "rowing",
    "basketball",
    "badminton",
    "campus",
    "secret",
    "skate",
    "math",
    "station",
  ],
  home: [
    "office",
    "music",
    "writing",
    "go",
    "stadium",
    "theater",
    "kitchen",
    "station",
  ],
  korea: ["cognition", "photo", "theater", "bridge", "namsan"],
};
export function belongsToWorld(place: string, world: WorldId) {
  return (
    ["hub", "bulletin", "stargazing", "airport"].includes(place) ||
    places[world].includes(place)
  );
}
