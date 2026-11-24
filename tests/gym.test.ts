import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gymRepMotion, useGym } from "../src/game/scenes/CognitionGym";
import { useGameMode } from "../src/game/core/gameMode";
import { runtime, useGame } from "../src/game/core/store";
import { freshSave } from "../src/shared/save";

let clock = 1000;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  useGameMode.setState({ active: null });
  useGym.setState({ reps: 0, liftedAt: -Infinity, earned: 0 });
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
afterEach(() => vi.restoreAllMocks());

function finishSet() {
  for (let i = 0; i < 8; i++) {
    clock += 900;
    useGym.getState().lift();
  }
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
});
