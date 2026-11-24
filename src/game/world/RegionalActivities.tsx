import { useEffect, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { create } from "zustand";
import * as THREE from "three";
import { runtime, useGame, walkTo } from "../core/store";
import { useGameMode } from "../core/gameMode";
import type { WorldId } from "../core/worlds";
import {
  activitySpots,
  freshActivities,
  nearbyRegionalActivity,
  regionalActionLabel,
  stepRegionalActivity,
  type ActivityState,
  type RegionalAction,
} from "../core/regionalActivities";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

const useActivities = create<{
  play: ActivityState;
  act: (id: RegionalAction) => void;
}>((set) => ({
  play: freshActivities(),
  act: (id) =>
    set((s) => ({
      play: stepRegionalActivity(s.play, id, performance.now() / 1000),
    })),
}));
const nowSeconds = () => performance.now() / 1000;
const ripeBeds: SceneryPart[][] = Array.from({ length: 4 }, (_, i) =>
  Array.from({ length: 8 }, (_, j) => ({
    p: [-2.6 + (j % 4) * 1.7, 1.1, -0.9 + Math.floor(j / 4) * 1.8],
    s: [0.28, 0.28, 0.28],
    c: i % 2 ? "#bb6d4b" : "#c2b36a",
    shape: "rock",
  })),
);
function available(world: WorldId) {
  const g = useGame.getState();
  return (
    g.world === world &&
    g.scene === "hub" &&
    !g.paused &&
    !g.build &&
    !g.traveling &&
    !g.overlayLocked &&
    g.panel === "none" &&
    !useGameMode.getState().active
  );
}
function selectActivity(
  id: RegionalAction,
  world: WorldId,
  event?: ThreeEvent<PointerEvent>,
) {
  event?.stopPropagation();
  if (!available(world)) return;
  const spot = activitySpots.find((s) => s.id === id)!;
  if (Math.hypot(runtime.x - spot.p[0], runtime.z - spot.p[1]) >= 2.4) {
    walkTo(...spot.p);
    return;
  }
  useActivities.getState().act(id);
}
const crate: SceneryPart[] = [
  { p: [0, 0.1, 0], s: [0.9, 0.2, 0.65], c: "#92774f" },
  ...[-1, 1].flatMap(
    (side) =>
      [
        { p: [side * 0.43, 0.35, 0], s: [0.07, 0.5, 0.7], c: "#b59b6a" },
        { p: [0, 0.35, side * 0.3], s: [0.9, 0.5, 0.07], c: "#b59b6a" },
      ] as SceneryPart[],
  ),
];
function Basket({ count }: { count: number }) {
  return (
    <group>
      <WorldSceneryParts parts={crate} />
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[-0.25 + i * 0.25, 0.5, 0]} castShadow>
          <icosahedronGeometry args={[0.19, 1]} />
          <meshStandardMaterial
            color={i % 2 ? "#bc7450" : "#b5ad65"}
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}
function Bowl() {
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[0.32, 0.2, 0.22, 12]} />
        <meshStandardMaterial color="#d6c7a5" />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.025, 12]} />
        <meshStandardMaterial color="#bd8058" />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.6, 0.025, 0.025]} />
        <meshStandardMaterial color="#dfc485" />
      </mesh>
    </group>
  );
}
const seated: SceneryPart[] = [
  { p: [0, 0.63, 0], s: [0.68, 0.67, 0.4], c: "#728b80" },
  { p: [0, 1.3, 0], s: [0.73, 0.65, 0.62], c: "#dfb891" },
  { p: [0, 1.65, -0.02], s: [0.78, 0.18, 0.65], c: "#443e34" },
  { p: [-0.16, 0.25, 0.3], s: [0.25, 0.25, 0.8], c: "#465c60" },
  { p: [0.16, 0.25, 0.3], s: [0.25, 0.25, 0.8], c: "#465c60" },
  { p: [-0.16, 0.2, 0.75], s: [0.27, 0.19, 0.34], c: "#d6ccad" },
  { p: [0.16, 0.2, 0.75], s: [0.27, 0.19, 0.34], c: "#d6ccad" },
  { p: [-0.16, 1.31, 0.32], s: [0.06, 0.08, 0.03], c: "#393b34" },
  { p: [0.16, 1.31, 0.32], s: [0.06, 0.08, 0.03], c: "#393b34" },
];
function PicnicGuest({ fed }: { fed: boolean }) {
  const arm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (arm.current)
      arm.current.rotation.x = fed
        ? -0.65 + Math.sin(clock.elapsedTime * 2) * 0.13
        : -1.2 + Math.sin(clock.elapsedTime * 3) * 0.25;
  });
  return (
    <group position={[-41, 0.35, 54]} rotation={[0, Math.PI, 0]}>
      <WorldSceneryParts parts={seated} />
      <group ref={arm} position={[0.43, 0.95, 0]}>
        <mesh position={[0, -0.24, 0]} castShadow>
          <boxGeometry args={[0.18, 0.5, 0.22]} />
          <meshStandardMaterial color="#728b80" />
        </mesh>
        <mesh position={[0, -0.53, 0]}>
          <boxGeometry args={[0.18, 0.16, 0.2]} />
          <meshStandardMaterial color="#dfb891" />
        </mesh>
      </group>
      {fed && (
        <group position={[0, 0.65, 0.45]}>
          <Bowl />
        </group>
      )}
    </group>
  );
}

/** Self-contained world interactions; mounting the environment is sufficient. */
export function RegionalActivities({ world }: { world: WorldId }) {
  const play = useActivities((s) => s.play);
  const [near, setNear] = useState<RegionalAction | null>(null),
    [now, setNow] = useState(nowSeconds);
  const carried = useRef<THREE.Group>(null),
    timer = useRef(0);
  useFrame((_, delta) => {
    timer.current += delta;
    if (timer.current > 0.15) {
      timer.current = 0;
      const next = available(world)
        ? (nearbyRegionalActivity(world, runtime.x, runtime.z)?.id ?? null)
        : null;
      setNear((old) => (old === next ? old : next));
      setNow(nowSeconds());
    }
    if (carried.current) {
      carried.current.visible = available(world);
      carried.current.position.set(runtime.x + 0.65, 0.95, runtime.z + 0.25);
    }
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== "e" ||
        e.repeat ||
        e.isComposing ||
        (e.target instanceof HTMLElement &&
          (e.target.matches("input,textarea,select") ||
            e.target.isContentEditable)) ||
        !available(world)
      )
        return;
      const spot = nearbyRegionalActivity(world, runtime.x, runtime.z);
      if (!spot) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      selectActivity(spot.id, world);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [world]);
  const spot = activitySpots.find((s) => s.id === near);
  const label = near ? regionalActionLabel(play, near, now) : "";
  const disabled = near ? stepRegionalActivity(play, near, now) === play : true;
  return (
    <group name={`${world}-physical-activities`}>
      {world === "home" && (
        <>
          {[
            [12, 42],
            [12, 55],
            [28, 42],
            [28, 55],
          ].map(([x, z], i) => (
            <group key={i}>
              {now >= play.gardenReadyAt[i] && (
                <group position={[x, 0, z]}>
                  <WorldSceneryParts parts={ripeBeds[i]} />
                </group>
              )}
              <mesh
                position={[x, 1.2, z]}
                onPointerDown={(e) =>
                  selectActivity(`harvest-${i}` as RegionalAction, world, e)
                }
              >
                <boxGeometry args={[7.5, 2.5, 4.5]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          ))}
          <group
            position={[25, 2, -10]}
            onPointerDown={(e) => selectActivity("produce", world, e)}
          >
            <Basket count={Math.min(3, play.produceCrates)} />
          </group>
        </>
      )}
      {world === "korea" && (
        <>
          <group
            position={[39, 2.25, 8.2]}
            onPointerDown={(e) => selectActivity("ramen", world, e)}
          >
            <Bowl />
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[2.5, 1, 2]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
          <group onPointerDown={(e) => selectActivity("picnic", world, e)}>
            <PicnicGuest fed={play.guestFedUntil > now} />
            <mesh position={[-41, 1.2, 54]}>
              <boxGeometry args={[2, 2.5, 2]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        </>
      )}
      <group ref={carried}>
        {world === "home" && play.basket > 0 ? (
          <Basket count={play.basket} />
        ) : world === "korea" && play.bowl ? (
          <Bowl />
        ) : null}
      </group>
      {spot && (
        <Html
          position={[spot.p[0], 2.2, spot.p[1]]}
          center
          zIndexRange={[19, 0]}
        >
          <button
            type="button"
            disabled={disabled}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => selectActivity(spot.id, world)}
            style={{
              whiteSpace: "nowrap",
              border: "1px solid #c4b28b",
              borderRadius: 8,
              padding: "9px 12px",
              background: "#243d37",
              color: "#f3e8cd",
              font: "600 13px system-ui",
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.75 : 1,
            }}
          >
            {label}
            {!disabled && " · E"}
          </button>
        </Html>
      )}
    </group>
  );
}
