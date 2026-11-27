import { describe, expect, it } from "vitest";
import {
  confettiPieces,
  HAPTICS,
  MAX_NODES,
  ndcToScreen,
  pieceAt,
  shakeKeyframes,
  shakeOffset,
  SHAKE_MS,
  SHAKE_PX,
  SlotPool,
} from "../src/game/scenes/juice/juice";

describe("feedback kit (D7)", () => {
  it("shake: rests at both ends, stays within strength × 6 px, three oscillations", () => {
    expect(shakeOffset(0, 1)).toEqual([0, 0]);
    expect(shakeOffset(SHAKE_MS, 1)).toEqual([0, 0]);
    let max = 0,
      flips = 0,
      last = 0;
    for (let ms = 1; ms < SHAKE_MS; ms++) {
      const [x] = shakeOffset(ms, 0.3);
      max = Math.max(max, Math.abs(x));
      if (Math.sign(x) !== 0 && Math.sign(x) !== Math.sign(last) && last !== 0) flips++;
      if (x !== 0) last = x;
    }
    expect(max).toBeLessThanOrEqual(0.3 * SHAKE_PX);
    expect(max).toBeGreaterThan(0.3 * SHAKE_PX * 0.4);
    expect(flips).toBe(5);
    const frames = shakeKeyframes(1);
    expect(frames[0].transform).toBe("translate(0.00px, 0.00px)");
    expect(frames.at(-1)!.transform).toBe("translate(0.00px, 0.00px)");
  });
  it("confetti: capped at the pool size, speeds within spec", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    expect(confettiPieces(500, 800, rnd)).toHaveLength(MAX_NODES);
    for (const p of confettiPieces(28, 800, rnd)) {
      expect(Math.abs(p.vx)).toBeLessThanOrEqual(220);
      expect(Math.abs(p.spin)).toBeLessThanOrEqual(540);
    }
    const p = { x: 0, vx: 100, vy: 0, spin: 90, colour: "#fff" };
    expect(pieceAt(p, 1)).toBe("translate(100.0px, 260.0px) rotate(90deg)");
  });
  it("pool: never more than 40 nodes, recycles the oldest", () => {
    let made = 0;
    const reset: number[] = [];
    const pool = new SlotPool(() => ++made, (n) => reset.push(n), 40);
    const first = pool.acquire();
    for (let i = 0; i < 60; i++) pool.acquire();
    expect(pool.size).toBe(40);
    expect(pool.inUse).toBe(40);
    expect(reset[0]).toBe(first);
    const item = pool.acquire();
    pool.release(item);
    expect(pool.acquire()).toBe(item);
  });
  it("haptic patterns and projection", () => {
    expect(HAPTICS.tap).toBe(8);
    expect(HAPTICS.score).toEqual([10, 30, 10]);
    expect(HAPTICS.win).toEqual([20, 40, 60]);
    expect(ndcToScreen({ x: 0, y: 0 }, { left: 10, top: 20, width: 200, height: 100 })).toEqual([110, 70]);
    expect(ndcToScreen({ x: -1, y: 1 }, { left: 0, top: 0, width: 200, height: 100 })).toEqual([0, 0]);
  });
});
