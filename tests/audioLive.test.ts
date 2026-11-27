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

  it("unlocks on pointerup, click and the tear cue, in the bubble phase too", async () => {
    const win = new EventTarget();
    const added: { type: string; capture: boolean }[] = [];
    const add = win.addEventListener.bind(win);
    win.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions | boolean) => {
      added.push({ type, capture: typeof opts === "object" ? !!opts.capture : !!opts });
      add(type, fn, opts);
    }) as typeof win.addEventListener;
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { hidden: false, addEventListener: () => {} });
    vi.resetModules();
    const live = await import("../src/game/core/audio/live");
    for (const type of ["pointerdown", "pointerup", "click", "keydown", "touchend"]) {
      expect(added).toContainEqual({ type, capture: true });
      expect(added).toContainEqual({ type, capture: false });
    }
    const unlock = vi.spyOn(live.audio, "unlock");
    win.dispatchEvent(new CustomEvent("stage-cue", { detail: { name: "flight" } }));
    expect(unlock).not.toHaveBeenCalled();
    win.dispatchEvent(new CustomEvent("stage-cue", { detail: { name: "tear" } }));
    expect(unlock).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("click"));
    expect(unlock).toHaveBeenCalledTimes(3);
  });
});
