import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readKitchenDay,
  saveKitchenDay,
} from "../src/game/scenes/kitchenProgress";

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("Kitchen day progress", () => {
  it("keeps the highest earned day across a new room session", () => {
    let stored: string | null = null;
    vi.stubGlobal("localStorage", {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    });
    expect(readKitchenDay()).toBe(1);
    saveKitchenDay(4);
    saveKitchenDay(2);
    expect(readKitchenDay()).toBe(4);
  });
  it.each(["0", "-2", "1.5", "Infinity", "broken", "99999999999999999999999"])(
    "ignores invalid saved day %s",
    (value) => {
      vi.stubGlobal("localStorage", { getItem: () => value });
      expect(readKitchenDay()).toBe(1);
    },
  );
  it("does not break play if browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readKitchenDay()).toBe(1);
    expect(() => saveKitchenDay(2)).not.toThrow();
  });
});
