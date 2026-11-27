import catalogue from "./stargazing-catalogue.json";
import { sampleDaylight, sampleSkyPalette, wrapHour, type Rgb } from "./daylight";

export type SkyWorld = "stanford" | "home" | "korea";
export type SkyLocation = {
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string;
};
export const SKY_LOCATIONS: Record<SkyWorld, SkyLocation> = {
  stanford: {
    label: "Stanford",
    latitude: 37.43,
    longitude: -122.17,
    timeZone: "America/Los_Angeles",
  },
  home: {
    label: "Bay Area",
    latitude: 37.43,
    longitude: -122.17,
    timeZone: "America/Los_Angeles",
  },
  korea: {
    label: "Seoul",
    latitude: 37.57,
    longitude: 126.98,
    timeZone: "Asia/Seoul",
  },
};
const RAD = Math.PI / 180;
const DAY = 86400000;
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 2.4;
export const clampZoom = (value: number) =>
  Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
export const wrapDegrees = (value: number) => ((value % 360) + 360) % 360;
export type SkyAim = { azimuth: number; altitude: number; zoom: number };
export const INITIAL_AIM: SkyAim = { azimuth: 180, altitude: 50, zoom: 1 };
export function panSky(aim: SkyAim, dx: number, dy: number): SkyAim {
  return {
    ...aim,
    azimuth: wrapDegrees(aim.azimuth + dx / aim.zoom),
    altitude: Math.max(5, Math.min(88, aim.altitude + dy / aim.zoom)),
  };
}
export type Horizontal = {
  azimuth: number;
  altitude: number;
  east: number;
  north: number;
  up: number;
};
export type ObservedStar = Horizontal & {
  id: number;
  name: string;
  magnitude: number;
  color: string;
};
// HYG v4.1 subset, CC BY-SA 4.0; provenance and tuple schema in /stargazing-data.txt.
type CatalogueStar = [
  number,
  number,
  number,
  number,
  number | null,
  string,
  number,
  number,
];
export const STAR_CATALOGUE = catalogue as CatalogueStar[];
export const julianDate = (date: Date) => date.getTime() / DAY + 2440587.5;

/** USNO approximate GMST in degrees; UTC used as UT1 (<1 second discrepancy). */
export function greenwichSiderealTime(date: Date) {
  const days = julianDate(date) - 2451545;
  const t = days / 36525;
  return wrapDegrees(
    280.46061837 +
      360.98564736629 * days +
      0.000387933 * t ** 2 -
      t ** 3 / 38710000,
  );
}
/** Equator/equinox of date -> local horizon. Azimuth: north=0, east=90. */
export function equatorialToHorizontal(
  raHours: number,
  declination: number,
  date: Date,
  location: Pick<SkyLocation, "latitude" | "longitude">,
): Horizontal {
  const ha =
    (greenwichSiderealTime(date) + location.longitude - raHours * 15) * RAD;
  const dec = declination * RAD;
  const lat = location.latitude * RAD;
  const east = -Math.cos(dec) * Math.sin(ha);
  const north =
    Math.sin(dec) * Math.cos(lat) -
    Math.cos(dec) * Math.cos(ha) * Math.sin(lat);
  const up =
    Math.sin(dec) * Math.sin(lat) +
    Math.cos(dec) * Math.cos(ha) * Math.cos(lat);
  return {
    east,
    north,
    up,
    azimuth: wrapDegrees(Math.atan2(east, north) / RAD),
    altitude: Math.asin(Math.max(-1, Math.min(1, up))) / RAD,
  };
}
/** IAU 1976 precession from catalogue J2000 to date, for a wide-field chart. */
export function precessJ2000(raHours: number, declination: number, date: Date) {
  const t = (julianDate(date) - 2451545) / 36525;
  const zeta =
    ((2306.2181 * t + 0.30188 * t ** 2 + 0.017998 * t ** 3) / 3600) * RAD;
  const z =
    ((2306.2181 * t + 1.09468 * t ** 2 + 0.018203 * t ** 3) / 3600) * RAD;
  const theta =
    ((2004.3109 * t - 0.42665 * t ** 2 - 0.041833 * t ** 3) / 3600) * RAD;
  const ra = raHours * 15 * RAD + zeta;
  const dec = declination * RAD;
  const a = Math.cos(dec) * Math.sin(ra);
  const b =
    Math.cos(theta) * Math.cos(dec) * Math.cos(ra) -
    Math.sin(theta) * Math.sin(dec);
  const c =
    Math.sin(theta) * Math.cos(dec) * Math.cos(ra) +
    Math.cos(theta) * Math.sin(dec);
  return {
    ra: wrapDegrees((Math.atan2(a, b) + z) / RAD) / 15,
    dec: Math.asin(Math.max(-1, Math.min(1, c))) / RAD,
  };
}
/** USNO low-precision solar coordinates (equator and ecliptic of date). */
function solarEquatorial(date: Date) {
  const n = julianDate(date) - 2451545;
  const meanLongitude = wrapDegrees(280.459 + 0.98564736 * n) * RAD;
  const anomaly = wrapDegrees(357.529 + 0.98560028 * n) * RAD;
  const lon =
    meanLongitude +
    (1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.00000036 * n) * RAD;
  const ra =
    wrapDegrees(
      Math.atan2(Math.cos(obliquity) * Math.sin(lon), Math.cos(lon)) / RAD,
    ) / 15;
  const dec = Math.asin(Math.sin(obliquity) * Math.sin(lon)) / RAD;
  return { ra, dec, longitude: wrapDegrees(lon / RAD) };
}
export function solarPosition(date: Date, location: SkyLocation) {
  const sun = solarEquatorial(date);
  return equatorialToHorizontal(sun.ra, sun.dec, date, location);
}
export function solarAltitude(date: Date, location: SkyLocation) {
  return solarPosition(date, location).altitude;
}
export type MoonPosition = Horizontal & {
  /** Illuminated fraction of the disc, 0 (new) .. 1 (full). */
  illumination: number;
  waxing: boolean;
};
/** Astronomical Almanac low-precision Moon (~0.3 deg), with the ~1 deg
 * topocentric parallax applied to the altitude. Ample for a star chart. */
export function lunarPosition(date: Date, location: SkyLocation): MoonPosition {
  const t = (julianDate(date) - 2451545) / 36525;
  const s = (a: number, b: number) => Math.sin(wrapDegrees(a + b * t) * RAD);
  const longitude = wrapDegrees(
    218.32 +
      481267.881 * t +
      6.29 * s(134.9, 477198.85) -
      1.27 * s(259.2, -413335.38) +
      0.66 * s(235.7, 890534.23) +
      0.21 * s(269.9, 954397.7) -
      0.19 * s(357.5, 35999.05) -
      0.11 * s(186.6, 966404.05),
  );
  const latitude =
    5.13 * s(93.3, 483202.03) +
    0.28 * s(228.2, 960400.87) -
    0.28 * s(318.3, 6003.18) -
    0.17 * s(217.6, -407332.2);
  const lambda = longitude * RAD,
    beta = latitude * RAD,
    obliquity = (23.439 - 0.013 * t) * RAD;
  const ra =
    wrapDegrees(
      Math.atan2(
        Math.sin(lambda) * Math.cos(obliquity) -
          Math.tan(beta) * Math.sin(obliquity),
        Math.cos(lambda),
      ) / RAD,
    ) / 15;
  const dec =
    Math.asin(
      Math.sin(beta) * Math.cos(obliquity) +
        Math.cos(beta) * Math.sin(obliquity) * Math.sin(lambda),
    ) / RAD;
  const geocentric = equatorialToHorizontal(ra, dec, date, location);
  const altitude =
    geocentric.altitude - 0.95 * Math.cos(geocentric.altitude * RAD);
  const az = geocentric.azimuth * RAD,
    alt = altitude * RAD;
  const sun = solarEquatorial(date);
  // Elongation from the Sun: cos psi = cos(beta) cos(lambda - lambdaSun).
  const cosPsi = Math.cos(beta) * Math.cos(lambda - sun.longitude * RAD);
  return {
    azimuth: geocentric.azimuth,
    altitude,
    east: Math.cos(alt) * Math.sin(az),
    north: Math.cos(alt) * Math.cos(az),
    up: Math.sin(alt),
    illumination: (1 - cosPsi) / 2,
    waxing: wrapDegrees(longitude - sun.longitude) < 180,
  };
}
export function observeSky(date: Date, location: SkyLocation): ObservedStar[] {
  const years = (julianDate(date) - 2451545) / 365.25;
  return STAR_CATALOGUE.map(
    ([id, ra, dec, magnitude, bv, name, pmra, pmdec]) => {
      // HYG RA proper motion includes cos(dec), milliarcseconds/year.
      const movedRA =
        ra +
        (pmra * years) / (3600000 * Math.max(0.001, Math.cos(dec * RAD))) / 15;
      const equator = precessJ2000(
        movedRA,
        dec + (pmdec * years) / 3600000,
        date,
      );
      const horizontal = equatorialToHorizontal(
        equator.ra,
        equator.dec,
        date,
        location,
      );
      const color =
        bv === null
          ? "#e3eaff"
          : bv < 0.1
            ? "#c4dcff"
            : bv < 0.6
              ? "#e4eaff"
              : bv < 1.2
                ? "#ffe4ba"
                : "#ffc68f";
      return { id, name, magnitude, color, ...horizontal };
    },
  ).filter((star) => star.altitude > 0);
}
/** Gnomonic projection: never wrap stars or show anything below the horizon. */
export function projectStar(
  star: Horizontal,
  aim: SkyAim,
): { x: number; y: number } | null {
  if (star.altitude <= 0) return null;
  const az = aim.azimuth * RAD;
  const alt = aim.altitude * RAD;
  const forward =
    star.east * Math.cos(alt) * Math.sin(az) +
    star.north * Math.cos(alt) * Math.cos(az) +
    star.up * Math.sin(alt);
  if (forward <= 0) return null;
  const scale = 300 / Math.tan((35 * RAD) / aim.zoom);
  const x =
    ((star.east * Math.cos(az) - star.north * Math.sin(az)) / forward) * scale;
  const y =
    (-(
      -star.east * Math.sin(alt) * Math.sin(az) -
      star.north * Math.sin(alt) * Math.cos(az) +
      star.up * Math.cos(alt)
    ) /
      forward) *
    scale;
  return x * x + y * y <= 310 ** 2 ? { x, y } : null;
}
/** Today's wall-clock `hour` (0..24, fractional) in the observer's
 * timezone, including Pacific DST. */
export function wallTimeAtLocation(
  now: Date,
  location: SkyLocation,
  hour: number,
): Date {
  const parts = (date: Date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: location.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
  const local = parts(now);
  const wallTime =
    Date.UTC(+local.year, +local.month - 1, +local.day) +
    Math.round(Math.max(0, Math.min(24, hour)) * 60) * 60000;
  const guess = parts(new Date(wallTime));
  const offset =
    Date.UTC(
      +guess.year,
      +guess.month - 1,
      +guess.day,
      +guess.hour,
      +guess.minute,
      +guess.second,
    ) - wallTime;
  return new Date(wallTime - offset);
}
/** Today's 22:00 in the observer's timezone. */
export function tonightAtLocation(now: Date, location: SkyLocation): Date {
  return wallTimeAtLocation(now, location, 22);
}

/**
 * The instant the eyepiece shows: today's date in the observer's timezone at
 * the GAME clock's hour (first visits open on 16:36, presets, Auto), never
 * the visitor's real clock. Stars, Moon and Sun are then real for that
 * instant, and the sky state below matches the village sky.
 */
export function telescopeSkyTime(
  now: Date,
  location: SkyLocation,
  gameHour: number,
) {
  return wallTimeAtLocation(now, location, wrapHour(gameHour));
}

export type TelescopePhase = "day" | "twilight" | "night";
export type TelescopeSky = {
  phase: TelescopePhase;
  /** The village sky's own night factor (daylight keys), 0..1. */
  night: number;
  /** Star-field visibility, 0 (none) .. 1 (full chart). */
  stars: number;
  /** Magnitude limit: a star fades in over the 1 mag above it. */
  magnitudeLimit: number;
  /** 0..1: how much daylight (sun glare, pale Moon) the sky carries. */
  daylight: number;
  palette: ReturnType<typeof sampleSkyPalette>;
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const DAY_MAGNITUDE_LIMIT = -2;
export const NIGHT_MAGNITUDE_LIMIT = 7;

/**
 * Game hour -> what the eyepiece shows. Driven by the same daylight keys as
 * the village sky (TimeOfDayLighting), so the telescope can never disagree
 * with the world around it. Continuous in `hour` (no pops): stars fade in
 * through dusk as the magnitude limit sweeps from brighter than Sirius to 6.
 */
export function telescopeSkyState(hour: number): TelescopeSky {
  const { night } = sampleDaylight(hour);
  const stars = smooth(0.08, 0.92, night);
  const daylight = 1 - smooth(0, 0.6, night);
  return {
    phase: stars >= 0.995 ? "night" : night <= 0.07 ? "day" : "twilight",
    night,
    stars,
    magnitudeLimit:
      DAY_MAGNITUDE_LIMIT +
      (NIGHT_MAGNITUDE_LIMIT - DAY_MAGNITUDE_LIMIT) * stars,
    daylight,
    palette: sampleSkyPalette(hour),
  };
}
/** Opacity of a star of `magnitude` under `limit` (1-mag soft edge). */
export function starVisibility(magnitude: number, limit: number) {
  return Math.max(0, Math.min(1, limit - magnitude + 0.5));
}
const EYEPIECE_NIGHT: Rgb = [0.024, 0.05, 0.1];
/** Sky colour at `altitude` through the eyepiece: the village gradient
 * (horizon -> top), darkened towards a telescope-black as stars come out. */
export function eyepieceSkyColor(sky: TelescopeSky, altitude: number): Rgb {
  const t = smooth(0, 70, altitude);
  const { top, horizon } = sky.palette;
  const dark = 0.55 * sky.stars;
  return [0, 1, 2].map((i) => {
    const c = horizon[i] + (top[i] - horizon[i]) * t;
    return c + (EYEPIECE_NIGHT[i] - c) * dark;
  }) as unknown as Rgb;
}
