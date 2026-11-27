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

const TRANSITION_SECONDS = 4.5;
// ~3 minutes of clock time: real-time drift in Auto never restarts an arc,
// while a preset pick, Auto resync or timezone jump always glides there.
const RETRIGGER_HOURS = 0.05;
const arc = { from: 0, to: Number.NaN, t: 1 };

/** Auto follows regional civil time; every target change glides the shortest arc. */
export function advanceHour(
  hour: number,
  seconds: number,
  mode: TimeMode,
  automaticHour = hour,
) {
  const dt = Math.min(Math.max(seconds, 0), 0.1);
  if (dt <= 0) return hour;
  const target =
    mode === "auto" ? wrapHour(automaticHour) : TIME_PRESETS[mode].hour;
  const distance = (from: number) => wrapHour(target - from + 12) - 12;
  if (Math.abs(distance(hour)) <= RETRIGGER_HOURS) {
    arc.t = 1;
    return target;
  }
  // Restart only on a real retarget: Auto's target drifts with the clock,
  // and a microscopic shift must not pin the arc at its first frame.
  const retarget = wrapHour(target - arc.to + 12) - 12;
  if (arc.t >= 1 || Math.abs(retarget) > RETRIGGER_HOURS) {
    arc.from = hour;
    arc.to = target;
    arc.t = 0;
  }
  arc.t = Math.min(1, arc.t + dt / TRANSITION_SECONDS);
  const ease = arc.t * arc.t * (3 - 2 * arc.t);
  return wrapHour(arc.from + distance(arc.from) * ease);
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
    top: "#7fb0dc",
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
    top: "#7fb0dc",
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
    top: "#6f9fd0",
    horizon: "#e4dcc8",
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
    top: "#6f86b0",
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

export type Rgb = readonly [number, number, number];
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
const linearKeys = DAYLIGHT_KEYS.map((key) => {
  const parse = (hex: string): Rgb => [
    toLinear(parseInt(hex.slice(1, 3), 16) / 255),
    toLinear(parseInt(hex.slice(3, 5), 16) / 255),
    toLinear(parseInt(hex.slice(5, 7), 16) / 255),
  ];
  return {
    top: parse(key.top),
    horizon: parse(key.horizon),
    sky: parse(key.sky),
    sun: parse(key.sun),
  };
});

/** The sky colours TimeOfDayLighting draws at `hour` (same keys, same
 * smoothstep, lerped in linear light like THREE.Color), as sRGB 0..1. */
export function sampleSkyPalette(hour: number) {
  const { index, blend } = sampleDaylight(hour);
  const from = linearKeys[index],
    to = linearKeys[index + 1];
  const mix = (a: Rgb, b: Rgb): Rgb => [
    toSrgb(a[0] + (b[0] - a[0]) * blend),
    toSrgb(a[1] + (b[1] - a[1]) * blend),
    toSrgb(a[2] + (b[2] - a[2]) * blend),
  ];
  return {
    top: mix(from.top, to.top),
    horizon: mix(from.horizon, to.horizon),
    sky: mix(from.sky, to.sky),
    sun: mix(from.sun, to.sun),
  };
}

/** sRGB 0..1 -> "#rrggbb". */
export function rgbHex([r, g, b]: Rgb) {
  const byte = (c: number) =>
    Math.round(Math.max(0, Math.min(1, c)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
