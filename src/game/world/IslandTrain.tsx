import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Box, Cylinder, Sign } from "./Models";
import { runtime, useGame } from "../core/store";
import { ISLAND_RAIL, railPose } from "../core/islandRail";
import "./island-train.css";

const TIES = 320;
const RAIL_SEGMENTS = 400;

function CoastalTrack() {
  const ties = useRef<THREE.InstancedMesh>(null);
  const rails = useRef<THREE.InstancedMesh>(null);
  const piers = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    for (let i = 0; i < TIES; i++) {
      const p = railPose(i / TIES);
      object.position.set(p.x, ISLAND_RAIL.height - 0.14, p.z);
      object.rotation.set(0, p.heading, 0);
      object.scale.set(2.5, 0.16, 0.32);
      object.updateMatrix();
      ties.current!.setMatrixAt(i, object.matrix);
    }
    for (let i = 0; i < RAIL_SEGMENTS; i++) {
      const p = railPose(i / RAIL_SEGMENTS);
      for (let side = 0; side < 2; side++) {
        const offset = side === 0 ? -0.77 : 0.77;
        object.position.set(
          p.x + Math.cos(p.heading) * offset,
          ISLAND_RAIL.height,
          p.z - Math.sin(p.heading) * offset,
        );
        object.rotation.set(0, p.heading, 0);
        object.scale.set(0.13, 0.16, 1.65);
        object.updateMatrix();
        rails.current!.setMatrixAt(i * 2 + side, object.matrix);
      }
    }
    for (let i = 0; i < 72; i++) {
      const p = railPose(i / 72);
      object.position.set(p.x, -1, p.z);
      object.rotation.set(0, p.heading, 0);
      object.scale.set(1.9, 4, 0.45);
      object.updateMatrix();
      piers.current!.setMatrixAt(i, object.matrix);
    }
    for (const ref of [ties, rails, piers]) {
      ref.current!.instanceMatrix.needsUpdate = true;
      ref.current!.computeBoundingSphere();
    }
  }, []);
  return (
    <group name="coastal-railway">
      <instancedMesh
        ref={ties}
        args={[undefined, undefined, TIES]}
        receiveShadow
      >
        <boxGeometry />
        <meshStandardMaterial color="#72503a" roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={rails}
        args={[undefined, undefined, RAIL_SEGMENTS * 2]}
      >
        <boxGeometry />
        <meshStandardMaterial
          color="#4e6064"
          roughness={0.63}
          metalness={0.2}
        />
      </instancedMesh>
      <instancedMesh
        ref={piers}
        args={[undefined, undefined, 72]}
        receiveShadow
      >
        <boxGeometry />
        <meshStandardMaterial color="#998b73" roughness={0.95} />
      </instancedMesh>
    </group>
  );
}

function Wheels({ phase }: { phase: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    group.current?.children.forEach((wheel) => {
      wheel.rotation.x = phase.current;
    });
  });
  return (
    <group ref={group}>
      {[-1.25, 1.25].flatMap((z) =>
        [-1, 1].map((x) => (
          <group key={`${x}:${z}`} position={[x * 0.96, 0.45, z]}>
            <Cylinder
              s={[0.48, 0.22, 0.48]}
              c="#29373b"
              r={[0, 0, Math.PI / 2]}
            />
            <Cylinder
              p={[x * 0.13, 0, 0]}
              s={[0.3, 0.07, 0.3]}
              c="#b69450"
              r={[0, 0, Math.PI / 2]}
            />
            <Box p={[x * 0.18, 0, 0]} s={[0.05, 0.55, 0.09]} c="#dbc489" />
          </group>
        )),
      )}
    </group>
  );
}

function Car({
  engine = false,
  phase,
}: {
  engine?: boolean;
  phase: React.RefObject<number>;
}) {
  return (
    <group>
      <Wheels phase={phase} />
      <Box p={[0, 0.75, 0]} s={[2.1, 0.3, 3.9]} c="#263c44" />
      {engine ? (
        <>
          <Cylinder
            p={[0, 1.45, 0.65]}
            s={[0.75, 2.4, 0.75]}
            r={[Math.PI / 2, 0, 0]}
            c="#31586a"
          />
          {[-0.2, 1.4].map((z) => (
            <Cylinder
              key={z}
              p={[0, 1.45, z]}
              s={[0.79, 0.12, 0.79]}
              r={[Math.PI / 2, 0, 0]}
              c="#c5a05a"
            />
          ))}
          <Cylinder p={[0, 2.3, 1.25]} s={[0.24, 0.9, 0.24]} c="#293b42" />
          <Cylinder p={[0, 2.77, 1.25]} s={[0.36, 0.15, 0.36]} c="#b8964d" />
          <Box p={[0, 1.55, -1.15]} s={[2, 1.6, 1.3]} c="#31586a" />
          <Box p={[0, 2.1, -0.47]} s={[1.5, 0.62, 0.04]} c="#b6d4c7" />
          {[-1, 1].map((side) => (
            <Box
              key={side}
              p={[side * 1.02, 2.03, -1.12]}
              s={[0.04, 0.72, 0.8]}
              c="#bdd5cc"
            />
          ))}
          <Box p={[0, 2.5, -1.15]} s={[2.45, 0.28, 1.8]} c="#b65b3f" />
          <Cylinder
            p={[0, 1.6, 1.9]}
            s={[0.23, 0.12, 0.23]}
            r={[Math.PI / 2, 0, 0]}
            c="#ffe3a0"
          />
          <Box p={[0, 0.73, 2.1]} s={[2.3, 0.24, 0.55]} c="#af593e" />
        </>
      ) : (
        <>
          <Box p={[0, 1.05, 0]} s={[1.9, 0.55, 3.5]} c="#31586a" />
          {[-1, 1].flatMap((side) =>
            [-1.4, 1.4].map((z) => (
              <Box
                key={`${side}:${z}`}
                p={[side * 0.88, 1.95, z]}
                s={[0.13, 1.5, 0.13]}
                c="#c4a465"
              />
            )),
          )}
          {[-0.85, 0.85].map((z) => (
            <Box key={z} p={[0, 1.44, z]} s={[1.6, 0.24, 0.62]} c="#bc693e" />
          ))}
          <Box p={[0, 2.75, 0]} s={[2.35, 0.32, 4.05]} c="#b65b3f" />
          <Box p={[0, 2.94, 0]} s={[1.6, 0.15, 3.9]} c="#c9734c" />
        </>
      )}
      <Box p={[0, 0.66, -2.15]} s={[0.18, 0.14, 0.65]} c="#59645c" />
    </group>
  );
}

export function IslandTrain({
  onRidingChange,
}: {
  onRidingChange?: (riding: boolean) => void;
}) {
  const [riding, setRiding] = useState(false);
  const [near, setNear] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.build);
  const coaches = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const turns = useRef(0);
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const exitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    onRidingChange?.(riding);
    if (riding) exitRef.current?.focus();
    return () => {
      onRidingChange?.(false);
    };
  }, [riding, onRidingChange]);
  useEffect(() => {
    if (!riding) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setRiding(false);
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [riding]);
  useFrame(({ camera }, delta) => {
    if (hidden || !runtime.active) return;
    const dt = Math.min(delta, 0.05);
    if (!reducedMotion || riding) {
      turns.current += dt / ISLAND_RAIL.lapSeconds;
      phase.current -= dt * 7.5;
    }
    coaches.current?.children.forEach((car, i) => {
      const pose = railPose(turns.current, i * 0.009);
      car.position.set(pose.x, ISLAND_RAIL.height, pose.z);
      car.rotation.y = pose.heading;
    });
    const isNear =
      Math.hypot(
        runtime.x - ISLAND_RAIL.station[0],
        runtime.z - ISLAND_RAIL.station[1],
      ) < 5;
    if (isNear !== near) setNear(isNear);
    if (riding) {
      const p = railPose(turns.current, 0.009);
      look.set(p.x, 1.5, p.z);
      cameraTarget.set(p.x + 20, 26, p.z + 28);
      camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 3));
      camera.lookAt(look);
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = THREE.MathUtils.damp(camera.zoom, 21, 4, dt);
        camera.updateProjectionMatrix();
      }
    }
  });
  const board = () => {
    runtime.target = null;
    runtime.path = [];
    runtime.moving = false;
    setRiding(true);
  };
  return (
    <group>
      <CoastalTrack />
      <group ref={coaches}>
        {[0, 1, 2].map((i) => {
          const pose = railPose(0, i * 0.009);
          return (
            <group
              key={i}
              position={[pose.x, ISLAND_RAIL.height, pose.z]}
              rotation={[0, pose.heading, 0]}
            >
              <Car engine={i === 0} phase={phase} />
            </group>
          );
        })}
      </group>
      <group position={[-80.2, 0, 12]}>
        <Box p={[-0.5, 0.6, 0]} s={[12.4, 0.5, 4.5]} c="#9c7952" />
        <Box p={[4.6, 0.2, 0]} s={[2.2, 0.3, 4]} c="#b39a72" />
        {[-5, -1, 3].flatMap((x) =>
          [-1.6, 1.6].map((z) => (
            <Box
              key={`${x}:${z}`}
              p={[x, -0.7, z]}
              s={[0.3, 2.2, 0.3]}
              c="#6b543e"
            />
          )),
        )}
        {[-3.4, 1.8].map((x) => (
          <Box key={x} p={[x, 2, -1.7]} s={[0.22, 3, 0.22]} c="#674f39" />
        ))}
        <Sign text="ISLAND RAIL" p={[-0.8, 3.3, -1.7]} size={[4.9, 0.8]} />
        <Box p={[-0.8, 3.85, -1.7]} s={[5.9, 0.2, 1.3]} c="#b75a3e" />
        <Box p={[-0.8, 1.05, -1.2]} s={[3.8, 0.16, 0.65]} c="#76513a" />
      </group>
      {!hidden && (near || riding) && (
        <Html
          fullscreen
          portal={portal}
          zIndexRange={[25, 0]}
          style={{ pointerEvents: "none" }}
        >
          <section
            className="island-rail-controls"
            aria-label="Island train"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <strong>Island rail</strong>
            {riding ? (
              <button ref={exitRef} onClick={() => setRiding(false)}>
                Return to station
              </button>
            ) : (
              <button onClick={board}>Ride island loop</button>
            )}
          </section>
        </Html>
      )}
    </group>
  );
}
