import { beforeEach, describe, expect, it } from "vitest";
import {
  endGameMode,
  escapeGameMode,
  startGameMode,
  useGameMode,
} from "../src/game/core/gameMode";
import { keys, touch } from "../src/game/core/input";
import { runtime, useGame } from "../src/game/core/store";

beforeEach(() => {
  useGameMode.setState({ active: null });
  useGame.setState({
    scene: "kappa",
    panel: "none",
    paused: false,
    traveling: false,
  });
  runtime.x = 4;
  runtime.z = 7;
  runtime.heading = 0.8;
});

describe("optional immersive games", () => {
  it("does not start on room entry and rejects a different room's game", () => {
    expect(useGameMode.getState().active).toBeNull();
    expect(startGameMode("badminton")).toBe(false);
    useGame.setState({ paused: true });
    expect(startGameMode("pong")).toBe(false);
  });
  it("clears held inputs and restores the original position after a rematch", () => {
    keys.add("w");
    touch.z = 1;
    runtime.target = [0, 18.3];
    runtime.path = [[0, 10]];
    expect(startGameMode("pong")).toBe(true);
    expect(keys.size).toBe(0);
    expect(touch.z).toBe(0);
    expect(runtime.target).toBeNull();
    expect(runtime.path).toEqual([]);
    runtime.x = 9;
    runtime.z = -3;
    runtime.heading = 2;
    expect(startGameMode("pong")).toBe(true);
    expect(startGameMode("blackjack")).toBe(false);
    endGameMode();
    expect([runtime.x, runtime.z, runtime.heading]).toEqual([4, 7, 0.8]);
    expect(useGameMode.getState().active).toBeNull();
  });
  it("does not restore an old room's position over a new scene spawn", () => {
    startGameMode("blackjack");
    useGame.setState({ scene: "hub" });
    runtime.x = -18;
    runtime.z = -9;
    endGameMode();
    expect([runtime.x, runtime.z]).toEqual([-18, -9]);
  });
  it("preserves the active round and saved pose when Escape resumes a paused game", () => {
    startGameMode("pong");
    runtime.x = 9;
    useGame.setState({ paused: true });
    expect(escapeGameMode()).toBe(false);
    expect(useGameMode.getState().active?.id).toBe("pong");
    expect(runtime.x).toBe(9);
    useGame.setState({ paused: false });
    expect(escapeGameMode()).toBe(true);
    expect(useGameMode.getState().active).toBeNull();
    expect([runtime.x, runtime.z, runtime.heading]).toEqual([4, 7, 0.8]);
  });
  it("does not close a game behind an open settings panel", () => {
    startGameMode("pong");
    useGame.setState({ panel: "help" });
    expect(escapeGameMode()).toBe(false);
    expect(useGameMode.getState().active?.id).toBe("pong");
  });
});
