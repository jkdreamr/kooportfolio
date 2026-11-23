import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  Box,
  Ball,
  Bench,
  Boat,
  Character,
  Cylinder,
  Flowers,
  House,
  Lamp,
  Npc,
  Ring,
  Sign,
  Tree,
} from "./Models";
import { runtime, useGame } from "../core/store";
import { movement } from "../core/input";
import { canWalk, doors, findPath, moveWorld } from "../core/world";

export function walkTo(x: number, z: number) {
  runtime.path = findPath([runtime.x, runtime.z], [x, z]);
  runtime.target = runtime.path.shift() ?? null;
}
export function Walker({ interior = false }: { interior?: boolean }) {
  const avatar = useRef<THREE.Group>(null);
  const save = useGame((s) => s.save);
  const { camera } = useThree();
  const follow = useRef(new THREE.Vector3(0, 0, 0));
  useFrame((_, delta) => {
    const state = useGame.getState(),
      dt = Math.min(delta, 0.04);
    let [dx, dz] = movement();
    if (Math.hypot(dx, dz) > 0.1) {
      runtime.target = null;
      runtime.path = [];
      const x = dx;
      dx = x * 0.83 + dz * 0.55;
      dz = dz * 0.83 - x * 0.55;
    } else if (runtime.target) {
      const [tx, tz] = runtime.target;
      const distance = Math.hypot(tx - runtime.x, tz - runtime.z);
      if (distance < 0.18) {
        runtime.target = runtime.path.shift() ?? null;
      } else {
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
      if (interior) {
        runtime.x = THREE.MathUtils.clamp(runtime.x + dx * dt * 4, -4.6, 4.6);
        runtime.z = THREE.MathUtils.clamp(runtime.z + dz * dt * 4, -5, 5.7);
      } else
        [runtime.x, runtime.z] = moveWorld(
          runtime.x,
          runtime.z,
          dx * dt * 4.6,
          dz * dt * 4.6,
        );
      runtime.heading = Math.atan2(dx, dz);
    }
    if (avatar.current) {
      avatar.current.position.set(runtime.x, 0.08, runtime.z);
      avatar.current.rotation.y = THREE.MathUtils.damp(
        avatar.current.rotation.y,
        runtime.heading,
        15,
        dt,
      );
    }
    let near = "";
    if (interior) {
      if (runtime.z > 3.7) near = "exit";
      if (Math.hypot(runtime.x, runtime.z + 2) < 2.5)
        near = state.scene === "boathouse" ? "race" : "read";
    } else {
      near =
        doors.find((d) => Math.hypot(d.x - runtime.x, d.z - runtime.z) < 1.9)
          ?.id ?? "";
    }
    state.setNear(near);
    const fx = interior ? 0 : runtime.x * 0.12,
      fz = interior ? 0 : runtime.z * 0.12;
    follow.current.lerp(new THREE.Vector3(fx, 0, fz), 1 - Math.exp(-dt * 2));
    const offset = interior
      ? new THREE.Vector3(13, 15, 20)
      : new THREE.Vector3(24, 28, 32);
    camera.position.copy(offset.add(follow.current));
    camera.lookAt(follow.current.x, interior ? 0.5 : 0.3, follow.current.z);
    if (camera instanceof THREE.OrthographicCamera) {
      const targetZoom = interior
        ? 44
        : state.build
          ? 22
          : window.innerWidth < 700
            ? 18
            : 29;
      camera.zoom = THREE.MathUtils.damp(camera.zoom, targetZoom, 3, dt);
      camera.updateProjectionMatrix();
    }
  });
  return (
    <group ref={avatar}>
      <Character color={save.color} hat={save.hat} scale={0.78} />
      <Ring p={[0, 0.035, 0]} radius={0.5} tube={0.035} c="#f0d598" />
    </group>
  );
}
function Water() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.children.forEach((child, i) => {
        child.position.x = Math.sin(clock.elapsedTime * 0.4 + i) * 0.3;
        child.scale.x = 0.8 + Math.sin(clock.elapsedTime + i) * 0.15;
      });
  });
  return (
    <>
      <Box p={[0, -0.03, 10.6]} s={[29, 0.28, 6.8]} c="#70a7a7" />
      <group ref={ref}>
        {Array.from({ length: 28 }, (_, i) => (
          <group key={i}>
            <Box
              p={[Math.sin(i * 5.2) * 13, 0.13, 8.4 + (i % 5) * 1.13]}
              s={[0.5 + (i % 3) * 0.4, 0.015, 0.045]}
              c={i % 2 ? "#9ec6bd" : "#a8cdc3"}
            />
          </group>
        ))}
      </group>
    </>
  );
}
function CourtPavilion() {
  return (
    <group position={[7.1, 0, -1]}>
      <Box p={[0, 0.12, 0]} s={[6.4, 0.3, 5.2]} c="#b8a88a" />
      <Box p={[0, 0.31, 0]} s={[6, 0.08, 4.8]} c="#b77456" />
      <Box p={[0, 0.37, 0]} s={[5.5, 0.02, 4.3]} c="#b98262" />
      <Ring p={[0, 0.4, 0]} radius={0.8} tube={0.035} c="#efdab1" />
      {[-2.75, 2.75].map((x) => (
        <Box key={x} p={[x, 0.42, 0]} s={[0.045, 0.02, 4.35]} c="#efdab1" />
      ))}
      {[-2.15, 0, 2.15].map((z) => (
        <Box key={z} p={[0, 0.42, z]} s={[5.55, 0.02, 0.045]} c="#efdab1" />
      ))}
      {[-3, 3].flatMap((x) =>
        [-2.5, 2.5].map((z) => (
          <Cylinder
            key={`${x}${z}`}
            p={[x, 1.45, z]}
            s={[0.1, 2.8, 0.1]}
            c="#6c7b64"
          />
        )),
      )}
      {[-3, 3].map((x) => (
        <Box key={x} p={[x, 1.3, 0]} s={[0.06, 1.4, 4.8]} c="#a3ac8b" />
      ))}
      <Box p={[0, 1.9, -2.25]} s={[0.12, 3.6, 0.13]} c="#687568" />
      <Box p={[0, 3.15, -2.12]} s={[1.6, 1, 0.13]} c="#e6d9bd" />
      <Box p={[0, 3.14, -2.03]} s={[0.65, 0.48, 0.03]} c="#b97e5f" />
      <Ring p={[0, 2.8, -1.7]} radius={0.34} tube={0.04} c="#a96c4f" />
      <Box p={[0, 2.7, 2.5]} s={[3, 0.55, 0.2]} c="#607461" />
      <Sign
        text="TRICK SHOT PARK"
        p={[0, 2.7, 2.62]}
        color="#607461"
        ink="#f6e7c5"
        size={[2.8, 0.5]}
      />
      <Ball p={[1.6, 0.65, 0.8]} s={[0.3, 0.3, 0.3]} c="#cf8652" />
      <Bench p={[3.8, 0.05, 0.4]} rotation={-Math.PI / 2} />
    </group>
  );
}
function Garden({ level }: { level: number }) {
  return (
    <group position={[-0.5, 0, 0.3]}>
      <Cylinder p={[0, 0.22, 0]} s={[1.7, 0.4, 1.7]} c="#d5c7a4" />
      <Cylinder p={[0, 0.47, 0]} s={[1.35, 0.16, 1.35]} c="#7b9e93" />
      <Cylinder p={[0, 0.8, 0]} s={[0.28, 0.75, 0.28]} c="#ddd0ac" />
      <Ball p={[0, 1.35, 0]} s={[0.5, 0.4, 0.5]} c="#ded1ad" />
      {Array.from({ length: level > 1 ? 12 : 6 }, (_, i) => (
        <Flowers
          key={i}
          p={[
            Math.sin((i * Math.PI) / (level > 1 ? 6 : 3)) * 2.05,
            0,
            Math.cos((i * Math.PI) / (level > 1 ? 6 : 3)) * 2.05,
          ]}
          color={i % 2 ? "#e9c268" : "#cd8978"}
        />
      ))}
      {level > 1 && (
        <>
          <Box p={[-2.7, 1.5, 0]} s={[0.15, 3, 0.15]} c="#c0a67c" />
          <Box p={[2.7, 1.5, 0]} s={[0.15, 3, 0.15]} c="#c0a67c" />
          <Box p={[0, 3, 0]} s={[5.7, 0.2, 1]} c="#c5ab80" />
          {[-2, -1, 0, 1, 2].map((x) => (
            <Ball key={x} p={[x, 3.05, 0]} s={[0.6, 0.27, 0.8]} c="#7c946c" />
          ))}
        </>
      )}
      {level > 2 && (
        <>
          <Bench p={[-3, 0, 1.8]} rotation={0.4} />
          <Bench p={[3, 0, 1.8]} rotation={-0.4} />
          <Tree p={[0, 0, -2.7]} size={0.6} variant={1} />
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
      <Cylinder p={[0, -1.15, 0]} s={[15.2, 1.8, 13]} c="#7e7050" />
      <Cylinder p={[0, -0.38, 0]} s={[15.3, 0.7, 13.1]} c="#b0a77c" />
      <Cylinder p={[0, -0.03, -1]} s={[14.8, 0.3, 12.2]} c="#7da653" />
      {/* Subtle lawn grid and edge masonry give the village a buildable footprint. */}
      {Array.from({ length: 10 }, (_, ix) =>
        Array.from({ length: 8 }, (_, iz) => {
          const x = ix * 2.8 - 12.6,
            z = iz * 2.7 - 10.5;
          return (x / 14) ** 2 + ((z + 1) / 11.3) ** 2 < 1 ? (
            <Box
              key={`${ix}:${iz}`}
              p={[x, 0.126, z]}
              s={[2.72, 0.015, 2.62]}
              c={(ix + iz) % 2 ? "#81aa57" : "#86ae5c"}
            />
          ) : null;
        }),
      )}
      {Array.from({ length: 27 }, (_, i) => {
        const a = Math.PI + (i / 26) * Math.PI,
          x = Math.cos(a) * 13.9,
          z = Math.sin(a) * 10.5 - 0.5;
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, -a, 0]}>
            <Box
              p={[0, 0.46, 0]}
              s={[1.16, 0.85, 0.65]}
              c={i % 2 ? "#aaa58d" : "#bcb39a"}
            />
            <Box p={[0, 0.94, 0]} s={[1.22, 0.2, 0.75]} c="#d2c6a6" />
          </group>
        );
      })}
      <Water />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.15, -1]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!build && canWalk(e.point.x, e.point.z))
            walkTo(e.point.x, e.point.z);
        }}
      >
        <circleGeometry args={[14.7, 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Box p={[0, 0.14, 4.4]} s={[22, 0.1, 2.2]} c="#d8caa8" />
      <Box p={[0, 0.14, -0.9]} s={[2.2, 0.1, 11]} c="#d8caa8" />
      <Box p={[-7.2, 0.14, 2.7]} s={[2.1, 0.1, 3.6]} c="#d8caa8" />
      <Box p={[7.1, 0.14, 3]} s={[2.2, 0.1, 2.6]} c="#d8caa8" />
      {Array.from({ length: 25 }, (_, i) => (
        <Box
          key={i}
          p={[i * 0.8 - 9.6, 0.2, 4.4 + (i % 2 ? 0.35 : -0.35)]}
          s={[0.6, 0.03, 0.5]}
          c="#cfc09d"
        />
      ))}
      <House p={[-7.2, 0, -1]} level={save.upgrades.boathouse} />
      <CourtPavilion />
      <House p={[0, 0, -7]} kind="study" />
      <Garden level={save.upgrades.garden} />
      {[
        [-12, 0, -3],
        [-11, 0, -6],
        [-7, 0, -8],
        [-4, 0, -8],
        [5, 0, -8],
        [9, 0, -7],
        [12, 0, -4],
        [12, 0, 3],
        [-12, 0, 5],
      ].map((p, i) => (
        <Tree
          key={i}
          p={p as [number, number, number]}
          size={0.75 + (i % 3) * 0.13}
          variant={i}
        />
      ))}
      {Array.from({ length: 28 }, (_, i) => {
        const a = i * 2.399,
          x = Math.sin(a) * (10 + (i % 4)),
          z = Math.cos(a) * (7 + (i % 3));
        return (
          <Ball
            key={i}
            p={[x, 0.3, z]}
            s={[0.5, 0.45, 0.55]}
            c={i % 2 ? "#94a17a" : "#81956d"}
          />
        );
      })}
      <Bench p={[-3.4, 0.1, 5.4]} />
      <Bench p={[3.4, 0.1, 5.4]} />
      <Lamp p={[-9.2, 0, 4.8]} />
      <Lamp p={[9.6, 0, 4.8]} />
      <Lamp p={[-2, 0, -4.5]} />
      <group position={[-7, 0.1, 9]}>
        {Array.from({ length: 10 }, (_, i) => (
          <Box
            key={i}
            p={[0, 0, i * 0.42 - 1.5]}
            s={[3.2, 0.18, 0.35]}
            c={i % 2 ? "#b79b72" : "#c0a47a"}
          />
        ))}
        {[-1.4, 1.4].flatMap((x) =>
          [-1.4, 2.1].map((z) => (
            <Cylinder
              key={`${x}${z}`}
              p={[x, -0.3, z]}
              s={[0.13, 1.6, 0.13]}
              c="#8f7757"
            />
          )),
        )}
      </group>
      <group position={[-3.8, 0.1, 11.5]} rotation={[0, 1.3, 0]}>
        <Boat pace={0} />
      </group>
      <group position={[-11, 0.15, 7]}>
        <Box p={[0, 0.4, 0]} s={[1.4, 0.8, 1]} c="#b38f62" />
        <Sign text="WELCOME" p={[0, 1.35, 0.55]} size={[1.6, 0.4]} />
        <Box p={[0, 0.7, 0]} s={[0.1, 1.5, 0.1]} c="#826e50" />
      </group>
      <group position={[6.3, 0, -7]}>
        <Box p={[0, 0.3, 0]} s={[3.6, 0.5, 3]} c="#a19c81" />
        {[-1.5, 1.5].map((x) => (
          <Box key={x} p={[x, 1, 0]} s={[0.12, 2, 0.12]} c="#bc9b70" />
        ))}
        <Sign text="MORE TO COME" p={[0, 1.5, 1.4]} size={[2.7, 0.5]} />
        <Box p={[0, 1, 1.3]} s={[3.8, 0.4, 0.15]} c="#c9aa7a" />
      </group>
      {doors.map((door, i) => (
        <Html
          key={door.id}
          center
          position={[door.x, i === 2 ? 8.2 : i === 0 ? 7.1 : 4.2, door.z - 1.2]}
          zIndexRange={[12, 11]}
        >
          <button
            className="world-label"
            onClick={() => walkTo(door.x, door.z)}
          >
            <span className="label-dot" />
            {door.name}
            <span className="label-level">
              {i === 0
                ? `LV ${save.upgrades.boathouse}`
                : i === 2
                  ? "LV 1"
                  : "PLAY"}{" "}
              ↗
            </span>
          </button>
        </Html>
      ))}
      <Npc origin={[-3.5, 0.15, 3]} color="#bf8066" />
      <Npc origin={[6, 0.15, 6]} color="#d3ad68" />
      <Walker />
    </group>
  );
}
