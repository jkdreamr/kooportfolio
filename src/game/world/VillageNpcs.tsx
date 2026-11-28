import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useWorldActive } from "../engine/active";
import { RigBatch, RigMeshes } from "./character/CharacterRig";
import { createGait, seatPose, stepGait } from "./character/locomotion";
import { NEAR_RIG, nearRig } from "./character/rig";
import { assignTiers, type TierSlots } from "./character/crowdTiers";
import { HIP } from "./character/skeleton";
import { NpcPortraitShot } from "./NpcPortraitShot";
import { SculptBatch } from "./character/sculpt/runtime";
import { sculptCharFor, useCast } from "./character/sculpt/useSculpt";
import { registerSculptWarmup } from "./character/sculpt/warm";
import { lookFor } from "./character/wardrobe";
import * as THREE from "three";
import { movement } from "../core/input";
import { runtime, useGame } from "../core/store";
import { nearestNpc, stepNpc } from "../core/npcs";
import {
  closeConversation,
  activeNpcActors,
  activeNpcCrowd,
  stepNpcApproach,
  talkToNpc,
  useNpcs,
  type NpcEntry,
} from "../core/npcState";
import type { WorldId } from "../core/worlds";
import { useWorldView, viewRuntime } from "../core/worldView";
import { useStage } from "../../stage/contract";
import { exposeQa } from "../../stage/qa";

// QA builds only (tree-shaken otherwise): screenshot tools find villagers.
exposeQa({ npcCrowd: activeNpcCrowd, useNpcs, talkToNpc });
registerSculptWarmup();

function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
const NPC_SCALE = 0.67;
const base = new THREE.Matrix4(),
  turn = new THREE.Quaternion(),
  at = new THREE.Vector3(),
  size = new THREE.Vector3(NPC_SCALE, NPC_SCALE, NPC_SCALE);
const up = new THREE.Vector3(0, 1, 0);

/** Sculpted tiers (character/sculpt): the nearest few villagers get the
 * hero bake, the rest of the near crowd the mid bake, and everyone beyond
 * the low primitive rig. Medium: mid and low only. Low: low only. */
const HERO_MAX = 5;
const HERO_RADIUS = 13;
const MID_RADIUS = { high: 20, medium: 10, low: 0 } as const;
/** At most this many mid-tier villagers at once (worst-case triangle cap). */
const MID_MAX = { high: 10, medium: 8, low: 0 } as const;
type Sculpts = { hero: SculptBatch | null; mid: SculptBatch };

/** The whole crowd: hero + mid sculpted BatchedMeshes (one draw each) and
 * the low primitive rig (≤8 instanced draws). Before the bake loads, the
 * primitive near rig stands in for the sculpted tiers. */
function CrowdRig({ crowd }: { crowd: NpcEntry[] }) {
  // Every villager wears their own outfit (character/cast.ts).
  const looks = useMemo(() => crowd.map(({ npc }) => lookFor(npc)), [crowd]);
  const stageTier = useStage((s) => s.tier) ?? "medium";
  // The low tier shows no sculpt at all: no download, no decode.
  const cast = useCast(MID_RADIUS[stageTier] > 0);
  // Built and disposed in the same (layout) effect and held in state, so
  // StrictMode's extra cleanup cannot leave a disposed batch in use. The
  // hero bake only exists on high, the one tier that shows it.
  const [sculpt, setSculpt] = useState<Sculpts | null>(null);
  useLayoutEffect(() => {
    if (!cast || MID_RADIUS[stageTier] <= 0 || !crowd.every(({ npc }) => cast.has(npc.id))) {
      setSculpt(null);
      return;
    }
    const chars = crowd.map(({ npc }) => sculptCharFor(npc));
    const built: Sculpts = {
      hero: stageTier === "high" ? new SculptBatch(cast, chars, "hero") : null,
      mid: new SculptBatch(cast, chars, "mid"),
    };
    setSculpt(built);
    return () => {
      built.hero?.dispose();
      built.mid.dispose();
    };
  }, [cast, crowd, stageTier]);
  const near = useMemo(() => new RigBatch(sculpt ? [] : looks, "high"), [looks, sculpt]);
  const far = useMemo(() => new RigBatch(looks, "low"), [looks]);
  const slots = useMemo(
    () => ({
      near: new Int32Array(Math.max(1, crowd.length)),
      far: new Int32Array(Math.max(1, crowd.length)),
      /** 0 low, 1 near/mid, 2 hero. */
      tier: new Uint8Array(Math.max(1, crowd.length)),
      dist: new Float32Array(Math.max(1, crowd.length)),
      /** Camera distance to each villager's placed root (for the LOD test). */
      range: new Float32Array(Math.max(1, crowd.length)),
      order: Array.from(crowd, (_, i) => i),
      /** Where each villager stands this frame (x, y, z). */
      at: new Float32Array(Math.max(1, crowd.length) * 3),
    }),
    [crowd],
  );
  const gaits = useMemo(
    () => crowd.map((entry) => createGait(hashId(entry.npc.id) % 997)),
    [crowd],
  );
  const last = useRef<Float32Array | null>(null);
  const active = useWorldActive();
  const write = (dt: number, camera?: THREE.Camera) => {
    const game = useGame.getState();
    const prev = (last.current ??= new Float32Array(crowd.length * 2).fill(
      NaN,
    ));
    const tier = useStage.getState().tier ?? "medium";
    // The whole-island diorama shows only tiny walkers: all low.
    const overview =
      viewRuntime.blend === 0 && useWorldView.getState().zoom < 3;
    const radius = overview || !camera ? 0 : sculpt ? MID_RADIUS[tier] : NEAR_RIG[tier];
    const heroRadius = overview || !camera || tier !== "high" ? 0 : HERO_RADIUS;
    const fov = (camera as THREE.PerspectiveCamera | undefined)?.fov ?? 42;
    const talking = useNpcs.getState().talking;
    const clock = performance.now() / 1000;
    let nearCount = 0,
      farCount = 0;
    const seatY = HIP * NPC_SCALE - 0.008;
    for (let i = 0; i < crowd.length; i++) {
      const { actor } = crowd[i];
      const seated = actor.seat ? actor.posture : 0;
      const x = actor.x + ((actor.seat?.position[0] ?? actor.x) - actor.x) * seated;
      const z = actor.z + ((actor.seat?.position[1] ?? actor.z) - actor.z) * seated;
      const y = 0.2 + ((actor.seat?.height ?? seatY) + 0.04 - seatY) * seated;
      slots.at[i * 3] = x;
      slots.at[i * 3 + 1] = y;
      slots.at[i * 3 + 2] = z;
      if (camera) {
        slots.dist[i] = Math.hypot(camera.position.x - x, camera.position.z - z);
        slots.range[i] = Math.hypot(camera.position.x - x, camera.position.y - y, camera.position.z - z);
      }
    }
    // Tiers, counted as they are handed out, nearest first, with incumbents
    // preferred (no frame-to-frame swaps at the caps). Without a camera
    // (the first layout write) everyone is low and the tiers are kept.
    if (camera)
      assignTiers(slots as TierSlots, {
        heroMax: sculpt?.hero && heroRadius > 0 ? HERO_MAX : 0,
        midMax: sculpt ? MID_MAX[tier] : crowd.length,
        heroIn: (i, was) => nearRig(slots.range[i], fov, heroRadius, was),
        midIn: (i, was) => radius > 0 && nearRig(slots.range[i], fov, radius, was),
      });
    crowd.forEach(({ actor }, i) => {
      const seated = actor.seat ? actor.posture : 0;
      const x = slots.at[i * 3],
        z = slots.at[i * 3 + 2];
      let vx = 0,
        vz = 0;
      if (dt > 0 && !Number.isNaN(prev[i * 2])) {
        const dx = x - prev[i * 2],
          dz = z - prev[i * 2 + 1];
        if (Math.hypot(dx, dz) < 1.5) {
          vx = dx / dt / NPC_SCALE;
          vz = dz / dt / NPC_SCALE;
        }
      }
      prev[i * 2] = x;
      prev[i * 2 + 1] = z;
      const frozen = game.paused || game.panel !== "none";
      // Look at the player when they come close (and always while talking).
      const isTalking = talking === actor.id && !game.paused;
      const pdx = runtime.x - x, pdz = runtime.z - z;
      const pd = Math.hypot(pdx, pdz);
      let look: { yaw: number; pitch: number } | null = null;
      if (isTalking || (pd < 3.2 && pd > 0.2 && !actor.moving)) {
        const yaw = Math.atan2(Math.sin(Math.atan2(pdx, pdz) - actor.heading), Math.cos(Math.atan2(pdx, pdz) - actor.heading));
        if (Math.abs(yaw) < 1.9) look = { yaw, pitch: pd < 1.2 ? -0.08 : 0 };
      }
      const pose = stepGait(gaits[i], dt, vx, vz, actor.heading, {
        forceWalk:
          actor.moving && !frozen && Math.hypot(vx, vz) < 0.5 && seated < 0.1,
        still: (frozen && !isTalking) || seated > 0.5,
        talking: isTalking,
        look,
      });
      seatPose(pose, seated);
      if (seated <= 0) pose.seat = 0;
      // The villager you are talking to moves their mouth.
      // Syllable-like mouth motion while speaking (with short pauses).
      pose.talk = isTalking
        ? Math.max(0, Math.sin(clock * 11 + i) * 0.5 + Math.sin(clock * 6.3) * 0.35) * (Math.sin(clock * 1.7 + i) > -0.6 ? 1 : 0)
        : 0;
      at.set(x, slots.at[i * 3 + 1], z);
      turn.setFromAxisAngle(up, actor.heading);
      base.compose(at, turn, size);
      const level = camera ? slots.tier[i] : 0;
      const hero = level === 2,
        close = level >= 1;
      if (sculpt) {
        if (hero) sculpt.hero?.write(i, pose, base);
        else sculpt.hero?.hide(i);
        if (close && !hero) sculpt.mid.write(i, pose, base);
        else sculpt.mid.hide(i);
      }
      if (close && !sculpt) {
        slots.near[nearCount] = i;
        near.write(nearCount++, pose, base, looks[i]);
      } else if (!close) {
        slots.far[farCount] = i;
        far.write(farCount++, pose, base, looks[i]);
      }
    });
    near.commit(nearCount);
    far.commit(farCount);
  };
  // First pose before paint, whenever the batches change (not every render:
  // that would reset the LOD hysteresis on unrelated re-renders).
  useLayoutEffect(() => write(0), [near, far, sculpt]);
  useFrame(({ camera }, delta) => {
    if (!active) return;
    write(Math.min(delta, 0.05), camera);
  });
  const talk =
    (batch: RigBatch, slot: Int32Array) =>
    (kind: Parameters<RigBatch["characterAt"]>[0], event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (event.instanceId === undefined) return;
      const index = batch.characterAt(kind, event.instanceId);
      const entry = index >= 0 ? crowd[slot[index]] : undefined;
      if (entry) talkToNpc(entry.actor.id);
    };
  const talkSculpt = (batch: SculptBatch) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const id = (event as unknown as { batchId?: number }).batchId;
    if (id === undefined) return;
    const entry = crowd[batch.characterAt(id)];
    if (entry) talkToNpc(entry.actor.id);
  };
  const shadowsMid = (useStage.getState().tier ?? "medium") !== "low";
  return (
    <>
      {sculpt && (
        <>
          {sculpt.hero && <primitive object={sculpt.hero.mesh} castShadow receiveShadow onPointerDown={talkSculpt(sculpt.hero)} />}
          <primitive object={sculpt.mid.mesh} castShadow={shadowsMid} receiveShadow onPointerDown={talkSculpt(sculpt.mid)} />
        </>
      )}
      <RigMeshes batch={near} onPointerDown={talk(near, slots.near)} />
      <RigMeshes
        batch={far}
        shadows={false}
        onPointerDown={talk(far, slots.far)}
      />
    </>
  );
}

function TalkRings({ world }: { world: WorldId }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const actors = activeNpcActors(world);
  const worldActive = useWorldActive();
  useFrame(() => {
    if (!worldActive) return;
    const game = useGame.getState(),
      selected = useNpcs.getState().pending;
    const nearest =
      game.near === "npc"
        ? nearestNpc(actors, runtime.x, runtime.z, world)?.id
        : null;
    actors.forEach((actor, i) => {
      const show =
        game.panel === "none" &&
        !game.paused &&
        (actor.id === selected || actor.id === nearest);
      transform.position.set(actor.x, 0.27, actor.z);
      transform.rotation.set(-Math.PI / 2, 0, 0);
      transform.scale.setScalar(show ? 1 : 0);
      transform.updateMatrix();
      mesh.current?.setMatrixAt(i, transform.matrix);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, actors.length]}
      frustumCulled={false}
    >
      <ringGeometry args={[0.43, 0.5, 24]} />
      <meshBasicMaterial
        color="#f4d58c"
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function NpcCrowd() {
  const world = useGame((game) => game.world);
  useEffect(() => () => closeConversation(), []);
  const worldActive = useWorldActive();
  useFrame((_, delta) => {
    if (!worldActive) return;
    const game = useGame.getState(),
      state = useNpcs.getState();
    if (state.talking && game.panel !== "npc") closeConversation();
    const frozen = game.paused || !runtime.active || game.panel !== "none";
    const crowd = activeNpcCrowd(game.world);
    for (const { actor, npc } of crowd) {
      stepNpc(
        actor,
        npc,
        delta,
        [runtime.x, runtime.z],
        frozen,
        actor.id === state.pending || actor.id === state.talking,
        game.world,
      );
    }
    if (state.pending) {
      const [dx, dz] = movement();
      stepNpcApproach(delta, frozen || Math.hypot(dx, dz) > 0.1);
    }
  });
  return (
    <>
      <group key={world} name="village-npcs">
        <CrowdRig crowd={activeNpcCrowd(world)} />
        <TalkRings world={world} />
      </group>
      <NpcPortraitShot />
    </>
  );
}
