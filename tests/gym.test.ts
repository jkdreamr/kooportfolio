import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gymRepMotion, useGym } from "../src/game/scenes/CognitionGym";
import { useGameMode } from "../src/game/core/gameMode";
import { runtime, useGame } from "../src/game/core/store";
import { freshSave } from "../src/shared/save";
import {
  GYM_BEST_KEY,
  gymMarker,
  gymTarget,
  readGymBest,
} from "../src/game/scenes/gymGame";

let clock = 1000;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  useGameMode.setState({ active: null });
  useGym.setState({
    reps: 0,
    liftedAt: -Infinity,
    earned: 0,
    readyAt: 0,
    pausedAt: null,
    strike: 0,
    score: 0,
    streak: 0,
    judgment: "",
    points: 0,
    best: 0,
    newBest: false,
  });
  useGame.setState({
    scene: "gym",
    paused: false,
    panel: "none",
    build: false,
    traveling: false,
    near: "",
    save: freshSave(),
  });
  runtime.x = 1;
  runtime.z = 1;
  runtime.active = true;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function finishSet() {
  for (let i = 0; i < 8; i++) {
    clock += 900;
    useGym.getState().lift();
  }
}

function perfectLift() {
  const state = useGym.getState();
  clock = state.readyAt;
  while (
    Math.abs(
      gymMarker(state.readyAt, clock, state.reps) - gymTarget(state.reps),
    ) > 0.01
  )
    clock += 10;
  useGym.getState().lift();
}

describe("optional gym sessions", () => {
  it("does not lift before Play or start from the doorway", () => {
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(0);
    runtime.z = 16.5;
    expect(useGym.getState().startSession()).toBe(false);
    expect(useGameMode.getState().active).toBeNull();
    expect(useGame.getState().save.coins).toBe(0);
  });

  it("cancels an unfinished set without a reward and restores walking position", () => {
    expect(useGym.getState().startSession()).toBe(true);
    useGym.getState().lift();
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(1);
    runtime.x = 8;
    useGym.getState().cancelSession();
    expect(useGym.getState().reps).toBe(0);
    expect(useGameMode.getState().active).toBeNull();
    expect([runtime.x, runtime.z]).toEqual([1, 1]);
    expect(useGame.getState().save.coins).toBe(0);
  });

  it("awards only a completed set and only once per day across rematches", () => {
    useGym.getState().startSession();
    finishSet();
    expect(useGym.getState().reps).toBe(8);
    expect(useGym.getState().earned).toBe(15);
    expect(useGame.getState().save.coins).toBe(15);
    useGym.getState().startSession();
    finishSet();
    expect(useGym.getState().earned).toBe(0);
    expect(useGame.getState().save.coins).toBe(15);
    expect(useGameMode.getState().active?.position).toEqual([1, 1]);
  });

  it("keeps the recovery cue aligned with the first accepted follow-up lift", () => {
    useGym.getState().startSession();
    expect(gymRepMotion(useGym.getState().liftedAt).phase).toBe("ready");
    useGym.getState().lift();
    expect(gymRepMotion(useGym.getState().liftedAt).phase).toBe("pressing");
    clock += 899;
    expect(gymRepMotion(useGym.getState().liftedAt).phase).toBe("lowering");
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(1);
    clock += 1;
    expect(gymRepMotion(useGym.getState().liftedAt).phase).toBe("ready");
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(2);
  });

  it("ignores lifts while paused or in another room", () => {
    useGym.getState().startSession();
    useGame.setState({ paused: true });
    useGym.getState().lift();
    useGame.setState({ paused: false, scene: "cognition" });
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(0);
  });

  it("rewards timing and streaks rather than quick repeated presses", () => {
    useGym.getState().startSession();
    perfectLift();
    expect(useGym.getState()).toMatchObject({
      reps: 1,
      judgment: "Perfect",
      points: 200,
      score: 200,
      streak: 1,
    });
    useGym.getState().lift();
    expect(useGym.getState()).toMatchObject({ reps: 1, score: 200, streak: 1 });
    perfectLift();
    expect(useGym.getState()).toMatchObject({
      reps: 2,
      points: 225,
      score: 425,
      streak: 2,
    });
    clock = useGym.getState().readyAt;
    useGym.getState().lift();
    expect(useGym.getState()).toMatchObject({
      reps: 3,
      judgment: "Miss",
      points: 0,
      score: 425,
      streak: 0,
    });
    perfectLift();
    expect(useGym.getState()).toMatchObject({
      reps: 4,
      points: 200,
      score: 625,
      streak: 1,
    });
    expect(useGame.getState().save.coins).toBe(0);
  });

  it("stores a best only after all eight lifts, and keeps it across replay and cancellation", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    useGym.getState().startSession();
    for (let i = 0; i < 7; i++) perfectLift();
    expect(values.has(GYM_BEST_KEY)).toBe(false);
    expect(useGym.getState().best).toBe(0);
    perfectLift();
    expect(useGym.getState()).toMatchObject({
      reps: 8,
      score: 2300,
      best: 2300,
      newBest: true,
    });
    expect(readGymBest()).toBe(2300);
    useGym.getState().startSession();
    expect(useGym.getState()).toMatchObject({
      reps: 0,
      score: 0,
      best: 2300,
      newBest: false,
    });
    useGym.getState().cancelSession();
    expect(readGymBest()).toBe(2300);
  });

  it("freezes the timing target and recovery while paused", () => {
    useGym.getState().startSession();
    clock += 400;
    const before = gymMarker(useGym.getState().readyAt, clock, 0);
    useGame.setState({ paused: true });
    useGym.getState().syncClock();
    clock += 10000;
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(0);
    useGame.setState({ paused: false });
    useGym.getState().syncClock();
    expect(gymMarker(useGym.getState().readyAt, clock, 0)).toBeCloseTo(before);
    perfectLift();
    clock += 200;
    const liftedAt = useGym.getState().liftedAt;
    const progress = gymRepMotion(liftedAt).progress;
    useGame.setState({ paused: true });
    useGym.getState().syncClock();
    clock += 10000;
    useGame.setState({ paused: false });
    useGym.getState().syncClock();
    expect(gymRepMotion(useGym.getState().liftedAt).progress).toBeCloseTo(
      progress,
    );
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(1);
  });

  it("does not replace a newer record from another tab with a stale lower score", () => {
    const values = new Map([[GYM_BEST_KEY, "2000"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    useGym.getState().startSession();
    expect(useGym.getState().best).toBe(0);
    finishSet();
    expect(useGym.getState().score).toBeLessThan(2000);
    expect(useGym.getState()).toMatchObject({ best: 2000, newBest: false });
    expect(readGymBest()).toBe(2000);
  });

  it("still completes and rewards a set when local best storage is blocked", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("blocked");
        },
      },
    });
    expect(readGymBest()).toBe(0);
    useGym.getState().startSession();
    for (let i = 0; i < 8; i++) perfectLift();
    expect(useGym.getState()).toMatchObject({
      reps: 8,
      best: 2300,
      earned: 15,
    });
    expect(useGame.getState().save.coins).toBe(15);
  });
});
