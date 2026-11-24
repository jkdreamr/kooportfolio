import { create } from "zustand";
import type { TimeMode } from "./daylight";
import {
  readWorldHour,
  WORLD_TIME_ZONES,
  type WorldTimeZone,
} from "./worldTime";

const initialTimeZone = WORLD_TIME_ZONES.pacific;
export const daylightClock = { hour: readWorldHour(initialTimeZone) };

function regionalClock(timeZone: WorldTimeZone) {
  daylightClock.hour = readWorldHour(timeZone);
  return { hour: daylightClock.hour };
}

export const useTimeOfDay = create<{
  hour: number;
  mode: TimeMode;
  timeZone: WorldTimeZone;
  setMode: (mode: TimeMode) => void;
  setTimeZone: (timeZone: WorldTimeZone) => void;
}>((set, get) => ({
  hour: daylightClock.hour,
  mode: "auto",
  timeZone: initialTimeZone,
  setMode: (mode) =>
    set({
      mode,
      ...(mode === "auto" ? regionalClock(get().timeZone) : {}),
    }),
  // Travel owns the destination; daylight never guesses from mutable map bounds.
  setTimeZone: (timeZone) => {
    if (timeZone === get().timeZone) return;
    set({
      timeZone,
      ...(get().mode === "auto" ? regionalClock(timeZone) : {}),
    });
  },
}));
