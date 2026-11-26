import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  aimThrough,
  flightPoses,
  peekPose,
  project,
  toNdc,
} from "../src/stage/peephole/flight";
import { isPlayPath, visitPolicy } from "../src/stage/peephole/policy";

const vp = { width: 1440, height: 900 };
const scene = { subject: [-6, 0, -18] as const, approach: [70, 85, 95] as const };

describe("aiming through the hole", () => {
  it("puts the subject exactly on the requested pixel (checked with three)", () => {
    const pos = [40, 180, 120] as const;
    const target = aimThrough(pos, scene.subject, 0.3, 0.35, 30, 1.6);
    const cam = new THREE.PerspectiveCamera(30, 1.6, 0.1, 1000);
    cam.position.set(...pos);
    cam.lookAt(...target);
    cam.updateMatrixWorld();
    const p = new THREE.Vector3(...scene.subject).project(cam);
    expect(p.x).toBeCloseTo(0.3, 3);
    expect(p.y).toBeCloseTo(0.35, 3);
  });
  it("peek pose frames the island under the o", () => {
    const hole = { x: 860, y: 280 };
    const pose = peekPose(scene, hole, vp);
    const p = project(pose, scene.subject, vp.width / vp.height);
    const ndc = toNdc(hole.x, hole.y, vp);
    expect(p.x).toBeCloseTo(ndc.x, 3);
    expect(p.y).toBeCloseTo(ndc.y, 3);
    expect(p.depth).toBeGreaterThan(100);
    expect(pose.position[1]).toBeGreaterThan(150);
  });
});

describe("flight", () => {
  it("starts at peek, ends at live, keeps bank under 4°, and descends", () => {
    const peek = peekPose(scene, { x: 860, y: 280 }, vp);
    const live = { position: [30, 50, 40] as const, target: [0, 0, 0] as const, fov: 20 };
    const poses = flightPoses(peek, live, scene);
    expect(poses[0].position).toEqual(peek.position);
    expect(poses.at(-1)!.position).toEqual(live.position);
    for (const p of poses) expect(Math.abs(p.roll ?? 0)).toBeLessThanOrEqual((4 * Math.PI) / 180);
    for (let i = 1; i < poses.length; i++)
      expect(poses[i].position[1]).toBeLessThan(poses[i - 1].position[1] + 1e-6);
  });
});

describe("visit policy", () => {
  const base = { reducedMotion: false, saveData: false, returning: false, webgl: true };
  it("first visit: physical, full flight, preloads", () => {
    const p = visitPolicy(base);
    expect(p).toMatchObject({ preloadAtIdle: true, physical: true, flightSeconds: 4.6, pullScale: 1, playLabel: "Play" });
  });
  it("returning: shorter pull and flight, Continue", () => {
    const p = visitPolicy({ ...base, returning: true });
    expect(p).toMatchObject({ pullScale: 0.6, flightSeconds: 2.2, playLabel: "Continue", instantCounter: true });
  });
  it("respects Save-Data, 2g and reduced motion", () => {
    expect(visitPolicy({ ...base, saveData: true }).preloadAtIdle).toBe(false);
    expect(visitPolicy({ ...base, effectiveType: "2g" }).preloadAtIdle).toBe(false);
    expect(visitPolicy({ ...base, effectiveType: "4g" }).preloadAtIdle).toBe(true);
    const r = visitPolicy({ ...base, reducedMotion: true });
    expect(r.physical).toBe(false);
    expect(r.flightSeconds).toBe(0);
  });
  it("recognises the play route", () => {
    expect(isPlayPath("/play")).toBe(true);
    expect(isPlayPath("/play/")).toBe(true);
    expect(isPlayPath("/player")).toBe(false);
    expect(isPlayPath("/")).toBe(false);
  });
});
