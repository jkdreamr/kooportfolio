import { describe, expect, it } from "vitest";
import { closeListen, openListen, useListen } from "../src/game/ui/ListenPanel";

describe("listen panel state", () => {
  it("opens on a chosen tab and closes", () => {
    expect(useListen.getState().open).toBe(false);
    openListen("youtube");
    expect(useListen.getState()).toMatchObject({ open: true, tab: "youtube" });
    closeListen();
    expect(useListen.getState().open).toBe(false);
    openListen();
    expect(useListen.getState().tab).toBe("soundcloud");
    closeListen();
  });
});

describe("listen player states", () => {
  it("shows the frame only once the host has answered, never when it failed", async () => {
    const { showsFrame } = await import("../src/game/ui/ListenPanel");
    expect(showsFrame("checking")).toBe(false);
    expect(showsFrame("failed")).toBe(false);
    expect(showsFrame("loading")).toBe(true);
    expect(showsFrame("slow")).toBe(true);
    expect(showsFrame("ready")).toBe(true);
  });
});
