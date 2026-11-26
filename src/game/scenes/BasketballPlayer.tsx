import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime, useGame } from "../core/store";
import { RigBatch, RigMeshes } from "../world/character/CharacterRig";
import { createGait, stepGait } from "../world/character/locomotion";
import { DEFAULT_PALETTE, type Palette } from "../world/character/rig";

// Court rig: the shared rounded character with a planted, two-handed gather,
// a jump on release and a high follow-through (wrist snap over the head).
const base = new THREE.Matrix4(),
  at = new THREE.Vector3(),
  world = new THREE.Vector3(),
  quat = new THREE.Quaternion(),
  euler = new THREE.Euler(),
  one = new THREE.Vector3(1, 1, 1);

export function BasketballPlayer({
  color,
  hat,
  release,
}: {
  color: string;
  hat: boolean;
  release: RefObject<number>;
}) {
  const root = useRef<THREE.Group>(null);
  const batch = useMemo(() => new RigBatch(1), []);
  const gait = useRef(createGait(11));
  const last = useRef<THREE.Vector3 | null>(null);
  const raise = useRef(0);
  const palette = useMemo<Palette>(
    () => ({
      ...DEFAULT_PALETTE,
      shirt: color,
      pants: "#344e50",
      shoe: "#fff1d8",
      band: "#b65c3d",
      hasHat: hat,
    }),
    [color, hat],
  );
  useFrame((_, delta) => {
    const g = useGame.getState();
    const dt = Math.min(delta, 0.05);
    const frozen =
      g.paused || !!g.result || g.panel !== "none" || !runtime.active;
    const group = root.current;
    if (!group) return;
    group.getWorldPosition(world);
    let vx = 0,
      vz = 0;
    if (last.current && dt > 0) {
      const dx = world.x - last.current.x,
        dz = world.z - last.current.z;
      if (Math.hypot(dx, dz) < 1.5) {
        vx = dx / dt / 0.9;
        vz = dz / dt / 0.9;
      }
    }
    (last.current ??= new THREE.Vector3()).copy(world);
    const yaw = euler.setFromQuaternion(
      group.getWorldQuaternion(quat),
      "YXZ",
    ).y;
    const pose = stepGait(gait.current, frozen ? 0 : dt, vx, vz, yaw, {
      forceWalk: runtime.moving && Math.hypot(vx, vz) < 0.5,
      still: frozen,
    });
    const follow = Math.max(0, 1 - (release.current ?? 9) / 0.65);
    const gather = runtime.shooting ? 1 : 0;
    const target = Math.max(gather * 1.2, follow * 2.75);
    raise.current = THREE.MathUtils.damp(raise.current, target, 18, dt);
    const r = raise.current;
    pose.armL = THREE.MathUtils.lerp(pose.armL, r, Math.min(1, r));
    pose.armR = THREE.MathUtils.lerp(pose.armR, r, Math.min(1, r));
    pose.elbowL = pose.elbowR = THREE.MathUtils.lerp(
      pose.elbowL,
      1.3 - follow * 0.9,
      Math.min(1, r),
    );
    pose.spreadL = pose.spreadR = 0.1 - Math.min(1, r) * 0.05;
    // Knees load during the gather, then the jump.
    pose.kneeL += gather * 0.5;
    pose.kneeR += gather * 0.5;
    pose.bob -= gather * 0.06;
    const jump =
      Math.sin(Math.min(1, (release.current ?? 9) / 0.5) * Math.PI) * 0.31;
    base.compose(at.set(0, 0.12 + jump, 0), quat.identity(), one);
    batch.write(0, pose, base, palette);
    batch.commit(1);
  });
  return (
    <group scale={0.9}>
      <group ref={root}>
        <RigMeshes batch={batch} />
      </group>
    </group>
  );
}
