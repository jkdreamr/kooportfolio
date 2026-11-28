import { FIELD_GOAL } from "./fieldGoal";

type V3 = [number, number, number];

// Short landscape screens use a right-hand HUD rail, not a bottom overlay.
export function stadiumViewOffset(width: number, height: number): number {
  return height <= 500 && width > height ? Math.min(width * 0.15, 120) : 0;
}

/** Where the kick is taken from, in world units (x, z). */
export type StadiumSpot = { x: number; z: number };

/**
 * Walking: a player-scale follow camera. Playing: behind the kicker at the
 * attempt's spot (it moves down the ladder), the posts in the upper part of
 * the frame; in flight it rises and drops back with the ball so the arc and
 * the posts stay in view.
 */
export function stadiumCameraFrame(
  player: { x: number; z: number },
  playing: boolean,
  ball: V3,
  portrait: boolean,
  spot: StadiumSpot = { x: 0, z: FIELD_GOAL.startZ },
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
  const lift = Math.max(0, ball[1] - FIELD_GOAL.tee);
  const back = portrait ? 9 : 6.5;
  const up = portrait ? 4.6 : 3.4;
  return {
    position: [spot.x * 0.6, up + lift * 0.55, spot.z + back + lift * 0.45],
    target: [ball[0] * 0.35, 1.6 + ball[1] * 0.45, (spot.z + FIELD_GOAL.goalZ) / 2 - 2],
  };
}
