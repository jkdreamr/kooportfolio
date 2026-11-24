import { useEffect, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { create } from "zustand";
import * as THREE from "three";
import { runtime, useGame, walkTo } from "../core/store";
import { newRunId } from "../../shared/run-id";
import { useGameMode } from "../core/gameMode";
import type { WorldId } from "../core/worlds";
import {
  activitySpots,
  BOOK_SPOTS,
  FISHING_SPOTS,
  freshActivities,
  PARCEL_DOORS,
  regionalPayout,
  nearbyRegionalActivity,
  regionalActionLabel,
  stepRegionalActivity,
  type ActivityState,
  type RegionalAction,
} from "../core/regionalActivities";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

type Gain = { coins: number; p: readonly [number, number]; key: number };
const useActivities = create<{
  play: ActivityState;
  gain: Gain | null;
  act: (id: RegionalAction) => void;
}>((set, get) => ({
  play: freshActivities(),
  gain: null,
  act: (id) => {
    const now = performance.now() / 1000,
      game = useGame.getState(),
      play = get().play,
      coins = regionalPayout(play, id, now, game.save.upgrades.garden),
      next = stepRegionalActivity(play, id, now);
    if (next === play) return;
    set({ play: next });
    if (!coins) return;
    game.award(`side-${id}-${newRunId()}`, coins, Math.ceil(coins / 2));
    const p = activitySpots.find((s) => s.id === id)!.p;
    set({ gain: { coins, p, key: now } });
  },
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

const parcel: SceneryPart[] = [
  { p: [0, 0.2, 0], s: [0.55, 0.4, 0.45], c: "#b8915f", shape: "block" },
  { p: [0, 0.2, 0], s: [0.08, 0.41, 0.46], c: "#e3d6bb", shape: "block" },
  { p: [0, 0.405, 0], s: [0.56, 0.01, 0.08], c: "#e3d6bb", shape: "block" },
];
const postbox: SceneryPart[] = [
  { p: [0, 0.55, 0], s: [0.12, 1.1, 0.12], c: "#3c4652", shape: "block" },
  { p: [0, 1.3, 0], s: [0.7, 0.55, 0.5], c: "#41566a", shape: "stone" },
  { p: [0, 1.4, 0.26], s: [0.42, 0.05, 0.02], c: "#1d242c", shape: "block" },
  { p: [0.38, 1.45, 0], s: [0.04, 0.3, 0.04], c: "#c9cfd6", shape: "block" },
];
const bookColors = ["#4f6a7f", "#8b5a4a", "#6f7f61"];
function Book({ c }: { c: string }) {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.12, 0.36]} />
        <meshStandardMaterial color={c} roughness={0.8} />
      </mesh>
      <mesh position={[0.02, 0, 0]}>
        <boxGeometry args={[0.47, 0.09, 0.37]} />
        <meshStandardMaterial color="#e7e0cf" />
      </mesh>
    </group>
  );
}
const bookDrop: SceneryPart[] = [
  { p: [0, 0.6, 0], s: [0.9, 1.2, 0.7], c: "#4b5966", shape: "stone" },
  { p: [0, 1.28, 0], s: [0.95, 0.16, 0.75], c: "#5f6d79", shape: "stone" },
  { p: [0, 0.95, 0.36], s: [0.6, 0.08, 0.02], c: "#1d242c", shape: "block" },
];
const rodStand: SceneryPart[] = [
  { p: [0, 0.3, 0], s: [0.5, 0.6, 0.5], c: "#5a6470", shape: "stone" },
  {
    p: [0, 1.4, 1],
    s: [0.05, 0.05, 2.6],
    c: "#8a7558",
    r: [-0.6, 0, 0],
    shape: "block",
  },
];
function Bobber({ x, rod }: { x: number; rod: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const bite = useActivities.getState().play.biteAt[rod],
      now = nowSeconds();
    ref.current.visible = bite !== null;
    const biting = bite !== null && now >= bite;
    ref.current.position.y =
      -2.22 +
      (biting
        ? -0.12 + Math.sin(clock.elapsedTime * 18) * 0.05
        : Math.sin(clock.elapsedTime * 2.4) * 0.03);
  });
  return (
    <group ref={ref} position={[x, -2.22, 24.6]} visible={false}>
      <mesh>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshStandardMaterial color="#e4e8ec" />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshStandardMaterial color="#b4543f" />
      </mesh>
    </group>
  );
}
function ParcelMarker({ p }: { p: readonly [number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 3.4 + Math.sin(clock.elapsedTime * 2) * 0.15;
    ref.current.rotation.y = clock.elapsedTime * 0.8;
  });
  return (
    <group ref={ref} position={[p[0], 3.4, p[1]]}>
      <WorldSceneryParts parts={parcel} />
    </group>
  );
}
function CoinGain({ gain }: { gain: Gain }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), 1400);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;
  return (
    <Html
      position={[gain.p[0], 3.4, gain.p[1]]}
      center
      zIndexRange={[18, 0]}
      style={{ pointerEvents: "none" }}
    >
      <span className="side-quest-gain">+{gain.coins}</span>
    </Html>
  );
}

/** Self-contained world interactions; mounting the environment is sufficient. */
export function RegionalActivities({ world }: { world: WorldId }) {
  const play = useActivities((s) => s.play),
    gain = useActivities((s) => s.gain);
  const [near, setNear] = useState<RegionalAction | null>(null),
    [now, setNow] = useState(nowSeconds);
  const carried = useRef<THREE.Group>(null),
    timer = useRef(0);
  useFrame((_, delta) => {
    timer.current += delta;
    if (timer.current > 0.15) {
      timer.current = 0;
      const next = available(world)
        ? (nearbyRegionalActivity(
            world,
            runtime.x,
            runtime.z,
            useActivities.getState().play,
          )?.id ?? null)
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
      const spot = nearbyRegionalActivity(
        world,
        runtime.x,
        runtime.z,
        useActivities.getState().play,
      );
      if (!spot) return;
      selectActivity(spot.id, world);
      // Delivering at a door's own prompt still lets the same E enter it.
      const door = spot.id.startsWith("parcel-")
        ? PARCEL_DOORS[Number(spot.id.slice(7))]?.id
        : undefined;
      if (door && useGame.getState().near === door) return;
      e.preventDefault();
      e.stopImmediatePropagation();
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
          <group
            position={[5.2, 0, -5.4]}
            rotation={[0, -0.5, 0]}
            onPointerDown={(e) => selectActivity("postbox", world, e)}
          >
            <WorldSceneryParts parts={postbox} />
            <mesh position={[0, 1, 0]}>
              <boxGeometry args={[1.4, 2, 1.4]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
          {play.parcel !== null && (
            <group
              onPointerDown={(e) =>
                selectActivity(
                  `parcel-${play.parcel}` as RegionalAction,
                  world,
                  e,
                )
              }
            >
              <ParcelMarker p={PARCEL_DOORS[play.parcel].p} />
            </group>
          )}
        </>
      )}
      {world === "stanford" && (
        <>
          {BOOK_SPOTS.map(([x, z], i) =>
            now >= play.booksReadyAt[i] ? (
              <group
                key={i}
                position={[x + 0.7, 0.25, z + 0.4]}
                rotation={[0, i * 1.3, 0]}
                onPointerDown={(e) =>
                  selectActivity(`book-${i}` as RegionalAction, world, e)
                }
              >
                <Book c={bookColors[i]} />
                <mesh>
                  <boxGeometry args={[1.4, 1, 1.4]} />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            ) : null,
          )}
          <group
            position={[42.3, 0, 55.6]}
            rotation={[0, Math.PI, 0]}
            onPointerDown={(e) => selectActivity("bookdrop", world, e)}
          >
            <WorldSceneryParts parts={bookDrop} />
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
          {FISHING_SPOTS.map(([x, z], i) => (
            <group key={i}>
              <group
                position={[x + 0.9, 0, z]}
                onPointerDown={(e) =>
                  selectActivity(`fish-${i}` as RegionalAction, world, e)
                }
              >
                <WorldSceneryParts parts={rodStand} />
              </group>
              <Bobber x={x + 0.9} rod={i} />
            </group>
          ))}
        </>
      )}
      <group ref={carried}>
        {world === "home" && play.basket > 0 ? (
          <Basket count={play.basket} />
        ) : world === "home" && play.parcel !== null ? (
          <WorldSceneryParts parts={parcel} />
        ) : world === "korea" && play.bowl ? (
          <Bowl />
        ) : world === "stanford" && play.books > 0 ? (
          Array.from({ length: play.books }, (_, i) => (
            <group
              key={i}
              position={[0, i * 0.13, 0]}
              rotation={[0, i * 0.4, 0]}
            >
              <Book c={bookColors[i % 3]} />
            </group>
          ))
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
            className="side-quest-action"
          >
            {label}
            {!disabled && <kbd>E</kbd>}
          </button>
        </Html>
      )}
      {gain && <CoinGain key={gain.key} gain={gain} />}
    </group>
  );
}
