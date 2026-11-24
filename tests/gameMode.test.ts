import { beforeEach, describe, expect, it } from "vitest";
import {
  endGameMode,
  escapeGameMode,
  startGameMode,
  useGameMode,
} from "../src/game/core/gameMode";
import { keys, touch } from "../src/game/core/input";
import { runtime, useGame, walkTo } from "../src/game/core/store";
import { SKATE_EXIT } from "../src/game/core/skate";
import { PHOTO_BOOTH_ENTRY, PHOTO_BOOTH_ORIGIN } from "../src/game/core/photoBoothLayout";
import { canWalk, moveWorld } from "../src/game/core/world";

beforeEach(() => {
  useGameMode.setState({ active: null });
  useGame.setState({
    scene: "kappa",
    world: "home",
    panel: "none",
    paused: false,
    traveling: false,
  });
  runtime.x = 4;
  runtime.z = 7;
  runtime.heading = 0.8;
});

describe("optional immersive games", () => {
  it("opens the photo booth only near its entrance in Korea and restores the return pose", () => {
    useGame.setState({ scene: "hub", world: "korea" });
    expect(startGameMode("photo-booth")).toBe(false);
    [runtime.x, runtime.z] = PHOTO_BOOTH_ENTRY;
    useGame.setState({ world: "home" });
    expect(startGameMode("photo-booth")).toBe(false);
    useGame.setState({ world: "korea" });
    expect(startGameMode("photo-booth")).toBe(true);
    runtime.z += 0.8;
    endGameMode();
    expect([runtime.x, runtime.z]).toEqual(PHOTO_BOOTH_ENTRY);
    expect(runtime.heading).toBe(0.8);
  });

  it("allows walking through the front opening but not through the booth walls", () => {
    const [x, , z] = PHOTO_BOOTH_ORIGIN;
    const inside = moveWorld(x, PHOTO_BOOTH_ENTRY[1], 0, -1.5, "korea");
    expect(inside[0]).toBe(x);
    expect(inside[1]).toBeCloseTo(z + 0.25);
    expect(canWalk(x + 1.5, z, "korea")).toBe(false);
    expect(canWalk(x + 1.04, z + 1.3, "korea")).toBe(false);
    expect(canWalk(x, z - 1.3, "korea")).toBe(false);
  });
  it.each([0, 23, 25])("routes the skate walker from z=%s to its own physical gate", (z) => {
    useGame.setState({ scene: "skate" });
    runtime.z = z;
    walkTo(...SKATE_EXIT);
    expect(runtime.target).toEqual(SKATE_EXIT);
    expect(runtime.target![1]).toBeGreaterThan(23);
    expect(runtime.path).toEqual([]);
  });
  it("does not start on room entry and rejects a different room's game", () => {
    expect(useGameMode.getState().active).toBeNull();
    expect(startGameMode("badminton")).toBe(false);
    useGame.setState({ paused: true });
    expect(startGameMode("pong")).toBe(false);
  });
  it("only starts paper toss in the Study and returns to the saved walking pose", () => {
    expect(startGameMode("paper-toss")).toBe(false);
    useGame.setState({ scene: "office" });
    expect(useGameMode.getState().active).toBeNull();
    expect(startGameMode("paper-toss")).toBe(true);
    expect(useGameMode.getState().active?.id).toBe("paper-toss");
    runtime.x = 9;
    expect(escapeGameMode()).toBe(true);
    expect([runtime.x, runtime.z, runtime.heading]).toEqual([4, 7, 0.8]);
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
    // Holding the resume key is not a second deliberate press to leave.
    expect(escapeGameMode(true)).toBe(false);
    expect(useGameMode.getState().active?.id).toBe("pong");
    expect(runtime.x).toBe(9);
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
