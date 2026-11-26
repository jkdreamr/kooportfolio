import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorldActive } from "../engine/active";
import { RigBatch, RigMeshes } from "./character/CharacterRig";
import { createGait, seatPose, stepGait } from "./character/locomotion";
import { DEFAULT_PALETTE, type Palette } from "./character/rig";
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

const HAIR = ["#3e3632", "#5b4030", "#2d2a2a", "#8a5a3a", "#c49a62", "#6b6460"];
const PANTS = ["#3a4547", "#4b4a5e", "#6b5844", "#36485a", "#5f6b55"];
const HATS = ["#e0b86d", "#d9c08a", "#c98f5a", "#e7d2a2"];
const SHOES = ["#efe2c8", "#7b5a43", "#3f3a36", "#c9b9a0"];
function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
function npcPalette(npc: NpcEntry["npc"]): Palette {
  const h = hashId(npc.id);
  return {
    ...DEFAULT_PALETTE,
    shirt: npc.color,
    skin: npc.skin,
    hasHat: npc.hat,
    hair: HAIR[h % HAIR.length],
    pants: PANTS[(h >>> 3) % PANTS.length],
    hat: HATS[(h >>> 6) % HATS.length],
    shoe: SHOES[(h >>> 9) % SHOES.length],
    band: npc.color,
  };
}
const NPC_SCALE = 0.67;
const base = new THREE.Matrix4(),
  turn = new THREE.Quaternion(),
  at = new THREE.Vector3(),
  size = new THREE.Vector3(NPC_SCALE, NPC_SCALE, NPC_SCALE);
const up = new THREE.Vector3(0, 1, 0);

/** The whole crowd as one instanced rig: ≈7 draws for every villager. */
function CrowdRig({ crowd }: { crowd: NpcEntry[] }) {
  const batch = useMemo(() => new RigBatch(Math.max(1, crowd.length)), [crowd]);
  const gaits = useMemo(
    () => crowd.map((entry) => createGait(hashId(entry.npc.id) % 997)),
    [crowd],
  );
  const palettes = useMemo(
    () => crowd.map(({ npc }) => npcPalette(npc)),
    [crowd],
  );
  const last = useRef<Float32Array | null>(null);
  const active = useWorldActive();
  const write = (dt: number) => {
    const game = useGame.getState();
    const prev = (last.current ??= new Float32Array(crowd.length * 2).fill(
      NaN,
    ));
    crowd.forEach(({ actor }, i) => {
      const seated = actor.seat ? actor.posture : 0;
      const x =
        actor.x + ((actor.seat?.position[0] ?? actor.x) - actor.x) * seated;
      const z =
        actor.z + ((actor.seat?.position[1] ?? actor.z) - actor.z) * seated;
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
      const pose = stepGait(gaits[i], dt, vx, vz, actor.heading, {
        forceWalk:
          actor.moving && !frozen && Math.hypot(vx, vz) < 0.5 && seated < 0.1,
        still: frozen || seated > 0.5,
      });
      seatPose(pose, seated);
      if (seated <= 0) pose.seat = 0;
      at.set(
        x,
        0.2 + ((actor.seat?.height ?? 0.508) + 0.04 - 0.508) * seated,
        z,
      );
      turn.setFromAxisAngle(up, actor.heading);
      base.compose(at, turn, size);
      batch.write(i, pose, base, palettes[i]);
    });
    batch.commit(crowd.length);
  };
  useLayoutEffect(() => write(0));
  useFrame((_, delta) => {
    if (!active) return;
    write(Math.min(delta, 0.05));
  });
  return (
    <RigMeshes
      batch={batch}
      onPointerDown={(kind, event) => {
        event.stopPropagation();
        if (event.instanceId === undefined) return;
        const entry = crowd[batch.characterAt(kind, event.instanceId)];
        if (entry) talkToNpc(entry.actor.id);
      }}
    />
  );
}

function TalkRings({ world }: { world: WorldId }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const actors = activeNpcActors(world);
  useFrame(() => {
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
  useFrame((_, delta) => {
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
    <group key={world} name="village-npcs">
      <CrowdRig crowd={activeNpcCrowd(world)} />
      <TalkRings world={world} />
    </group>
  );
}
