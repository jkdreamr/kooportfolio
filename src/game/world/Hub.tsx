import { useRef } from "react";
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
  Npc,
  Ring,
} from "./Models";
import { runtime, useGame, walkTo } from "../core/store";
import { movement } from "../core/input";
import { canWalk, doors, moveWorld } from "../core/world";
import { LabelProjection } from "./Labels";
import { Landscape } from "./Landscape";
import { ROOM } from "../core/room";
import {
  KappaShell,
  CognitionShell,
  KitchenShell,
  GymShell,
} from "./VillageBuildings";

export function Walker({ interior = false }: { interior?: boolean }) {
  const avatar = useRef<THREE.Group>(null),
    save = useGame((s) => s.save);
  const { camera, size } = useThree();
  const follow = useRef(new THREE.Vector3()),
    desired = useRef(new THREE.Vector3()),
    offset = useRef(new THREE.Vector3());
  useFrame((_, delta) => {
    const state = useGame.getState(),
      dt = Math.min(delta, 0.04);
    let [dx, dz] = movement(),
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
      state.panel === "none" &&
      Math.hypot(dx, dz) > 0.1;
    if (runtime.moving) {
      const step = Math.min(dt * (interior ? 4 : 4.6), remaining);
      if (interior) {
        runtime.x = THREE.MathUtils.clamp(
          runtime.x + dx * step,
          -ROOM.walkX,
          ROOM.walkX,
        );
        runtime.z = THREE.MathUtils.clamp(
          runtime.z + dz * step,
          ROOM.minZ,
          ROOM.maxZ,
        );
      } else
        [runtime.x, runtime.z] = moveWorld(
          runtime.x,
          runtime.z,
          dx * step,
          dz * step,
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
      if (runtime.z > ROOM.doorZ - 1.3 && Math.abs(runtime.x) < 2.2)
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
    } else
      near =
        doors.find((d) => Math.hypot(d.x - runtime.x, d.z - runtime.z) < 1.9)
          ?.id ?? "";
    state.setNear(near);
    const mobile = size.width < 700 || size.height < 500;
    const closeInterior = interior && (mobile || size.height < 500);
    desired.current.set(
      interior ? (closeInterior ? runtime.x * 0.8 : 0) : runtime.x * 0.92,
      0,
      interior ? (closeInterior ? runtime.z * 0.8 : 0) : runtime.z * 0.92,
    );
    follow.current.lerp(desired.current, 1 - Math.exp(-dt * 3));
    if (interior) offset.current.set(18, 23, 29);
    else offset.current.set(28, 34, 38);
    camera.position.copy(offset.current.add(follow.current));
    camera.lookAt(follow.current.x, interior ? 0.5 : 0.7, follow.current.z);
    if (camera instanceof THREE.OrthographicCamera) {
      const fitted = Math.max(
        3.5,
        Math.min(
          (size.width - 70) / 114,
          (size.height - (size.height < 500 ? 100 : 150)) / 83,
        ),
      );
      const targetZoom = interior
        ? closeInterior
          ? 24
          : Math.min(38, (size.width - 35) / 35, (size.height - 170) / 29)
        : state.build
          ? fitted * 0.9
          : mobile
            ? 24
            : 28;
      camera.zoom = THREE.MathUtils.damp(camera.zoom, targetZoom, 5, dt);
      camera.updateProjectionMatrix();
    }
  });
  return (
    <group ref={avatar}>
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

export function Hub() {
  const save = useGame((s) => s.save),
    build = useGame((s) => s.build);
  return (
    <group>
      <Landscape />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.24, -1]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!build && canWalk(e.point.x, e.point.z))
            walkTo(e.point.x, e.point.z);
        }}
      >
        <planeGeometry args={[104, 90]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {doors.map((door) => (
        <group
          key={door.id}
          position={[door.footprint[0], 0, door.footprint[1]]}
        >
          {door.id === "boathouse" && (
            <House p={[0, 0, 0]} level={save.upgrades.boathouse} />
          )}
          {door.id === "office" && <House p={[0, 0, 0]} kind="study" />}
          {door.id === "basketball" && <CourtPavilion />}
          {door.id === "kappa" && <KappaShell />}
          {door.id === "cognition" && <CognitionShell />}
          {door.id === "kitchen" && <KitchenShell />}
          {door.id === "gym" && <GymShell />}
        </group>
      ))}
      <Garden level={save.upgrades.garden} />
      <Npc origin={[-3.5, 0.2, -3]} color="#b95e3d" />
      <Npc origin={[11, 0.2, 12.3]} color="#d3a444" />
      <Walker />
      <LabelProjection />
    </group>
  );
}
