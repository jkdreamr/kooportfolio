import { describe, expect, it } from "vitest";
import { TERRAIN, terrainHeightAt, terrainTierLoop } from "../src/game/core/terrain";
import { scaleLoop } from "../src/game/core/coast";

describe("terrain tier lookup does not allocate", () => {
  it("returns the same cached outline on every call, equal to the scaled loop", () => {
    for (const world of ["home", "korea", "stanford"] as const)
      for (const feature of TERRAIN[world])
        for (let tier = 0; tier < feature.tiers.length; tier++) {
          const a = terrainTierLoop(feature, tier);
          expect(terrainTierLoop(feature, tier)).toBe(a);
          expect(a).toEqual(scaleLoop(feature.outline, feature.focus, feature.tiers[tier].scale));
        }
  });
  it("heights are unchanged by the cache", () => {
    const feature = TERRAIN.home.find((f) => f.tiers.length > 1)!;
    const [x, z] = feature.focus;
    expect(terrainHeightAt(x, z, "home")).toBeCloseTo(feature.tiers[feature.tiers.length - 1].y, 6);
  });
});
