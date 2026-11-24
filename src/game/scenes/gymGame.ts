export const GYM_REP_MS = 900;
export const GYM_ROUND_SIZE = 8;
export const GYM_GOAL = 1200;
export const GYM_BEST_KEY = "joshua-exe:gym-best:v1";
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

export function judgeGymLift(marker: number, target: number, streak: number) {
  const distance = Math.abs(marker - target);
  const judgment =
    distance <= GYM_PERFECT_RADIUS + 1e-9
      ? "Perfect"
      : distance <= GYM_TARGET_RADIUS + 1e-9
        ? "Clean"
        : "Miss";
  const points = judgment === "Perfect" ? 200 : judgment === "Clean" ? 100 : 0;
  return {
    judgment,
    points: points ? points + streak * 25 : 0,
    streak: points ? streak + 1 : 0,
  } as const;
}

export function readGymBest() {
  try {
    const best = Number(window.localStorage.getItem(GYM_BEST_KEY));
    return Number.isInteger(best) && best >= 0 && best <= 2300 ? best : 0;
  } catch {
    return 0;
  }
}

export function saveGymBest(score: number, cachedBest: number) {
  // Another tab may have finished a better set since this tab loaded.
  const previousBest = Math.max(cachedBest, readGymBest());
  const best = Math.max(score, previousBest);
  try {
    window.localStorage.setItem(GYM_BEST_KEY, String(best));
  } catch {
    // A blocked local store must not interrupt the set or daily reward.
  }
  return { best, newBest: score > previousBest };
}
