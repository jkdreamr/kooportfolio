import { FIELD_GOAL } from "./fieldGoal";

type V3 = [number, number, number];

export function stadiumCameraFrame(
  player: { x: number; z: number },
  playing: boolean,
  ball: V3,
  portrait: boolean,
): { position: V3; target: V3 } {
  if (!playing) {
    // On the outer west concourse, view from outside the suite tower instead
    // of putting its opaque wall between the camera and the walking avatar.
    const edge = Math.max(0, Math.min(1, (-player.x - 14) / 3));
    const offset = 5 - 10 * edge * edge * (3 - 2 * edge);
    return {
      position: [player.x + offset, 10, player.z + 6],
      target: [player.x, 1, player.z - 3],
    };
  }
  return {
    position: [
      portrait ? 0 : 6,
      portrait ? 17 : 14,
      FIELD_GOAL.startZ + (portrait ? 18 : 14),
    ],
    // Share the frame between the posts and the football, including wide kicks.
    target: [
      ball[0] * 0.45,
      (portrait ? -2 : -4) + ball[1] * 0.4,
      (FIELD_GOAL.startZ + FIELD_GOAL.goalZ) / 2,
    ],
  };
}
