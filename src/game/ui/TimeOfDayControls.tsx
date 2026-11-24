import { useRef } from "react";
import { clockText, TIME_PRESETS, type TimeMode } from "../core/daylight";
import { useTimeOfDay } from "../core/timeOfDay";
import { TIME_ZONE_LABELS } from "../core/worldTime";
import { useGame } from "../core/store";
import "./time-of-day.css";

/** A single native select keeps keyboard/touch access without another HUD panel. */
export function TimeOfDayControls() {
  const pointerSelection = useRef(false);
  const { hour, mode, timeZone, setMode } = useTimeOfDay();
  const visible = useGame(
    (state) =>
      state.scene === "hub" &&
      !state.paused &&
      !state.build &&
      state.panel === "none",
  );
  if (!visible) return null;
  const night = hour < 5 || hour >= 20;
  return (
    <div
      className="time-of-day-control"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {night ? (
          <path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </>
        )}
      </svg>
      <select
        aria-label="Time of day"
        title="Time of day"
        value={mode}
        onPointerDown={() => {
          pointerSelection.current = true;
        }}
        onKeyDown={() => {
          pointerSelection.current = false;
        }}
        onBlur={() => {
          pointerSelection.current = false;
        }}
        onChange={(event) => {
          setMode(event.target.value as TimeMode);
          // Pointer choices return to gameplay. Keyboard users keep native
          // arrow-key browsing and Tab out when finished, like any select.
          if (pointerSelection.current) event.currentTarget.blur();
        }}
      >
        <option value="auto">Auto</option>
        {Object.entries(TIME_PRESETS).map(([value, preset]) => (
          <option key={value} value={value}>
            {preset.label}
          </option>
        ))}
      </select>
      <time aria-label={`${timeZone} time ${clockText(hour)}`} title={timeZone}>
        {clockText(hour)} {TIME_ZONE_LABELS[timeZone]}
      </time>
    </div>
  );
}
