import type { RaceState } from "./rowing";

export const ROWING_RECORDS_KEY = "joshua-exe-rowing-records-v1";
export type RaceRecord = { time: number; splits: number[]; strokes: number };
type Records = Record<string, RaceRecord>;
type RecordStorage = Pick<Storage, "getItem" | "setItem">;
const keyFor = (length: number, seed: number) => `${length}:${seed}`;
const validTime = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1e5;

function read(storage: RecordStorage): Records | null {
  const raw = storage.getItem(ROWING_RECORDS_KEY);
  if (!raw) return {};
  const records = JSON.parse(raw) as Records;
  if (!records || typeof records !== "object" || Array.isArray(records))
    return null;
  for (const [key, record] of Object.entries(records)) {
    if (
      !/^\d+:\d+$/.test(key) ||
      !record ||
      !validTime(record.time) ||
      !Number.isSafeInteger(record.strokes) ||
      record.strokes < 0 ||
      !Array.isArray(record.splits) ||
      !record.splits.every(
        (time, i, splits) =>
          validTime(time) &&
          time < record.time &&
          (i === 0 || time > splits[i - 1]),
      )
    )
      return null;
  }
  return records;
}

export function readRaceRecord(
  length: number,
  seed: number,
  storage?: RecordStorage,
): RaceRecord | null {
  try {
    return read(storage ?? localStorage)?.[keyFor(length, seed)] ?? null;
  } catch {
    return null;
  }
}

export function saveRaceRecord(
  race: RaceState,
  length: number,
  seed: number,
  storage?: RecordStorage,
) {
  if (!race.finished || race.distance !== length || !validTime(race.time))
    return false;
  try {
    const target = storage ?? localStorage;
    const records = read(target);
    // Never overwrite an unrecognized or corrupt saved file.
    if (!records) return false;
    const key = keyFor(length, seed);
    if (records[key] && records[key].time <= race.time) return false;
    delete records[key];
    records[key] = {
      time: race.time,
      splits: [...race.splits],
      strokes: race.strokes,
    };
    target.setItem(
      ROWING_RECORDS_KEY,
      JSON.stringify(Object.fromEntries(Object.entries(records).slice(-64))),
    );
    return true;
  } catch {
    return false;
  }
}
