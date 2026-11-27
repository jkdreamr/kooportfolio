import { describe, expect, it } from "vitest";
import {
  PeepholeSim,
  STEP,
  handDistanceForTension,
  inverseRubberBand,
  pullLength,
  rubberBand,
  LOADING_MAX_T,
  loadingProgress,
  rampTension,
} from "../src/stage/peephole/spring";

const L = 220;
function run(sim: PeepholeSim, seconds: number, frame = 1 / 60, each?: () => void) {
  const frames = Math.round(seconds / frame);
  for (let i = 0; i < frames; i++) {
    sim.advance(frame);
    each?.();
  }
}

describe("pull length and rubber band", () => {
  it("scales with the viewport and clamps", () => {
    expect(pullLength(1440, 900)).toBeCloseTo(252);
    expect(pullLength(390, 844)).toBe(140);
    expect(pullLength(3840, 2160)).toBe(260);
    expect(pullLength(1440, 900, true)).toBeCloseTo(252 * 0.6);
  });
  it("is monotonic, bounded by 2.2L and invertible", () => {
    let prev = -1;
    for (let d = 0; d < 5000; d += 7) {
      const r = rubberBand(d, L);
      expect(r).toBeGreaterThan(prev);
      expect(r).toBeLessThan(2.2 * L);
      expect(inverseRubberBand(r, L)).toBeCloseTo(d, 3);
      prev = r;
    }
  });
  it("costs more hand travel for each pixel of letter travel", () => {
    const a = rubberBand(100, L) - rubberBand(0, L);
    const b = rubberBand(600, L) - rubberBand(500, L);
    expect(b).toBeLessThan(a * 0.5);
    expect(rubberBand(handDistanceForTension(1, L), L)).toBeCloseTo(L, 6);
  });
});

describe("letter spring", () => {
  it("rests exactly at rest", () => {
    const sim = new PeepholeSim(L);
    run(sim, 2);
    expect(sim.x).toBe(0);
    expect(sim.y).toBe(0);
    expect(sim.atRest).toBe(true);
  });

  it("follows a partial drag, then springs back with 2–3 overshoots and never commits", () => {
    const sim = new PeepholeSim(L);
    sim.grab(500, 300);
    // Drag to T ≈ 0.7 over a quarter second.
    const hand = handDistanceForTension(0.7, L);
    for (let i = 1; i <= 15; i++) {
      sim.drag(500 + (hand * i) / 15, 300);
      sim.advance(1 / 60);
    }
    run(sim, 0.6);
    expect(sim.tension).toBeGreaterThan(0.66);
    expect(sim.tension).toBeLessThan(0.74);
    expect(sim.crack).toBeGreaterThan(0);
    sim.release();
    // Count visible overshoots: swings past rest that peak above 1.5 px.
    let crossings = 0;
    let last = Math.sign(sim.x);
    let peak = 0;
    let maxAfter = 0;
    run(sim, 4, 1 / 60, () => {
      const s = Math.sign(sim.x);
      if (s !== 0 && s !== last) {
        if (peak > 1.5 || crossings === 0) crossings++;
        last = s;
        peak = 0;
      }
      peak = Math.max(peak, Math.abs(sim.x));
      if (crossings > 0) maxAfter = Math.max(maxAfter, Math.abs(sim.x));
    });
    if (peak <= 1.5) crossings--; // the last swing never became visible
    expect(sim.committed).toBe(false);
    expect(crossings).toBeGreaterThanOrEqual(2);
    expect(crossings).toBeLessThanOrEqual(6);
    // First overshoot is visible but well below the pull.
    expect(maxAfter).toBeGreaterThan(0.08 * 0.7 * L);
    expect(maxAfter).toBeLessThan(0.7 * L);
    expect(sim.atRest).toBe(true);
    expect(sim.crack).toBeLessThan(0.001);
    // The deepest crack leaves a faint crease.
    expect(sim.crease).toBeGreaterThan(0);
  });

  it("holding below threshold never commits", () => {
    const sim = new PeepholeSim(L);
    sim.grab(0, 0);
    sim.drag(handDistanceForTension(0.95, L), 0);
    run(sim, 3);
    expect(sim.tension).toBeLessThan(1);
    expect(sim.committed).toBe(false);
  });

  it("commits after T ≥ 1 is held for 80 ms", () => {
    const sim = new PeepholeSim(L);
    const events: string[] = [];
    sim.on((e) => events.push(e));
    sim.grab(0, 0);
    sim.drag(0, handDistanceForTension(1.15, L));
    let firstOver = -1;
    let commitAt = -1;
    run(sim, 2, 1 / 240, () => {
      if (firstOver < 0 && sim.tension >= 1) firstOver = sim.time;
      if (commitAt < 0 && sim.committed) commitAt = sim.time;
    });
    expect(sim.committed).toBe(true);
    expect(commitAt - firstOver).toBeGreaterThanOrEqual(0.08 - STEP);
    expect(commitAt - firstOver).toBeLessThan(0.08 + 2 * STEP);
    expect(events).toContain("commit");
    expect(sim.commitDirY).toBeCloseTo(1, 2);
  });

  it("a brief excursion past threshold does not commit", () => {
    const sim = new PeepholeSim(L);
    sim.grab(0, 0);
    sim.drag(handDistanceForTension(1.05, L), 0);
    run(sim, 2, 1 / 240, () => {
      if (sim.tension >= 1) sim.drag(handDistanceForTension(0.5, L), 0);
    });
    expect(sim.committed).toBe(false);
  });

  it("an outward flick above 0.85 commits on release, a slow release does not", () => {
    const slow = new PeepholeSim(L);
    slow.grab(0, 0);
    slow.drag(handDistanceForTension(0.9, L), 0);
    run(slow, 1.5);
    expect(slow.release()).toBe(false);
    expect(slow.committed).toBe(false);

    const fast = new PeepholeSim(L);
    fast.grab(0, 0);
    // Snap outward quickly from 0.6 → 0.98 and let go mid-motion.
    fast.drag(handDistanceForTension(0.6, L), 0);
    run(fast, 1);
    fast.drag(handDistanceForTension(1.6, L), 0);
    let released = false;
    run(fast, 0.5, 1 / 120, () => {
      if (!released && fast.tension > 0.88) released = fast.release() || true;
    });
    expect(fast.committed).toBe(true);
  });

  it("is frame-rate independent (fixed 120 Hz step)", () => {
    const make = () => {
      const s = new PeepholeSim(L);
      s.grab(0, 0);
      s.drag(180, -90);
      return s;
    };
    const a = make();
    const b = make();
    run(a, 0.5, 1 / 30);
    run(b, 0.5, 1 / 120);
    a.release();
    b.release();
    run(a, 0.8, 1 / 30);
    run(b, 0.8, 1 / 120);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.angle).toBeCloseTo(b.angle, 6);
  });

  it("stays stable at the stiffest point and under a huge frame", () => {
    const sim = new PeepholeSim(L);
    sim.grab(0, 0);
    sim.drag(1e6, 1e6);
    sim.advance(5);
    run(sim, 1);
    expect(Number.isFinite(sim.x)).toBe(true);
    expect(sim.tension).toBeLessThan(2.2);
  });

  it("re-grabbing a moving letter is continuous", () => {
    const sim = new PeepholeSim(L);
    sim.grab(0, 0);
    sim.drag(200, 0);
    run(sim, 0.5);
    sim.release();
    run(sim, 0.05);
    const twin = new PeepholeSim(L);
    Object.assign(twin, { x: sim.x, y: sim.y, vx: sim.vx, vy: sim.vy });
    sim.grab(900, 900);
    sim.advance(STEP);
    twin.advance(STEP);
    // Grabbing changes the anchor, never the position: the letter cannot jump.
    expect(Math.abs(sim.x - twin.x)).toBeLessThan(4);
  });

  it("swings with lateral motion and the page lags the letter", () => {
    const sim = new PeepholeSim(L);
    sim.grab(0, 0);
    sim.drag(250, 0);
    sim.advance(0.05);
    expect(Math.abs(sim.angle)).toBeGreaterThan(0.005);
    expect(Math.abs(sim.px)).toBeLessThan(Math.abs(sim.x));
  });

  it("keyboard impulses move and return; resize keeps tension", () => {
    const sim = new PeepholeSim(L);
    sim.impulse(0.9 * L, 0);
    run(sim, 0.12);
    expect(sim.x).toBeGreaterThan(5);
    run(sim, 4);
    expect(sim.atRest).toBe(true);

    sim.grab(0, 0);
    sim.drag(handDistanceForTension(0.7, L), 0);
    run(sim, 1);
    const T = sim.tension;
    sim.resize(L * 0.6);
    expect(sim.tension).toBeCloseTo(T, 6);
    run(sim, 0.5);
    expect(sim.tension).toBeCloseTo(0.7, 1);
  });

  it("reseal lets go without committing", () => {
    const sim = new PeepholeSim(L);
    sim.grab(0, 0);
    sim.drag(handDistanceForTension(0.9, L), 0);
    run(sim, 0.5);
    sim.reseal();
    run(sim, 4);
    expect(sim.atRest).toBe(true);
    expect(sim.committed).toBe(false);
  });
});

describe("pulling before the world is ready (A6)", () => {
  it("holds the tension at the loading ceiling however far the hand goes", () => {
    const sim = new PeepholeSim(L, { commitT: Infinity, flickT: Infinity, maxT: LOADING_MAX_T });
    sim.grab(0, 0);
    let peak = 0;
    for (let i = 1; i <= 60; i++) {
      sim.drag(i * 12, i * 6);
      sim.advance(1 / 60);
      peak = Math.max(peak, sim.tension);
    }
    run(sim, 1);
    expect(sim.tension).toBeCloseTo(LOADING_MAX_T, 2);
    expect(peak).toBeLessThan(LOADING_MAX_T + 0.08);
    expect(sim.committed).toBe(false);
  });
  it("hands the same drag on when armed: no jump, tension continuous, then commits", () => {
    const sim = new PeepholeSim(L, { commitT: Infinity, flickT: Infinity, maxT: LOADING_MAX_T });
    sim.grab(0, 0);
    const hand = handDistanceForTension(1.25, L);
    sim.drag(Math.cos(0.4) * hand, Math.sin(0.4) * hand);
    run(sim, 1.2);
    expect(sim.tension).toBeCloseTo(LOADING_MAX_T, 2);
    // Armed: the controller lifts the ceiling with rampTension each frame.
    sim.tune.commitT = 1;
    sim.tune.flickT = 0.85;
    let last = sim.tension;
    const steps: number[] = [];
    for (let i = 0; i < 120 && !sim.committed; i++) {
      if (Number.isFinite(sim.tune.maxT)) sim.setMaxTension(rampTension(sim.tune.maxT, 1 / 60));
      sim.advance(1 / 60);
      steps.push(Math.abs(sim.tension - last));
      last = sim.tension;
    }
    // At the hand-off itself the tension is continuous (< 0.02), and the
    // lift never produces a visible jump afterwards either.
    expect(steps[0]).toBeLessThan(0.02);
    expect(Math.max(...steps)).toBeLessThan(0.05);
    expect(sim.committed).toBe(true);
    expect(sim.held).toBe(true);
  });
  it("lifts the ceiling to Infinity past the band's reach", () => {
    let t = LOADING_MAX_T;
    let frames = 0;
    while (Number.isFinite(t)) {
      t = rampTension(t, 1 / 60);
      frames++;
    }
    expect(frames).toBeGreaterThan(30);
    expect(frames).toBeLessThan(60);
  });
  it("release still reseals exactly from the ceiling", () => {
    const sim = new PeepholeSim(L, { commitT: Infinity, flickT: Infinity, maxT: LOADING_MAX_T });
    sim.grab(0, 0);
    sim.drag(400, 200);
    run(sim, 1);
    sim.release();
    run(sim, 4);
    expect(sim.atRest).toBe(true);
    expect(sim.x).toBeCloseTo(0, 1);
  });
  it("loading gauge: rises monotonically 0 → 1 across download and warm-up", () => {
    let last = -1;
    const samples: number[] = [];
    for (let t = 0; t <= 6; t += 0.1) samples.push(loadingProgress(t, false, 0));
    for (const w of [0, 0.25, 0.5, 0.75, 1]) samples.push(loadingProgress(7, true, w));
    for (const p of samples) {
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(1);
    expect(loadingProgress(100, false, 0)).toBeLessThan(0.6);
  });
});
