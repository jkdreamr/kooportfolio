export type Save = {
  version: 1;
  revision: number;
  coins: number;
  xp: number;
  position: [number, number];
  world: WorldId;
  upgrades: Record<BuildingId, number>;
  collectedAt: number;
  color: string;
  hat: boolean;
  bestRace: number | null;
  bestBasket: number;
  memories: string[];
  rewards: string[];
};
import { WORLD_BOUNDS } from "./world-bounds";
import { onStanfordLand, STANFORD_SHORE_CLEARANCE } from "./stanford-ground";
import { BUILDINGS, gardenStored, type BuildingId } from "./buildings";
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
export const freshSave = (now = Date.now()): Save => ({
  version: 1,
  revision: 0,
  coins: 0,
  xp: 0,
  position: [0, 5],
  world: "home",
  upgrades: { boathouse: 1, garden: 1, kitchen: 1 },
  collectedAt: now,
  color: "#6f8670",
  hat: true,
  bestRace: null,
  bestBasket: 0,
  memories: [],
  rewards: [],
});
const finiteRange = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
export function parseSave(raw: string | null, now = Date.now()): Save {
  if (!raw) return freshSave(now);
  const s = JSON.parse(raw) as Save;
  // Version-one saves predate the three regions; all other progress survives.
  if (s.world === undefined) s.world = "home";
  // Saves from before the kitchen upgrade and garden collector start fresh there.
  if (s.upgrades && s.upgrades.kitchen === undefined) s.upgrades.kitchen = 1;
  if (s.collectedAt === undefined) s.collectedAt = now;
  if (
    s.version !== 1 ||
    !isWorld(s.world) ||
    !finiteRange(s.coins, 0, 1e9) ||
    !finiteRange(s.xp, 0, 1e9) ||
    !finiteRange(s.revision, 0, 1e15) ||
    !Array.isArray(s.position) ||
    s.position.length !== 2 ||
    !finiteRange(s.position[0], WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX) ||
    // Accept the old northern apron long enough to migrate its position below.
    !finiteRange(s.position[1], -76, WORLD_BOUNDS.maxZ) ||
    ![1, 2, 3].includes(s.upgrades?.boathouse) ||
    ![1, 2, 3].includes(s.upgrades?.garden) ||
    ![1, 2, 3].includes(s.upgrades?.kitchen) ||
    !finiteRange(s.collectedAt, 0, 1e15) ||
    typeof s.color !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(s.color) ||
    typeof s.hat !== "boolean" ||
    !Array.isArray(s.rewards) ||
    !s.rewards.every((x) => typeof x === "string") ||
    !Array.isArray(s.memories) ||
    !s.memories.every((x) => typeof x === "string") ||
    !(s.bestRace === null || finiteRange(s.bestRace, 1, 1e5)) ||
    !finiteRange(s.bestBasket, 0, 1e6)
  )
    throw new Error("Unrecognized save");
  if (
    s.position[1] < WORLD_BOUNDS.minZ ||
    (s.world === "stanford" &&
      !onStanfordLand(...s.position, STANFORD_SHORE_CLEARANCE))
  )
    s.position = [0, 5];
  if (s.collectedAt > now) s.collectedAt = now;
  return s;
}
export function reward(s: Save, id: string, coins: number, xp: number): Save {
  if (
    s.rewards.includes(id) ||
    !Number.isSafeInteger(coins) ||
    coins < 0 ||
    !Number.isSafeInteger(xp) ||
    xp < 0
  )
    return s;
  return {
    ...s,
    coins: s.coins + coins,
    xp: s.xp + xp,
    rewards: [...s.rewards.slice(-255), id],
    revision: s.revision + 1,
  };
}
export function collectGarden(s: Save, now = Date.now()): Save {
  const stored = gardenStored(s.upgrades.garden, s.collectedAt, now);
  if (stored < 1) return s;
  return {
    ...s,
    coins: s.coins + stored,
    collectedAt: now,
    revision: s.revision + 1,
  };
}
export function upgrade(s: Save, key: BuildingId, now = Date.now()): Save {
  const level = s.upgrades[key],
    cost = BUILDINGS[key].cost[level - 1];
  if (cost === undefined || s.coins < cost) return s;
  // Like a mine in Clash of Clans, upgrading the garden banks what it held.
  const banked = key === "garden" ? collectGarden(s, now) : s;
  return {
    ...banked,
    coins: banked.coins - cost,
    upgrades: { ...banked.upgrades, [key]: level + 1 },
    revision: s.revision + 1,
  };
}
