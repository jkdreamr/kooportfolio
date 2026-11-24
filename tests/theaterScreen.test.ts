import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  THEATER_EYE,
  THEATER_SCREEN,
  THEATER_SCREEN_HEIGHT,
  THEATER_SCREEN_WIDTH,
  theaterFov,
} from "../src/game/core/theaterScreen";

describe("theater screen", () => {
  it.each([21 / 9, 16 / 9, 4 / 3, 1, 9 / 19.5])(
    "keeps the full screen in view from the audience seat at aspect %s",
    (aspect) => {
      const camera = new PerspectiveCamera(theaterFov(aspect), aspect);
      camera.position.set(...THEATER_EYE);
      camera.lookAt(...THEATER_SCREEN);
      camera.updateMatrixWorld();

      for (const x of [-1, 1]) {
        for (const y of [-1, 1]) {
          const corner = new Vector3(...THEATER_SCREEN);
          corner.x += x * THEATER_SCREEN_WIDTH / 2;
          corner.y += y * THEATER_SCREEN_HEIGHT / 2;
          corner.project(camera);
          expect(Math.abs(corner.x)).toBeLessThan(0.94);
          expect(Math.abs(corner.y)).toBeLessThan(0.75);
        }
      }
    },
  );
});
