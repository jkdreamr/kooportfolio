import { describe, expect, it } from "vitest";
import { launchersFor, registerLauncher } from "../src/game/core/launchers";
import { isCue } from "../src/game/core/audio/cues";
import { FLIGHT_OBSTACLES, HERO_SPOTS } from "../src/game/core/heroSpots";
import { OWNER_LINKS } from "../src/content/links";
import { WORLD_IDS } from "../src/shared/worlds";

describe("phase-0 contracts", () => {
  it("registers and unregisters launchers per scene", () => {
    const off = registerLauncher({ scene: "hub", id: "a", label: "A", start: () => {} });
    expect(launchersFor("hub").map((l) => l.id)).toEqual(["a"]);
    const before = launchersFor("hub");
    expect(launchersFor("hub")).toBe(before);
    off();
    expect(launchersFor("hub")).toEqual([]);
  });
  it("knows its cue names", () => {
    expect(isCue("tear")).toBe(true);
    expect(isCue("nope")).toBe(false);
  });
  it("has a hero spot and obstacle list for every world", () => {
    for (const w of WORLD_IDS) {
      expect(HERO_SPOTS[w].position).toHaveLength(2);
      expect(Array.isArray(FLIGHT_OBSTACLES[w])).toBe(true);
    }
  });
  it("lists only https owner links with unique ids", () => {
    expect(OWNER_LINKS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(OWNER_LINKS.map((l) => l.id)).size).toBe(OWNER_LINKS.length);
    for (const l of OWNER_LINKS) expect(l.url.startsWith("https://")).toBe(true);
  });
});
