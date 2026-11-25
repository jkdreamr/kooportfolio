import type { BadmintonInput, BadmintonShot } from "./badminton";

/** Touch taps stay centered so there is always a way back to neutral aim; shots stay sticky once presets are visible. */
export function badmintonGesture(
  dx: number,
  dy: number,
  selected: Pick<BadmintonInput, "aim" | "shot"> = { aim: 0, shot: "drop" },
  pointerType = "mouse",
  presetsVisible = false,
): Pick<BadmintonInput, "aim" | "shot"> {
  const touch = pointerType === "touch" || pointerType === "pen";
  const crossedX = dx < -18 || dx > 18;
  const crossedY = dy < -14 || dy > 14;
  const baseline = touch
    ? {
        aim: (presetsVisible && (crossedX || crossedY) ? selected.aim : 0) as
          | -1
          | 0
          | 1,
        shot: (presetsVisible ? selected.shot : "drop") as BadmintonShot,
      }
    : selected;
  return {
    aim: dx < -18 ? -1 : dx > 18 ? 1 : baseline.aim,
    shot: dy < -14 ? "clear" : dy > 14 ? "smash" : baseline.shot,
  };
}
