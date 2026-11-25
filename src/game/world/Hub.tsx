import { useRef, useState } from "react";
import { RegionalActivities } from "./RegionalActivities";
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
import { movement, movementSpeed } from "../core/input";
import {
  canWalk,
  doorsInWorld,
  landmarkActionAt,
  moveWorld,
} from "../core/world";
import { LabelProjection } from "./Labels";
import { Landscape } from "./Landscape";
import { VillageGardens } from "./VillageGardens";
import { HomeWorldEnvironment } from "./HomeWorldEnvironment";
import { HomeBuildingArt } from "./HomeBuildingArt";
import { KoreaWorldEnvironment } from "./KoreaWorldEnvironment";
import { Bulletin } from "./Bulletin";
import { roomFor } from "../core/room";
import { useGameMode } from "../core/gameMode";
import { useWorldView } from "../core/worldView";
import {
  islandCenter,
  islandZoom,
  islandFollow,
  ISLAND_CAMERA_OFFSET,
} from "../core/islandCamera";
import { NpcCrowd } from "./VillageNpcs";
import { nearbyNpcId } from "../core/npcState";
import { BadmintonPavilion } from "../scenes/BadmintonCourt";
import { Wildlife } from "./Wildlife";
import { WritingShell } from "./WritingShell";
import { StadiumBuilding } from "../scenes/Stadium";
import { MovieTheaterBuilding } from "../scenes/MovieTheater";
import { IslandTrain } from "./IslandTrain";
import { WorldTravel } from "./WorldTravel";
import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import { PhotoBooth } from "./PhotoBooth";
import { PhotoBoothView } from "./PhotoBoothView";
import { isNearPhotoBooth } from "../core/photoBoothLayout";
import { StargazingHill } from "./StargazingHill";
import {
  STANFORD_BULLETIN,
  STANFORD_TELESCOPE,
} from "../../shared/stanford-transport";
import { SkateParkBuilding } from "../scenes/SkatePark";
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
    save = useGame((s) => s.save);
  const playing = useGameMode((s) => !!s.active);
  const { camera, size } = useThree();
  const follow = useRef(new THREE.Vector3()),
    desired = useRef(new THREE.Vector3()),
    offset = useRef(new THREE.Vector3()),
    cameraScene = useRef("");
  useFrame((_, delta) => {
    const state = useGame.getState(),
      dt = Math.min(delta, 0.04);
    if (locked || useGameMode.getState().active) {
      runtime.moving = false;
      state.setNear("");
      if (locked && !interior) {
        // Travel owns the live view. Keep its last framing for a damped handoff,
        // including the new world key so landing cannot trigger a camera cut.
        follow.current
          .copy(camera.position)
          .sub(offset.current.set(...ISLAND_CAMERA_OFFSET));
        cameraScene.current = `${state.scene}:${state.world}`;
        if (avatar.current) {
          avatar.current.position.set(runtime.x, 0.18, runtime.z);
          avatar.current.rotation.y = runtime.heading;
        }
      }
      return;
    }
    let [dx, dz] = state.overlayLocked ? [0, 0] : movement(),
      remaining = Infinity;
    if (Math.hypot(dx, dz) > 0.1) {
      runtime.target = null;
      runtime.path = [];
      const x = dx;
      dx = x * 0.83 + dz * 0.55;
      dz = dz * 0.83 - x * 0.55;
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
      !state.build &&
      !state.overlayLocked &&
      state.panel === "none" &&
      Math.hypot(dx, dz) > 0.1;
    if (runtime.moving) {
      const step = Math.min(dt * movementSpeed(interior ? 4 : 4.6), remaining);
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
        doorsInWorld(state.world).find(
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
    state.setNear(state.overlayLocked ? "" : near);
    if (!followCamera) return;
    const mobile = size.width < 700 || size.height < 500;
    const worldZoom = useWorldView.getState().zoom;
    const playerFollow = islandFollow(worldZoom);
    const [centerX, centerZ] = islandCenter(state.world);
    desired.current.set(
      interior
        ? runtime.x * 0.9
        : THREE.MathUtils.lerp(centerX, runtime.x * 0.92, playerFollow),
      0,
      interior
        ? runtime.z * 0.9 - 2
        : THREE.MathUtils.lerp(centerZ, runtime.z * 0.92, playerFollow),
    );
    const cameraKey = `${state.scene}:${state.world}`;
    const changedScene = cameraScene.current !== cameraKey;
    const wholeIsland = !interior && worldZoom === 1 && !state.build;
    if (changedScene || wholeIsland) {
      follow.current.copy(desired.current);
      cameraScene.current = cameraKey;
    }
    follow.current.lerp(desired.current, 1 - Math.exp(-dt * 3));
    if (interior) offset.current.set(15, 21, 25);
    else offset.current.set(...ISLAND_CAMERA_OFFSET);
    camera.position.copy(offset.current.add(follow.current));
    camera.lookAt(
      follow.current.x,
      interior ? 0.5 : follow.current.y + 0.7,
      follow.current.z,
    );
    if (camera instanceof THREE.OrthographicCamera) {
      const fitted = islandZoom(size.width, size.height, state.world);
      const targetZoom = interior
        ? mobile
          ? Math.max(
              20,
              Math.min(34, size.width / 12, (size.height - 90) / 11.5),
            )
          : Math.max(
              26,
              Math.min(52, size.width / 23, (size.height - 100) / 14),
            )
        : state.build
          ? fitted * 0.9
          : fitted;
      const zoom = !interior && !state.build ? worldZoom : 1;
      camera.zoom =
        changedScene || wholeIsland
          ? targetZoom * zoom
          : THREE.MathUtils.damp(camera.zoom, targetZoom * zoom, 5, dt);
      camera.updateProjectionMatrix();
    }
  });
  return (
    <group ref={avatar} name="village-player" visible={!locked && !playing}>
      <Character color={save.color} hat={save.hat} scale={0.65} />
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
      <Box p={[0, 3.15, -2.12]} s={[1.6, 1, 0.13]} c="#edddbb" />
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
  const save = useGame((s) => s.save),
    build = useGame((s) => s.build),
    world = useGame((s) => s.world),
    traveling = useGame((s) => s.traveling);
  const skate = doorsInWorld(world).find((door) => door.id === "skate");
  return (
    <group>
      <Landscape world={world} />
      <VillageGardens world={world} />
      <RegionalActivities world={world} />
      {world === "home" && <HomeWorldEnvironment />}
      {world === "korea" && (
        <KoreaWorldEnvironment
          onVisitLandmark={(x, z) => {
            if (!build && !traveling) walkTo(x, z);
          }}
        />
      )}
      <Bulletin
        position={world === "stanford" ? STANFORD_BULLETIN : undefined}
      />
      <Wildlife />
      {world === "stanford" && !save.memories.includes(HOOVER_KEY) && (
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
            if (!build && !traveling) walkTo(door.x, door.z);
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
          if (!build && !traveling && canWalk(e.point.x, e.point.z, world))
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
            if (!build && !traveling) walkTo(door.x, door.z);
          }}
          position={[door.footprint[0], 0, door.footprint[1]]}
          scale={door.scale}
        >
          {door.id === "boathouse" && (
            <House p={[0, 0, 0]} level={save.upgrades.boathouse} />
          )}
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
          {door.id === "basketball" && <CourtPavilion />}
          {door.id === "kappa" && <KappaShell />}
          {door.id === "cognition" && <CognitionShell />}
          {door.id === "kitchen" && <KitchenShell />}
          {door.id === "gym" && <GymShell />}
          {world === "home" && <HomeBuildingArt id={door.id} />}
        </group>
      ))}
      {world === "home" && <Garden level={save.upgrades.garden} />}
      <NpcCrowd />
      <Walker locked={trainRiding || traveling} />
      <LabelProjection />
    </group>
  );
}
