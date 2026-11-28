import { describe, expect, it } from "vitest";
import { sampleSkyPalette } from "../src/game/core/daylight";
import {
  INITIAL_AIM,
  projectStar,
  starVisibility,
  telescopeSkyState,
} from "../src/game/core/stargazing";
import {
  afterglow,
  buildCloudField,
  cloudDrift,
  cloudPresence,
  CLOUD_LAYERS,
  cloudSpriteSteps,
  createCloudShade,
  makeCloudSprite,
  makeGlowField,
  makeRayField,
  projectSky,
  sampleCloudLight,
  scopeSkyColor,
  shadeCloud,
  shadeSea,
  SKY_MID_ALTITUDE,
  SPRITE_SIZE,
  tintSprite,
  villageSun,
  warmLight,
  type CloudLight,
} from "../src/game/core/telescopeClouds";

const luminance = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** Every number a light carries, flattened (for continuity checks). */
function numbers(light: CloudLight) {
  const out: number[] = [];
  for (const value of Object.values(light)) {
    if (typeof value === "number") out.push(value);
    else out.push(...(value as number[]));
  }
  return out;
}
const hours = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

describe("the village sun the eyepiece draws", () => {
  it("rises at 06:00, culminates in the south and sets at 18:30", () => {
    expect(villageSun(6).altitude).toBeCloseTo(0, 6);
    expect(villageSun(18.5).altitude).toBeCloseTo(0, 6);
    const noon = villageSun(12.25);
    expect(noon.altitude).toBeGreaterThan(60);
    expect(noon.azimuth).toBeCloseTo(180, 4);
    // East in the morning, west in the evening.
    expect(villageSun(6).azimuth).toBeGreaterThan(60);
    expect(villageSun(6).azimuth).toBeLessThan(90);
    expect(villageSun(18.5).azimuth).toBeGreaterThan(270);
    expect(villageSun(18.5).azimuth).toBeLessThan(300);
  });
  it("climbs all morning and sinks all afternoon and evening (monotonic)", () => {
    const up = hours(0.25, 12.25, 0.05).map((h) => villageSun(h).altitude);
    const down = hours(12.25, 24.25, 0.05).map((h) => villageSun(h).altitude);
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1]);
    for (let i = 1; i < down.length; i++) expect(down[i]).toBeLessThan(down[i - 1]);
  });
  it("is continuous round the clock, midnight included, and a unit vector", () => {
    for (const h of hours(0, 24, 0.01)) {
      const a = villageSun(h),
        b = villageSun(h + 0.01);
      expect(Math.hypot(a.east, a.north, a.up)).toBeCloseTo(1, 9);
      expect(Math.hypot(b.east - a.east, b.north - a.north, b.up - a.up)).toBeLessThan(0.006);
    }
    expect(villageSun(24).altitude).toBeCloseTo(villageSun(0).altitude, 9);
  });
  it("agrees with the village sky: up while it is day, down at night", () => {
    expect(telescopeSkyState(12).phase).toBe("day");
    expect(villageSun(18).altitude).toBeGreaterThan(2);
    expect(villageSun(18).altitude).toBeLessThan(10);
    expect(villageSun(19.25).altitude).toBeLessThan(-5);
    expect(villageSun(22).altitude).toBeLessThan(-18);
  });
});

describe("eyepiece sky gradient = the village's three stops", () => {
  it("is the horizon at 0 degrees, mid at 35 and zenith overhead, by day", () => {
    for (const hour of [9, 12, 16.6, 18]) {
      const palette = sampleSkyPalette(hour);
      const at = (altitude: number) => scopeSkyColor(palette, 0, altitude);
      for (let i = 0; i < 3; i++) {
        expect(at(0)[i]).toBeCloseTo(palette.horizon[i], 6);
        expect(at(-20)[i]).toBeCloseTo(palette.horizon[i], 6);
        expect(at(SKY_MID_ALTITUDE)[i]).toBeCloseTo(palette.mid[i], 6);
        expect(at(90)[i]).toBeCloseTo(palette.zenith[i], 6);
      }
    }
  });
  it("uses zenith, not the old two-stop top", () => {
    const palette = sampleSkyPalette(18);
    expect(scopeSkyColor(palette, 0, 90)).not.toEqual(palette.top);
  });
  it("darkens towards telescope-black as the stars come out", () => {
    const palette = sampleSkyPalette(23);
    expect(luminance(scopeSkyColor(palette, 1, 60))).toBeLessThan(
      luminance(scopeSkyColor(palette, 0, 60)),
    );
  });
  it("is continuous in altitude", () => {
    const palette = sampleSkyPalette(18.5);
    for (let altitude = -10; altitude < 90; altitude += 0.5) {
      const a = scopeSkyColor(palette, 0.2, altitude),
        b = scopeSkyColor(palette, 0.2, altitude + 0.5);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.02);
    }
  });
});

describe("projectSky places clouds where projectStar places stars", () => {
  it("matches the star projection", () => {
    const out = { x: 0, y: 0, forward: 0 };
    const RAD = Math.PI / 180;
    for (const aim of [INITIAL_AIM, { azimuth: 275, altitude: 14, zoom: 1.7 }, { azimuth: 20, altitude: 80, zoom: 0.8 }])
      for (const [azimuth, altitude] of [[aim.azimuth + 6, aim.altitude + 4], [aim.azimuth - 8, Math.max(1, aim.altitude - 5)], [aim.azimuth, aim.altitude]]) {
        const star = {
          azimuth,
          altitude,
          east: Math.cos(altitude * RAD) * Math.sin(azimuth * RAD),
          north: Math.cos(altitude * RAD) * Math.cos(azimuth * RAD),
          up: Math.sin(altitude * RAD),
        };
        const expected = projectStar(star, aim)!;
        projectSky(azimuth, altitude, aim, out);
        expect(out.x).toBeCloseTo(expected.x, 6);
        expect(out.y).toBeCloseTo(expected.y, 6);
        expect(out.forward).toBeGreaterThan(0);
      }
  });
  it("reports what is behind the eyepiece instead of wrapping it", () => {
    const out = { x: 0, y: 0, forward: 0 };
    expect(projectSky(0, 10, INITIAL_AIM, out).forward).toBeLessThan(0);
  });
  it("keeps the horizon a straight, level line", () => {
    const out = { x: 0, y: 0, forward: 0 };
    const aim = { azimuth: 270, altitude: 14, zoom: 1 };
    const y = projectSky(270, 0, aim, out).y;
    for (const azimuth of [240, 255, 285, 300]) expect(projectSky(azimuth, 0, aim, out).y).toBeCloseTo(y, 6);
    expect(y).toBeGreaterThan(0);
  });
});

describe("cloud light over the day", () => {
  it("is deterministic", () => {
    for (const hour of [0, 6.2, 12, 17.5, 18.5, 19.25, 22])
      expect(sampleCloudLight(hour)).toEqual(sampleCloudLight(hour));
  });
  it("is continuous in the hour, midnight included (no pops)", () => {
    let previous = numbers(sampleCloudLight(0));
    for (const hour of hours(0.01, 24.01, 0.01)) {
      const next = numbers(sampleCloudLight(hour));
      next.forEach((value, i) => {
        // `hour` and the sun's azimuth wrap; everything else must creep.
        const delta = Math.abs(value - previous[i]);
        if (i === 0) expect(Math.min(delta, 24 - delta)).toBeLessThan(0.011);
        else if (i === 1) expect(Math.min(delta, 360 - delta)).toBeLessThan(1);
        else if (i === 2) expect(delta).toBeLessThan(0.4);
        else expect(delta).toBeLessThan(0.05);
      });
      previous = next;
    }
  });
  it("keeps every colour and strength in range", () => {
    const shade = createCloudShade();
    for (const hour of hours(0, 24, 0.05)) {
      const light = sampleCloudLight(hour);
      for (const value of numbers(light).slice(3)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1.0001);
      }
      for (const lift of [0, 0.5, 1])
        for (const distance of [0, 60, 180]) {
          shadeCloud(light, lift, distance, shade);
          for (const c of [...shade.top, ...shade.under, ...shade.rim]) {
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(1.0001);
          }
        }
    }
  });
  it("warms, then lights from below, monotonically through the afternoon", () => {
    const run = hours(12.25, 18.5, 0.05).map((h) => sampleCloudLight(h));
    for (let i = 1; i < run.length; i++) {
      expect(run[i].warmth).toBeGreaterThanOrEqual(run[i - 1].warmth);
      expect(run[i].under).toBeGreaterThanOrEqual(run[i - 1].under);
    }
    expect(run[0].warmth).toBe(0);
    expect(run[run.length - 1].warmth).toBe(1);
    expect(run[run.length - 1].under).toBe(1);
  });
  it("dims the cloud tops monotonically from noon to night", () => {
    const shade = createCloudShade();
    const tops = hours(12.25, 21.5, 0.05).map((h) =>
      luminance(shadeCloud(sampleCloudLight(h), 0.5, 60, shade).top),
    );
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThanOrEqual(tops[i - 1] + 1e-9);
    expect(tops[0]).toBeGreaterThan(0.9);
    expect(tops[tops.length - 1]).toBeLessThan(0.45);
  });
  it("clears the sky monotonically into the night, and back by morning", () => {
    const dusk = hours(16, 21, 0.05).map((h) => sampleCloudLight(h).cover);
    for (let i = 1; i < dusk.length; i++) expect(dusk[i]).toBeLessThanOrEqual(dusk[i - 1]);
    expect(sampleCloudLight(12).cover).toBe(1);
    expect(sampleCloudLight(18).cover).toBe(1);
    expect(sampleCloudLight(22).cover).toBe(0);
    const dawn = hours(0, 6.5, 0.05).map((h) => sampleCloudLight(h).cover);
    for (let i = 1; i < dawn.length; i++) expect(dawn[i]).toBeGreaterThanOrEqual(dawn[i - 1]);
  });
  it("reads as each time of day", () => {
    const shade = createCloudShade();
    // Day: white tops over cool grey bases.
    const day = shadeCloud(sampleCloudLight(12), 0.5, 60, shade);
    expect(Math.min(...day.top)).toBeGreaterThan(0.93);
    expect(day.under[2]).toBeGreaterThan(day.under[0]);
    expect(luminance(day.under)).toBeLessThan(luminance(day.top));
    // Sunset: warm undersides brighter than cool violet tops.
    const sunset = { ...shadeCloud(sampleCloudLight(18.5), 0.5, 20, createCloudShade()) };
    expect(sunset.under[0]).toBeGreaterThan(sunset.under[2] + 0.3);
    expect(sunset.top[2]).toBeGreaterThan(sunset.top[0]);
    expect(luminance(sunset.under)).toBeGreaterThan(luminance(sunset.top));
    expect(sunset.spread).toBeGreaterThan(0.9);
    // Golden hour: the tops are warm, the light still from above.
    const golden = shadeCloud(sampleCloudLight(17.5), 0.5, 20, createCloudShade());
    expect(golden.top[0]).toBeGreaterThan(golden.top[2] + 0.08);
    expect(golden.spread).toBe(0);
    // Night: dim and blue.
    const night = shadeCloud(sampleCloudLight(23), 0.5, 90, createCloudShade());
    expect(luminance(night.top)).toBeLessThan(0.45);
    expect(night.top[2]).toBeGreaterThan(night.top[0]);
    expect(night.rimAmount).toBe(0);
  });
  it("lets high cloud hold the afterglow longer than low cloud", () => {
    for (const altitude of hours(-16, 4, 0.5)) {
      expect(afterglow(altitude, 1)).toBeGreaterThanOrEqual(afterglow(altitude, 0));
      expect(afterglow(altitude + 0.5, 0.5)).toBeGreaterThanOrEqual(afterglow(altitude, 0.5));
    }
    expect(afterglow(-7.9, 0)).toBeLessThan(0.05);
    expect(afterglow(-7.9, 1)).toBeGreaterThan(0.95);
  });
  it("glows on the horizon only around sunrise and sunset", () => {
    expect(sampleCloudLight(12).glowAlpha).toBe(0);
    expect(sampleCloudLight(23).glowAlpha).toBe(0);
    expect(sampleCloudLight(18.5).glowAlpha).toBeGreaterThan(0.9);
    expect(sampleCloudLight(6).glowAlpha).toBeGreaterThan(0.9);
    // The sun's disc is gone once it is under the cloud sea.
    expect(sampleCloudLight(12).discAlpha).toBe(1);
    expect(sampleCloudLight(19.25).discAlpha).toBe(0);
    expect(sampleCloudLight(18.5).discAlpha).toBe(1);
  });
  it("runs the warm ramp continuously from cream to the last mauve", () => {
    const a: [number, number, number] = [0, 0, 0],
      b: [number, number, number] = [0, 0, 0];
    for (let e = -20; e < 30; e += 0.1) {
      warmLight(e, a);
      warmLight(e + 0.1, b);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.012);
    }
    expect(luminance(warmLight(20, a))).toBeGreaterThan(luminance(warmLight(-12, b)));
  });
  it("shades the cloud sea continuously too", () => {
    const a = createCloudShade(),
      b = createCloudShade();
    for (const hour of hours(0, 24, 0.01)) {
      shadeSea(sampleCloudLight(hour), a);
      shadeSea(sampleCloudLight(hour + 0.01), b);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(a.top[i] - b.top[i])).toBeLessThan(0.03);
        expect(Math.abs(a.under[i] - b.under[i])).toBeLessThan(0.03);
      }
    }
  });
});

describe("stars fade in through blue hour, under the clouds", () => {
  it("brings the chart in monotonically from sunset to night", () => {
    const run = hours(18, 21, 0.05).map((h) => telescopeSkyState(h));
    for (let i = 1; i < run.length; i++) {
      expect(run[i].stars).toBeGreaterThanOrEqual(run[i - 1].stars);
      expect(run[i].magnitudeLimit).toBeGreaterThanOrEqual(run[i - 1].magnitudeLimit);
    }
    // Sunset: nothing; blue hour: the bright stars; night: the full chart.
    expect(starVisibility(1, telescopeSkyState(18).magnitudeLimit)).toBe(0);
    expect(starVisibility(1, telescopeSkyState(19.25).magnitudeLimit)).toBe(1);
    expect(starVisibility(6, telescopeSkyState(19.25).magnitudeLimit)).toBe(0);
    expect(starVisibility(6, telescopeSkyState(22).magnitudeLimit)).toBe(1);
  });
});

describe("the seeded cloud field", () => {
  it("is deterministic and seeded", () => {
    expect(buildCloudField()).toEqual(buildCloudField());
    expect(buildCloudField(7)).toEqual(buildCloudField(7));
    expect(buildCloudField(7)).not.toEqual(buildCloudField(8));
  });
  it("is layered back to front, far cloud low and near cloud high", () => {
    const field = buildCloudField();
    for (let i = 1; i < field.length; i++) expect(field[i].layer).toBeGreaterThanOrEqual(field[i - 1].layer);
    const mean = (layer: number) => {
      const of = field.filter((cloud) => cloud.layer === layer);
      return of.reduce((sum, cloud) => sum + cloud.altitude, 0) / of.length;
    };
    expect(mean(0)).toBeLessThan(mean(1));
    expect(mean(1)).toBeLessThan(mean(2));
    for (const cloud of field) {
      expect(cloud.altitude).toBeGreaterThan(0);
      expect(cloud.altitude).toBeLessThan(70);
      expect(cloud.azimuth).toBeGreaterThanOrEqual(0);
      expect(cloud.azimuth).toBeLessThan(360);
    }
  });
  it("covers the whole horizon, so the sun always sets through cloud", () => {
    const low = buildCloudField().filter((cloud) => cloud.layer === 0);
    for (let azimuth = 0; azimuth < 360; azimuth += 5)
      expect(
        low.some((cloud) => Math.abs(((cloud.azimuth - azimuth + 540) % 360) - 180) < 40),
      ).toBe(true);
  });
  it("leaves the night sky mostly clear: a few thin wisps", () => {
    const field = buildCloudField();
    const night = sampleCloudLight(23);
    const left = field.filter((cloud) => cloudPresence(cloud, night) > 0.01);
    expect(left.length).toBeGreaterThan(3);
    expect(left.length).toBeLessThan(field.length * 0.4);
    for (const cloud of left) {
      expect(cloud.kind).toBe("streak");
      expect(cloudPresence(cloud, night)).toBeLessThan(0.5);
    }
    // Sky covered at night, as a fraction of the dome above the horizon.
    const dome = 360 * (180 / Math.PI);
    const covered = left.reduce(
      (sum, cloud) => sum + cloud.width * cloud.height * 0.5 * cloudPresence(cloud, night),
      0,
    );
    expect(covered / dome).toBeLessThan(0.05);
    const day = sampleCloudLight(12);
    for (const cloud of field) expect(cloudPresence(cloud, day)).toBe(cloud.opacity);
  });
  it("drifts as a pure, periodic function of the time of day", () => {
    for (let layer = 0; layer < CLOUD_LAYERS.length; layer++) {
      expect(cloudDrift(layer, 0)).toBe(0);
      expect(cloudDrift(layer, 86400)).toBe(0);
      expect(cloudDrift(layer, 4321)).toBe(cloudDrift(layer, 4321));
      // Slow: under a tenth of a degree a second, near layers fastest.
      const rate = cloudDrift(layer, 10) / 10;
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(0.1);
      if (layer) expect(rate).toBeGreaterThan(cloudDrift(layer - 1, 10) / 10);
      expect(CLOUD_LAYERS[layer].parallax).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("cloud sprites", () => {
  it("are deterministic in (kind, seed) and differ between seeds", () => {
    for (const kind of ["cumulus", "streak", "sea"] as const) {
      const a = makeCloudSprite(kind, 1),
        b = makeCloudSprite(kind, 1),
        c = makeCloudSprite(kind, 2);
      expect([a.width, a.height]).toEqual([...SPRITE_SIZE[kind]]);
      for (const channel of ["alpha", "depth", "facing", "thick", "lobe"] as const) {
        expect(a[channel].length).toBe(a.width * a.height);
        expect(Buffer.compare(Buffer.from(a[channel]), Buffer.from(b[channel]))).toBe(0);
      }
      expect(Buffer.compare(Buffer.from(a.alpha), Buffer.from(c.alpha))).not.toBe(0);
    }
  });
  it("paint the same sprite in slices as in one go", () => {
    const steps = cloudSpriteSteps("cumulus", 3);
    let count = 0;
    let step = steps.next();
    while (!step.done) {
      count++;
      step = steps.next();
    }
    expect(count).toBeGreaterThan(8);
    expect(Buffer.compare(Buffer.from(step.value.alpha), Buffer.from(makeCloudSprite("cumulus", 3).alpha))).toBe(0);
  });
  it("never touch their edges (no cut clouds), and have a solid body", () => {
    for (const kind of ["cumulus", "streak"] as const)
      for (const seed of [1, 2, 3, 4]) {
        const { width, height, alpha } = makeCloudSprite(kind, seed);
        for (let x = 0; x < width; x++) {
          expect(alpha[x]).toBe(0);
          expect(alpha[(height - 1) * width + x]).toBe(0);
        }
        for (let y = 0; y < height; y++) {
          expect(alpha[y * width]).toBe(0);
          expect(alpha[y * width + width - 1]).toBe(0);
        }
        let covered = 0;
        for (const a of alpha) if (a > 128) covered++;
        expect(covered / alpha.length).toBeGreaterThan(kind === "cumulus" ? 0.15 : 0.08);
        expect(covered / alpha.length).toBeLessThan(0.6);
      }
  });
  it("tile the cloud sea seamlessly, solid below its tops", () => {
    for (const seed of [1, 2]) {
      const { width, height, alpha, depth } = makeCloudSprite("sea", seed);
      let jump = 0,
        seam = 0;
      for (let y = 0; y < height; y++) {
        seam += Math.abs(alpha[y * width] - alpha[y * width + width - 1]);
        jump += Math.abs(alpha[y * width + 300] - alpha[y * width + 301]);
        expect(alpha[(height - 1) * width + ((y * 13) % width)]).toBe(255);
        expect(alpha[(y * 13) % width]).toBe(0);
      }
      // The wrap is as smooth as any other pair of neighbouring columns.
      expect(seam).toBeLessThan(Math.max(4 * jump, 900));
      expect(depth[(height - 1) * width]).toBe(255);
    }
  });
  it("light deterministically: day white over grey, sunset glowing from below", () => {
    const sprite = makeCloudSprite("cumulus", 1);
    const paint = (hour: number) => {
      const out = new Uint8ClampedArray(sprite.alpha.length * 4);
      tintSprite(sprite, shadeCloud(sampleCloudLight(hour), 0.5, 30, createCloudShade()), 1, out);
      return out;
    };
    expect(Buffer.compare(Buffer.from(paint(18.5)), Buffer.from(paint(18.5)))).toBe(0);
    // Mean colour of the top and bottom thirds of the cloud's pixels.
    const bands = (rgba: Uint8ClampedArray) => {
      const sum = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];
      for (let i = 0; i < sprite.alpha.length; i++) {
        if (sprite.alpha[i] < 200) continue;
        const band = sprite.depth[i] < 70 ? 0 : sprite.depth[i] > 185 ? 1 : -1;
        if (band < 0) continue;
        for (let c = 0; c < 3; c++) sum[band][c] += rgba[i * 4 + c];
        sum[band][3]++;
      }
      return sum.map(([r, g, b, n]) => [r / n / 255, g / n / 255, b / n / 255]);
    };
    const [dayTop, dayBase] = bands(paint(12));
    expect(luminance(dayTop)).toBeGreaterThan(luminance(dayBase) + 0.05);
    const [duskTop, duskBase] = bands(paint(18.5));
    expect(luminance(duskBase)).toBeGreaterThan(luminance(duskTop) + 0.05);
    expect(duskBase[0]).toBeGreaterThan(duskBase[2] + 0.25);
    // Alpha passes straight through.
    const out = paint(12);
    for (let i = 0; i < sprite.alpha.length; i += 97) expect(out[i * 4 + 3]).toBe(sprite.alpha[i]);
  });
  it("builds seeded, bounded glow and ray fields", () => {
    const glow = makeGlowField(64, 2, 5);
    expect(glow).toEqual(makeGlowField(64, 2, 5));
    expect(glow[0]).toBe(0);
    expect(glow[32 * 64 + 32]).toBeGreaterThan(0.95);
    const rays = makeRayField(64, 9);
    expect(rays).toEqual(makeRayField(64, 9));
    for (const value of rays) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(rays[0]).toBe(0);
  });
});
