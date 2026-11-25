import { afterEach, describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import {
  islandCenter,
  islandFollow,
  islandZoom,
  ISLAND_CAMERA_OFFSET,
} from "../src/game/core/islandCamera";
import {
  fitIsland,
  MAX_WORLD_ZOOM,
  MIN_WORLD_ZOOM,
  useWorldView,
  zoomWorld,
} from "../src/game/core/worldView";
import { WORLD_ELLIPSE } from "../src/shared/world-bounds";
import { islandForWorld } from "../src/game/core/homeIsland";
import { KOREA_SHORE } from "../src/game/core/koreaDistrict";
import { KOREA_LANDMARKS } from "../src/game/core/koreaLandmarks";
import { POND_SURFACE } from "../src/game/core/pond";
import { villageGardenPlots } from "../src/game/core/villageGardens";
import { WORLD_IDS } from "../src/game/core/worlds";
import { freshSave, parseSave } from "../src/shared/save";

afterEach(fitIsland);

describe("whole-island camera", () => {
  it.each([
    [1280, 800],
    [1440, 900],
    [390, 844],
    [844, 390],
  ])(
    "fits the coastline, railway and lake at %s × %s without walking",
    (width, height) => {
      const camera = new OrthographicCamera(
        -width / 2,
        width / 2,
        height / 2,
        -height / 2,
        0.1,
        350,
      );
      camera.position.set(
        ISLAND_CAMERA_OFFSET[0],
        ISLAND_CAMERA_OFFSET[1],
        WORLD_ELLIPSE.centerZ + ISLAND_CAMERA_OFFSET[2],
      );
      camera.lookAt(0, 0.7, WORLD_ELLIPSE.centerZ);
      camera.zoom = islandZoom(width, height);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (let i = 0; i < 180; i++) {
        const angle = (i / 180) * Math.PI * 2;
        const point = new Vector3(
          Math.cos(angle) * 88,
          0,
          WORLD_ELLIPSE.centerZ + Math.sin(angle) * 83,
        ).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(0.98);
        expect(Math.abs(point.y)).toBeLessThan(0.9);
        expect(Math.abs(point.z)).toBeLessThan(1);
      }
      for (const p of [
        [-9, 0, 112],
        [-28, 28, -48],
      ]) {
        const projected = new Vector3(...p).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(0.98);
        expect(Math.abs(projected.y)).toBeLessThan(0.95);
      }
      expect(islandFollow(1)).toBe(0);
      expect(islandFollow(5)).toBe(1);
    },
  );

  it("zooms to walking scale and always returns to the overview", () => {
    zoomWorld(1000);
    expect(useWorldView.getState().zoom).toBe(MAX_WORLD_ZOOM);
    zoomWorld(0.00001);
    expect(useWorldView.getState().zoom).toBe(MIN_WORLD_ZOOM);
    fitIsland();
    expect(useWorldView.getState().zoom).toBe(1);
    for (const factor of [NaN, Infinity, 0, -1]) zoomWorld(factor);
    expect(useWorldView.getState().zoom).toBe(1);
  });

  it("keeps Korea within half the area of the shared island ellipse", () => {
    const area =
      Math.abs(
        KOREA_SHORE.reduce((sum, [x, z], i) => {
          const [nextX, nextZ] = KOREA_SHORE[(i + 1) % KOREA_SHORE.length];
          return sum + x * nextZ - z * nextX;
        }, 0),
      ) / 2;
    expect(area).toBeLessThan(
      (Math.PI * WORLD_ELLIPSE.radiusX * WORLD_ELLIPSE.radiusZ) / 2,
    );
  });

  it.each([
    [1280, 800],
    [390, 844],
    [844, 390],
  ])("fits the Korea shoreline and tower at %s × %s", (width, height) => {
    const [x, z] = islandCenter("korea");
    const camera = new OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0.1,
      350,
    );
    camera.position.set(
      x + ISLAND_CAMERA_OFFSET[0],
      ISLAND_CAMERA_OFFSET[1],
      z + ISLAND_CAMERA_OFFSET[2],
    );
    camera.lookAt(x, 0.7, z);
    camera.zoom = islandZoom(width, height, "korea");
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const {
      origin: [towerX, towerZ],
      height: towerHeight,
    } = KOREA_LANDMARKS.namsan;
    for (const point of [
      ...KOREA_SHORE.map(([px, pz]) => new Vector3(px, -3.7, pz)),
      new Vector3(towerX, towerHeight, towerZ),
    ]) {
      point.project(camera);
      expect(Math.abs(point.x)).toBeLessThan(0.95);
      expect(Math.abs(point.y)).toBeLessThan(0.9);
      expect(Math.abs(point.z)).toBeLessThan(1);
    }
  });
});

describe("stable, planted island", () => {
  it("moves legacy apron saves to the plaza without losing earned progress", () => {
    const legacy = {
      ...freshSave(),
      coins: 75,
      xp: 21,
      memories: ["hoover-key"],
      position: [0, -70],
    };
    expect(parseSave(JSON.stringify(legacy))).toEqual({
      ...legacy,
      position: [0, 5],
    });
    expect(() =>
      parseSave(JSON.stringify({ ...legacy, position: [0, -1000] })),
    ).toThrow();
  });
  it("keeps water above the entire pond bed rather than coplanar with it", () => {
    const bedTop = POND_SURFACE.bedY + POND_SURFACE.bedDepth / 2;
    const waterBottom = POND_SURFACE.waterY - POND_SURFACE.waterDepth / 2;
    expect(waterBottom - bedTop).toBeGreaterThan(0.02);
  });

  it.each(WORLD_IDS)(
    "roots every %s garden inside the smaller coastline and keeps water clear",
    (world) => {
      const plots = villageGardenPlots(world);
      expect(plots.length).toBeGreaterThan(0);
      const island = islandForWorld(world);
      for (const { x, z } of plots) {
        expect(
          ((x - island.centerX) / island.radiusX) ** 2 +
            ((z - island.centerZ) / island.radiusZ) ** 2,
        ).toBeLessThan(1);
        if (world === "korea")
          expect(x > -14 && x < 64 && z > 20 && z < 46).toBe(false);
      }
    },
  );
});
