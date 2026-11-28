import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../core/store";
import { RigBatch, RigMeshes } from "../world/character/CharacterRig";
import { createGait, stepGait } from "../world/character/locomotion";
import { DEFAULT_PALETTE, type Palette } from "../world/character/rig";

/**
 * What the court tells the rig each frame, per player. Written by the court
 * loop (no React state), read here.
 */
export type CourtPose = {
  visible: boolean;
  x: number;
  z: number;
  /** Facing yaw (three's rotation.y). */
  yaw: number;
  vx: number;
  vz: number;
  /** Jump height above the floor (shots, blocks). */
  jump: number;
  /** 0..1 gather (ball up at the chest/head). */
  gather: number;
  /** Seconds since the last release (follow-through), large when none. */
  release: number;
  /** Arms up on defence (a contest). */
  contest: number;
  /** Rooted by a juke: a stumble. */
  stumble: number;
};
export const courtPose = (): CourtPose => ({
  visible: true,
  x: 0,
  z: 5,
  yaw: Math.PI,
  vx: 0,
  vz: 0,
  jump: 0,
  gather: 0,
  release: 9,
  contest: 0,
  stumble: 0,
});

const base = new THREE.Matrix4(),
  at = new THREE.Vector3(),
  quat = new THREE.Quaternion(),
  up = new THREE.Vector3(0, 1, 0),
  scale = new THREE.Vector3(0.9, 0.9, 0.9);

/**
 * Both court players in one rig batch (one set of draw calls for two):
 * a planted two-handed gather, a jump on release with a high
 * follow-through, arms up to contest, a stumble when his ankles go.
 */
export function BasketballPlayers({
  poses,
  colors,
}: {
  poses: readonly CourtPose[];
  colors: readonly { shirt: string; hat: boolean; pants?: string }[];
}) {
  const batch = useMemo(() => new RigBatch(2), []);
  const gaits = useRef([createGait(11), createGait(23)]);
  const raise = useRef([0, 0]);
  const palettes = useMemo<Palette[]>(
    () =>
      colors.map((c, i) => ({
        ...DEFAULT_PALETTE,
        shirt: c.shirt,
        pants: c.pants ?? (i ? "#2f3b4a" : "#344e50"),
        shoe: "#fff1d8",
        band: i ? "#e9d6a0" : "#b65c3d",
        hasHat: c.hat,
      })),
    [colors],
  );
  useFrame((_, delta) => {
    const g = useGame.getState();
    const dt = Math.min(delta, 0.05);
    const frozen = g.paused || !!g.result || g.panel !== "none";
    let n = 0;
    for (let i = 0; i < poses.length && i < 2; i++) {
      const p = poses[i];
      if (!p.visible) continue;
      const pose = stepGait(gaits.current[i], frozen ? 0 : dt, p.vx, p.vz, p.yaw, { still: frozen });
      const follow = Math.max(0, 1 - p.release / 0.65);
      const target = Math.max(p.gather * 1.2, follow * 2.75, p.contest * 2.9);
      raise.current[i] = THREE.MathUtils.damp(raise.current[i], target, 18, dt);
      const r = raise.current[i],
        w = Math.min(1, r);
      pose.armL = THREE.MathUtils.lerp(pose.armL, r, w);
      pose.armR = THREE.MathUtils.lerp(pose.armR, r, w);
      pose.elbowL = pose.elbowR = THREE.MathUtils.lerp(pose.elbowL, 1.3 - Math.max(follow, p.contest) * 0.9, w);
      pose.spreadL = pose.spreadR = 0.1 - w * 0.05 + p.contest * 0.25;
      pose.kneeL += p.gather * 0.5 + p.stumble * 0.6;
      pose.kneeR += p.gather * 0.5;
      pose.bob -= p.gather * 0.06 + p.stumble * 0.1;
      quat.setFromAxisAngle(up, p.yaw + p.stumble * 0.35);
      base.compose(at.set(p.x, 0.12 + p.jump, p.z), quat, scale);
      batch.write(n++, pose, base, palettes[i]);
    }
    batch.commit(n);
  });
  return <RigMeshes batch={batch} />;
}
