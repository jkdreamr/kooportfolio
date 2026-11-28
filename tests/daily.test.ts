import { describe, expect, it } from "vitest";
import { DAILY_POOL, DAILY_WORLDS, dailyTask, dailyThree, dayNumber, secondsToNextDay, type RunReport } from "../src/game/core/daily";

describe("Daily Three", () => {
  it("is deterministic, one task per world, and never repeats yesterday's pick over 400 days", () => {
    const start = dayNumber(new Date("2026-01-01T00:00:00Z"));
    let prev = dailyThree(start - 1);
    const used = new Set<string>();
    for (let d = start; d < start + 400; d++) {
      const today = dailyThree(d);
      expect(dailyThree(d)).toEqual(today);
      expect(today.map((t) => t.world)).toEqual([...DAILY_WORLDS]);
      today.forEach((t, w) => {
        expect(t.id).not.toBe(prev[w].id);
        expect(dailyTask(t.id)).toBe(t);
        used.add(t.id);
      });
      prev = today;
    }
    // Every task in the pool comes up.
    expect(used.size).toBe(DAILY_WORLDS.reduce((n, w) => n + DAILY_POOL[w].length, 0));
  });
  it("tasks are judged from reported runs", () => {
    const day = 20000;
    const run = (game: RunReport["game"], result: RunReport["result"]): RunReport => ({ game, result, day, at: 0 });
    expect(dailyTask("home.kick-daily")!.done(run("stadium", { mode: "daily", score: 160, daily: true }), day)).toBe(true);
    expect(dailyTask("home.kick-daily")!.done(run("stadium", { mode: "drive", score: 400 }), day)).toBe(false);
    expect(dailyTask("home.beat-day")!.done(run("music", { mode: "freestyle", score: 3, stats: { beat: day % 8 } }), day)).toBe(true);
    expect(dailyTask("home.beat-day")!.done(run("music", { mode: "freestyle", score: 3, stats: { beat: (day + 1) % 8 } }), day)).toBe(false);
    expect(dailyTask("stanford.skate-goals")!.done(run("skate", { mode: "daily", score: 900, daily: true, stats: { goals: 2 } }), day)).toBe(true);
  });
  it("counts down to 00:00 UTC", () => {
    expect(secondsToNextDay(new Date("2026-11-28T23:00:00Z"))).toBe(3600);
  });
});
