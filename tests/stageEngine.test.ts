import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  canEnterMode,
  cameraRig,
  distanceToZoom,
  useCameraRig,
  useStage,
  zoomToDistance,
  TELEPHOTO_FOV,
} from "../src/stage/contract";
import { aimCamera, viewZoom } from "../src/game/engine/camera";
import { CameraRigRuntime } from "../src/game/engine/rig";
import { ISLAND_CAMERA_OFFSET } from "../src/game/core/islandView";

describe("stage mode machine", () => {
  it("allows only the designed transitions", () => {
    expect(canEnterMode("site", "peek")).toBe(true);
    expect(canEnterMode("peek", "tearing")).toBe(true);
    expect(canEnterMode("tearing", "flying")).toBe(true);
    expect(canEnterMode("flying", "game")).toBe(true);
    expect(canEnterMode("game", "site")).toBe(true);
    expect(canEnterMode("site", "flying")).toBe(false);
    expect(canEnterMode("flying", "peek")).toBe(false);
  });
  it("rejects an illegal jump without changing state", () => {
    useStage.setState({ mode: "site" });
    expect(useStage.getState().setMode("flying")).toBe(false);
    expect(useStage.getState().mode).toBe("site");
    expect(useStage.getState().setMode("peek")).toBe(true);
    expect(useStage.getState().worldVisible).toBe(true);
    useStage.setState({ mode: "site", worldVisible: false });
  });
});

describe("ortho zoom → telephoto distance", () => {
  it("round-trips", () => {
    const d = zoomToDistance(29, 800);
    expect(distanceToZoom(d, 800)).toBeCloseTo(29, 6);
  });

  it("frames the target plane exactly like the old orthographic camera", () => {
    const width = 1280,
      height = 800,
      zoom = 9.5;
    const target = new THREE.Vector3(4, 0.7, -3);
    const offset = new THREE.Vector3(...ISLAND_CAMERA_OFFSET);
    const ortho = new THREE.OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0.1,
      1000,
    );
    const perspective = new THREE.PerspectiveCamera(
      TELEPHOTO_FOV,
      width / height,
      0.1,
      5000,
    );
    aimCamera(ortho, target, offset, zoom, height);
    aimCamera(perspective, target, offset, zoom, height);
    ortho.updateMatrixWorld();
    perspective.updateMatrixWorld();
    expect(viewZoom(ortho)).toBe(zoom);
    expect(viewZoom(perspective)).toBe(zoom);
    // Points on the plane through the target, facing the camera, land on the
    // same pixels under both projections.
    const right = new THREE.Vector3().setFromMatrixColumn(perspective.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(perspective.matrixWorld, 1);
    for (const [r, u] of [
      [0, 0],
      [20, 0],
      [0, 15],
      [-30, -12],
    ]) {
      const point = target.clone().addScaledVector(right, r).addScaledVector(up, u);
      const a = point.clone().project(ortho);
      const b = point.clone().project(perspective);
      expect(b.x).toBeCloseTo(a.x, 4);
      expect(b.y).toBeCloseTo(a.y, 4);
    }
  });
});

describe("camera rig", () => {
  const camera = () => {
    const c = new THREE.PerspectiveCamera(20, 1.6, 0.1, 1000);
    c.position.set(0, 50, 60);
    c.lookAt(0, 0, 0);
    c.userData.viewDistance = Math.hypot(50, 60);
    c.updateMatrixWorld();
    return c;
  };

  it("never changes the gameplay camera it overrides", () => {
    const rig = new CameraRigRuntime();
    const c = camera();
    const before = c.position.clone();
    cameraRig.pose({ position: [10, 10, 10], target: [0, 0, 0], fov: 30 });
    rig.apply(c, 1 / 60);
    expect(c.position.toArray()).toEqual([10, 10, 10]);
    expect(c.fov).toBe(30);
    rig.restore(c);
    expect(c.position.equals(before)).toBe(true);
    expect(c.fov).toBe(20);
    cameraRig.live();
  });

  it("ends a flight exactly on the live follow pose and hands control back", () => {
    const rig = new CameraRigRuntime();
    const c = camera();
    let blendStarted = 0,
      done = 0;
    cameraRig.path({
      points: [
        { position: [0, 200, 200], target: [0, 0, 0], fov: 30 },
        { position: [40, 80, 90], target: [0, 0, 0], fov: 24 },
        { position: [0, 50, 60], target: [0, 0, 0], fov: 20 },
      ],
      duration: 1,
      blendToLive: 0.3,
      onBlendStart: () => blendStarted++,
      onDone: () => done++,
    });
    for (let i = 0; i < 70; i++) {
      rig.apply(c, 1 / 60);
      rig.restore(c);
    }
    expect(blendStarted).toBe(1);
    expect(done).toBe(1);
    expect(useCameraRig.getState().command.kind).toBe("live");
    expect(rig.rendered.position.distanceTo(c.position)).toBeLessThan(1e-6);
  });

  it("smooths a scene change instead of cutting", () => {
    const rig = new CameraRigRuntime();
    const c = camera();
    rig.apply(c, 1 / 60);
    rig.restore(c);
    rig.blend(0.6);
    c.position.set(100, 20, 0);
    c.lookAt(0, 0, 0);
    rig.apply(c, 1 / 60);
    // First frame after the change is still near the old pose.
    expect(rig.rendered.position.distanceTo(new THREE.Vector3(0, 50, 60))).toBeLessThan(5);
    rig.restore(c);
    for (let i = 0; i < 60; i++) {
      rig.apply(c, 1 / 60);
      rig.restore(c);
    }
    expect(rig.rendered.position.distanceTo(c.position)).toBeLessThan(1e-6);
  });
});
