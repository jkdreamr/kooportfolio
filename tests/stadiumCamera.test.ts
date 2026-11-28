import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FIELD_GOAL, FLIGHT_STEP, fieldZ, simulateKick } from "../src/game/core/fieldGoal";
import { stadiumCameraFrame, stadiumViewOffset } from "../src/game/core/stadiumCamera";
import { attemptFor, buildKick, idealAngle, aimForAngle, ladderYards, neededPower } from "../src/game/core/stadiumChallenge";

function project(camera: THREE.PerspectiveCamera, p: readonly number[], width: number, height: number) {
  const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
  return [((v.x + 1) * width) / 2, ((1 - v.y) * height) / 2] as const;
}
function aimAt(camera: THREE.PerspectiveCamera, frame: ReturnType<typeof stadiumCameraFrame>) {
  camera.position.set(...frame.position);
  camera.lookAt(...frame.target);
  camera.updateMatrixWorld();
}

describe("stadium game camera", () => {
  it.each([
    [800, 500],
    [390, 844],
    [1440, 900],
  ])("before every kick both uprights and the bar are in frame and ≥ 40 px wide at %s×%s", (width, height) => {
    const camera = new THREE.PerspectiveCamera(56, width / height, 0.1, 180);
    const portrait = width < 700 && height > width;
    for (let rung = 0; rung < 16; rung++) {
      const a = attemptFor(7, rung, rung);
      const spot = { x: a.spot.x, z: fieldZ(a.spot.d) };
      aimAt(camera, stadiumCameraFrame({ x: 0, z: 0 }, true, [spot.x, FIELD_GOAL.tee, spot.z], portrait, spot));
      const left = project(camera, [-FIELD_GOAL.halfWidth, FIELD_GOAL.crossbar + 3, FIELD_GOAL.goalZ], width, height);
      const right = project(camera, [FIELD_GOAL.halfWidth, FIELD_GOAL.crossbar + 3, FIELD_GOAL.goalZ], width, height);
      const bar = project(camera, [0, FIELD_GOAL.crossbar, FIELD_GOAL.goalZ], width, height);
      const tee = project(camera, [spot.x, FIELD_GOAL.tee, spot.z], width, height);
      for (const [x, y] of [left, right, bar, tee]) {
        expect(x, `rung ${rung}`).toBeGreaterThan(8);
        expect(x).toBeLessThan(width - 8);
        expect(y).toBeGreaterThan(8);
        expect(y).toBeLessThan(height - 8);
      }
      expect(right[0] - left[0], `rung ${rung} (${ladderYards(rung)} yd)`).toBeGreaterThanOrEqual(40);
    }
  });
  it("keeps the ball in frame through a long kick", () => {
    const [width, height] = [800, 500];
    const camera = new THREE.PerspectiveCamera(56, width / height, 0.1, 180);
    camera.setViewOffset(width, height, stadiumViewOffset(width, height), 0, width, height);
    for (const yards of [25, 43, 60]) {
      const a = attemptFor(3, 5, 1, yards);
      const p = Math.min(1, neededPower(a.spot) + 0.02);
      const flight = simulateKick(buildKick(a.spot, p, aimForAngle(idealAngle(a.spot, p))));
      const spot = { x: a.spot.x, z: fieldZ(a.spot.d) };
      for (let i = 0; i < flight.path.length / 3; i += 3) {
        const ball = [flight.path[i * 3], flight.path[i * 3 + 1], fieldZ(flight.path[i * 3 + 2])] as [number, number, number];
        if (i * FLIGHT_STEP > flight.crossT) break;
        aimAt(camera, stadiumCameraFrame({ x: 0, z: 0 }, true, ball, false, spot));
        const [x, y] = project(camera, ball, width, height);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(width);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(height);
      }
    }
  });
});
