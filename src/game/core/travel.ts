export type TravelWorld = "stanford" | "home" | "korea";
export type TravelMode = "car" | "train" | "plane";
export type TravelStop = "station" | "airport";
export type TravelOption = { destination: TravelWorld; mode: TravelMode };

export const WORLD_NAMES: Record<TravelWorld, string> = {
  stanford: "Stanford",
  home: "Home",
  korea: "Korea",
};

export function travelOptions(
  world: TravelWorld,
  stop: TravelStop,
): TravelOption[] {
  if (stop === "airport")
    return (
      world === "korea" ? (["home", "stanford"] as const) : (["korea"] as const)
    ).map((destination) => ({ destination, mode: "plane" }));
  if (world === "korea") return [];
  const destination = world === "home" ? "stanford" : "home";
  return [
    { destination, mode: "car" },
    { destination, mode: "train" },
  ];
}

export function canTravel(
  from: TravelWorld,
  to: TravelWorld,
  mode: TravelMode,
) {
  return travelOptions(from, mode === "plane" ? "airport" : "station").some(
    (option) => option.destination === to && option.mode === mode,
  );
}
