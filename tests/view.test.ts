import { afterEach, describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { aimCamera } from "../src/game/engine/camera";
import {
  BOOM_LAST_RESORT,
  BOOM_MAX_ELEVATION,
  BOOM_MIN_DISTANCE,
  EXPLORE_ELEVATION,
  EXPLORE_FOV,
  applyViewPose,
  azimuthOf,
  buildTreeGrid,
  clearBoom,
  dioramaPose,
  easeView,
  exploreLens,
  explorePose,
  makeViewPose,
  mixView,
  stepViewProgress,
  treeBlocked,
} from "../src/game/engine/view";
import { ISLAND_CAMERA_OFFSET } from "../src/game/core/islandView";
import { obstacleAt, resetBoomMemo, setBoomObstacles } from "../src/game/engine/view";
import { FLIGHT_OBSTACLES, HERO_SPOTS } from "../src/game/core/heroSpots";
import { canWalk, doorsInWorld } from "../src/game/core/world";
import { terrainHeightAt } from "../src/game/core/terrain";
import type { WorldId } from "../src/shared/worlds";
import {
  DEFAULT_EXPLORE_DISTANCE,
  MAX_EXPLORE_DISTANCE,
  MIN_EXPLORE_DISTANCE,
  dollyExplore,
  setView,
  toggleView,
  useWorldView,
} from "../src/game/core/worldView";
import { freshSave, parseSave } from "../src/shared/save";

const offset = new Vector3(...ISLAND_CAMERA_OFFSET);
const cameraPosition = (pose: ReturnType<typeof makeViewPose>) =>
  pose.target.clone().addScaledVector(pose.direction, pose.distance);

afterEach(() =>
  useWorldView.setState({
    zoom: 1,
    view: "diorama",
    exploreDistance: DEFAULT_EXPLORE_DISTANCE,
  }),
);

describe("diorama pose", () => {
  it.each([1, 2.4, 4.5, 14])(
    "is bit-identical to aimCamera at zoom %s",
    (zoom) => {
      const look = new Vector3(-6.25, 0.7, -18.125);
      const camera = new PerspectiveCamera(20, 1440 / 900, 0.1, 1000);
      aimCamera(camera, look, offset, zoom * 9.3, 900);
      const pose = dioramaPose(makeViewPose(), look, offset, zoom * 9.3, 900);
      const mixed = mixView(makeViewPose(), pose, makeViewPose(), 0);
      // The Walker path at blend 0 is aimCamera itself; the pose maths match.
      expect(cameraPosition(pose).toArray()).toEqual(camera.position.toArray());
      expect(mixed.distance).toBe(camera.userData.viewDistance);
      expect(mixed.fov).toBe(20);
    },
  );
});

describe("explore pose", () => {
  it("keeps the diorama azimuth and sits low behind the player", () => {
    const pose = explorePose(
      makeViewPose(),
      { x: 4, y: 0.18, z: 9 },
      offset,
      10,
      EXPLORE_FOV,
    );
    expect(Math.atan2(pose.direction.x, pose.direction.z)).toBeCloseTo(
      azimuthOf(offset),
      12,
    );
    expect(Math.asin(pose.direction.y)).toBeCloseTo(EXPLORE_ELEVATION, 12);
    expect(pose.target.y).toBeCloseTo(0.18 + 1.4, 12);
    // Shifted to screen-right: the player sits left of centre.
    const right = new Vector3(Math.cos(azimuthOf(offset)), 0, -Math.sin(azimuthOf(offset)));
    expect(pose.target.clone().sub(new Vector3(4, 1.58, 9)).dot(right)).toBeCloseTo(0.8, 9);
    expect(cameraPosition(pose).y).toBeGreaterThan(3);
  });
  it("uses a wider lens and longer boom on a phone in portrait", () => {
    expect(exploreLens(390, 844)).toEqual({ fov: 50, distanceScale: 1.1 });
    expect(exploreLens(1440, 900)).toEqual({ fov: 42, distanceScale: 1 });
    expect(exploreLens(844, 390).fov).toBe(42);
  });
  it("frames the character at 14–18% of the viewport height by default", () => {
    // Measured on 1440×900 renders: the character with its hat spans 16.2–16.4%
    // of the height at the default 10-unit boom, i.e. ~1.26 world units.
    const visible = 2 * DEFAULT_EXPLORE_DISTANCE * Math.tan((EXPLORE_FOV * Math.PI) / 360);
    expect(1.26 / visible).toBeGreaterThan(0.14);
    expect(1.26 / visible).toBeLessThan(0.18);
  });
});

describe("view blend", () => {
  const diorama = dioramaPose(
    makeViewPose(),
    new Vector3(-6, 0.7, -18),
    offset,
    9.3,
    900,
  );
  const explore = explorePose(makeViewPose(), { x: 3, y: 0.18, z: 6 }, offset, 10, 42);
  it("returns each end exactly", () => {
    const out = makeViewPose();
    mixView(out, diorama, explore, 1);
    expect(out).toEqual(explore);
    mixView(out, diorama, explore, 0);
    expect(out).toEqual(diorama);
  });
  it("changes framed size monotonically and never dips under the ground", () => {
    const out = makeViewPose();
    let previous = Infinity;
    for (let i = 0; i <= 100; i++) {
      mixView(out, diorama, explore, easeView(i / 100));
      const framed = out.distance * Math.tan((out.fov * Math.PI) / 360);
      expect(framed).toBeLessThanOrEqual(previous + 1e-9);
      previous = framed;
      expect(cameraPosition(out).y).toBeGreaterThan(1);
    }
  });
  it("reverses mid-blend without a jump", () => {
    let p = 0;
    for (let i = 0; i < 20; i++) p = stepViewProgress(p, 1, 1 / 60, 0.9);
    const mid = p;
    const back = stepViewProgress(p, 0, 1 / 60, 0.9);
    expect(mid - back).toBeCloseTo(1 / 54, 9);
    expect(easeView(mid) - easeView(back)).toBeLessThan(0.04);
    expect(stepViewProgress(0.99, 1, 1, 0.9)).toBe(1);
  });
});

describe("boom safety", () => {
  const target = { x: 0, y: 1.6, z: 0 };
  const azimuth = azimuthOf(offset);
  it("keeps the full boom when nothing is in the way", () => {
    const out = clearBoom({ distance: 0, elevation: 0 }, target, azimuth, 10, () => false);
    expect(out).toEqual({ distance: 10, elevation: EXPLORE_ELEVATION });
  });
  it("comes closer behind a wall before it rises, never under the minimum", () => {
    // A wall 6 units behind the player along the boom.
    const wall = (x: number, z: number) =>
      x * Math.sin(azimuth) + z * Math.cos(azimuth) > 6;
    const out = clearBoom({ distance: 0, elevation: 0 }, target, azimuth, 10, wall);
    expect(out.distance).toBeLessThan(6.5);
    expect(out.distance).toBeGreaterThanOrEqual(BOOM_MIN_DISTANCE);
    expect(out.elevation).toBe(EXPLORE_ELEVATION);
    // A wall closer than the minimum boom: shortest length, then up.
    const close = (x: number, z: number, y: number) =>
      x * Math.sin(azimuth) + z * Math.cos(azimuth) > 1.5 && y < 2.4;
    const raised = clearBoom({ distance: 0, elevation: 0 }, target, azimuth, 10, close);
    expect(raised.distance).toBe(BOOM_MIN_DISTANCE);
    expect(raised.elevation).toBeGreaterThan(EXPLORE_ELEVATION);
    const boxed = clearBoom({ distance: 0, elevation: 0 }, target, azimuth, 10, () => true);
    expect(boxed).toEqual({ distance: BOOM_LAST_RESORT, elevation: BOOM_MAX_ELEVATION });
  });
  it("stays out of tree crowns and trunks, but not the crown over the player", () => {
    const dir = { x: Math.sin(azimuth), z: Math.cos(azimuth) };
    // A crown (radius 1.6, centre 3 m up) right where the full boom ends.
    const camera = cameraPosition(explorePose(makeViewPose(), { x: 0, y: 0.18, z: 0 }, offset, 10, EXPLORE_FOV));
    const over: [number, number, number, number] = [0, 3.4, 0, 1.8];
    const grid = buildTreeGrid([[camera.x, camera.y, camera.z, 1.6], over]);
    expect(treeBlocked(grid, camera.x, camera.z, camera.y, 0, 0)).toBe(true);
    // Trunk below the crown centre, clear above and beside it.
    expect(treeBlocked(grid, camera.x, camera.z, 0.5, 0, 0)).toBe(true);
    expect(treeBlocked(grid, camera.x + 4, camera.z, camera.y, 0, 0)).toBe(false);
    // The crown over the player's own head is ignored.
    expect(treeBlocked(grid, 0, 0, 3.4, 0, 0)).toBe(false);
    expect(treeBlocked(grid, 0, 0, 3.4, 30, 30)).toBe(true);
    const out = clearBoom({ distance: 0, elevation: 0 }, target, azimuth, 10, (x, z, y) =>
      treeBlocked(grid, x, z, y, target.x, target.z),
    );
    expect(out.distance).toBeLessThan(10);
    expect(out.distance).toBeGreaterThanOrEqual(BOOM_MIN_DISTANCE);
    // Far away from every tree: an empty cell answers false.
    expect(treeBlocked(grid, dir.x * 200, dir.z * 200, 2, 0, 0)).toBe(false);
    expect(treeBlocked(buildTreeGrid([]), 0, 0, 0, 9, 9)).toBe(false);
  });
});

describe("camera write", () => {
  it("records a view zoom the marker and the rig can read", () => {
    const camera = new PerspectiveCamera(20, 1.6, 0.1, 1000);
    const pose = explorePose(makeViewPose(), { x: 0, y: 0.18, z: 0 }, offset, 10, 42);
    applyViewPose(camera, pose, 900);
    expect(camera.fov).toBe(42);
    expect(camera.userData.viewDistance).toBe(10);
    expect(camera.position.distanceTo(pose.target)).toBeCloseTo(10, 9);
    expect(camera.userData.viewZoom).toBeCloseTo(900 / (2 * Math.tan((21 * Math.PI) / 180) * 10), 9);
  });
});

describe("view state", () => {
  it("toggles and dollies the explore boom within 6–16", () => {
    toggleView();
    expect(useWorldView.getState().view).toBe("explore");
    for (let i = 0; i < 30; i++) dollyExplore(1.25);
    expect(useWorldView.getState().exploreDistance).toBe(MIN_EXPLORE_DISTANCE);
    for (let i = 0; i < 30; i++) dollyExplore(0.8);
    expect(useWorldView.getState().exploreDistance).toBe(MAX_EXPLORE_DISTANCE);
    setView("diorama");
    expect(useWorldView.getState().view).toBe("diorama");
    expect(useWorldView.getState().zoom).toBe(1);
  });
  it("persists the view in the save; old and invalid values still parse", () => {
    const old = freshSave();
    expect(parseSave(JSON.stringify(old))).toEqual(old);
    const chosen = { ...freshSave(), view: "explore" as const };
    expect(parseSave(JSON.stringify(chosen))).toEqual(chosen);
    expect(parseSave(JSON.stringify({ ...freshSave(), view: "orbit" }))).toEqual(
      freshSave(),
    );
  });
});

describe("boom avoids props (A9)", () => {
  const azimuth = azimuthOf(offset);
  const target = { x: 0, y: 1.6, z: 0 };
  it("tests the world's tall props on top of the caller's solids", () => {
    // A pergola post 4 m behind the player, on the boom line.
    const px = Math.sin(azimuth) * 4;
    const pz = Math.cos(azimuth) * 4;
    setBoomObstacles([[px, pz, 0.3, 0.3, 3]]);
    try {
      const out = clearBoom({ distance: 0, elevation: 0 }, target, azimuth, 10, () => false);
      expect(out.distance).toBeLessThan(4);
      expect(out.distance).toBeGreaterThanOrEqual(BOOM_MIN_DISTANCE);
      expect(out.elevation).toBe(EXPLORE_ELEVATION);
    } finally {
      setBoomObstacles([]);
    }
    expect(obstacleAt([[0, 0, 1, 1, 2]], 0.5, 0.5, 1)).toBe(true);
    expect(obstacleAt([[0, 0, 1, 1, 2]], 0.5, 0.5, 2.5)).toBe(false);
    expect(obstacleAt([[0, 0, 1, 1, 2]], 1.5, 0, 1)).toBe(false);
  });

  /** The engine's obstacle list for a world (Game.tsx worldObstacles). */
  const solids = (world: WorldId) => [
    ...FLIGHT_OBSTACLES[world],
    ...doorsInWorld(world).map(({ footprint, anchor }) => [footprint[0], footprint[1], footprint[2] + 0.4, footprint[3] + 0.4, anchor[1]] as const),
  ];
  /** Hero spot plus the first 12 walkable points of a fixed 6 m ring walk. */
  function scriptedPositions(world: WorldId): [number, number][] {
    const [hx, hz] = HERO_SPOTS[world].position;
    const out: [number, number][] = [[hx, hz]];
    for (let ring = 1; out.length < 13 && ring <= 8; ring++)
      for (let k = 0; k < 12 && out.length < 13; k++) {
        const a = (k / 12) * Math.PI * 2 + ring * 0.37;
        const x = hx + Math.cos(a) * ring * 6;
        const z = hz + Math.sin(a) * ring * 6;
        if (canWalk(x, z, world)) out.push([+x.toFixed(2), +z.toFixed(2)]);
      }
    return out;
  }
  for (const world of ["home", "stanford", "korea"] as const) {
    it(`${world}: nothing between the camera and the look point at the player's head, 13 scripted spots`, () => {
      const list = solids(world);
      setBoomObstacles(list);
      try {
        const spots = scriptedPositions(world);
        expect(spots.length).toBe(13);
        for (const [x, z] of spots) {
          const feetY = Math.max(0, terrainHeightAt(x, z, world));
          const pose = explorePose(makeViewPose(), { x, y: feetY + 0.18, z }, offset, DEFAULT_EXPLORE_DISTANCE, EXPLORE_FOV);
          const blocked = (bx: number, bz: number, by: number) => terrainHeightAt(bx, bz, world) > by - 0.6;
          const safe = clearBoom({ distance: 0, elevation: 0 }, pose.target, azimuth, DEFAULT_EXPLORE_DISTANCE, blocked);
          const camera = cameraPosition(explorePose(makeViewPose(), { x, y: feetY + 0.18, z }, offset, safe.distance, EXPLORE_FOV, safe.elevation));
          for (let i = 1; i < 60; i++) {
            const p = camera.clone().lerp(pose.target, i / 60);
            const hit = list.find((o) => obstacleAt([o], p.x, p.z, p.y));
            expect(hit, `${world} ${x},${z} sample ${i} ${p.toArray().map((v) => v.toFixed(2))} ${safe.distance} ${hit}`).toBeUndefined();
          }
        }
      } finally {
        setBoomObstacles([]);
      }
    });
  }
});

describe("boom memo (A12)", () => {
  it("does not sample the world again while nothing has moved", () => {
    resetBoomMemo();
    let calls = 0;
    const blocked = () => {
      calls++;
      return false;
    };
    const target = { x: 1, y: 1.6, z: 2 };
    const a = clearBoom({ distance: 0, elevation: 0 }, target, 0.7, 10, blocked);
    const first = calls;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) expect(clearBoom({ distance: 0, elevation: 0 }, target, 0.7, 10, blocked)).toEqual(a);
    expect(calls).toBe(first);
    clearBoom({ distance: 0, elevation: 0 }, { ...target, x: 1.5 }, 0.7, 10, blocked);
    expect(calls).toBeGreaterThan(first);
    // Still re-checked now and then even when nothing moves.
    const before = calls;
    for (let i = 0; i < 40; i++) clearBoom({ distance: 0, elevation: 0 }, { ...target, x: 1.5 }, 0.7, 10, blocked);
    expect(calls).toBeGreaterThan(before);
  });
});
