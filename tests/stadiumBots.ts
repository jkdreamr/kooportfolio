import { currentAttempt, newDrive, perfectTimes, recordKick, resolveAttempt, type DriveMode } from "../src/game/core/stadiumChallenge";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A drive by a player whose locks are off by Gaussian noise of σ = `errMs` on both bars. */
export function botDrive(errMs: number, seed: number, mode: DriveMode = "drive") {
  const d = newDrive(mode, seed * 7919 + 13),
    r = rng(seed);
  while (!d.over && d.kicks < 200) {
    const a = currentAttempt(d);
    const t = perfectTimes(a);
    const e = () => (Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) * errMs) / 1000;
    const res = resolveAttempt(a, Math.max(0, t.powerT + e()), Math.max(0, t.aimT + e()));
    recordKick(d, a, res.result);
  }
  return d;
}
export const botStats = (errMs: number, runs = 60) => {
  const ds = Array.from({ length: runs }, (_, i) => botDrive(errMs, i + 1));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))];
  const longest = ds.map((d) => d.longest),
    score = ds.map((d) => d.score);
  return { longest: mean(longest), score: mean(score), p25: pct(longest, 0.25), p75: pct(longest, 0.75), p20: pct(longest, 0.2), median: pct(longest, 0.5) };
};
