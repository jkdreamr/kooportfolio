import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createGait,
  seatPose,
  stepGait,
  FULL_STRIDE_SPEED,
} from "../src/game/world/character/locomotion";
import { Baker } from "../src/game/world/StaticBatch";
import { PARTS, solveJoints } from "../src/game/world/character/rig";

describe("locomotion driver", () => {
  it("eases into and out of a walk instead of snapping", () => {
    const gait = createGait(3);
    stepGait(gait, 1 / 60, FULL_STRIDE_SPEED, 0, 0);
    const first = gait.pose.walk;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.4);
    for (let i = 0; i < 120; i++) stepGait(gait, 1 / 60, FULL_STRIDE_SPEED, 0, 0);
    expect(gait.pose.walk).toBeGreaterThan(0.95);
    stepGait(gait, 1 / 60, 0, 0, 0);
    expect(gait.pose.walk).toBeGreaterThan(0.6);
    for (let i = 0; i < 120; i++) stepGait(gait, 1 / 60, 0, 0, 0);
    expect(gait.pose.walk).toBeLessThan(0.05);
  });

  it("swings legs and arms in opposition while walking", () => {
    const gait = createGait(1);
    let opposed = 0;
    for (let i = 0; i < 200; i++) {
      const p = stepGait(gait, 1 / 60, FULL_STRIDE_SPEED, 0, 0);
      if (i > 60 && Math.abs(p.hipL) > 0.2) {
        expect(Math.sign(p.hipL)).toBe(-Math.sign(p.hipR));
        // Left arm swings with the right leg.
        expect(Math.sign(p.armL)).toBe(Math.sign(p.hipR));
        opposed++;
      }
    }
    expect(opposed).toBeGreaterThan(10);
  });

  it("banks into turns and leans when accelerating", () => {
    const gait = createGait(2);
    let heading = 0;
    for (let i = 0; i < 60; i++) {
      heading += 0.06;
      stepGait(gait, 1 / 60, FULL_STRIDE_SPEED, 0, heading);
    }
    expect(Math.abs(gait.pose.bank)).toBeGreaterThan(0.05);
    const still = createGait(4);
    stepGait(still, 1 / 60, 0, 0, 0);
    const lean0 = still.pose.lean;
    for (let i = 0; i < 6; i++) stepGait(still, 1 / 60, FULL_STRIDE_SPEED, 0, 0);
    expect(still.pose.lean).toBeGreaterThan(lean0);
  });

  it("idles with breathing and blinks deterministically", () => {
    const a = createGait(9),
      b = createGait(9);
    let blinked = false;
    for (let i = 0; i < 600; i++) {
      stepGait(a, 1 / 60, 0, 0, 0);
      stepGait(b, 1 / 60, 0, 0, 0);
      if (a.pose.eyes < 0.5) blinked = true;
    }
    expect(blinked).toBe(true);
    expect(a.pose).toEqual(b.pose);
  });

  it("folds into a seated pose", () => {
    const gait = createGait(5);
    const pose = seatPose(stepGait(gait, 1 / 60, 0, 0, 0), 1);
    expect(pose.hipL).toBeCloseTo(Math.PI / 2);
    expect(pose.kneeR).toBeCloseTo(Math.PI / 2);
  });

  it("keeps the feet near the ground when standing", () => {
    const gait = createGait(6);
    for (let i = 0; i < 30; i++) stepGait(gait, 1 / 60, 0, 0, 0);
    const joints = solveJoints(gait.pose, new THREE.Matrix4());
    const ankle = new THREE.Vector3().setFromMatrixPosition(joints.ankleL);
    expect(ankle.y).toBeGreaterThan(0.02);
    expect(ankle.y).toBeLessThan(0.14);
    expect(PARTS.length).toBeGreaterThan(20);
  });
});

describe("StaticBatch baker", () => {
  const box = new THREE.BoxGeometry();
  const red = new THREE.MeshStandardMaterial({ color: "#c33" });
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });

  function building() {
    const root = new THREE.Group();
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(box, red);
      m.position.set(i, 0, 0);
      root.add(m);
    }
    const pane = new THREE.Mesh(box, glass);
    root.add(pane);
    const live = new THREE.Group();
    live.userData.noBake = true;
    live.add(new THREE.Mesh(box, red));
    root.add(live);
    return { root, pane };
  }

  it("merges opaque meshes into one draw and leaves the rest alone", () => {
    const { root, pane } = building();
    const baker = new Baker(root, "test-a");
    baker.bake();
    expect(baker.meshes.length).toBe(1);
    expect(baker.entries.length).toBe(20);
    expect(pane.visible).toBe(true);
    const merged = baker.meshes[0].geometry;
    expect(merged.attributes.position.count).toBe(20 * box.attributes.position.count);
    expect(merged.attributes.color).toBeDefined();
    baker.dispose();
    expect(root.children.every((c) => c.visible)).toBe(true);
  });

  it("reuses the cached geometry for identical content", () => {
    const a = building(),
      b = building();
    const ba = new Baker(a.root, "test-b");
    const bb = new Baker(b.root, "test-b");
    ba.bake();
    bb.bake();
    expect(bb.meshes[0].geometry).toBe(ba.meshes[0].geometry);
    ba.dispose();
    bb.dispose();
  });

  it("un-bakes a piece that starts moving", () => {
    const { root } = building();
    const baker = new Baker(root, "test-c");
    baker.bake();
    const mover = baker.entries[3].object;
    mover.position.y = 2;
    root.updateMatrixWorld(true);
    for (let i = 0; i < 10; i++) {
      baker.tick();
      root.updateMatrixWorld(true);
    }
    expect(mover.visible).toBe(true);
    expect(baker.entries.length).toBe(19);
    baker.dispose();
  });
});
