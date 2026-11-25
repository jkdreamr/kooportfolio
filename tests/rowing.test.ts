import { describe, expect, it } from "vitest";
import {
  catchBoosted,
  catchReady,
  currentLine,
  newRace,
  newRivals,
  racePlace,
  riverCenter,
  riverCurrent,
  rivalInput,
  stepRace,
  strokeDrive,
  TICK,
  type RaceState,
} from "../src/game/core/rowing";
import {
  readRaceRecord,
  ROWING_RECORDS_KEY,
  saveRaceRecord,
} from "../src/game/core/rowingRecords";

it("never ranks a daily river even when its seed matches Regatta", () => {
});

const drive = (cadence = 30, burst = false, length = 360, seed = 7) => {
  let race = newRace();
  for (let tick = 0; tick < 120 * 60 && !race.finished; tick++) {
    const target = riverCenter(race.distance + 8, seed);
    race = stepRace(
      race,
      {
        cadence,
        burst,
        steer: Math.max(-1, Math.min(1, (target - race.x) * 0.5)),
      },
      length,
      seed,
    );
  }
  return race;
};
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

describe("rowing strokes and race timing", () => {
  it("holds every boat at the start through the countdown", () => {
    let s = newRace();
    for (let i = 0; i < 180; i++)
      s = stepRace(s, { cadence: 36, burst: true, steer: 1 }, 360);
    expect(s.distance).toBe(0);
    expect(s.stamina).toBe(100);
    expect(s.stroke).toBe(0);
  });
  it("accelerates on the drive and glides through recovery", () => {
    const base = { ...newRace(), time: 10, speed: 9, x: riverCenter(0) };
    const input = { cadence: 30, burst: false, steer: 0 };
    expect(strokeDrive(0.19)).toBeGreaterThan(1);
    expect(strokeDrive(0.7)).toBe(0);
    expect(
      stepRace({ ...base, stroke: 0.18 }, input, 360).speed,
    ).toBeGreaterThan(9);
    expect(stepRace({ ...base, stroke: 0.7 }, input, 360).speed).toBeLessThan(
      9,
    );
  });
  it("boosts only the next drive when the player catches in the green", () => {
    const base = { ...newRace(), time: 10, speed: 9, stroke: 0.9 };
    const input = { cadence: 30, burst: false, steer: 0 };
    const early = { ...base, stroke: 0.6 };
    expect(catchReady(early)).toBe(false);
    expect(stepRace(early, { ...input, catchPressed: true }, 360)).toEqual(
      stepRace(early, input, 360),
    );
    expect(catchReady(base)).toBe(true);
    let caught = stepRace(base, { ...input, catchPressed: true }, 360);
    let normal = stepRace(base, input, 360);
    expect(caught.boostedStroke).toBe(base.strokes + 1);
    expect(catchBoosted(caught)).toBe(true);
    expect(catchReady(caught)).toBe(false);
    expect(caught.speed).toBe(normal.speed);
    while (caught.stroke > 0.1) {
      caught = stepRace(caught, { ...input, catchPressed: true }, 360);
      normal = stepRace(normal, input, 360);
    }
    expect(caught.boostedStroke).toBe(caught.strokes);
    expect(caught.speed).toBeGreaterThan(normal.speed);
    expect(caught.stamina).toBe(normal.stamina);
    expect(catchBoosted({ ...caught, stroke: 0.4 })).toBe(false);
    expect(catchReady({ ...caught, stroke: 0.9 })).toBe(true);
  });
  it("closes the catch window at stroke rollover", () => {
    const before = { ...newRace(), time: 10, stroke: 0.999, strokes: 3 };
    const input = { cadence: 36, burst: false, steer: 0 };
    const pressed = { ...input, catchPressed: true };
    expect(catchReady(before)).toBe(true);
    expect(stepRace(before, pressed, 360).boostedStroke).toBe(4);
    const after = stepRace(before, input, 360);
    expect(after.strokes).toBe(4);
    expect(catchReady(after)).toBe(false);
    expect(stepRace(after, pressed, 360).boostedStroke).toBeNull();
  });
  it("makes cadence and sprinting a tradeoff rather than free speed", () => {
    const settle = drive(24),
      rhythm = drive(),
      push = drive(36),
      burst = drive(30, true);
    for (const s of [settle, rhythm, push, burst])
      expect(s.finished).toBe(true);
    expect(push.time).toBeLessThan(rhythm.time);
    expect(settle.time).toBeGreaterThan(rhythm.time);
    expect(push.stamina).toBeLessThan(rhythm.stamina);
    expect(burst.stamina).toBeLessThan(rhythm.stamina);
    // A short sprint is faster; holding it for the whole race exhausts the crew.
    expect(drive(30, true, 80).time).toBeLessThan(drive(30, false, 80).time);
    expect(burst.time).toBeGreaterThan(rhythm.time);
  });
  it("aligns the visible fast-water line with the simulated current", () => {
    for (const seed of [1, 2, 30])
      for (const distance of [0, 85, 330, 700]) {
        const x = currentLine(distance, seed);
        expect(riverCurrent(distance, x, seed)).toBeGreaterThan(
          riverCurrent(distance, x + 5, seed),
        );
      }
    expect(currentLine(200, 1)).not.toBe(currentLine(200, 2));
  });
  it("interpolates split and finish crossings within the fixed step", () => {
    const start = {
      ...newRace(),
      time: 35,
      distance: 359.99,
      speed: 12,
      splits: [11, 21, 31],
    };
    const finished = stepRace(
      start,
      { cadence: 30, steer: 0, burst: false },
      360,
    );
    expect(finished.time).toBeGreaterThan(35);
    expect(finished.time).toBeLessThan(35 + TICK);
    const split = stepRace(
      { ...start, distance: 99.99, splits: [] },
      { cadence: 30, steer: 0, burst: false },
      360,
    );
    expect(split.splits[0]).toBeLessThan(35 + TICK);
    expect(
      stepRace(finished, { cadence: 36, steer: 1, burst: true }, 360),
    ).toBe(finished);
  });
  it("uses finish time, not frozen distance, for the final placing", () => {
    const player = { ...newRace(), distance: 360, finished: true, time: 40 };
    const rivals = [38, 41, 42].map((time) => ({ ...player, time }));
    expect(racePlace(player, rivals)).toBe(2);
    expect(
      racePlace({ ...player, finished: false, distance: 359 }, rivals),
    ).toBe(4);
  });
});

describe("rival crews", () => {
  it.each([1, 2, 971])(
    "finishes seeded course %s without scripted distance or bank clipping",
    (seed) => {
      let rivals = newRivals();
      for (
        let tick = 0;
        tick < 110 * 60 && !rivals.every((r) => r.finished);
        tick++
      ) {
        rivals = rivals.map((r, i) =>
          stepRace(r, rivalInput(r, i, 750, seed), 750, seed),
        );
        for (const r of rivals)
          expect(
            Math.abs(r.x - riverCenter(r.distance, seed)),
          ).toBeLessThanOrEqual(11);
      }
      expect(rivals.every((r) => r.finished && r.splits.length === 7)).toBe(
        true,
      );
      expect(new Set(rivals.map((r) => r.time)).size).toBe(3);
    },
  );
});

describe("local rowing records", () => {
  const finish = (time: number): RaceState => ({
    ...newRace(),
    finished: true,
    distance: 360,
    time,
    splits: [10, 20, 30],
    strokes: 20,
  });
  it("keeps the fastest result for each length and river seed", () => {
    const s = storage();
    expect(saveRaceRecord(finish(40), 360, 1, s)).toBe(true);
    expect(saveRaceRecord(finish(42), 360, 1, s)).toBe(false);
    expect(saveRaceRecord(finish(38), 360, 1, s)).toBe(true);
    expect(readRaceRecord(360, 1, s)?.time).toBe(38);
    expect(readRaceRecord(360, 2, s)).toBeNull();
    expect(readRaceRecord(750, 1, s)).toBeNull();
    expect(saveRaceRecord(newRace(), 360, 1, s)).toBe(false);
  });
  it("preserves a corrupt file and handles unavailable storage", () => {
    const s = storage();
    s.setItem(ROWING_RECORDS_KEY, "broken");
    expect(readRaceRecord(360, 1, s)).toBeNull();
    expect(saveRaceRecord(finish(40), 360, 1, s)).toBe(false);
    expect(s.getItem(ROWING_RECORDS_KEY)).toBe("broken");
    const unavailable = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(saveRaceRecord(finish(40), 360, 1, unavailable)).toBe(false);
  });
  it("uses a returning player's faster sprint record without mixing courses", () => {
    const s = storage();
    expect(readRaceRecord(360, 1, s, 32)).toEqual({
      time: 32,
      splits: [],
      strokes: 0,
    });
    saveRaceRecord(finish(40), 360, 1, s);
    expect(readRaceRecord(360, 1, s, 32)?.time).toBe(32);
    expect(readRaceRecord(360, 1, s, 45)?.time).toBe(40);
    expect(readRaceRecord(360, 2, s, 32)).toBeNull();
    expect(readRaceRecord(750, 1, s, 32)).toBeNull();
  });
});
