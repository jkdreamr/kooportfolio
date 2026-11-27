import { describe, expect, it } from "vitest";
import { benchmarkBudgetMs, buildStamp, summarizeFrames } from "../src/game/engine/stats";

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

describe("benchmark build stamp (A13)", () => {
  const entry = (name: string, transferSize: number, encodedBodySize = 600, decodedBodySize = 1800) => ({
    name,
    transferSize,
    encodedBodySize,
    decodedBodySize,
  });
  it("names the commit and the engine chunk as received", () => {
    const stamp = buildStamp("abc123def456", [
      entry("https://x.test/assets/index-Ab12.js", 90),
      entry("https://x.test/assets/engine-kRNAW4gX.js", 661_000, 660_000, 1_898_697),
      entry("https://x.test/assets/engine-SudPRSDu.css", 36_000),
    ]);
    expect(stamp).toEqual({
      commit: "abc123def456",
      engineChunk: { file: "engine-kRNAW4gX.js", transferBytes: 661_000, decodedBytes: 1_898_697 },
    });
  });
  it("uses the encoded size for a cached chunk and copes with none", () => {
    expect(buildStamp("c", [entry("/assets/engine-x.js", 0, 640_000)]).engineChunk?.transferBytes).toBe(640_000);
    expect(buildStamp("c", []).engineChunk).toBeNull();
  });
});
