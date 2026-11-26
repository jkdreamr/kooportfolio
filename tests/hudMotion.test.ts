import { describe, expect, it } from "vitest";
import { glassModeFor } from "../src/game/ui/hudStage";
import { MOTION } from "../src/game/ui/motion";
import { TIER_BUDGETS } from "../src/stage/contract";

describe("HUD motion and glass budget", () => {
  it("frosts eight panes only on a roomy high-tier screen", () => {
    expect(glassModeFor("high", false)).toBe("full");
    expect(glassModeFor("high", true)).toBe("lite");
    expect(glassModeFor("medium", false)).toBe("lite");
    expect(glassModeFor("low", false)).toBe("none");
    expect(glassModeFor("low", true)).toBe("none");
    // Lite is the two-pane budget the contract gives phones/medium.
    expect(TIER_BUDGETS.medium.backdropPanes).toBe(2);
  });

  it("settles the staggered reveal in one beat after the last step", () => {
    // wordmark, capsule +80, dock +160, zoom/time +240, prompt +320
    expect(MOTION.revealStagger * 4).toBe(320);
    expect(MOTION.revealTotal).toBe(MOTION.reveal + 320);
    expect(MOTION.reveal).toBe(420);
  });
});
