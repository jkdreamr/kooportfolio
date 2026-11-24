import type { BadmintonInput } from "./badminton";

/** Mouse taps keep keyboard selections; touch gestures start from a centered drop. */
export function badmintonGesture(
  dx: number,
  dy: number,
  selected: Pick<BadmintonInput, "aim" | "shot"> = { aim: 0, shot: "drop" },
  pointerType = "mouse",
): Pick<BadmintonInput, "aim" | "shot"> {
  const baseline = pointerType === "touch" || pointerType === "pen"
    ? { aim: 0 as const, shot: "drop" as const }
    : selected;
  return {
    aim: dx < -18 ? -1 : dx > 18 ? 1 : baseline.aim,
    shot: dy < -18 ? "clear" : dy > 18 ? "smash" : baseline.shot,
  };
}
