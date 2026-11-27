import { describe, expect, it } from "vitest";
import {
  BANNER_MS,
  bannerKeyframes,
  confettiPieces,
  createGameClock,
  effectScale,
  gameClock,
  HITSTOP_MAX_MS,
  SLOWMO_MAX_MS,
  SLOWMO_RELEASE_MS,
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

describe("game clock and banner (J0)", () => {
  const make = (reduced = false) => {
    let t = 1000;
    const clock = createGameClock(() => t, () => reduced);
    return { clock, at: (ms: number) => (t = 1000 + ms) };
  };
  it("rests at 1 with nothing running", () => {
    const { clock } = make();
    expect(clock.scale).toBe(1);
    expect(clock.scaled(0.016)).toBe(0.016);
    expect(gameClock.scale).toBe(1);
  });
  it("slowMo: holds the scale, eases back linearly over the release, then 1", () => {
    const { clock, at } = make();
    clock.slowMo(0.4, 1200);
    at(0);
    expect(clock.scale).toBeCloseTo(0.4);
    at(1199);
    expect(clock.scale).toBeCloseTo(0.4);
    at(1200 + SLOWMO_RELEASE_MS / 2);
    expect(clock.scale).toBeCloseTo(0.7);
    at(1200 + SLOWMO_RELEASE_MS);
    expect(clock.scale).toBe(1);
    expect(clock.scaled(0.02)).toBe(0.02);
  });
  it("hitStop: freezes for ms with no ease, capped at 250 ms; is slowMo(0, ms)", () => {
    const { clock, at } = make();
    clock.hitStop(60);
    at(0);
    expect(clock.scale).toBe(0);
    expect(clock.scaled(0.016)).toBe(0);
    at(59);
    expect(clock.scale).toBe(0);
    at(60);
    expect(clock.scale).toBe(1);
    clock.hitStop(10_000);
    at(60 + HITSTOP_MAX_MS - 1);
    expect(clock.scale).toBe(0);
    at(60 + HITSTOP_MAX_MS);
    expect(clock.scale).toBe(1);
  });
  it("overlaps: the slowest wins; a hit-stop inside a slow-mo returns to the slow-mo", () => {
    const { clock, at } = make();
    at(0);
    clock.slowMo(0.5, 1000);
    at(100);
    clock.hitStop(80);
    at(120);
    expect(clock.scale).toBe(0);
    at(200);
    expect(clock.scale).toBeCloseTo(0.5);
  });
  it("cancel ends one effect early; reset clears all; bad input is clamped or ignored", () => {
    const { clock, at } = make();
    at(0);
    const stop = clock.slowMo(0.3, 2000);
    clock.slowMo(0.6, 2000);
    at(10);
    expect(clock.scale).toBeCloseTo(0.3);
    stop();
    expect(clock.scale).toBeCloseTo(0.6);
    clock.reset();
    expect(clock.scale).toBe(1);
    clock.slowMo(-2, 100);
    expect(clock.scale).toBe(0);
    clock.reset();
    clock.slowMo(5, 100);
    expect(clock.scale).toBe(1);
    clock.slowMo(0.5, 0);
    clock.slowMo(0.5, Number.NaN);
    clock.reset();
    clock.slowMo(0.5, 60_000);
    at(10 + SLOWMO_MAX_MS - 1);
    expect(clock.scale).toBeCloseTo(0.5);
    at(10 + SLOWMO_MAX_MS + SLOWMO_RELEASE_MS);
    expect(clock.scale).toBe(1);
  });
  it("reduced motion: the clock stays at 1", () => {
    const { clock, at } = make(true);
    clock.hitStop(100);
    clock.slowMo(0.2, 1000);
    at(10);
    expect(clock.scale).toBe(1);
  });
  it("effect envelope is 1 before it starts", () => {
    expect(effectScale({ scale: 0.2, start: 100, hold: 50, release: 0 }, 50)).toBe(1);
  });
  it("banner: 900 ms; reduced motion animates opacity only", () => {
    expect(BANNER_MS).toBe(900);
    expect(bannerKeyframes(false).some((f) => "transform" in f)).toBe(true);
    const still = bannerKeyframes(true);
    expect(still.some((f) => "transform" in f)).toBe(false);
    expect(still[0].opacity).toBe(0);
    expect(still.at(-1)!.opacity).toBe(0);
  });
});
