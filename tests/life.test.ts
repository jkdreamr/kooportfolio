import { describe, expect, it } from "vitest";
import {
  ALERT,
  ALERT_RADIUS,
  CIRCLING,
  FEEDING,
  FLOCK_SPOTS,
  FLYING,
  LANDING,
  LIFE_COUNTS,
  RETURN_CLEARANCE,
  SCATTER_FAN,
  SCATTER_RADIUS,
  beaconsOn,
  butterflyOrigins,
  createFlocks,
  flockCentre,
  returnSpot,
  setBeacons,
  stepFlocks,
} from "../src/game/core/life";
import { canWalk } from "../src/game/core/world";
import { bloomPick, inMeadow } from "../src/game/world/env/bloom";

const run = (f: ReturnType<typeof createFlocks>, s: number, px: number, pz: number, speed = 0) => {
  for (let t = 0; t < s; t += 1 / 60) stepFlocks(f, 1 / 60, px, pz, speed);
};

describe("songbird flocks", () => {
  it("feeding spots are open walkable ground", () => {
    for (const world of ["home", "korea", "stanford"] as const)
      for (const [x, z] of FLOCK_SPOTS[world])
        for (let a = 0; a < 12; a++)
          expect(canWalk(x + Math.cos(a) * 2, z + Math.sin(a) * 2, world), `${world} ${x},${z}`).toBe(true);
  });

  it("alerts inside 6 and scatters inside 3.2, fanning away from the player", () => {
    const f = createFlocks("home", 7);
    const c = flockCentre(f, 0, { x: 0, z: 0 });
    run(f, 0.1, c.x + ALERT_RADIUS + 0.5, c.z);
    expect(f.state[0]).toBe(FEEDING);
    run(f, 0.1, c.x + ALERT_RADIUS - 0.5, c.z);
    expect(f.state[0]).toBe(ALERT);
    const px = c.x + SCATTER_RADIUS - 0.4;
    stepFlocks(f, 1 / 60, px, c.z, 0);
    expect(f.state[0]).toBe(FLYING);
    expect(f.scattered).toBe(1);
    const away = Math.atan2(c.x - px, 0);
    for (let j = 0; j < 7; j++) {
      const d = Math.atan2(Math.sin(f.heading[j] - away), Math.cos(f.heading[j] - away));
      expect(Math.abs(d)).toBeLessThanOrEqual(SCATTER_FAN + 1e-6);
    }
  });

  it("scatters when the player runs at it from 5", () => {
    const f = createFlocks("korea", 4);
    const c = flockCentre(f, 1, { x: 0, z: 0 });
    stepFlocks(f, 1 / 60, c.x + 4.5, c.z, 5);
    expect(f.state[1]).toBe(FLYING);
  });

  it("climbs, circles, then lands at a spot at least 12 from the player", () => {
    const f = createFlocks("stanford", 5);
    const c = flockCentre(f, 0, { x: 0, z: 0 });
    stepFlocks(f, 1 / 60, c.x + 1, c.z, 0);
    run(f, 2, c.x + 1, c.z);
    expect(f.state[0]).toBe(CIRCLING);
    // The player waits on the flock's own spot: it must go to the other one.
    const own = FLOCK_SPOTS.stanford[0];
    run(f, 23, own[0], own[1]);
    expect([LANDING, FEEDING]).toContain(f.state[0]);
    const spot = FLOCK_SPOTS.stanford[f.spot[0]];
    expect(Math.hypot(spot[0] - own[0], spot[1] - own[1])).toBeGreaterThanOrEqual(RETURN_CLEARANCE);
    run(f, 15, own[0], own[1]);
    expect(f.state[0]).toBe(FEEDING);
    for (let j = 0; j < 5; j++) expect(f.y[j]).toBeLessThan(0.2);
  });

  it("returnSpot keeps circling when every spot is near the player", () => {
    expect(returnSpot("home", 0, 100, 100)).toBe(0);
    const [x, z] = FLOCK_SPOTS.home[0];
    expect(returnSpot("home", 0, x, z)).toBe(1);
  });

  it("never reallocates its arrays", () => {
    const f = createFlocks("home", 7);
    const arrays = [f.x, f.y, f.z, f.heading, f.state, f.timer];
    run(f, 30, FLOCK_SPOTS.home[0][0], FLOCK_SPOTS.home[0][1], 4);
    expect([f.x, f.y, f.z, f.heading, f.state, f.timer]).toEqual(arrays);
    for (const a of arrays) for (const v of a) expect(Number.isFinite(v)).toBe(true);
  });

  it("tier counts shrink toward low", () => {
    expect(LIFE_COUNTS.high.birds).toBeGreaterThan(LIFE_COUNTS.medium.birds);
    expect(LIFE_COUNTS.low.butterflies).toBe(0);
  });
});

describe("butterflies and beacons", () => {
  it("places butterflies on walkable ground, deterministically", () => {
    const walk = (x: number, z: number) => canWalk(x, z, "home");
    const a = butterflyOrigins("home", 36, [[-2.5, 5]], walk),
      b = butterflyOrigins("home", 36, [[-2.5, 5]], walk);
    expect(a.length).toBe(36 * 3);
    expect(Array.from(a)).toEqual(Array.from(b));
    for (let i = 0; i < 36; i++) {
      expect(walk(a[i * 3], a[i * 3 + 2])).toBe(true);
      expect(a[i * 3 + 1]).toBeGreaterThan(0.4);
    }
  });

  it("keeps at most four beacons", () => {
    setBeacons([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 9],
    ]);
    expect(beaconsOn()).toHaveLength(4);
    setBeacons([]);
    expect(beaconsOn()).toHaveLength(0);
  });
});

describe("meadow blossom", () => {
  it("meadows cover 14–22% of the ground and 30% of their tufts bloom", () => {
    let n = 0,
      meadow = 0,
      bloom = 0;
    for (let x = -80; x < 80; x += 0.61)
      for (let z = -80; z < 80; z += 0.67) {
        n++;
        if (inMeadow(x, z)) meadow++;
        if (bloomPick(x, z, 4) >= 0) bloom++;
      }
    expect(meadow / n).toBeGreaterThan(0.14);
    expect(meadow / n).toBeLessThan(0.22);
    expect(bloom / meadow).toBeGreaterThan(0.25);
    expect(bloom / meadow).toBeLessThan(0.35);
  });
});
