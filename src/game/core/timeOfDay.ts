import { create } from "zustand";
import type { TimeMode } from "./daylight";
import {
  readWorldHour,
  WORLD_TIME_ZONES,
  type WorldTimeZone,
} from "./worldTime";

const initialTimeZone = WORLD_TIME_ZONES.pacific;
export const daylightClock = { hour: readWorldHour(initialTimeZone) };

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
  // Mode and timezone changes never snap the displayed hour: advanceHour
  // glides daylightClock toward the new target over a few seconds.
  setMode: (mode) => set({ mode }),
  // Travel owns the destination; daylight never guesses from mutable map bounds.
  setTimeZone: (timeZone) => {
    if (timeZone === get().timeZone) return;
    set({ timeZone });
  },
}));
