export type BuildingId = "boathouse" | "garden" | "kitchen";
export const MAX_LEVEL = 3;
type Building = {
  name: string;
  // Coins to go from level n to n + 1.
  cost: readonly number[];
  perk: (level: number) => string;
};
export const GARDEN_RATE = [1, 2, 4] as const; // coins per minute
export const GARDEN_CAPACITY = [20, 60, 150] as const;
export const KITCHEN_BURNERS = [1, 2, 3] as const;
export const RACE_BONUS = [0, 0.25, 0.5] as const;
const tier = (table: readonly number[], level: number) =>
  table[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];
export const gardenRate = (level: number) => tier(GARDEN_RATE, level);
export const gardenCapacity = (level: number) => tier(GARDEN_CAPACITY, level);
export const kitchenBurners = (level: number) => tier(KITCHEN_BURNERS, level);
export const raceBonus = (level: number) => tier(RACE_BONUS, level);
export function gardenStored(level: number, collectedAt: number, now: number) {
  const minutes = Math.max(0, now - collectedAt) / 60000;
  return Math.min(
    gardenCapacity(level),
    Math.floor(minutes * gardenRate(level)),
  );
}
export const raceCoins = (base: number, boathouse: number) =>
  Math.round(base * (1 + raceBonus(boathouse)));
export const BUILDINGS: Record<BuildingId, Building> = {
  garden: {
    name: "Little Garden",
    cost: [40, 100],
    perk: (level) =>
      `${gardenRate(level)}/min · holds ${gardenCapacity(level)}`,
  },
  kitchen: {
    name: "Kitchen",
    cost: [80, 180],
    perk: (level) =>
      `${kitchenBurners(level)} burner${kitchenBurners(level) > 1 ? "s" : ""}`,
  },
  boathouse: {
    name: "Boathouse",
    cost: [60, 140],
    perk: (level) =>
      raceBonus(level)
        ? `Race prizes +${Math.round(raceBonus(level) * 100)}%`
        : "Standard race prizes",
  },
};
export const BUILDING_ORDER: readonly BuildingId[] = [
  "garden",
  "kitchen",
  "boathouse",
];
