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
