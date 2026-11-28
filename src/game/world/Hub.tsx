import { useLayoutEffect, useRef, useState } from "react";
import { gameInputEnabled, useStage } from "../../stage/contract";
import { aimCamera, viewZoom } from "../engine/camera";
import {
  applyViewPose,
  azimuthOf,
  clearBoom,
  dioramaPose,
  easeView,
  exploreLens,
  explorePose,
  makeViewPose,
  mixView,
  stepViewProgress,
  stepSpring,
  buildTreeGrid,
  emptyTreeGrid,
  treeBlocked,
  EXPLORE_ELEVATION,
  VIEW_BLEND_SECONDS,
  VIEW_BLEND_SECONDS_REDUCED,
} from "../engine/view";
import { TELEPHOTO_FOV } from "../../stage/contract";
import { terrainHeightAt } from "../core/terrain";
import type { WorldId } from "../core/worlds";
import { useWorldActive } from "../engine/active";
import { rig } from "../engine/Engine";
import { Environment } from "./env";
import { StaticBatch } from "./StaticBatch";
import { GlazedPanel } from "./GlazedPanel";
import { RegionalActivities, useActivities } from "./RegionalActivities";
import { carriedIn } from "../core/carry";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  Box,
  Ball,
  Bench,
  Character,
  Cylinder,
  Flowers,
  House,
  Ring,
} from "./Models";
import { runtime, useGame, walkTo } from "../core/store";
import { keys, movement, movementSpeed } from "../core/input";
import { footstep } from "../core/sound";
import {
  canWalk,
  doorsInWorld,
  landmarkActionAt,
  moveWorld,
} from "../core/world";
import { LabelProjection } from "./Labels";
import { Landscape } from "./Landscape";
import { IslandUnderside } from "./IslandUnderside";
import { IslandTerrain } from "./IslandTerrain";
import { VillageGardens } from "./VillageGardens";
import { HomeWorldEnvironment } from "./HomeWorldEnvironment";
import { HomeBuildingArt } from "./HomeBuildingArt";
import { KoreaWorldEnvironment } from "./KoreaWorldEnvironment";
import { Bulletin } from "./Bulletin";
import { roomFor } from "../core/room";
import { useGameMode } from "../core/gameMode";
import {
  orbit,
  orbitReset,
  stepOrbit,
  useWorldView,
  viewRuntime,
} from "../core/worldView";
import {
  islandCenter,
  islandZoom,
  islandFollow,
  islandViewShift,
  ISLAND_CAMERA_OFFSET,
} from "../core/islandCamera";
import { NpcCrowd } from "./VillageNpcs";
import { applyQaCamera } from "./qaCamera";
import { nearbyNpcId, talkFocus } from "../core/npcState";
import { BadmintonPavilion } from "../scenes/BadmintonCourt";
import { Wildlife } from "./Wildlife";
import { WritingShell } from "./WritingShell";
import { StadiumBuilding } from "../scenes/StadiumArchitecture";
import { MovieTheaterBuilding } from "../scenes/MovieTheater";
import { IslandTrain } from "./IslandTrain";
import { WorldTravel } from "./WorldTravel";
import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import { PhotoBooth } from "./PhotoBooth";
import { PhotoBoothView } from "./PhotoBoothView";
import { isNearPhotoBooth } from "../core/photoBoothLayout";
import { allCrowns, crownVersion } from "./env/foliage";
import { StargazingHill } from "./StargazingHill";
import {
  STANFORD_BULLETIN,
  STANFORD_TELESCOPE,
} from "../../shared/stanford-transport";
import { SkateParkBuilding } from "../scenes/SkateParkBuilding";
import { BeatLabShell, MathLabShell } from "./LabBuildings";
import { GoShell } from "./GoShell";
import { HooverKey } from "./HooverTowerDoor";
import { HOOVER, HOOVER_KEY, HOOVER_STASH } from "../core/hoover";
import { moveInterior } from "../core/houseRooms";
import {
  KappaShell,
  CognitionShell,
  KitchenShell,
  GymShell,
} from "./VillageBuildings";

/** Rig blend when travel, the train or a game mode takes or returns the hub
 * camera: position and fov (42° explore ↔ 20° telephoto) ease together,
 * ≤ ~2°/frame at 30 fps. */
const HANDOFF_BLEND_SECONDS = 0.8;

const reducedMotion =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;

/** Solid boxes the explore boom must stay out of: building footprints,
 * [cx, cz, halfX, halfZ, roofY]. Cached per world (doorsInWorld allocates). */
const boomSolids = new Map<WorldId, readonly (readonly number[])[]>();
function solidsFor(world: WorldId) {
  let solids = boomSolids.get(world);
  if (!solids) {
    solids = doorsInWorld(world).map(({ footprint, anchor }) => [
      footprint[0],
      footprint[1],
      footprint[2] + 0.4,
      footprint[3] + 0.4,
      anchor[1],
    ]);
    boomSolids.set(world, solids);
  }
  return solids;
}
/** doorsInWorld allocates a fresh list per call: the walker asks every
 * frame, so keep one per world. */
const worldDoors = new Map<WorldId, ReturnType<typeof doorsInWorld>>();
function doorsFor(world: WorldId) {
  let list = worldDoors.get(world);
  if (!list) {
    list = doorsInWorld(world);
    worldDoors.set(world, list);
  }
  return list;
}
let boomWorld: WorldId = "home";
/** The boom's look point: the crown the player stands under is ignored. */
const boomOrigin = { x: 0, z: 0 };
/** Every registered tree crown (village trees and groves), binned once per
 * change of the crown registry; queried without allocation. */
let treeGrid = emptyTreeGrid();
let treeGridVersion = -1;
function refreshTreeGrid() {
  const version = crownVersion();
  if (version === treeGridVersion) return;
  treeGridVersion = version;
  treeGrid = buildTreeGrid(
    allCrowns().map(({ p, s }) => [
      p[0],
      p[1],
      p[2],
      Math.max(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2])),
    ]),
  );
}
/** Rotate a horizontal vector about +Y by `angle` (as Object3D.rotateY). */
function yawX(x: number, z: number, angle: number) {
  return x * Math.cos(angle) + z * Math.sin(angle);
}
function yawZ(x: number, z: number, angle: number) {
  return z * Math.cos(angle) - x * Math.sin(angle);
}

function boomBlocked(x: number, z: number, y: number) {
  const solids = solidsFor(boomWorld);
  for (let i = 0; i < solids.length; i++) {
    const [cx, cz, hx, hz, top] = solids[i];
    if (y < top && Math.abs(x - cx) < hx && Math.abs(z - cz) < hz) return true;
  }
  if (treeBlocked(treeGrid, x, z, y, boomOrigin.x, boomOrigin.z)) return true;
  return terrainHeightAt(x, z, boomWorld) > y - 0.6;
}

export function Walker({
  interior = false,
  locked = false,
  followCamera = true,
}: {
  interior?: boolean;
  locked?: boolean;
  followCamera?: boolean;
}) {
  const avatar = useRef<THREE.Group>(null),
    color = useGame((s) => s.save.color),
    hat = useGame((s) => s.save.hat);
  // False while the hub is parked behind an interior: no movement, no camera.
  const active = useWorldActive();
  const playing = useGameMode((s) => !!s.active);
  const { camera, size } = useThree();
  const follow = useRef(new THREE.Vector3()),
    desired = useRef(new THREE.Vector3()),
    offset = useRef(new THREE.Vector3()),
    // The village view's offset: the overview turned by the look-around.
    orbitOffset = useRef(new THREE.Vector3()),
    look = useRef(new THREE.Vector3()),
    // Scene and world the follow camera last framed (compared field by
    // field: no per-frame key string).
    cameraScene = useRef({ scene: "", world: "" });
  // Second view (explore): poses, raw toggle progress, damped boom.
  const views = useRef({
    diorama: makeViewPose(),
    explore: makeViewPose(),
    mixed: makeViewPose(),
    focus: new THREE.Vector3(),
    feet: new THREE.Vector3(),
    // Boom length and pitch ride critically damped springs (B13).
    boomDistance: { value: 10, velocity: 0 },
    boomElevation: { value: EXPLORE_ELEVATION, velocity: 0 },
    safe: { distance: 10, elevation: EXPLORE_ELEVATION },
    progress: 0,
    dioramaZoom: 1,
    ownsLens: false,
    resumed: false,
    /** Another controller took the camera; the first hub frame after it
     * returns goes straight to the saved view instead of ramping up from
     * the far diorama pose. */
    handedOff: false,
  });
  // The first frame faces the landing heading (a hero spot's, B14) instead
  // of turning to it.
  useLayoutEffect(() => {
    if (avatar.current) avatar.current.rotation.y = runtime.heading;
  }, []);
  useFrame((_, delta) => {
    if (!active) {
      // Parked behind an interior: explore-only work elsewhere stops.
      if (!interior) {
        viewRuntime.blend = 0;
        viewRuntime.effective = "diorama";
        views.current.resumed = true;
      }
      return;
    }
    const state = useGame.getState(),
      dt = Math.min(delta, 0.04);
    if (locked || useGameMode.getState().active) {
      runtime.moving = false;
      state.setNear("");
      if (!interior) {
        leaveExplore();
        // Travel, the train and game modes frame from the painted overview:
        // drop the look-around and let the rig smooth the cut.
        if (orbitReset()) rig.blend(HANDOFF_BLEND_SECONDS);
      }
      if (locked && !interior) {
        // Travel owns the live view. Keep its last framing for a damped handoff,
        // including the new world key so landing cannot trigger a camera cut.
        // The look point of whatever travel rendered (ortho or telephoto).
        const reach =
          typeof camera.userData.viewDistance === "number"
            ? camera.userData.viewDistance
            : Math.hypot(...ISLAND_CAMERA_OFFSET);
        camera.getWorldDirection(offset.current);
        follow.current
          .copy(camera.position)
          .addScaledVector(offset.current, reach);
        follow.current.y -= 0.7;
        cameraScene.current.scene = state.scene;
        cameraScene.current.world = state.world;
        if (avatar.current) {
          avatar.current.position.set(runtime.x, 0.18, runtime.z);
          avatar.current.rotation.y = runtime.heading;
        }
      }
      return;
    }
    // Before the HUD reveal (portfolio peek, cinematic) the world lives but
    // the avatar ignores input; the camera follow below keeps running.
    const enabled = gameInputEnabled(useStage.getState());
    if (!enabled) {
      runtime.target = null;
      runtime.path = [];
    }
    let [dx, dz] = state.overlayLocked || !enabled ? [0, 0] : movement(),
      remaining = Infinity;
    if (Math.hypot(dx, dz) > 0.1) {
      runtime.target = null;
      runtime.path = [];
      const x = dx;
      dx = x * 0.83 + dz * 0.55;
      dz = dz * 0.83 - x * 0.55;
      // Turned village view: keys stay screen-relative.
      const turn = interior ? 0 : orbit.yaw * (1 - viewRuntime.blend);
      if (turn !== 0) {
        const tx = dx;
        dx = yawX(tx, dz, turn);
        dz = yawZ(tx, dz, turn);
      }
    } else if (runtime.target) {
      const [tx, tz] = runtime.target,
        distance = Math.hypot(tx - runtime.x, tz - runtime.z);
      if (distance < 0.0001) {
        runtime.x = tx;
        runtime.z = tz;
        runtime.target = runtime.path.shift() ?? null;
      } else {
        remaining = distance;
        dx = (tx - runtime.x) / distance;
        dz = (tz - runtime.z) / distance;
      }
    }
    runtime.moving =
      !state.paused &&
      !state.overlayLocked &&
      state.panel === "none" &&
      Math.hypot(dx, dz) > 0.1;
    if (runtime.moving) {
      const step = Math.min(dt * movementSpeed(interior ? 4 : 4.6), remaining),
        px = runtime.x,
        pz = runtime.z;
      if (interior) {
        [runtime.x, runtime.z] = moveInterior(
          state.scene,
          runtime.x,
          runtime.z,
          dx * step,
          dz * step,
        );
      } else
        [runtime.x, runtime.z] = moveWorld(
          runtime.x,
          runtime.z,
          dx * step,
          dz * step,
          state.world,
        );
      if (Math.hypot(runtime.x - px, runtime.z - pz) > 0.0001) footstep();
      runtime.heading = Math.atan2(dx, dz);
    }
    if (avatar.current) {
      avatar.current.position.set(runtime.x, 0.18, runtime.z);
      avatar.current.rotation.y = THREE.MathUtils.damp(
        avatar.current.rotation.y,
        runtime.heading,
        15,
        dt,
      );
    }
    let near = "";
    if (interior) {
      if (
        runtime.z > roomFor(state.scene).doorZ - 1.3 &&
        Math.abs(runtime.x) < 2.2
      )
        near = "exit";
      if (Math.hypot(runtime.x, runtime.z + 2) < 2.5) {
        near =
          (
            {
              boathouse: "race",
              office: "read",
              cognition: "desk",
              gym: "lift",
            } as Record<string, string>
          )[state.scene] ?? "";
      }
      if (
        state.scene === "secret" &&
        !state.save.memories.includes(HOOVER_STASH) &&
        Math.hypot(runtime.x - HOOVER.chest[0], runtime.z - HOOVER.chest[1]) < 3
      )
        near = "stash";
    } else {
      near =
        doorsFor(state.world).find(
          (d) => Math.hypot(d.x - runtime.x, d.z - runtime.z) < 1.9,
        )?.id ?? "";
      if (!near) near = landmarkActionAt(runtime.x, runtime.z, state.world);
      if (
        !near &&
        state.world === "korea" &&
        isNearPhotoBooth(runtime.x, runtime.z)
      )
        near = "photo";
      if (
        !near &&
        state.world === "stanford" &&
        !state.save.memories.includes(HOOVER_KEY) &&
        Math.hypot(runtime.x - HOOVER.key[0], runtime.z - HOOVER.key[1]) < 1.2
      )
        near = "hoover-key";
      if (
        !near &&
        state.world === "stanford" &&
        state.save.memories.includes(HOOVER_KEY) &&
        Math.hypot(runtime.x - HOOVER.door[0], runtime.z - HOOVER.door[1]) < 1.5
      )
        near = "hoover-door";
      if (!near) near = nearbyNpcId(runtime.x, runtime.z);
    }
    state.setNear(state.overlayLocked || !enabled ? "" : near);
    if (!followCamera) return;
    const perspective = camera as THREE.PerspectiveCamera;
    if (interior) {
      // Interiors keep their own telephoto lens.
      if (perspective.isPerspectiveCamera && perspective.fov !== TELEPHOTO_FOV) {
        perspective.fov = TELEPHOTO_FOV;
        perspective.updateProjectionMatrix();
      }
    }
    const mobile = size.width < 700 || size.height < 500;
    const worldZoom = useWorldView.getState().zoom;
    const playerFollow = islandFollow(worldZoom);
    const [centerX, centerZ] = islandCenter(state.world);
    // Talking: frame the villager and the player, a little up-screen of the
    // dialogue box, closer in (eases both ways; none under reduced motion).
    const talk = !interior && talkFocus.active && worldZoom > 1 && !reducedMotion?.matches;
    const [ox, , oz] = ISLAND_CAMERA_OFFSET, lift = talk ? 1.6 / Math.hypot(ox, oz) : 0;
    const px = talk ? talkFocus.x + ox * lift : runtime.x, pz = talk ? talkFocus.z + oz * lift : runtime.z;
    desired.current.set(
      interior
        ? runtime.x * 0.9
        : THREE.MathUtils.lerp(centerX, px * 0.92, playerFollow),
      0,
      interior
        ? runtime.z * 0.9 - 2
        : THREE.MathUtils.lerp(centerZ, pz * 0.92, playerFollow),
    );
    if (!interior) {
      // The overview also frames the rock hanging beneath the island.
      const [shiftX, shiftY, shiftZ] = islandViewShift(state.world);
      const overview = 1 - playerFollow;
      // A screen-down pan: it turns with the look-around.
      desired.current.x += yawX(shiftX, shiftZ, orbit.yaw) * overview;
      desired.current.y += shiftY * overview;
      desired.current.z += yawZ(shiftX, shiftZ, orbit.yaw) * overview;
    }
    const changedScene =
      cameraScene.current.scene !== state.scene || cameraScene.current.world !== state.world;
    const wholeIsland = !interior && worldZoom === 1;
    if (changedScene || wholeIsland) {
      follow.current.copy(desired.current);
      cameraScene.current.scene = state.scene;
      cameraScene.current.world = state.world;
    }
    follow.current.lerp(desired.current, 1 - Math.exp(-dt * 3));
    if (interior) offset.current.set(15, 21, 25);
    else offset.current.set(...ISLAND_CAMERA_OFFSET);
    const turned = orbitOffset.current;
    if (interior) turned.copy(offset.current);
    else {
      // Village view look-around: Q/E turn it unless they have a job here
      // (E uses what is near, Q drops what is carried).
      const villageView =
        enabled &&
        useWorldView.getState().view === "diorama" &&
        !state.paused &&
        !state.overlayLocked &&
        state.panel === "none";
      const key = villageView
        ? Number(
            keys.has("q") &&
              !carriedIn(state.world, useActivities.getState().play),
          ) - Number(keys.has("e") && state.near === "")
        : 0;
      stepOrbit(dt, key, !!reducedMotion?.matches);
      const [ox, oy, oz] = ISLAND_CAMERA_OFFSET;
      const flat = Math.hypot(ox, oz),
        reach = Math.hypot(flat, oy),
        elevation = Math.atan2(oy, flat) + orbit.pitch,
        scale = (reach * Math.cos(elevation)) / flat;
      turned.set(
        yawX(ox, oz, orbit.yaw) * scale,
        reach * Math.sin(elevation),
        yawZ(ox, oz, orbit.yaw) * scale,
      );
    }
    const fitted = islandZoom(size.width, size.height, state.world);
    const targetZoom = interior
      ? mobile
        ? Math.max(20, Math.min(34, size.width / 12, (size.height - 90) / 11.5))
        : Math.max(26, Math.min(52, size.width / 23, (size.height - 100) / 14))
      : fitted * (talk ? 1.35 : 1);
    const zoom = !interior ? worldZoom : 1;
    const v = views.current;
    // The old orthographic zoom drives the telephoto camera's distance. While
    // a view blend owns the camera, its viewZoom is the mixed one: damp the
    // diorama's own zoom instead.
    const fromZoom =
      !interior && (v.progress > 0 || v.ownsLens) ? v.dioramaZoom : viewZoom(camera);
    const nextZoom =
      changedScene || wholeIsland
        ? targetZoom * zoom
        : THREE.MathUtils.damp(fromZoom, targetZoom * zoom, 5, dt);
    v.dioramaZoom = nextZoom;
    look.current.set(
      follow.current.x,
      interior ? 0.5 : follow.current.y + 0.7,
      follow.current.z,
    );
    if (interior || !perspective.isPerspectiveCamera) {
      aimCamera(camera, look.current, turned, nextZoom, size.height);
      return;
    }
    // --- hub: diorama, explore, or the parametric blend between them ---
    const toward = useWorldView.getState().view === "explore" ? 1 : 0;
    if (v.handedOff) {
      v.handedOff = false;
      if (toward === 1) {
        // Land on explore directly; the rig smooths the cut from whatever
        // the other controller left on screen.
        v.progress = 1;
        v.resumed = true;
        rig.blend(HANDOFF_BLEND_SECONDS);
      }
    }
    const wasIdle = v.progress === 0;
    v.progress = changedScene
      ? toward
      : stepViewProgress(
          v.progress,
          toward,
          dt,
          reducedMotion?.matches ? VIEW_BLEND_SECONDS_REDUCED : VIEW_BLEND_SECONDS,
        );
    const blend = easeView(v.progress);
    viewRuntime.blend = blend;
    viewRuntime.effective = toward ? "explore" : "diorama";
    if (blend === 0) {
      // Exactly today's diorama camera.
      if (perspective.fov !== TELEPHOTO_FOV) {
        perspective.fov = TELEPHOTO_FOV;
        perspective.updateProjectionMatrix();
      }
      v.ownsLens = false;
      aimCamera(camera, look.current, turned, nextZoom, size.height);
      return;
    }
    dioramaPose(v.diorama, look.current, turned, nextZoom, size.height);
    const lens = exploreLens(size.width, size.height);
    const reach =
      useWorldView.getState().exploreDistance * lens.distanceScale;
    v.feet.set(px, 0.18, pz);
    const snap = wasIdle || changedScene || v.resumed;
    v.resumed = false;
    if (snap) v.focus.copy(v.feet);
    else v.focus.lerp(v.feet, 1 - Math.exp(-dt * 10));
    boomWorld = state.world;
    boomOrigin.x = v.focus.x;
    boomOrigin.z = v.focus.z;
    refreshTreeGrid();
    explorePose(v.explore, v.focus, offset.current, reach, lens.fov);
    clearBoom(v.safe, v.explore.target, azimuthOf(offset.current), reach, boomBlocked);
    if (snap) {
      // Only where nothing of the explore pose is on screen yet (blend
      // starting from the diorama, a new scene under the rig's blend).
      v.boomDistance.value = v.safe.distance;
      v.boomElevation.value = v.safe.elevation;
      v.boomDistance.velocity = v.boomElevation.velocity = 0;
    } else {
      // An obstacle entering or leaving the boom's path eases the camera in
      // or out over BOOM_SPRING_SECONDS, from rest: never a cut, never a jerk.
      stepSpring(v.boomDistance, v.safe.distance, dt);
      stepSpring(v.boomElevation, v.safe.elevation, dt);
    }
    explorePose(
      v.explore,
      v.focus,
      offset.current,
      v.boomDistance.value,
      lens.fov,
      v.boomElevation.value,
    );
    mixView(v.mixed, v.diorama, v.explore, blend);
    v.ownsLens = true;
    applyViewPose(perspective, v.mixed, size.height);
    applyQaCamera(perspective);
  });
  /** Another controller (travel, train, a game mode) takes the hub camera:
   * drop the explore blend at once and let the rig smooth the cut. */
  function leaveExplore() {
    const v = views.current;
    if (v.progress === 0 && !v.ownsLens) return;
    v.progress = 0;
    v.ownsLens = false;
    v.handedOff = true;
    viewRuntime.blend = 0;
    viewRuntime.effective = "diorama";
    const perspective = camera as THREE.PerspectiveCamera;
    if (perspective.isPerspectiveCamera && perspective.fov !== TELEPHOTO_FOV) {
      perspective.fov = TELEPHOTO_FOV;
      perspective.updateProjectionMatrix();
    }
    rig.blend(HANDOFF_BLEND_SECONDS);
  }
  return (
    <group ref={avatar} name="village-player" visible={!locked && !playing}>
      <Character player color={color} hat={hat} scale={0.65} />
    </group>
  );
}

function CourtPavilion() {
  return (
    <group>
      <Box p={[0, 0.15, 0]} s={[6.4, 0.3, 5.2]} c="#9d9474" />
      <Box p={[0, 0.33, 0]} s={[6, 0.08, 4.8]} c="#ad603c" />
      <Ring p={[0, 0.4, 0]} radius={0.8} tube={0.035} c="#f2d79c" />
      {[-2.75, 2.75].map((x) => (
        <Box key={x} p={[x, 0.4, 0]} s={[0.045, 0.02, 4.35]} c="#f2d79c" />
      ))}
      {[-2.15, 0, 2.15].map((z) => (
        <Box key={z} p={[0, 0.4, z]} s={[5.55, 0.02, 0.045]} c="#f2d79c" />
      ))}
      {[-3, 3].flatMap((x) =>
        [-2.5, 2.5].map((z) => (
          <Cylinder
            key={`${x}:${z}`}
            p={[x, 1.45, z]}
            s={[0.1, 2.8, 0.1]}
            c="#426248"
          />
        )),
      )}
      {[-3, 3].map((x) => (
        <Box key={x} p={[x, 1.3, 0]} s={[0.06, 1.4, 4.8]} c="#7e9a72" />
      ))}
      <Box p={[0, 1.9, -2.25]} s={[0.12, 3.6, 0.13]} c="#47644f" />
      <GlazedPanel position={[0, 3.15, -2.12]} size={[1.6, 1, 0.13]} />
      {[-0.8, 0.8].map((x) => (
        <Box key={x} p={[x, 3.15, -2.12]} s={[0.045, 1.04, 0.15]} c="#c3d2dc" />
      ))}
      {[-0.5, 0.5].map((y) => (
        <Box
          key={y}
          p={[0, 3.15 + y, -2.12]}
          s={[1.64, 0.045, 0.15]}
          c="#c3d2dc"
        />
      ))}
      <Box p={[0, 3.14, -2.03]} s={[0.65, 0.48, 0.03]} c="#bc6040" />
      <Ring p={[0, 2.8, -1.7]} radius={0.34} tube={0.04} c="#b65e35" />
      <Ball p={[1.6, 0.65, 0.8]} s={[0.3, 0.3, 0.3]} c="#d78532" />
      <Bench p={[3.8, 0.05, 0.4]} rotation={-Math.PI / 2} />
    </group>
  );
}

function Garden({ level }: { level: number }) {
  return (
    <group>
      <Cylinder p={[0, 0.28, 0]} s={[1.7, 0.4, 1.7]} c="#c7b58c" />
      <Cylinder p={[0, 0.53, 0]} s={[1.35, 0.16, 1.35]} c="#5caa9b" />
      <Cylinder p={[0, 0.85, 0]} s={[0.28, 0.75, 0.28]} c="#ddc99c" />
      <Ball p={[0, 1.4, 0]} s={[0.5, 0.4, 0.5]} c="#e2c785" />
      {Array.from({ length: level > 1 ? 12 : 6 }, (_, i) => (
        <Flowers
          key={i}
          p={[
            Math.sin((i * Math.PI) / (level > 1 ? 6 : 3)) * 2.05,
            0.15,
            Math.cos((i * Math.PI) / (level > 1 ? 6 : 3)) * 2.05,
          ]}
          color={i % 2 ? "#e8b443" : "#cc614a"}
        />
      ))}
      {level > 1 && (
        <>
          {[-2.7, 2.7].map((x) => (
            <Box key={x} p={[x, 1.5, 0]} s={[0.15, 3, 0.15]} c="#aa874d" />
          ))}
          <Box p={[0, 3, 0]} s={[5.7, 0.2, 1]} c="#c3a56b" />
          {[-2, -1, 0, 1, 2].map((x) => (
            <GlazedPanel
              key={`glass-${x}`}
              position={[x, 3.14, 0.85]}
              size={[0.95, 1.2, 0.045]}
              rotation={[-Math.PI / 2, 0, 0]}
            />
          ))}
          {[-2, -1, 0, 1, 2].map((x) => (
            <Ball key={x} p={[x, 3.05, 0]} s={[0.6, 0.27, 0.8]} c="#4d813c" />
          ))}
        </>
      )}
      {level > 2 && (
        <>
          <Bench p={[-3, 0.15, 1.8]} rotation={0.4} />
          <Bench p={[3, 0.15, 1.8]} rotation={-0.4} />
          <Cylinder p={[0, 2.25, 0]} s={[0.5, 0.2, 0.5]} c="#e5c15d" />
        </>
      )}
    </group>
  );
}

const updateTravel = (traveling: boolean) => useGame.setState({ traveling });

export function Hub() {
  const [trainRiding, setTrainRiding] = useState(false);
  // Field selectors only: the save object is replaced on every autosave.
  const hasHooverKey = useGame((s) => s.save.memories.includes(HOOVER_KEY)),
    world = useGame((s) => s.world),
    traveling = useGame((s) => s.traveling),
    quality = useGame((s) => s.quality);
  const active = useWorldActive();
  const skate = doorsInWorld(world).find((door) => door.id === "skate");
  return (
    <group>
      <Landscape world={world} />
      <IslandTerrain world={world} detail={quality === "high"} />
      <IslandUnderside world={world} detail={quality === "high"} />
      <VillageGardens world={world} />
      <RegionalActivities world={world} />
      <Environment world={world} />
      {world === "home" && <HomeWorldEnvironment />}
      {world === "korea" && (
        <KoreaWorldEnvironment
          onVisitLandmark={(x, z) => {
            if (!traveling) walkTo(x, z);
          }}
        />
      )}
      <Bulletin
        position={world === "stanford" ? STANFORD_BULLETIN : undefined}
      />
      <Wildlife />
      {world === "stanford" && !hasHooverKey && (
        <group position={[HOOVER.key[0], 0.2, HOOVER.key[1]]}>
          <HooverKey />
        </group>
      )}
      {world === "stanford" && skate && (
        <group
          onPointerDown={(event) => {
            event.stopPropagation();
            const door = doorsInWorld(world).find(
              (entry) => entry.id === "skate",
            )!;
            if (!traveling) walkTo(door.x, door.z);
          }}
        >
          <SkateParkBuilding
            position={[skate.footprint[0], 0, skate.footprint[1]]}
            rotation={skate.rotation}
          />
        </group>
      )}
      {world === "korea" && (
        <>
          <PhotoBooth />
          <PhotoBoothView />
        </>
      )}
      <StargazingHill
        position={
          world === "stanford"
            ? [STANFORD_TELESCOPE[0], 0, STANFORD_TELESCOPE[1]]
            : [-19, 0, -38]
        }
      />
      {world !== "korea" && (
        <IslandTrain
          key={world}
          world={world}
          disabled={traveling}
          onRidingChange={setTrainRiding}
        />
      )}
      <WorldTravel
        world={world}
        disabled={trainRiding}
        onTravelChange={updateTravel}
        onArrive={(destination, mode) =>
          useGame.getState().travel(destination, mode)
        }
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.24, WORLD_ELLIPSE.centerZ]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!traveling && canWalk(e.point.x, e.point.z, world))
            walkTo(e.point.x, e.point.z);
        }}
      >
        <planeGeometry args={[174, 184]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {doorsInWorld(world).map((door) => (
        <group
          key={door.id}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (!traveling) walkTo(door.x, door.z);
          }}
          position={[door.footprint[0], 0, door.footprint[1]]}
          scale={door.scale}
        >
          {door.id === "boathouse" && <House p={[0, 0, 0]} level={3} />}
          {door.id === "office" && <House p={[0, 0, 0]} kind="study" />}
          {door.id === "go" && <GoShell />}
          {door.id === "theater" && (
            <MovieTheaterBuilding p={[0, 0, 0]} korean={world === "korea"} />
          )}
          {door.id === "writing" && <WritingShell p={[0, 0, 0]} />}
          {door.id === "stadium" && <StadiumBuilding />}
          {door.id === "badminton" && <BadmintonPavilion />}
          {door.id === "music" && <BeatLabShell />}
          {door.id === "math" && <MathLabShell />}
          {door.id === "basketball" && (
            <StaticBatch id={`court-pavilion-${world}`}>
              <CourtPavilion />
            </StaticBatch>
          )}
          {door.id === "kappa" && <KappaShell />}
          {door.id === "cognition" && <CognitionShell />}
          {door.id === "kitchen" && <KitchenShell />}
          {door.id === "gym" && <GymShell />}
          {world === "home" && <HomeBuildingArt id={door.id} />}
        </group>
      ))}
      {world === "home" && (
        <StaticBatch id="home-garden">
          <Garden level={3} />
        </StaticBatch>
      )}
      <NpcCrowd />
      <Walker locked={trainRiding || traveling} />
      <LabelProjection active={active} />
    </group>
  );
}
