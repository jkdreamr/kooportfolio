import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { movement } from "../core/input";
import { runtime, useGame } from "../core/store";
import { canTalkToNpc, nearestNpc, stepNpc, villagers } from "../core/npcs";
import {
  closeConversation,
  npcActors,
  talkToNpc,
  useNpcs,
} from "../core/npcState";

type Part = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  swing?: number;
  hat?: boolean;
};
const parts: Part[] = [
  { p: [0, 0.78, 0], s: [0.66, 0.64, 0.42], c: "shirt" },
  { p: [0, 1.47, 0.02], s: [0.72, 0.65, 0.62], c: "skin" },
  { p: [0, 1.79, 0], s: [0.76, 0.2, 0.66], c: "#423a32" },
  { p: [0, 1.65, -0.27], s: [0.74, 0.35, 0.15], c: "#423a32" },
  { p: [-0.15, 1.48, 0.337], s: [0.065, 0.085, 0.025], c: "#302e29" },
  { p: [0.15, 1.48, 0.337], s: [0.065, 0.085, 0.025], c: "#302e29" },
  { p: [0, 1.3, 0.34], s: [0.12, 0.025, 0.02], c: "#895e4f" },
  { p: [-0.17, 0.27, 0], s: [0.24, 0.44, 0.25], c: "#39464a", swing: 1 },
  { p: [0.17, 0.27, 0], s: [0.24, 0.44, 0.25], c: "#39464a", swing: -1 },
  { p: [-0.17, 0.07, 0.06], s: [0.26, 0.14, 0.37], c: "#e9ddc4", swing: 1 },
  { p: [0.17, 0.07, 0.06], s: [0.26, 0.14, 0.37], c: "#e9ddc4", swing: -1 },
  { p: [-0.43, 0.78, 0], s: [0.2, 0.47, 0.25], c: "shirt", swing: -1 },
  { p: [0.43, 0.78, 0], s: [0.2, 0.47, 0.25], c: "shirt", swing: 1 },
  { p: [-0.43, 0.5, 0], s: [0.19, 0.18, 0.22], c: "skin", swing: -1 },
  { p: [0.43, 0.5, 0], s: [0.19, 0.18, 0.22], c: "skin", swing: 1 },
  { p: [0, 1.94, 0], s: [0.84, 0.16, 0.75], c: "shirt", hat: true },
  { p: [0, 1.87, 0.35], s: [0.81, 0.065, 0.46], c: "shirt", hat: true },
];
const limbAxis = new THREE.Vector3(1, 0, 0);

function selectNpc(event: ThreeEvent<PointerEvent>) {
  event.stopPropagation();
  if (event.instanceId !== undefined) talkToNpc(npcActors[event.instanceId].id);
}

/** One draw call per body part for the entire crowd, not per person. */
function CrowdPart({ part }: { part: Part }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const local = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if (!mesh.current) return;
    villagers.forEach((npc, index) => {
      mesh.current!.setColorAt(
        index,
        new THREE.Color(
          part.c === "shirt"
            ? npc.color
            : part.c === "skin"
              ? npc.skin
              : part.c,
        ),
      );
    });
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
    mesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, [part]);
  useFrame(() => {
    if (!mesh.current) return;
    const game = useGame.getState();
    npcActors.forEach((actor, i) => {
      const active =
        actor.moving && !game.paused && game.panel === "none" && !game.build;
      const swing = active ? Math.sin(actor.stride) : 0;
      local.set(...part.p);
      if (part.swing) {
        const pivot = part.p[1] < 0.45 ? 0.46 : 1.01;
        local.y -= pivot;
        local.applyAxisAngle(limbAxis, swing * part.swing * 0.5);
        local.y += pivot;
      }
      local
        .multiplyScalar(0.67)
        .applyAxisAngle(THREE.Object3D.DEFAULT_UP, actor.heading);
      transform.position.set(
        actor.x + local.x,
        0.2 + local.y + Math.abs(swing) * 0.025,
        actor.z + local.z,
      );
      transform.rotation.set(
        part.swing ? swing * part.swing * 0.5 : 0,
        actor.heading,
        0,
        "YXZ",
      );
      transform.scale
        .set(...part.s)
        .multiplyScalar(part.hat && !villagers[i].hat ? 0 : 0.67);
      transform.updateMatrix();
      mesh.current!.setMatrixAt(i, transform.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    // Raycasting must use today's crowd bounds, not its initial arrangement.
    mesh.current.boundingSphere = null;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, villagers.length]}
      frustumCulled={false}
      castShadow
      receiveShadow
      onPointerDown={selectNpc}
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}

function TalkRings() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const game = useGame.getState(),
      selected = useNpcs.getState().pending;
    const nearest =
      game.near === "npc"
        ? nearestNpc(npcActors, runtime.x, runtime.z)?.id
        : null;
    npcActors.forEach((actor, i) => {
      const show =
        game.panel === "none" &&
        !game.paused &&
        !game.build &&
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
      args={[undefined, undefined, villagers.length]}
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
  const pendingTime = useRef(0);
  useEffect(() => () => closeConversation(), []);
  useFrame((_, delta) => {
    const game = useGame.getState(),
      state = useNpcs.getState();
    if (state.talking && game.panel !== "npc") closeConversation();
    const frozen =
      game.paused || game.build || !runtime.active || game.panel !== "none";
    for (let i = 0; i < npcActors.length; i++) {
      const actor = npcActors[i];
      stepNpc(
        actor,
        villagers[i],
        delta,
        [runtime.x, runtime.z],
        frozen,
        actor.id === state.pending || actor.id === state.talking,
      );
    }
    if (!state.pending) {
      pendingTime.current = 0;
      return;
    }
    pendingTime.current += Math.min(delta, 0.04);
    const [dx, dz] = movement();
    const actor = npcActors.find((npc) => npc.id === state.pending)!;
    if (frozen || Math.hypot(dx, dz) > 0.1 || pendingTime.current > 25) {
      useNpcs.setState({ pending: null });
    } else if (canTalkToNpc(actor, runtime.x, runtime.z)) {
      talkToNpc(actor.id);
    } else if (!runtime.target) useNpcs.setState({ pending: null });
  });
  return (
    <group name="village-npcs">
      {parts.map((part, index) => (
        <CrowdPart key={index} part={part} />
      ))}
      <TalkRings />
    </group>
  );
}
