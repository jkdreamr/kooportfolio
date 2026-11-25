import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
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

type Part = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  swing?: number;
  hat?: boolean;
  limb?: "thigh" | "shin" | "foot" | "arm" | "hand";
};
const parts: Part[] = [
  { p: [0, 0.78, 0], s: [0.66, 0.64, 0.42], c: "shirt" },
  { p: [0, 1.47, 0.02], s: [0.72, 0.65, 0.62], c: "skin" },
  { p: [0, 1.79, 0], s: [0.76, 0.2, 0.68], c: "#423a32" },
  { p: [0, 1.65, -0.27], s: [0.74, 0.35, 0.15], c: "#423a32" },
  { p: [-0.15, 1.48, 0.337], s: [0.065, 0.085, 0.025], c: "#302e29" },
  { p: [0.15, 1.48, 0.337], s: [0.065, 0.085, 0.025], c: "#302e29" },
  { p: [0, 1.3, 0.34], s: [0.12, 0.025, 0.02], c: "#895e4f" },
  {
    p: [-0.17, 0.27, 0],
    s: [0.24, 0.44, 0.25],
    c: "#39464a",
    swing: 1,
    limb: "thigh",
  },
  {
    p: [0.17, 0.27, 0],
    s: [0.24, 0.44, 0.25],
    c: "#39464a",
    swing: -1,
    limb: "thigh",
  },
  { p: [-0.17, 0.24, 0.4], s: [0.24, 0.38, 0.25], c: "#39464a", limb: "shin" },
  { p: [0.17, 0.24, 0.4], s: [0.24, 0.38, 0.25], c: "#39464a", limb: "shin" },
  {
    p: [-0.17, 0.07, 0.06],
    s: [0.26, 0.14, 0.37],
    c: "#e9ddc4",
    swing: 1,
    limb: "foot",
  },
  {
    p: [0.17, 0.07, 0.06],
    s: [0.26, 0.14, 0.37],
    c: "#e9ddc4",
    swing: -1,
    limb: "foot",
  },
  {
    p: [-0.43, 0.78, 0],
    s: [0.2, 0.47, 0.25],
    c: "shirt",
    swing: -1,
    limb: "arm",
  },
  {
    p: [0.43, 0.78, 0],
    s: [0.2, 0.47, 0.25],
    c: "shirt",
    swing: 1,
    limb: "arm",
  },
  {
    p: [-0.43, 0.5, 0],
    s: [0.19, 0.18, 0.22],
    c: "skin",
    swing: -1,
    limb: "hand",
  },
  {
    p: [0.43, 0.5, 0],
    s: [0.19, 0.18, 0.22],
    c: "skin",
    swing: 1,
    limb: "hand",
  },
  { p: [0, 1.94, 0], s: [0.84, 0.16, 0.75], c: "shirt", hat: true },
  { p: [0, 1.87, 0.35], s: [0.81, 0.065, 0.46], c: "shirt", hat: true },
];
const limbAxis = new THREE.Vector3(1, 0, 0);

/** One draw call per body part for the entire crowd, not per person. */
function CrowdPart({ part, crowd }: { part: Part; crowd: NpcEntry[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const local = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if (!mesh.current) return;
    crowd.forEach(({ npc }, index) => {
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
  }, [part, crowd]);
  useFrame(() => {
    if (!mesh.current) return;
    const game = useGame.getState();
    crowd.forEach(({ actor, npc }, i) => {
      const active =
        actor.moving && !game.paused && game.panel === "none";
      const swing = active ? Math.sin(actor.stride) : 0;
      const seated = actor.seat ? actor.posture : 0;
      let tilt = part.swing ? swing * part.swing * 0.5 : 0;
      local.set(...part.p);
      if (part.limb === "thigh") {
        local.y += 0.19 * seated;
        local.z += 0.2 * seated;
        tilt -= (Math.PI / 2) * seated;
      } else if (part.limb === "foot") {
        local.z += 0.37 * seated;
      } else if (part.limb === "arm" || part.limb === "hand") {
        tilt -= 0.7 * seated;
        local.z += (part.limb === "hand" ? 0.3 : 0.12) * seated;
        local.y += (part.limb === "hand" ? 0.12 : 0.02) * seated;
      }
      if (part.swing && active) {
        const pivot = part.p[1] < 0.45 ? 0.46 : 1.01;
        local.y -= pivot;
        local.applyAxisAngle(limbAxis, swing * part.swing * 0.5);
        local.y += pivot;
      }
      local
        .multiplyScalar(0.67)
        .applyAxisAngle(THREE.Object3D.DEFAULT_UP, actor.heading);
      transform.position.set(
        actor.x +
          ((actor.seat?.position[0] ?? actor.x) - actor.x) * seated +
          local.x,
        0.2 +
          local.y +
          ((actor.seat?.height ?? 0.508) + 0.04 - 0.508) * seated +
          Math.abs(swing) * 0.025,
        actor.z +
          ((actor.seat?.position[1] ?? actor.z) - actor.z) * seated +
          local.z,
      );
      transform.rotation.set(tilt, actor.heading, 0, "YXZ");
      transform.scale
        .set(...part.s)
        .multiplyScalar(
          part.hat && !npc.hat
            ? 0
            : part.limb === "shin"
              ? 0.67 * seated
              : 0.67,
        );
      transform.updateMatrix();
      mesh.current!.setMatrixAt(i, transform.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    // Raycasting must use today's crowd bounds, not its initial arrangement.
    mesh.current.boundingSphere = null;
  });
  const selectNpc = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (event.instanceId !== undefined)
      talkToNpc(crowd[event.instanceId].actor.id);
  };
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, crowd.length]}
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
    const frozen =
      game.paused || !runtime.active || game.panel !== "none";
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
      {parts.map((part, index) => (
        <CrowdPart key={index} part={part} crowd={activeNpcCrowd(world)} />
      ))}
      <TalkRings world={world} />
    </group>
  );
}
