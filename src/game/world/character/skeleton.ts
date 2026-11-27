import * as THREE from "three";
import type { Pose } from "./locomotion";

/**
 * The character skeleton (character units, y up, +z forward, feet at y=0).
 * Chunky stylised proportions: a head about a third of the height, a short
 * squashed torso and short legs. Shared by the primitive rig, the sculpted
 * (baked) rig and the offline sculpt, so every LOD poses identically.
 */
export const SK = {
  hip: 0.62,
  chestUp: 0.08,
  neckUp: 0.44,
  headUp: 0.06,
  /** Head sphere centre above the head joint. */
  headCenter: 0.33,
  shoulder: [0.25, 0.37, -0.01] as const,
  upperArm: 0.23,
  foreArm: 0.21,
  hipOff: [0.11, -0.03] as const,
  thigh: 0.27,
  shin: 0.255,
} as const;
export const HIP = SK.hip;

export type Joint =
  | "body"
  | "pelvis"
  | "chest"
  | "neck"
  | "head"
  | "shoulderL"
  | "shoulderR"
  | "elbowL"
  | "elbowR"
  | "handL"
  | "handR"
  | "hipL"
  | "hipR"
  | "kneeL"
  | "kneeR"
  | "ankleL"
  | "ankleR";
export const JOINTS: Joint[] = [
  "body",
  "pelvis",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "handL",
  "handR",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
  "ankleL",
  "ankleR",
];

export type JointMatrices = Record<Joint, THREE.Matrix4>;
export const makeJoints = (): JointMatrices =>
  Object.fromEntries(JOINTS.map((j) => [j, new THREE.Matrix4()])) as JointMatrices;

const joints = makeJoints();
const local = new THREE.Matrix4(),
  euler = new THREE.Euler(),
  quat = new THREE.Quaternion(),
  pos = new THREE.Vector3(),
  one = new THREE.Vector3(1, 1, 1);

function link(
  out: THREE.Matrix4,
  parent: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  euler.set(rx, ry, rz, "YXZ");
  quat.setFromEuler(euler);
  pos.set(x, y, z);
  local.compose(pos, quat, one);
  out.multiplyMatrices(parent, local);
}

/** Solve the joint chain for one pose under `base` (root/world transform).
 * Writes into `out` (a shared scratch set by default). */
export function solveJoints(
  pose: Pose,
  base: THREE.Matrix4,
  out: JointMatrices = joints,
) {
  const seat = pose.seat;
  link(out.body, base, pose.sway, SK.hip + pose.bob - seat * 0.02, 0, pose.lean, 0, pose.bank);
  link(out.pelvis, out.body, 0, 0, 0, 0, pose.hipYaw, pose.hipRoll);
  link(out.chest, out.pelvis, 0, SK.chestUp, 0, pose.chestPitch, pose.chestYaw, pose.chestRoll);
  link(out.neck, out.chest, 0, SK.neckUp, 0.0);
  link(out.head, out.neck, 0, SK.headUp, 0.01, pose.headPitch, pose.headYaw, pose.headRoll);
  for (const [side, sign] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    const arm = side === "L" ? pose.armL : pose.armR;
    const spread = side === "L" ? pose.spreadL : pose.spreadR;
    const elbow = side === "L" ? pose.elbowL : pose.elbowR;
    const hip = side === "L" ? pose.hipL : pose.hipR;
    const knee = side === "L" ? pose.kneeL : pose.kneeR;
    const ankle = side === "L" ? pose.ankleL : pose.ankleR;
    link(
      out[`shoulder${side}`],
      out.chest,
      sign * SK.shoulder[0],
      SK.shoulder[1],
      SK.shoulder[2],
      -arm,
      0,
      sign * spread,
    );
    link(out[`elbow${side}`], out[`shoulder${side}`], 0, -SK.upperArm, 0, -elbow, 0, 0);
    link(out[`hand${side}`], out[`elbow${side}`], 0, -SK.foreArm, 0);
    link(out[`hip${side}`], out.pelvis, sign * SK.hipOff[0], SK.hipOff[1], 0, -hip, 0, sign * 0.025);
    link(out[`knee${side}`], out[`hip${side}`], 0, -SK.thigh, 0, knee, 0, 0);
    link(out[`ankle${side}`], out[`knee${side}`], 0, -SK.shin, 0, -ankle, 0, -sign * 0.025);
  }
  return out;
}

/** The bind pose every sculpted piece is modelled in (arms straight down). */
export function restPose(): Pose {
  return {
    bob: 0, sway: 0, lean: 0, bank: 0, hipRoll: 0, hipYaw: 0,
    chestPitch: 0, chestYaw: 0, chestRoll: 0, breath: 1,
    headPitch: 0, headYaw: 0, headRoll: 0,
    hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0,
    armL: 0, armR: 0, spreadL: 0, spreadR: 0, elbowL: 0, elbowR: 0,
    eyes: 1, walk: 0, seat: 0, talk: 0,
  };
}
