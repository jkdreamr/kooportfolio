import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO_SPOTS } from "../src/game/core/heroSpots";

// B14: the first landing uses HERO_SPOTS when the save has no position of its own.
const storage = (entries: Record<string, string>) => ({
  getItem: (k: string) => entries[k] ?? null,
  setItem: (k: string, v: string) => void (entries[k] = v),
  removeItem: (k: string) => void delete entries[k],
});
const save = (position: [number, number], world = "home") =>
  JSON.stringify({ version: 1, revision: 1, position, world, color: "#6f8670", hat: true, memories: [] });

describe("first landing (B14)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it("a first visit stands on the home hero spot, facing its heading", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", storage({}));
    const { runtime, useGame } = await import("../src/game/core/store");
    expect([runtime.x, runtime.z]).toEqual(HERO_SPOTS.home.position);
    expect(runtime.heading).toBe(HERO_SPOTS.home.heading);
    expect(useGame.getState().save.position).toEqual(HERO_SPOTS.home.position);
  });
  it("a save with its own walkable position keeps it", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", storage({ "joshua-exe-save-v1": save([0, 5]) }));
    const { runtime } = await import("../src/game/core/store");
    expect([runtime.x, runtime.z]).toEqual([0, 5]);
    expect(runtime.heading).toBe(0);
  });
  it("an unwalkable saved spot falls back to that world's hero spot", async () => {
    vi.resetModules();
    const { canWalk, doorsInWorld } = await import("../src/game/core/world");
    // The middle of a building's footprint: within the save's bounds, never walkable.
    const blocked = doorsInWorld("home")
      .map((door) => [door.footprint[0], door.footprint[1]] as [number, number])
      .find(([x, z]) => !canWalk(x, z, "home"))!;
    expect(blocked).toBeDefined();
    vi.resetModules();
    vi.stubGlobal("localStorage", storage({ "joshua-exe-save-v1": save(blocked) }));
    const { runtime } = await import("../src/game/core/store");
    expect([runtime.x, runtime.z]).toEqual(HERO_SPOTS.home.position);
  });
});
