import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  aimThrough,
  blendFog,
  catmullRom,
  clearFlightPath,
  flightFloor,
  flightPoses,
  peekFog,
  peekPose,
  project,
  smootherstep,
  toNdc,
  type Obstacle,
} from "../src/stage/peephole/flight";
import { CameraRigRuntime } from "../src/game/engine/rig";
import { cameraRig, type CameraPose } from "../src/stage/contract";
import { isPlayPath, isReturning, visitPolicy } from "../src/stage/peephole/policy";

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
    expect(p).toMatchObject({ preloadAtIdle: false, physical: true, flightSeconds: 4.6, pullScale: 1, playLabel: "Play" });
  });
  it("returning: shorter pull and flight, Continue", () => {
    const p = visitPolicy({ ...base, returning: true });
    expect(p).toMatchObject({ pullScale: 0.6, flightSeconds: 2.2, playLabel: "Continue", instantCounter: true });
  });
  it("respects Save-Data, 2g and reduced motion", () => {
    expect(visitPolicy({ ...base, saveData: true }).preloadAtIdle).toBe(false);
    expect(visitPolicy({ ...base, effectiveType: "2g" }).preloadAtIdle).toBe(false);
    expect(visitPolicy({ ...base, effectiveType: "4g" }).preloadAtIdle).toBe(false);
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

describe("returning visitors", () => {
  it("counts entering, or a save that predates the silent boot", () => {
    expect(isReturning(false, false, false)).toBe(false);
    expect(isReturning(true, false, false)).toBe(true); // legacy player
    expect(isReturning(true, false, true)).toBe(false); // save written behind the page
    expect(isReturning(true, true, true)).toBe(true);
    expect(isReturning(false, true, false)).toBe(true);
  });
});

describe("tear flight: clear path, one curve, haze (A7)", () => {
  const peek = peekPose(scene, { x: 860, y: 280 }, vp);
  const live: CameraPose = { position: [8, 6, 14], target: [0, 1.4, 4], fov: 42 };
  const base = flightPoses(peek, live, scene);
  /** Box straddling the unobstructed path where it is lowest (the pergola case). */
  function boxOnPath(): Obstacle {
    const path = clearFlightPath(base, []);
    const p = path[path.length - 5].position;
    return [p[0], p[2], 2, 2, p[1] + 0.5]; // 4 × 4 footprint, top above the camera
  }
  const heights = (poses: CameraPose[]) => poses.map((p) => p.position[1]);
  const secondDiff = (h: number[]) => h.slice(1, -1).map((v, i) => h[i] - 2 * v + h[i + 2]);
  /** Vertical distance above the box top inside the grown footprint, else horizontal distance. */
  function clearance(pose: CameraPose, [cx, cz, hx, hz, top]: Obstacle) {
    const [x, y, z] = pose.position;
    const dx = Math.max(0, Math.abs(x - cx) - hx);
    const dz = Math.max(0, Math.abs(z - cz) - hz);
    const flat = Math.hypot(dx, dz);
    return flat > 0 ? Math.max(flat, y - top) : y - top;
  }

  it("catmull-rom passes through its control points", () => {
    const pts = base.map((p) => p.position);
    for (let i = 0; i < pts.length; i++) {
      const q = catmullRom(pts, i / (pts.length - 1));
      for (let k = 0; k < 3; k++) expect(q[k]).toBeCloseTo(pts[i][k], 6);
    }
  });
  it("keeps 1.5 m clear of a 4×4×3 box on the path, ends fixed, gently", () => {
    const box = boxOnPath();
    const free = clearFlightPath(base, []);
    const lifted = clearFlightPath(base, [box]);
    expect(lifted).toHaveLength(48);
    expect(lifted[0].position).toEqual(free[0].position);
    expect(lifted.at(-1)!.position).toEqual(free.at(-1)!.position);
    const inside = free.filter((p) => flightFloor(p.position[0], p.position[2], [box]) > p.position[1]);
    expect(inside.length).toBeGreaterThan(0); // the box really was in the way
    for (const p of lifted.slice(0, -1)) expect(clearance(p, box)).toBeGreaterThanOrEqual(1.5);
    const accFree = Math.max(...secondDiff(heights(free)).map(Math.abs));
    const accLifted = Math.max(...secondDiff(heights(lifted)).map(Math.abs));
    expect(accLifted).toBeLessThan(2 * accFree);
  });
  it("changes nothing without obstacles, or with one off the path", () => {
    const free = clearFlightPath(base, []);
    expect(clearFlightPath(base, [[500, 500, 2, 2, 50]])).toEqual(free);
  });

  it("flies one smootherstep curve: still at both ends, no speed steps", () => {
    const rig = new CameraRigRuntime();
    const camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 1000);
    const placeLive = () => {
      camera.position.set(...live.position);
      camera.lookAt(...live.target);
      camera.userData.viewDistance = Math.hypot(8, 4.6, 10);
      camera.fov = 42;
    };
    placeLive();
    rig.apply(camera, 0);
    rig.restore(camera);
    const duration = 4.6;
    cameraRig.path({ points: clearFlightPath(base, [boxOnPath()]), duration, ease: "smootherstep", blendToLive: 0.6 });
    const dt = 1 / 120;
    const positions: THREE.Vector3[] = [];
    for (let t = 0; t <= duration + 2 * dt; t += dt) {
      placeLive();
      rig.apply(camera, dt);
      positions.push(camera.position.clone());
      rig.restore(camera);
    }
    const speeds = positions.slice(1).map((p, i) => p.distanceTo(positions[i]) / dt);
    const peak = Math.max(...speeds);
    expect(speeds[0]).toBeLessThan(0.02 * peak);
    expect(speeds[Math.round(duration / dt) - 2]).toBeLessThan(0.02 * peak);
    const steps = speeds.slice(1).map((v, i) => [i, Math.abs(v - speeds[i])]);
    const worst = steps.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (process.env.DEBUG_FLIGHT) console.log("peak", peak, "worst", worst, steps.length);
    for (let i = 1; i < speeds.length; i++) expect(Math.abs(speeds[i] - speeds[i - 1])).toBeLessThan(0.05 * peak);
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
  });

  it("peek haze leaves the island centre nearly clear, then eases to gameplay fog", () => {
    for (const d of [180, 230, 300]) {
      const f = peekFog(d);
      const t = (d - f.near) / (f.far - f.near);
      expect(t * t * (3 - 2 * t)).toBeLessThanOrEqual(0.2); // three's fog smoothstep at depth d
    }
    const live = { near: 20, far: 280 };
    expect(blendFog(peekFog(230), live, 0)).toEqual(peekFog(230));
    expect(blendFog(peekFog(230), live, 1)).toEqual(live);
  });
});
