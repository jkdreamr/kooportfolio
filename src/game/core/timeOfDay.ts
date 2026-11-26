import { create } from "zustand";
import { wrapHour, type TimeMode } from "./daylight";
import {
  readWorldHour,
  WORLD_TIME_ZONES,
  type WorldTimeZone,
} from "./worldTime";

const initialTimeZone = WORLD_TIME_ZONES.pacific;

/** The warm late-afternoon light a first visit opens on (the reference's
 * long, low sun). */
export const FIRST_VISIT_HOUR = 16.6;
const SAVE_KEY = "joshua-exe-save-v1";
const ANCHOR_KEY = "joshua-exe-auto-anchor";

function storage(kind: "localStorage" | "sessionStorage") {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}
/**
 * Auto follows each world's civil time. A first-time visitor (no save yet)
 * instead gets a session anchor: Auto runs at real speed from late afternoon,
 * shifted by the same offset in every timezone, so the worlds keep their
 * relative times. The anchor lives for the browser session (a reload keeps
 * it); returning visitors see real local time, exactly as before.
 */
function readAnchor(): number {
  const session = storage("sessionStorage");
  try {
    const kept = session?.getItem(ANCHOR_KEY);
    if (kept !== null && kept !== undefined && Number.isFinite(Number(kept)))
      return Number(kept);
    if (storage("localStorage")?.getItem(SAVE_KEY)) return 0;
  } catch {
    return 0;
  }
  if (!session) return 0;
  const offset = wrapHour(FIRST_VISIT_HOUR - readWorldHour(initialTimeZone));
  try {
    session.setItem(ANCHOR_KEY, String(offset));
  } catch {
    // Private mode: the anchor still applies to this page load.
  }
  return offset;
}
let autoOffset = readAnchor();

/** The hour Auto shows in `timeZone` right now (civil time + any anchor). */
export function autoHour(timeZone: WorldTimeZone, now = new Date()) {
  return wrapHour(readWorldHour(timeZone, now) + autoOffset);
}
/** Tests / settings: drop the first-visit anchor (Auto = civil time). */
export function clearAutoAnchor() {
  autoOffset = 0;
  try {
    storage("sessionStorage")?.removeItem(ANCHOR_KEY);
  } catch {
    // ignore
  }
}

export const daylightClock = { hour: autoHour(initialTimeZone) };

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
