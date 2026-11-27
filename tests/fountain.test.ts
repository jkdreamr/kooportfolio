import { describe, expect, it } from "vitest";
import {
  FOUNTAIN_KIND,
  fountainInstances,
  fountainParticleCount,
  fountainParticleTotal,
  fountainTriangles,
  jetPoint,
} from "../src/game/core/fountain";
import { campusFountainSpec as spec } from "../src/game/core/campusDistrict";
import { campusFountainWorld } from "../src/game/core/campus";
import { emittersFor } from "../src/game/core/ambientAudio";

describe("fountain water", () => {
  it("stays inside the per-fountain triangle budget on every tier", () => {
    for (const tier of ["high", "medium", "low"] as const)
      expect(fountainTriangles(spec.jets, tier)).toBeLessThanOrEqual(3000);
    expect(fountainParticleCount(spec.jets, "low")).toBeLessThan(
      fountainParticleCount(spec.jets, "medium"),
    );
    expect(fountainParticleCount(spec.jets, "high")).toBe(
      fountainParticleTotal(spec.jets),
    );
  });

  it("thins every stream evenly when a tier draws a prefix", () => {
    const { a, count } = fountainInstances(spec);
    expect(count).toBe(fountainParticleTotal(spec.jets));
    const kinds = (n: number) => {
      const tally = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) tally[a[i * 4]]++;
      return tally;
    };
    const all = kinds(count);
    const low = kinds(fountainParticleCount(spec.jets, "low"));
    // Mist is always drawn; the other streams keep their share (±40%).
    expect(low[FOUNTAIN_KIND.mist]).toBe(all[FOUNTAIN_KIND.mist]);
    for (const kind of [FOUNTAIN_KIND.jet, FOUNTAIN_KIND.plume, FOUNTAIN_KIND.splash]) {
      const share = low[kind] / all[kind];
      expect(share).toBeGreaterThan(0.3 * 0.6);
      expect(share).toBeLessThan(0.3 * 1.4);
    }
    // Deterministic layout.
    expect(fountainInstances(spec).a).toEqual(a);
  });

  it("arcs each jet up from the bowl rim and lands it on the basin water", () => {
    const start = jetPoint(spec, 0),
      end = jetPoint(spec, 1);
    expect(start.radius).toBeCloseTo(spec.bowlRadius, 6);
    expect(start.y).toBeCloseTo(spec.bowlY, 6);
    expect(end.y).toBeCloseTo(spec.basinY, 6);
    expect(end.radius).toBeGreaterThan(spec.bowlRadius);
    expect(end.radius).toBeLessThan(spec.basinRadius);
    const apex = Math.max(
      ...Array.from({ length: 50 }, (_, i) => jetPoint(spec, i / 49).y),
    );
    expect(apex).toBeGreaterThan(spec.bowlY + 0.05);
  });

  it("puts a spray ambience on the Stanford fountain only", () => {
    const spray = emittersFor("stanford").filter((e) => e.layer === "spray");
    expect(spray).toHaveLength(1);
    expect(spray[0].position[0]).toBeCloseTo(campusFountainWorld[0], 6);
    expect(spray[0].position[2]).toBeCloseTo(campusFountainWorld[1], 6);
    for (const world of ["home", "korea"] as const)
      expect(emittersFor(world).some((e) => e.layer === "spray")).toBe(false);
  });
});
