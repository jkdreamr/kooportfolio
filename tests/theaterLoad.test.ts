import { describe, expect, it } from "vitest";
import { loadTheaterProgram, warmTheaterProgram } from "../src/game/core/theaterProgram";
import { KOREA_THEATER_PROGRAM, THEATER_PROGRAM } from "../src/game/core/theater/catalogue";

describe("theatre catalogue on demand (D9)", () => {
  it("loads each cinema's programme from the lazy chunk", async () => {
    expect(await loadTheaterProgram("home")).toBe(THEATER_PROGRAM);
    expect(await loadTheaterProgram("korea")).toBe(KOREA_THEATER_PROGRAM);
  });
  it("warms once and reuses the download", () => {
    expect(warmTheaterProgram()).toBe(warmTheaterProgram());
  });
});
