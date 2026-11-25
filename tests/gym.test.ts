import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gymRepMotion, useGym } from "../src/game/scenes/CognitionGym";
import { useGameMode } from "../src/game/core/gameMode";
import { runtime, useGame } from "../src/game/core/store";
import { freshSave } from "../src/shared/save";
import { gymMarker, gymTarget } from "../src/game/scenes/gymGame";

let clock = 1000;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  useGameMode.setState({ active: null });
  useGym.setState({
    reps: 0,
    liftedAt: -Infinity,
    readyAt: 0,
    pausedAt: null,
    strike: 0,
    judgment: "",
  });
  useGame.setState({
    scene: "gym",
    paused: false,
    panel: "none",
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
  });

  it("completes a set after eight lifts and can replay it", () => {
    useGym.getState().startSession();
    finishSet();
    expect(useGym.getState().reps).toBe(8);
    useGym.getState().startSession();
    finishSet();
    expect(useGym.getState().reps).toBe(8);
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

  it("rewards timing rather than quick repeated presses", () => {
    useGym.getState().startSession();
    perfectLift();
    expect(useGym.getState()).toMatchObject({ reps: 1, judgment: "Perfect" });
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(1);
    perfectLift();
    expect(useGym.getState().reps).toBe(2);
    clock = useGym.getState().readyAt;
    useGym.getState().lift();
    expect(useGym.getState()).toMatchObject({ reps: 3, judgment: "Miss" });
    perfectLift();
    expect(useGym.getState().reps).toBe(4);
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

  it("freezes a visible tab when its window loses focus", () => {
    let focused = true;
    vi.stubGlobal("document", { hidden: false, hasFocus: () => focused });
    useGym.getState().startSession();
    clock += 400;
    const before = gymMarker(useGym.getState().readyAt, clock, 0);
    focused = false;
    useGym.getState().syncClock();
    clock += 8000;
    useGym.getState().lift();
    expect(useGym.getState().reps).toBe(0);
    focused = true;
    useGym.getState().syncClock();
    expect(gymMarker(useGym.getState().readyAt, clock, 0)).toBeCloseTo(before);
    perfectLift();
    expect(useGym.getState()).toMatchObject({ reps: 1, judgment: "Perfect" });
  });

});
