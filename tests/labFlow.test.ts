import { describe, expect, it } from "vitest";
import {
  HYPE_START,
  LAB_TOPICS,
  OFFSET_CLAMP_S,
  eighthOffset,
  flowCloseBars,
  flowSheet,
  flowTap,
  gradeOffset,
  hypeLevel,
  newFlow,
  schemeFamilySlot,
  type FlowGrid,
} from "../src/game/core/labFlow";
import { LAB_BEAT_PATTERNS, beatVariant, variantForBar } from "../src/game/core/labBeats";
import { RHYME_BEATS, RHYME_FAMILIES, newRhymeGame, swapRhymeWord } from "../src/game/core/labGames";

const grid: FlowGrid = { beatS: 60 / 90, swing: 0.12, countIn: (60 / 90) * 4, bars: 16 };
function gauss(rnd: () => number) {
  return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Taps on eighth notes with Gaussian error σ (s) and a fixed lag; returns hype by bar. */
function eighthBot(sigma: number, lag = 0, seed = 1, bars = 16) {
  const f = newFlow(),
    r = rng(seed);
  for (let bar = 0; bar < bars; bar++) {
    for (let e = 0; e < 8; e++) {
      const t = grid.countIn + bar * grid.beatS * 4 + (e * grid.beatS) / 2 + lag + gauss(r) * sigma;
      flowTap(f, t, grid);
    }
    flowCloseBars(f, grid.countIn + (bar + 1) * grid.beatS * 4 + 0.001, grid);
  }
  return { f, hype: f.barHype };
}

describe("beats", () => {
  it("every beat has four variants on valid steps; A is today's loop", () => {
    for (const beat of RHYME_BEATS) {
      const A = beatVariant(beat.pattern, "A");
      expect(A).toBe(LAB_BEAT_PATTERNS[beat.pattern]);
      for (const v of ["A", "B", "drop", "fill"] as const) {
        const d = beatVariant(beat.pattern, v);
        for (const s of [...d.kick, ...d.snare, ...d.hat]) {
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThan(16);
        }
      }
      expect(beatVariant(beat.pattern, "drop").snare).toEqual([]);
      expect(beatVariant(beat.pattern, "drop").hat).toEqual([]);
      expect(beatVariant(beat.pattern, "fill").snare).toEqual(expect.arrayContaining([12, 13, 14, 15]));
      expect(beatVariant(beat.pattern, "B").kick.length).toBe(A.kick.length + 1);
    }
  });
  it("a take plays A×4, B×4, drop×4, B×3, fill", () => {
    const order = Array.from({ length: 16 }, (_, b) => variantForBar(b)).join(",");
    expect(order).toBe("A,A,A,A,B,B,B,B,drop,drop,drop,drop,B,B,B,fill");
  });
});

describe("prompts", () => {
  it("schemes map bars to families", () => {
    expect(Array.from({ length: 8 }, (_, b) => schemeFamilySlot("AABB", b))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(Array.from({ length: 8 }, (_, b) => schemeFamilySlot("ABAB", b))).toEqual([0, 1, 0, 1, 2, 3, 2, 3]);
    expect(Array.from({ length: 8 }, (_, b) => schemeFamilySlot("AAAA", b))).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });
  it("bars that share a family rhyme with different words", () => {
    for (const scheme of ["AABB", "ABAB", "AAAA"] as const)
      for (let seed = 1; seed < 40; seed++) {
        const game = newRhymeGame(seed, 0, scheme);
        expect(game.bars).toHaveLength(16);
        for (let b = 0; b < 16; b++) {
          const slot = schemeFamilySlot(scheme, b);
          const peers = game.bars.filter((_, i) => schemeFamilySlot(scheme, i) === slot);
          expect(new Set(peers.map((p) => p.family)).size).toBe(1);
          expect(new Set(peers.map((p) => p.word)).size).toBe(peers.length);
          expect(RHYME_FAMILIES[game.bars[b].family]).toContain(game.bars[b].word);
        }
        expect(LAB_TOPICS).toContain(game.topic);
      }
    expect(LAB_TOPICS.length).toBeGreaterThanOrEqual(40);
  });
  it("swap word keeps the family and avoids its rhyming partners", () => {
    const game = newRhymeGame(5);
    const next = swapRhymeWord(game, 3, 0.5);
    expect(next.bars[3].family).toBe(game.bars[3].family);
    expect(next.bars[3].word).not.toBe(game.bars[3].word);
    expect(next.bars[3].word).not.toBe(game.bars[2].word);
  });
});

describe("tap grading and hype", () => {
  it("grades at 45 and 90 ms on the eighth grid", () => {
    expect(gradeOffset(45)).toBe("pocket");
    expect(gradeOffset(-46)).toBe("close");
    expect(gradeOffset(90)).toBe("close");
    expect(gradeOffset(91)).toBe("loose");
    expect(eighthOffset(grid.countIn + grid.beatS / 2 + 0.03, grid)).toBeCloseTo(0.03);
  });
  it("count-in taps are not graded; a tap near beat 4 lands the rhyme once", () => {
    const f = newFlow();
    expect(flowTap(f, 0.5, grid)).toBeNull();
    const beat4 = grid.countIn + grid.beatS * 3;
    expect(flowTap(f, beat4 + 0.02, grid)?.landed).toBe(true);
    expect(flowTap(f, beat4 + 0.01, grid)?.landed).toBe(false);
    expect(f.hype).toBe(HYPE_START + 4 + 8 + 4);
  });
  it("hype clamps to 0–100", () => {
    const tight = eighthBot(0);
    expect(Math.max(...tight.hype)).toBeLessThanOrEqual(100);
    const none = newFlow();
    flowCloseBars(none, grid.countIn + 16 * grid.beatS * 4 + 0.01, grid);
    expect(none.hype).toBe(0);
    expect(hypeLevel(95)).toBe(3);
    expect(hypeLevel(39)).toBe(0);
  });
  it("the automatic offset converges on a 180 ms lag (clamped at 150)", () => {
    // Quarter-note taps (a lag past half an eighth is ambiguous on eighths).
    const f = newFlow();
    for (let n = 0; n < 16; n++) flowTap(f, grid.countIn + n * grid.beatS + 0.18, grid);
    expect(f.offset).toBeCloseTo(OFFSET_CLAMP_S, 3);
    const small = eighthBot(0.005, 0.06, 4, 2).f;
    expect(small.offset).toBeGreaterThan(0.05);
    expect(small.offset).toBeLessThan(0.07);
  });
});

describe("tuning bots", () => {
  it("σ = 20 ms on eighths reaches hype ≥ 90 by bar 8", () => {
    for (const seed of [1, 2, 3]) expect(Math.max(...eighthBot(0.02, 0, seed).hype.slice(0, 8))).toBeGreaterThanOrEqual(90);
  });
  it("σ = 60 ms holds between 40 and 80", () => {
    for (const seed of [1, 2, 3]) {
      const late = eighthBot(0.06, 0, seed).hype.slice(4);
      const mean = late.reduce((a, b) => a + b, 0) / late.length;
      expect(mean).toBeGreaterThanOrEqual(40);
      expect(mean).toBeLessThanOrEqual(80);
    }
  });
  it("random taps at 5 Hz stay under 50", () => {
    for (const seed of [1, 2, 3]) {
      const f = newFlow(),
        r = rng(seed);
      const end = grid.countIn + 16 * grid.beatS * 4;
      for (let t = grid.countIn; t < end; t += 0.2) {
        flowTap(f, t + r() * 0.2, grid);
        flowCloseBars(f, t, grid);
      }
      flowCloseBars(f, end + 0.01, grid);
      const mean = f.barHype.reduce((a, b) => a + b, 0) / f.barHype.length;
      expect(mean).toBeLessThan(50);
    }
  });
  it("no taps ends at 0 and the take still has a sheet", () => {
    const f = newFlow();
    flowCloseBars(f, grid.countIn + 16 * grid.beatS * 4 + 0.01, grid);
    expect(f.hype).toBe(0);
    const sheet = flowSheet(f);
    expect(sheet.taps).toBe(0);
    expect(sheet.verdict).toBe("Calm room");
  });
});

describe("flow sheet", () => {
  it("summarises a fixed take and names the style", () => {
    const { f } = eighthBot(0.005, 0.03, 9);
    const sheet = flowSheet(f);
    expect(sheet.taps).toBe(128);
    expect(sheet.landed).toBe(16);
    expect(sheet.tapsPerBar).toBe(8);
    expect(sheet.verdict).toBe("Roof's off");
    // A steady 30 ms lag is learned by the offset, so it reads as in the pocket.
    expect(sheet.style).toBe("In the pocket");
    expect(sheet.pocketPct).toBe(100);
  });
  it("style thresholds", () => {
    const late = newFlow();
    late.offsets = [30, 30, 30, 30];
    late.taps = 4;
    expect(flowSheet(late).style).toBe("Laid back, sparse");
    late.offsets = [-30, -30, -30, -30];
    expect(flowSheet(late).style).toBe("On top, sparse");
    late.taps = 170;
    expect(flowSheet(late).style).toBe("On top, double-time");
  });
});
