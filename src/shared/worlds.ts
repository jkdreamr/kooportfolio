export const WORLD_IDS = ["home", "stanford", "korea"] as const;
export type WorldId = (typeof WORLD_IDS)[number];
export type TravelMode = "train" | "plane";
export const WORLDS = {
  home: { name: "Joshua’s home", timeZone: "America/Los_Angeles" },
  stanford: { name: "Stanford", timeZone: "America/Los_Angeles" },
  korea: { name: "Korea", timeZone: "Asia/Seoul" },
} as const;
export function isWorld(value: unknown): value is WorldId {
  return WORLD_IDS.some((world) => world === value);
}
export function validJourney(from: WorldId, to: WorldId, mode: TravelMode) {
  return (
    from !== to &&
    (from === "korea" || to === "korea" ? mode === "plane" : mode === "train")
  );
}
