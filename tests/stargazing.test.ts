import { describe, expect, it } from "vitest";
import {
  clampZoom,
  equatorialToHorizontal,
  greenwichSiderealTime,
  INITIAL_AIM,
  julianDate,
  MAX_ZOOM,
  MIN_ZOOM,
  observeSky,
  panSky,
  precessJ2000,
  projectStar,
  SKY_LOCATIONS,
  solarAltitude,
  telescopeSkyTime,
  tonightAtLocation,
} from "../src/game/core/stargazing";
import type { CatalogueStar } from "../src/game/core/stargazing";
import catalogue from "../src/game/core/stargazing-catalogue.json";

const STAR_CATALOGUE = catalogue as CatalogueStar[];

const epoch = new Date("2000-01-01T12:00:00Z");
const instant = new Date("2026-11-24T06:00:00Z");
const bay = SKY_LOCATIONS.home;

describe("real telescope sky", () => {
  it("matches the J2000 Julian date and USNO Greenwich sidereal reference", () => {
    expect(julianDate(epoch)).toBe(2451545);
    expect(greenwichSiderealTime(epoch)).toBeCloseTo(280.46061837, 6);
    const unchanged = precessJ2000(6.75, -16.72, epoch);
    expect(unchanged.ra).toBeCloseTo(6.75, 10);
    expect(unchanged.dec).toBeCloseTo(-16.72, 10);
  });

  it("puts a transiting equatorial star south, the pole north, and rising stars east", () => {
    const lst =
      ((greenwichSiderealTime(epoch) + bay.longitude + 360) % 360) / 15;
    const transit = equatorialToHorizontal(lst, 0, epoch, bay);
    expect(transit.altitude).toBeCloseTo(90 - bay.latitude, 8);
    expect(transit.azimuth).toBeCloseTo(180, 8);
    const pole = equatorialToHorizontal(0, 90, epoch, bay);
    expect(pole.altitude).toBeCloseTo(bay.latitude, 8);
    expect(Math.min(pole.azimuth, 360 - pole.azimuth)).toBeLessThan(1e-6);
    const rising = equatorialToHorizontal(lst + 6, 0, epoch, bay);
    expect(rising.altitude).toBeCloseTo(0, 8);
    expect(rising.azimuth).toBeCloseTo(90, 8);
  });

  it("uses valid real catalogue coordinates rather than random decorative points", () => {
    expect(STAR_CATALOGUE.length).toBeGreaterThan(5000);
    expect(
      STAR_CATALOGUE.every(
        ([id, ra, dec, mag]) =>
          id > 0 && ra >= 0 && ra < 24 && Math.abs(dec) <= 90 && mag <= 6,
      ),
    ).toBe(true);
    const sirius = STAR_CATALOGUE.find((star) => star[5] === "Sirius")!;
    expect(sirius[1]).toBeCloseTo(6.75248, 4);
    expect(sirius[2]).toBeCloseTo(-16.7161, 3);
  });

  it("agrees with independent Astronomy Engine 2.1.19 J2000-to-horizon reference positions", () => {
    // Rotation_EQJ_HOR + VectorFromSphere + HorizonFromVector, no refraction.
    // Great-circle tolerance allows the omitted nutation; no runtime dependency.
    const cases = [
      ["Polaris", bay, 38.02949867, 0.21383291],
      ["Vega", bay, 8.8153431, 312.83737265],
      ["Sirius", bay, 4.48455593, 115.08373425],
      ["Polaris", SKY_LOCATIONS.korea, 37.19748046, 0.62829122],
      ["Vega", SKY_LOCATIONS.korea, 88.63564202, 335.19407156],
      ["Sirius", SKY_LOCATIONS.korea, -69.13792063, 356.25093547],
    ] as const;
    const rad = Math.PI / 180;
    for (const [name, location, expectedAltitude, expectedAzimuth] of cases) {
      const star = STAR_CATALOGUE.find((entry) => entry[5] === name)!;
      const equator = precessJ2000(star[1], star[2], instant);
      const actual = equatorialToHorizontal(
        equator.ra,
        equator.dec,
        instant,
        location,
      );
      const dot =
        Math.sin(actual.altitude * rad) * Math.sin(expectedAltitude * rad) +
        Math.cos(actual.altitude * rad) *
          Math.cos(expectedAltitude * rad) *
          Math.cos((actual.azimuth - expectedAzimuth) * rad);
      expect(Math.acos(Math.min(1, dot)) / rad, name).toBeLessThan(0.02);
    }
    expect(Math.abs(solarAltitude(instant, bay) - -59.864322)).toBeLessThan(
      0.03,
    );
    expect(
      Math.abs(solarAltitude(instant, SKY_LOCATIONS.korea) - 20.59004079),
    ).toBeLessThan(0.03);
  });

  it("keeps Home and Stanford physically identical while Seoul differs at one UTC instant", () => {
    const home = observeSky(instant, bay, STAR_CATALOGUE);
    expect(home).toEqual(observeSky(instant, SKY_LOCATIONS.stanford, STAR_CATALOGUE));
    expect(home).not.toEqual(observeSky(instant, SKY_LOCATIONS.korea, STAR_CATALOGUE));
    expect(home.every((star) => star.altitude > 0 && star.altitude <= 90)).toBe(
      true,
    );
    expect(home.some((star) => star.name === "Polaris")).toBe(true);
    expect(home.some((star) => star.name === "Acrux")).toBe(false);
    expect(observeSky(instant, bay, STAR_CATALOGUE)).toEqual(home);
  });

  it("changes the actual sky by hour, by date and by season", () => {
    const polaris = (date: Date) =>
      observeSky(date, bay, STAR_CATALOGUE).find((star) => star.name === "Polaris")!;
    const now = polaris(instant);
    const tomorrow = polaris(new Date(instant.getTime() + 86400000));
    const hourLater = polaris(new Date(instant.getTime() + 3600000));
    expect(Math.abs(now.azimuth - tomorrow.azimuth)).toBeGreaterThan(0.001);
    expect(Math.abs(now.azimuth - hourLater.azimuth)).toBeGreaterThan(0.01);
    const names = (date: Date) => observeSky(date, bay, STAR_CATALOGUE).map((star) => star.id);
    expect(names(new Date("2027-05-24T06:00:00Z"))).not.toEqual(names(instant));
  });

  it("computes the observer's real Sun (eyepiece glare, Moon phase)", () => {
    expect(solarAltitude(instant, bay)).toBeLessThan(-6);
    expect(solarAltitude(instant, SKY_LOCATIONS.korea)).toBeGreaterThan(0);
    expect(
      solarAltitude(new Date("2026-11-24T20:00:00Z"), bay),
    ).toBeGreaterThan(0);
  });

  it("previews local 22:00 across different dates, DST and the Pacific date boundary", () => {
    expect(tonightAtLocation(instant, bay).toISOString()).toBe(
      "2026-11-24T06:00:00.000Z",
    );
    expect(tonightAtLocation(instant, SKY_LOCATIONS.korea).toISOString()).toBe(
      "2026-11-24T13:00:00.000Z",
    );
    expect(
      tonightAtLocation(new Date("2026-07-01T01:00:00Z"), bay).toISOString(),
    ).toBe("2026-07-01T05:00:00.000Z");
    expect(
      tonightAtLocation(new Date("2026-03-08T12:00:00Z"), bay).toISOString(),
    ).toBe("2026-03-09T05:00:00.000Z");
    expect(
      tonightAtLocation(new Date("2026-11-01T12:00:00Z"), bay).toISOString(),
    ).toBe("2026-11-02T06:00:00.000Z");
  });

  it("shows the instant of the GAME clock (today's local date), not the real one", () => {
    // Real clock 04:00 PT on Nov 24, village clock 16:36: the eyepiece shows
    // 16:36 PT that day, never "tonight" by the visitor's own clock.
    const realDawn = new Date("2026-11-24T12:00:00Z");
    expect(telescopeSkyTime(realDawn, bay, 16.6).toISOString()).toBe(
      "2026-11-25T00:36:00.000Z",
    );
    expect(telescopeSkyTime(realDawn, bay, 23).toISOString()).toBe(
      "2026-11-25T07:00:00.000Z",
    );
    expect(
      telescopeSkyTime(realDawn, SKY_LOCATIONS.korea, 12).toISOString(),
    ).toBe("2026-11-24T03:00:00.000Z");
  });

  it("centers targets geometrically, excludes the far hemisphere, and bounds the controls", () => {
    const sky = observeSky(instant, bay, STAR_CATALOGUE);
    const star = sky.find((s) => s.name === "Polaris")!;
    const center = projectStar(star, {
      ...INITIAL_AIM,
      azimuth: star.azimuth,
      altitude: star.altitude,
    })!;
    expect(center.x).toBeCloseTo(0, 8);
    expect(center.y).toBeCloseTo(0, 8);
    expect(projectStar({ ...star, altitude: -1 }, INITIAL_AIM)).toBeNull();
    expect(
      projectStar(star, {
        ...INITIAL_AIM,
        azimuth: star.azimuth + 180,
        altitude: -star.altitude,
      }),
    ).toBeNull();
    expect(panSky(INITIAL_AIM, 190, 100).altitude).toBe(88);
    expect(panSky(INITIAL_AIM, 190, -100).altitude).toBe(5);
    expect(panSky(INITIAL_AIM, 190, 0).azimuth).toBe(10);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
  });
});

describe("catalogue on demand (C7)", () => {
  it("observeSky draws nothing until the catalogue chunk has loaded, then all of it", async () => {
    const { loadCatalogue, loadedCatalogue } = await import("../src/game/core/stargazing");
    expect(observeSky(instant, bay)).toEqual([]);
    const first = loadCatalogue();
    expect(loadCatalogue()).toBe(first); // one request per session
    expect(await first).toHaveLength(STAR_CATALOGUE.length);
    expect(loadedCatalogue()).toHaveLength(STAR_CATALOGUE.length);
    expect(observeSky(instant, bay)).toEqual(observeSky(instant, bay, STAR_CATALOGUE));
  });
});
