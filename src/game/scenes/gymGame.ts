export const GYM_REP_MS = 900;
export const GYM_ROUND_SIZE = 8;
export const GYM_TARGET_RADIUS = 0.14;
export const GYM_PERFECT_RADIUS = 0.055;
const targets = [0.5, 0.68, 0.34, 0.6, 0.42, 0.72, 0.3, 0.54];

export function gymTarget(rep: number) {
  return targets[Math.min(GYM_ROUND_SIZE - 1, Math.max(0, rep))];
}

export function gymMarker(readyAt: number, now: number, rep: number) {
  // A generous first pass; later lifts ask for a little more attention.
  const sweep = Math.max(0, now - readyAt) / (1400 - Math.min(rep, 7) * 40);
  const position = sweep % 2;
  return position <= 1 ? position : 2 - position;
}

export function judgeGymLift(marker: number, target: number) {
  const distance = Math.abs(marker - target);
  return distance <= GYM_PERFECT_RADIUS + 1e-9
    ? "Perfect"
    : distance <= GYM_TARGET_RADIUS + 1e-9
      ? "Clean"
      : "Miss";
}


/** A clean or perfect lift extends the streak; a miss resets it. */
export function nextGymStreak(streak: number, judgment: "Perfect" | "Clean" | "Miss" | "") {
  return judgment === "Perfect" || judgment === "Clean" ? streak + 1 : 0;
}
/** The streak length that earns the big cue. */
export const GYM_STREAK_CHEER = 5;
