import { describe, expect, it } from "vitest";
import { announceArrival, clearArrival, useArrival } from "../src/game/core/arrival";

describe("arrival title card", () => {
  it("shows each arrival once and is cleared only by its own card", () => {
    announceArrival("korea");
    const first = useArrival.getState();
    expect(first.world).toBe("korea");
    announceArrival("stanford");
    const second = useArrival.getState();
    expect(second.serial).toBe(first.serial + 1);
    // The first card's end must not clear the second arrival.
    clearArrival(first.serial);
    expect(useArrival.getState().world).toBe("stanford");
    clearArrival(second.serial);
    expect(useArrival.getState().world).toBeNull();
  });
});
