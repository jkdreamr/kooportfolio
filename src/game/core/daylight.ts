export const TIME_PRESETS = {
  dawn: { hour: 5.5, label: "Dawn" },
  sunrise: { hour: 6.5, label: "Sunrise" },
  day: { hour: 12, label: "Day" },
  sunset: { hour: 18, label: "Sunset" },
  night: { hour: 23, label: "Night" },
} as const;
export type TimeMode = "auto" | keyof typeof TIME_PRESETS;

export function wrapHour(hour: number) {
  return ((hour % 24) + 24) % 24;
}

/** Auto follows regional civil time; fixed presets ease along the shortest arc. */
export function advanceHour(
  hour: number,
  seconds: number,
  mode: TimeMode,
  automaticHour = hour,
) {
  const dt = Math.min(Math.max(seconds, 0), 0.1);
  if (mode === "auto") return dt > 0 ? wrapHour(automaticHour) : hour;
  const distance = wrapHour(TIME_PRESETS[mode].hour - hour + 12) - 12;
  if (Math.abs(distance) < 0.0001 && dt > 0) return TIME_PRESETS[mode].hour;
  return wrapHour(hour + distance * (1 - Math.exp(-dt * 2.5)));
}

export function clockText(hour: number) {
  const minutes = Math.floor(wrapHour(hour) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export const DAYLIGHT_KEYS = [
  // Moonlight stays bright enough to navigate and play the outdoor games.
  {
    hour: 0,
    top: "#101e40",
    horizon: "#34456c",
    sun: "#b6ccff",
    sky: "#94b4ef",
    ground: "#303b55",
    key: 0.9,
    hemi: 0.85,
    ambient: 0.26,
    fill: 0.3,
    night: 1,
  },
  {
    hour: 4.5,
    top: "#202d52",
    horizon: "#696382",
    sun: "#bfcafa",
    sky: "#a0b2e0",
    ground: "#4e4760",
    key: 0.85,
    hemi: 0.85,
    ambient: 0.25,
    fill: 0.3,
    night: 0.75,
  },
  {
    hour: 5.5,
    top: "#626995",
    horizon: "#d9a29d",
    sun: "#f4b898",
    sky: "#c4c3e4",
    ground: "#66545a",
    key: 1.35,
    hemi: 0.95,
    ambient: 0.22,
    fill: 0.4,
    night: 0.25,
  },
  {
    hour: 6.5,
    top: "#a5bfce",
    horizon: "#f3c99d",
    sun: "#ffd0a0",
    sky: "#d5d7ec",
    ground: "#6c6546",
    key: 2.6,
    hemi: 1.05,
    ambient: 0.2,
    fill: 0.55,
    night: 0,
  },
  {
    hour: 9,
    top: "#aacdda",
    horizon: "#dce5c7",
    sun: "#fff0cc",
    sky: "#dceaff",
    ground: "#465638",
    key: 3.1,
    hemi: 0.95,
    ambient: 0.16,
    fill: 0.8,
    night: 0,
  },
  {
    hour: 12,
    top: "#a7cbd7",
    horizon: "#dce5c7",
    sun: "#fff0cc",
    sky: "#dceaff",
    ground: "#465638",
    key: 3.1,
    hemi: 0.95,
    ambient: 0.16,
    fill: 0.8,
    night: 0,
  },
  {
    hour: 16,
    top: "#a4bbc9",
    horizon: "#e8d4ae",
    sun: "#ffddaf",
    sky: "#d3dced",
    ground: "#665b3b",
    key: 2.8,
    hemi: 0.95,
    ambient: 0.18,
    fill: 0.6,
    night: 0,
  },
  {
    hour: 18,
    top: "#787799",
    horizon: "#e9ab85",
    sun: "#ffb477",
    sky: "#c6b5d1",
    ground: "#634850",
    key: 2.1,
    hemi: 1,
    ambient: 0.22,
    fill: 0.4,
    night: 0.1,
  },
  {
    hour: 19.5,
    top: "#303c65",
    horizon: "#9b8098",
    sun: "#bfcafa",
    sky: "#a0b2e0",
    ground: "#48455e",
    key: 1,
    hemi: 0.85,
    ambient: 0.26,
    fill: 0.3,
    night: 0.65,
  },
  {
    hour: 21,
    top: "#101e40",
    horizon: "#34456c",
    sun: "#b6ccff",
    sky: "#94b4ef",
    ground: "#303b55",
    key: 0.9,
    hemi: 0.85,
    ambient: 0.26,
    fill: 0.3,
    night: 1,
  },
  {
    hour: 24,
    top: "#101e40",
    horizon: "#34456c",
    sun: "#b6ccff",
    sky: "#94b4ef",
    ground: "#303b55",
    key: 0.9,
    hemi: 0.85,
    ambient: 0.26,
    fill: 0.3,
    night: 1,
  },
] as const;

export function sampleDaylight(hour: number) {
  const h = wrapHour(hour);
  const index = DAYLIGHT_KEYS.findIndex((key, i) => i > 0 && h < key.hour) - 1;
  const from = DAYLIGHT_KEYS[Math.max(0, index)];
  const to = DAYLIGHT_KEYS[Math.max(0, index) + 1];
  const t = (h - from.hour) / (to.hour - from.hour);
  const blend = t * t * (3 - 2 * t);
  const lerp = (a: number, b: number) => a + (b - a) * blend;
  return {
    index: Math.max(0, index),
    blend,
    key: lerp(from.key, to.key),
    hemi: lerp(from.hemi, to.hemi),
    ambient: lerp(from.ambient, to.ambient),
    fill: lerp(from.fill, to.fill),
    night: lerp(from.night, to.night),
  };
}
