import type { BadmintonInput } from "./badminton";

/** Taps keep the selected shot; swipes override only the axis they change. */
export function badmintonGesture(
  dx: number,
  dy: number,
  selected: Pick<BadmintonInput, "aim" | "shot"> = { aim: 0, shot: "drop" },
): Pick<BadmintonInput, "aim" | "shot"> {
  return {
    aim: dx < -18 ? -1 : dx > 18 ? 1 : selected.aim,
    shot: dy < -18 ? "clear" : dy > 18 ? "smash" : selected.shot,
  };
}
