import type { BadmintonInput } from "./badminton";

/** A tap plays a drop; vertical swipes change power, horizontal swipes aim. */
export function badmintonGesture(
  dx: number,
  dy: number,
): Pick<BadmintonInput, "aim" | "shot"> {
  return {
    aim: dx < -18 ? -1 : dx > 18 ? 1 : 0,
    shot: dy < -18 ? "clear" : dy > 18 ? "smash" : "drop",
  };
}
