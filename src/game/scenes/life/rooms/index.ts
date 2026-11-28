import { declareRoom } from "../../../core/discoveries";
import { Kit } from "../kit";
import type { RoomBuilder } from "./common";
import { badminton } from "./badminton";
import { boathouse } from "./boathouse";
import { cognition } from "./cognition";
import { go } from "./go";
import { gym } from "./gym";
import { kappa } from "./kappa";
import { kitchen } from "./kitchen";
import { math } from "./math";
import { music } from "./music";
import { EXTRAS } from "./extras";
import { office } from "./office";
import { secret } from "./secret";
import { theater, theaterKorea } from "./theater";
import { writing } from "./writing";

/**
 * Every room's life, by discovery room id (the scene, or "theater-korea").
 * Builders are pure: the same room and tier always give the same kit.
 */
export const ROOM_LIFE: Record<string, RoomBuilder> = {
  office,
  music,
  writing,
  go,
  kitchen,
  theater,
  "theater-korea": theaterKorea,
  cognition,
  kappa,
  gym,
  boathouse,
  badminton,
  math,
  secret,
};

const cache = new Map<string, Kit>();
/** The kit for a room (null for rooms without one). Memoised. */
export function buildRoomLife(roomId: string, options: { thin?: boolean } = {}): Kit | null {
  const build = ROOM_LIFE[roomId];
  if (!build) return null;
  const extras = EXTRAS[roomId];
  const key = `${roomId}:${options.thin ? "thin" : "full"}`;
  let kit = cache.get(key);
  if (!kit) {
    kit = new Kit(options);
    build(kit);
    extras?.(kit);
    cache.set(key, kit);
  }
  return kit;
}

/** Tells the discoveries module what every room offers, so the stamp card
 * knows the totals before any room has been entered. */
export function declareAllRooms() {
  for (const roomId of Object.keys(ROOM_LIFE)) {
    const kit = buildRoomLife(roomId);
    if (kit) declareRoom(roomId, kit.props.map((prop) => prop.id));
  }
}
declareAllRooms();
