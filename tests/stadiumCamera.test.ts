import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  FIELD_GOAL,
  goalClearanceTime,
  kickPosition,
} from "../src/game/core/fieldGoal";
import { stadiumCameraFrame } from "../src/game/core/stadiumCamera";

describe("stadium game camera", () => {
  it.each([
    [390, 844],
    [320, 844],
    [1440, 900],
  ])(
    "keeps the tee, full kick arc and posts clear of the HUD at %s×%s",
    (width, height) => {
      const camera = new THREE.PerspectiveCamera(56, width / height, 0.1, 180);
      for (const angle of [-18, 0, 18]) {
        for (const power of [0.47, 0.7, 1]) {
          const kick = { angle: (angle * Math.PI) / 180, power };
          const end = goalClearanceTime(kick);
          for (let time = 0; time <= end; time += 0.04) {
            const ball = kickPosition(kick, time);
            const frame = stadiumCameraFrame(
              { x: 0, z: 26.5 },
              true,
              ball,
              width < 700,
            );
            camera.position.set(...frame.position);
            camera.lookAt(...frame.target);
            camera.updateMatrixWorld();
            const projected = new THREE.Vector3(...ball).project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(0.9);
            expect(projected.y).toBeLessThan(1 - 150 / height);
            expect(projected.y).toBeGreaterThan(-1 + 340 / height);
            const goal = new THREE.Vector3(
              0,
              FIELD_GOAL.crossbar,
              FIELD_GOAL.goalZ,
            ).project(camera);
            expect(Math.abs(goal.x)).toBeLessThan(0.8);
            expect(goal.y).toBeLessThan(1 - 150 / height);
          }
        }
      }
    },
  );
});
