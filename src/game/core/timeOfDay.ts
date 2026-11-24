import { create } from "zustand";
import type { TimeMode } from "./daylight";

const now = new Date();
export const daylightClock = { hour: now.getHours() + now.getMinutes() / 60 };

export const useTimeOfDay = create<{
  hour: number;
  mode: TimeMode;
  setMode: (mode: TimeMode) => void;
}>((set) => ({
  hour: daylightClock.hour,
  mode: "auto",
  setMode: (mode) => set({ mode }),
}));
