import { afterEach, describe, expect, it, vi } from "vitest";
import { readKitchenTutorialDone, saveKitchenTutorialDone } from "../src/game/scenes/kitchenProgress";

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("Kitchen practice order", () => {
  it("is remembered once finished", () => {
    let stored: string | null = null;
    vi.stubGlobal("localStorage", {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    });
    expect(readKitchenTutorialDone()).toBe(false);
    saveKitchenTutorialDone();
    expect(readKitchenTutorialDone()).toBe(true);
  });
  it("shows again when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveKitchenTutorialDone()).not.toThrow();
    expect(readKitchenTutorialDone()).toBe(false);
  });
});
