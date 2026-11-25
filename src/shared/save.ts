export type Save = {
  version: 1;
  revision: number;
  position: [number, number];
  world: WorldId;
  color: string;
  hat: boolean;
  memories: string[];
};
import { WORLD_BOUNDS } from "./world-bounds";
import { onStanfordLand, STANFORD_SHORE_CLEARANCE } from "./stanford-ground";
import { isWorld, type WorldId } from "./worlds";

export const SAVE_KEY = "joshua-exe-save-v1";
export function writeGuestSave(
  storage: Pick<Storage, "getItem" | "setItem">,
  save: Save,
  expected: string | null,
): string | null {
  if (storage.getItem(SAVE_KEY) !== expected) return null;
  const raw = JSON.stringify(save);
  storage.setItem(SAVE_KEY, raw);
  return raw;
}
export const freshSave = (): Save => ({
  version: 1,
  revision: 0,
  position: [0, 5],
  world: "home",
  color: "#6f8670",
  hat: true,
  memories: [],
});
const finiteRange = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
export function parseSave(raw: string | null): Save {
  if (!raw) return freshSave();
  const s = JSON.parse(raw) as Save;
  // Version-one saves predate the three regions; all other progress survives.
  if (s.world === undefined) s.world = "home";
  if (
    s.version !== 1 ||
    !isWorld(s.world) ||
    !finiteRange(s.revision, 0, 1e15) ||
    !Array.isArray(s.position) ||
    s.position.length !== 2 ||
    !finiteRange(s.position[0], WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX) ||
    // Accept the old northern apron long enough to migrate its position below.
    !finiteRange(s.position[1], -76, WORLD_BOUNDS.maxZ) ||
    typeof s.color !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(s.color) ||
    typeof s.hat !== "boolean" ||
    !Array.isArray(s.memories) ||
    !s.memories.every((x) => typeof x === "string")
  )
    throw new Error("Unrecognized save");
  if (
    s.position[1] < WORLD_BOUNDS.minZ ||
    (s.world === "stanford" &&
      !onStanfordLand(...s.position, STANFORD_SHORE_CLEARANCE))
  )
    s.position = [0, 5];
  // Coins, levels, upgrades and best marks from retired saves are dropped.
  delete (s as Record<string, unknown>).coins;
  delete (s as Record<string, unknown>).xp;
  delete (s as Record<string, unknown>).upgrades;
  delete (s as Record<string, unknown>).collectedAt;
  delete (s as Record<string, unknown>).rewards;
  delete (s as Record<string, unknown>).bestRace;
  delete (s as Record<string, unknown>).bestBasket;
  return s;
}
