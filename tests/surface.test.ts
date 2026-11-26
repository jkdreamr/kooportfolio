import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SURFACE_KINDS,
  SURFACE_KIND_INDEX,
  sculptedMaterial,
  setSurfaceKind,
  surfaceKindForColor,
} from "../src/game/world/Surface";
import {
  DETAIL_LAYERS,
  DETAIL_SIZE_HIGH,
  DETAIL_SIZE_LOW,
  buildDetailLayer,
  detailSizeForTier,
} from "../src/game/world/env/detail";
import { buildNoiseData } from "../src/game/world/env/noise";

describe("surface kinds", () => {
  it("indexes every kind as one detail layer", () => {
    expect(SURFACE_KINDS).toHaveLength(DETAIL_LAYERS);
    SURFACE_KINDS.forEach((kind, i) => expect(SURFACE_KIND_INDEX[kind]).toBe(i));
  });

  it("guesses only clear cases from colour", () => {
    expect(surfaceKindForColor("#7a5236")).toBe("wood");
    expect(surfaceKindForColor("#8b5a2b")).toBe("wood");
    expect(surfaceKindForColor("#8f8f8c")).toBe("stone");
    expect(surfaceKindForColor("#f2ece0")).toBe("plaster");
    expect(surfaceKindForColor("#3f7f3a")).toBe("plain");
    expect(surfaceKindForColor("#2a6fc9")).toBe("plain");
    expect(surfaceKindForColor("not a colour")).toBe("plain");
    expect(surfaceKindForColor(0x7a5236)).toBe("wood");
    expect(surfaceKindForColor("#abc")).toBe(surfaceKindForColor("#aabbcc"));
  });

  it("tags a material through a uniform, never a program key", () => {
    const wood = sculptedMaterial({ color: "#7a5236" }, "wood");
    const plain = sculptedMaterial({ color: "#7a5236" });
    expect(wood.userData.surfaceKind).toBe("wood");
    expect(plain.userData.surfaceKind).toBe("plain");
    expect(wood.customProgramCacheKey()).toBe(plain.customProgramCacheKey());
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    wood.onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms.uSurfaceKind.value).toBe(SURFACE_KIND_INDEX.wood);
    expect(shader.fragmentShader).toContain("sculptLayer(");
    expect(shader.fragmentShader).toContain("SCULPT_KIND_VARYING");
    // Every patch point was found.
    expect(shader.fragmentShader).toContain("sculptDH");
    expect(shader.fragmentShader).toContain("sculptRim");
    expect(shader.vertexShader).toContain("vSculptWorld =");
    setSurfaceKind(wood, "stone");
    expect(shader.uniforms.uSurfaceKind.value).toBe(SURFACE_KIND_INDEX.stone);
  });
});

describe("detail layers", () => {
  it("picks the texture size by tier, within the memory budget", () => {
    expect(detailSizeForTier("low")).toBe(DETAIL_SIZE_LOW);
    expect(detailSizeForTier("high")).toBe(DETAIL_SIZE_HIGH);
    const bytes = DETAIL_SIZE_HIGH ** 2 * 4 * DETAIL_LAYERS * (4 / 3);
    expect(bytes).toBeLessThanOrEqual(1.4 * 1024 * 1024);
  });

  it("keeps the plain layer equal to the original painted grain", async () => {
    const size = 32;
    const plain = await buildDetailLayer(0, size);
    const noise = buildNoiseData(size);
    let worst = 0;
    for (let i = 0; i < size * size; i++) {
      const grain = noise[i * 4 + 1] * 0.65 + noise[i * 4] * 0.35;
      worst = Math.max(worst, Math.abs(plain[i * 4] - grain));
    }
    expect(worst).toBeLessThanOrEqual(1.5);
  });

  it("centres albedo and roughness on every tagged layer", async () => {
    for (let layer = 1; layer < DETAIL_LAYERS; layer++) {
      const data = await buildDetailLayer(layer, 48);
      let r = 0,
        b = 0,
        gMin = 255,
        gMax = 0;
      const n = data.length / 4;
      for (let i = 0; i < n; i++) {
        r += data[i * 4];
        b += data[i * 4 + 2];
        gMin = Math.min(gMin, data[i * 4 + 1]);
        gMax = Math.max(gMax, data[i * 4 + 1]);
      }
      expect(Math.abs(r / n - 127.5)).toBeLessThan(6);
      expect(Math.abs(b / n - 127.5)).toBeLessThan(6);
      // Height carries real relief for the bump.
      expect(gMax - gMin).toBeGreaterThan(24);
    }
  });

  it("tiles seamlessly (no wrap step exceeds the row's own steps)", async () => {
    const size = 64;
    for (let layer = 0; layer < DETAIL_LAYERS; layer++) {
      const data = await buildDetailLayer(layer, size);
      const at = (x: number, y: number) => data[(y * size + x) * 4 + 1];
      let bad = 0;
      for (let y = 0; y < size; y++) {
        let rowMax = 0,
          colMax = 0;
        for (let x = 1; x < size; x++) {
          rowMax = Math.max(rowMax, Math.abs(at(x, y) - at(x - 1, y)));
          colMax = Math.max(colMax, Math.abs(at(y, x) - at(y, x - 1)));
        }
        if (Math.abs(at(size - 1, y) - at(0, y)) > rowMax + 6) bad++;
        if (Math.abs(at(y, size - 1) - at(y, 0)) > colMax + 6) bad++;
      }
      expect(bad, `layer ${layer}`).toBeLessThanOrEqual(4);
    }
  });
});
