import { afterEach, describe, expect, it, vi } from "vitest";

describe("live audio bindings", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("ducks music and ambience while an external player holds the stage", async () => {
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { hidden: false, addEventListener: () => {} });
    vi.resetModules();
    const live = await import("../src/game/core/audio/live");
    const duck = vi.spyOn(live.audio, "holdDuck");
    win.dispatchEvent(new CustomEvent("stage-audio-hold", { detail: { source: "listen", on: true } }));
    expect(duck).toHaveBeenCalledWith("ambience", live.HOLD_DUCK.ambience);
    expect(duck).toHaveBeenCalledWith("music", live.HOLD_DUCK.music);
    duck.mockClear();
    win.dispatchEvent(new CustomEvent("stage-audio-hold", { detail: { source: "listen", on: false } }));
    expect(duck).toHaveBeenCalledWith("ambience", 0);
    // Nonsense events change nothing.
    duck.mockClear();
    win.dispatchEvent(new CustomEvent("stage-audio-hold", { detail: { on: true } }));
    expect(duck).not.toHaveBeenCalled();
  });
});
