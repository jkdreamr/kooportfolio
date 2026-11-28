import { describe, expect, it } from "vitest";
import { fitCamera, PROBES, safeInsets, screenToTile, setPose, tilePixels, tileToScreen } from "../../src/game/scenes/bannerRush/camera";

describe("Banner Rush camera (T-C1)", () => {
  it("reproduces the plan's fits within 5%", () => {
    const phone = fitCamera(390, 844);
    expect(phone.distanceTiles).toBeGreaterThan(69.75 * 0.95);
    expect(phone.distanceTiles).toBeLessThan(69.75 * 1.05);
    setPose(phone, 390, 844);
    expect(tilePixels(8, 27)).toBeGreaterThan(22.6 * 0.95);
    const desk = fitCamera(1440, 900);
    expect(desk.distanceTiles).toBeGreaterThan(57 * 0.95);
    expect(desk.distanceTiles).toBeLessThan(57 * 1.05);
  });
  for (const [w, h] of [
    [390, 844],
    [360, 640],
    [820, 1180],
    [1440, 900],
    [844, 390],
  ])
    it(`${w}×${h}: probes inside the safe rectangle, near tile ≥ 16 px, round trip within 0.5 px`, () => {
      const fit = fitCamera(w, h);
      const safe = safeInsets(w, h);
      setPose(fit, w, h);
      for (const [x, y, z] of PROBES) {
        const p = tileToScreen(x + 8, z + 14, y);
        expect(p.x).toBeGreaterThanOrEqual(safe.left - 0.5);
        expect(p.x).toBeLessThanOrEqual(w - safe.right + 0.5);
        expect(p.y).toBeGreaterThanOrEqual(safe.top - 0.5);
        expect(p.y).toBeLessThanOrEqual(h - safe.bottom + 0.5);
      }
      if (h > 480) expect(tilePixels(8, 27)).toBeGreaterThanOrEqual(16);
      for (const [x, y] of [
        [2.5, 3.5],
        [12, 20],
        [8, 14],
      ]) {
        const s = tileToScreen(x, y);
        const sx = s.x,
          sy = s.y;
        const t = screenToTile(sx, sy);
        const back = tileToScreen(t.x, t.y);
        expect(Math.abs(back.x - sx)).toBeLessThan(0.5);
        expect(Math.abs(back.y - sy)).toBeLessThan(0.5);
      }
    });
});
