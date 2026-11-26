import { describe, expect, it } from "vitest";
import { benchmarkBudgetMs, summarizeFrames } from "../src/game/engine/stats";

describe("benchmark frame summary", () => {
  it("is empty-safe", () => {
    expect(summarizeFrames([]).frames).toBe(0);
  });
  it("reports percentiles, 1% low and hitches", () => {
    const ms = [...Array.from({ length: 99 }, () => 10), 100];
    const s = summarizeFrames(ms);
    expect(s.frames).toBe(100);
    expect(s.p95Ms).toBe(10);
    expect(s.p99Ms).toBe(10);
    expect(s.maxMs).toBe(100);
    expect(s.over50).toBe(1);
    expect(s.low1Fps).toBe(10);
    expect(s.avgMs).toBeCloseTo(10.9, 1);
  });
  it("budgets 60 fps on high, 30 below", () => {
    expect(benchmarkBudgetMs("high")).toBe(16.7);
    expect(benchmarkBudgetMs("medium")).toBe(33.3);
  });
});
