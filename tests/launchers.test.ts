import { describe, expect, it } from "vitest";
import { launcherHosted, launchersFor, registerLauncher } from "../src/game/core/launchers";

describe("launcher registry (D6)", () => {
  it("keeps registration order per scene and replaces a launcher with the same id", () => {
    const offA = registerLauncher({ scene: "kappa", id: "blackjack", label: "Play Blackjack", start: () => {} });
    const offB = registerLauncher({ scene: "kappa", id: "pong", label: "Play Pong", start: () => {} });
    expect(launchersFor("kappa").map((l) => l.label)).toEqual(["Play Blackjack", "Play Pong"]);
    const offA2 = registerLauncher({ scene: "kappa", id: "blackjack", label: "Play Blackjack", start: () => {}, hint: "Enter" });
    expect(launchersFor("kappa").map((l) => l.id)).toEqual(["pong", "blackjack"]);
    // A stale unregister (the replaced entry) does not remove the new one.
    offA();
    expect(launchersFor("kappa")).toHaveLength(2);
    offA2();
    offB();
    expect(launchersFor("kappa")).toEqual([]);
  });
  it("runs the registered start", () => {
    let started = 0;
    const off = registerLauncher({ scene: "go", id: "go", label: "Play Go", start: () => started++ });
    launchersFor("go")[0].start();
    expect(started).toBe(1);
    off();
  });
  it("reports a scene as unhosted until a header renders its launchers", () => {
    expect(launcherHosted("office")).toBe(false);
  });
});
