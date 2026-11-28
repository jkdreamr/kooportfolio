import { KOREA_PICNIC_GUEST, KOREA_RAMEN_COUNTER } from "../core/koreaDistrict";

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
  BOOK_SPOTS,
  FISHING_SPOTS,
  freshActivities,
  PARCEL_DOORS,
  nearbyRegionalActivity,
  regionalActionLabel,
  stepRegionalActivity,
  type ActivityState,
  type RegionalAction,
} from "../core/regionalActivities";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";
import {
  applyUse,
  bestUse,
  carriedIn,
  destinations,
  drop,
  dropExpired,
  handsFull,
  ITEM_NAMES,
  KIND_WORLD,
  PARCEL_SHAKES,
  PICKUP_REACH,
  pickUp,
  questFor,
  questStamps,
  type Carried,
  type Dropped,
} from "../core/carry";
import { setBeacons, beaconsOn } from "../core/life";
import { cue } from "../core/audio/cues";
import { showToast } from "../ui/toasts";
import { roomStories } from "../../content/room-stories";
import { exposeQa } from "../../stage/qa";

/** Session play state for the side activities and the carry layer ("Hands"). */
export const useActivities = create<{
  play: ActivityState;
  dropped: Dropped | null;
  act: (id: RegionalAction) => void;
  /** Use / Give: the best action for what is in your hands, here. */
  use: (world: WorldId) => void;
  /** Sets what is in your hands on the ground where you stand. */
  dropHeld: (world: WorldId) => void;
  pickUpDropped: (world: WorldId) => void;
}>((set, get) => ({
  play: freshActivities(),
  dropped: null,
  act: (id) => {
    const now = performance.now() / 1000,
      play = get().play,
      next = stepRegionalActivity(play, id, now);
    if (next === play) return;
    const world = activitySpots.find((s) => s.id === id)!.world,
      before = carriedIn(world, play);
    set({ play: next });
    const after = carriedIn(world, next);
    if (after && (!before || after.count > before.count)) cue("ui-select");
    else if (before && !after) {
      // Delivered: say so, with the quest's progress.
      cue("ui-confirm");
      const q = questFor(world, before.kind);
      const tally = q ? ` · ${q.name} ${Math.min(q.progress(next), q.goal)}/${q.goal}` : "";
      showToast(`${ITEM_NAMES[before.kind]}${before.count > 1 ? ` ×${before.count}` : ""} delivered${tally}`);
    }
    for (const stamp of questStamps(next)) useGame.getState().earnStamp(stamp);
  },
  use: (world) => {
    const { play } = get(),
      held = carriedIn(world, play);
    if (!held) return;
    const now = nowSeconds(),
      best = bestUse(world, held, play, runtime.x, runtime.z, now);
    if (best.disabled) {
      cue("ui-error");
      if (best.reason) showToast(best.reason);
      return;
    }
    if (best.target) return get().act(best.target);
    const next = applyUse(play, best.action);
    if (next !== play) set({ play: next });
    if (best.action === "feed-ducks") {
      cue("quack");
      showToast("The ducks paddle over for the greens.");
    } else if (best.action === "eat") {
      cue("splash", { gain: 0.5 });
      showToast("Delicious. The bowl is empty.");
    } else if (best.action === "read") {
      const stories = Object.values(roomStories).filter((x) => !!x);
      const story = stories[(play.booksReturned + play.books) % Math.max(1, stories.length)];
      cue("rustle");
      if (story) showToast(story.text);
    } else if (best.action === "shake") {
      cue("rustle");
      showToast(PARCEL_SHAKES[held.parcel ?? 0]);
    }
  },
  dropHeld: (world) => {
    const { play, dropped } = get();
    const out = drop(world, play, runtime.x + Math.sin(runtime.heading) * 0.8, runtime.z + Math.cos(runtime.heading) * 0.8, nowSeconds());
    if (!out.dropped) return;
    // One thing on the ground at a time: an older one goes back home.
    if (dropped) cue("ui-back");
    set({ play: out.play, dropped: out.dropped });
    cue("ui-back");
  },
  pickUpDropped: (world) => {
    const { play, dropped } = get();
    if (!dropped || KIND_WORLD[dropped.kind] !== world) return;
    const next = pickUp(world, play, dropped);
    if (next === play) {
      cue("ui-error");
      showToast("Your hands are full");
      return;
    }
    set({ play: next, dropped: null });
    cue("ui-select");
  },
}));
/** Camera yaw (written each frame by the view) for the chip's arrow. */
export const carryView = { camYaw: 0 };
exposeQa({
  carry: {
    beacons: () => beaconsOn(),
    held: () => {
      const g = useGame.getState();
      return carriedIn(g.world, useActivities.getState().play);
    },
    dropped: () => useActivities.getState().dropped,
  },
});
const nearDropped = (world: WorldId) => {
  const d = useActivities.getState().dropped;
  return !!d && KIND_WORLD[d.kind] === world && Math.hypot(d.x - runtime.x, d.z - runtime.z) < PICKUP_REACH;
};
const nowSeconds = () => performance.now() / 1000;
const look = new THREE.Vector3();
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
    <group
      position={[KOREA_PICNIC_GUEST[0], 0.35, KOREA_PICNIC_GUEST[1]]}
      rotation={[0, Math.PI, 0]}
    >
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
/** A carried or dropped item's model. */
function HeldItem({ item }: { item: Carried }) {
  if (item.kind === "basket") return <Basket count={item.count} />;
  if (item.kind === "parcel") return <WorldSceneryParts parts={parcel} />;
  if (item.kind === "ramen") return <Bowl />;
  return (
    <>
      {Array.from({ length: Math.min(3, item.count) }, (_, i) => (
        <group key={i} position={[0, i * 0.13, 0]} rotation={[0, i * 0.4, 0]}>
          <Book c={bookColors[i % 3]} />
        </group>
      ))}
    </>
  );
}

/** Self-contained world interactions; mounting the environment is sufficient. */
export function RegionalActivities({ world }: { world: WorldId }) {
  const play = useActivities((s) => s.play);
  const [near, setNear] = useState<RegionalAction | null>(null),
    [now, setNow] = useState(nowSeconds);
  const carried = useRef<THREE.Group>(null),
    timer = useRef(0),
    beaconKey = useRef("");
  const dropped = useActivities((s) => s.dropped);
  const [nearDrop, setNearDrop] = useState(false);
  useFrame(({ camera, clock }, delta) => {
    camera.getWorldDirection(look);
    carryView.camYaw = Math.atan2(look.x, look.z);
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
      const store = useActivities.getState();
      if (store.dropped && dropExpired(store.dropped, nowSeconds())) useActivities.setState({ dropped: null });
      const close = available(world) && nearDropped(world);
      setNearDrop((old) => (old === close ? old : close));
      // Hands: the runtime flag and the beacons at the item's destination.
      const held: Carried | null = available(world) ? carriedIn(world, store.play) : null;
      runtime.carrying = held?.kind ?? null;
      const points = held ? destinations(held) : [];
      const key = points.map((p) => p.join(",")).join(";");
      if (key !== beaconKey.current) {
        beaconKey.current = key;
        setBeacons(points);
      }
    }
    if (carried.current) {
      carried.current.visible = available(world);
      // In the hands: in front of the chest, turning with the player, with a
      // small bob while walking.
      const h = runtime.heading;
      carried.current.position.set(
        runtime.x + Math.sin(h) * 0.42,
        0.98 + (runtime.moving ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.04 : 0),
        runtime.z + Math.cos(h) * 0.42,
      );
      carried.current.rotation.y = h;
    }
  });
  useEffect(
    () => () => {
      runtime.carrying = null;
      setBeacons([]);
    },
    [],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "q" &&
        !e.repeat &&
        available(world) &&
        !(e.target instanceof HTMLElement && (e.target.matches("input,textarea,select") || e.target.isContentEditable)) &&
        carriedIn(world, useActivities.getState().play)
      ) {
        useActivities.getState().dropHeld(world);
        e.preventDefault();
        return;
      }
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
      const play = useActivities.getState().play;
      if (nearDropped(world)) {
        useActivities.getState().pickUpDropped(world);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const spot = nearbyRegionalActivity(world, runtime.x, runtime.z, play);
      // Leave E to doors and villagers when this spot has nothing to do.
      if (
        !spot ||
        handsFull(world, play, spot.id) ||
        stepRegionalActivity(play, spot.id, performance.now() / 1000) === play
      ) {
        // Nothing to do here: E uses what is in your hands, unless a door
        // or villager has the key.
        if (carriedIn(world, play) && !useGame.getState().near) {
          useActivities.getState().use(world);
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
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
  const held = carriedIn(world, play);
  const full = near ? handsFull(world, play, near) : false;
  const label = near ? (full ? "Hands full" : regionalActionLabel(play, near, now)) : "";
  const disabled = near ? full || stepRegionalActivity(play, near, now) === play : true;
  return (
    <group name={`${world}-physical-activities`}>
      {world === "home" && (
        <>
          {[
            [-19, 0],
            [-19, 7],
            [-7, 0],
            [-7, 7],
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
            position={[17.2, 0, -5.4]}
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
            position={[KOREA_RAMEN_COUNTER[0], 2.25, KOREA_RAMEN_COUNTER[1]]}
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
            <mesh
              position={[KOREA_PICNIC_GUEST[0], 1.2, KOREA_PICNIC_GUEST[1]]}
            >
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
      {dropped && KIND_WORLD[dropped.kind] === world && (
        <group position={[dropped.x, 0.12, dropped.z]}>
          <HeldItem item={dropped} />
          {nearDrop && (
            <Html position={[0, 1.6, 0]} center zIndexRange={[19, 0]}>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => useActivities.getState().pickUpDropped(world)}
                className="side-quest-action"
              >
                Pick up {ITEM_NAMES[dropped.kind].toLowerCase()}
                <kbd>E</kbd>
              </button>
            </Html>
          )}
        </group>
      )}
      <group ref={carried}>
        {held && (
          <group scale={held.kind === "basket" ? 0.6 : 0.8} position={[0, held.kind === "basket" ? -0.25 : 0, 0]}>
            <HeldItem item={held} />
          </group>
        )}
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
    </group>
  );
}
