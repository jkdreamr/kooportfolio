import { wrapHour } from "./daylight";

// A miniature storybook climate, not a real location/weather service. Existing
// time presets naturally reveal clear noon, dawn mist, sunset rain and night snow.
// Late afternoon (the first visit's warm hero hour, 16:36) stays clear with a
// light breeze; the shower rolls in toward sunset instead.
const WEATHER = [
  { hour: 0, rain: 0, fog: 0.18, snow: 0.65, wind: 0.5 },
  { hour: 3, rain: 0, fog: 0.3, snow: 0.25, wind: 0.2 },
  { hour: 5, rain: 0, fog: 0.7, snow: 0, wind: 0.1 },
  { hour: 7, rain: 0, fog: 0.35, snow: 0, wind: 0.05 },
  { hour: 9, rain: 0, fog: 0, snow: 0, wind: 0 },
  { hour: 14, rain: 0, fog: 0, snow: 0, wind: 0 },
  { hour: 17, rain: 0, fog: 0.04, snow: 0, wind: 0.12 },
  { hour: 18, rain: 0.7, fog: 0.22, snow: 0, wind: 0.3 },
  { hour: 19, rain: 0.5, fog: 0.2, snow: 0, wind: 0.2 },
  { hour: 20, rain: 0, fog: 0.05, snow: 0, wind: 0.05 },
  { hour: 22, rain: 0, fog: 0.12, snow: 0.55, wind: 0.4 },
  { hour: 24, rain: 0, fog: 0.18, snow: 0.65, wind: 0.5 },
] as const;

export function sampleWeather(hour: number) {
  const h = wrapHour(hour);
  const index = Math.max(
    0,
    WEATHER.findIndex((key, i) => i > 0 && h < key.hour) - 1,
  );
  const from = WEATHER[index],
    to = WEATHER[index + 1];
  const p = (h - from.hour) / (to.hour - from.hour),
    blend = p * p * (3 - 2 * p);
  const lerp = (key: "rain" | "fog" | "snow" | "wind") =>
    from[key] + (to[key] - from[key]) * blend;
  return {
    rain: lerp("rain"),
    fog: lerp("fog"),
    snow: lerp("snow"),
    wind: lerp("wind"),
  };
}
