import * as THREE from "three";
import { sculptedMaterial } from "../Surface";
import type { Pose } from "./locomotion";

/**
 * Rounded stylised character rig, drawn entirely with instancing: every
 * character (player, NPC crowd) is a list of parts on a joint chain, and each
 * part is one instance of a handful of shared geometries. A whole crowd costs
 * one draw per geometry kind (≈7), not one per limb per person.
 *
 * Proportions (character units, before the avatar scale): big readable head
 * (≈1/3.4 of height) under a wide straw hat, short tapered torso, two-segment
 * limbs with overlapping rounded caps, chunky shoes. Hips at 0.77.
 */

export type Palette = {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  shoe: string;
  hat: string;
  band: string;
  hasHat: boolean;
};

export const DEFAULT_PALETTE: Palette = {
  shirt: "#6f8670",
  pants: "#3a4547",
  skin: "#efc5a0",
  hair: "#3e3632",
  shoe: "#efe2c8",
  hat: "#e0b86d",
  band: "#b0573a",
  hasHat: true,
};

type Slot = keyof Omit<Palette, "hasHat"> | "eye" | "blush" | "brow" | "sole";
type Joint =
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
type Kind = "sphere" | "limb" | "torso" | "hair" | "brim" | "crown" | "band";
type Part = {
  kind: Kind;
  joint: Joint;
  p: [number, number, number];
  s: [number, number, number];
  r?: [number, number, number];
  slot: Slot;
  hat?: boolean;
  noHat?: boolean;
  eye?: boolean;
  breath?: boolean;
};

const HIP = 0.77;
const mirror = (parts: Part[]): Part[] =>
  parts.flatMap((part) => {
    if (!part.joint.endsWith("L") && part.p[0] === 0) return [part];
    const right: Part = {
      ...part,
      joint: part.joint.endsWith("L")
        ? ((part.joint.slice(0, -1) + "R") as Joint)
        : part.joint,
      p: [-part.p[0], part.p[1], part.p[2]],
      r: part.r ? [part.r[0], -part.r[1], -part.r[2]] : undefined,
    };
    return [part, right];
  });

export const PARTS: Part[] = mirror([
  // Body
  {
    kind: "sphere",
    joint: "pelvis",
    p: [0, 0.02, 0],
    s: [0.215, 0.16, 0.17],
    slot: "pants",
  },
  {
    kind: "torso",
    joint: "chest",
    p: [0, 0, 0],
    s: [1, 1, 1],
    slot: "shirt",
    breath: true,
  },
  {
    kind: "limb",
    joint: "neck",
    p: [0, 0.09, 0.01],
    s: [0.075, 0.12, 0.075],
    slot: "skin",
  },
  // Head
  {
    kind: "sphere",
    joint: "head",
    p: [0, 0.3, 0.01],
    s: [0.33, 0.315, 0.31],
    slot: "skin",
  },
  {
    kind: "hair",
    joint: "head",
    p: [0, 0.3, 0.0],
    s: [0.35, 0.345, 0.335],
    slot: "hair",
  },
  {
    kind: "sphere",
    joint: "head",
    p: [0.118, 0.28, 0.283],
    s: [0.042, 0.058, 0.026],
    slot: "eye",
    eye: true,
  },
  {
    kind: "sphere",
    joint: "head",
    p: [0.122, 0.37, 0.282],
    s: [0.06, 0.016, 0.022],
    r: [0, 0, -0.18],
    slot: "brow",
  },
  {
    kind: "sphere",
    joint: "head",
    p: [0.195, 0.19, 0.248],
    s: [0.06, 0.03, 0.02],
    r: [0, 0.6, 0],
    slot: "blush",
  },
  {
    kind: "sphere",
    joint: "head",
    p: [0.325, 0.27, 0.0],
    s: [0.05, 0.072, 0.04],
    slot: "skin",
  },
  {
    kind: "sphere",
    joint: "head",
    p: [0, 0.215, 0.315],
    s: [0.04, 0.034, 0.034],
    slot: "skin",
  },
  // Straw hat (or a hair tuft without it)
  {
    kind: "brim",
    joint: "head",
    p: [0, 0.5, -0.01],
    s: [1, 1, 1],
    r: [-0.1, 0, 0],
    slot: "hat",
    hat: true,
  },
  {
    kind: "crown",
    joint: "head",
    p: [0, 0.5, -0.01],
    s: [1, 1, 1],
    r: [-0.1, 0, 0],
    slot: "hat",
    hat: true,
  },
  {
    kind: "band",
    joint: "head",
    p: [0, 0.535, -0.015],
    s: [0.292, 0.055, 0.292],
    r: [-0.1, 0, 0],
    slot: "band",
    hat: true,
  },
  {
    kind: "sphere",
    joint: "head",
    p: [0, 0.63, 0.02],
    s: [0.13, 0.07, 0.11],
    r: [0.2, 0, 0],
    slot: "hair",
    noHat: true,
  },
  // Arms
  {
    kind: "limb",
    joint: "shoulderL",
    p: [0, 0.02, 0],
    s: [0.088, 0.27, 0.088],
    slot: "shirt",
  },
  {
    kind: "limb",
    joint: "elbowL",
    p: [0, 0.02, 0],
    s: [0.068, 0.25, 0.068],
    slot: "skin",
  },
  {
    kind: "sphere",
    joint: "handL",
    p: [0, -0.035, 0.005],
    s: [0.075, 0.082, 0.068],
    slot: "skin",
  },
  // Legs
  {
    kind: "limb",
    joint: "hipL",
    p: [0, 0.03, 0],
    s: [0.105, 0.36, 0.105],
    slot: "pants",
  },
  {
    kind: "limb",
    joint: "kneeL",
    p: [0, 0.02, 0],
    s: [0.088, 0.34, 0.088],
    slot: "pants",
  },
  {
    kind: "sphere",
    joint: "ankleL",
    p: [0, -0.025, 0.055],
    s: [0.098, 0.068, 0.155],
    slot: "shoe",
  },
  {
    kind: "sphere",
    joint: "ankleL",
    p: [0, -0.07, 0.05],
    s: [0.1, 0.022, 0.158],
    slot: "sole",
  },
]);

const lathe = (points: [number, number][], segments = 14) =>
  new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );

function buildGeometries(): Record<Kind, THREE.BufferGeometry> {
  const sphere = new THREE.SphereGeometry(1, 14, 10);
  const limb = lathe(
    [
      [0, -1.07],
      [0.62, -1.03],
      [0.86, -0.9],
      [0.95, -0.45],
      [1, -0.06],
      [0.9, 0.03],
      [0.55, 0.085],
      [0, 0.1],
    ],
    10,
  );
  const torso = lathe(
    [
      [0, -0.09],
      [0.19, -0.085],
      [0.232, 0.02],
      [0.248, 0.2],
      [0.268, 0.37],
      [0.25, 0.46],
      [0.18, 0.525],
      [0.06, 0.55],
      [0, 0.552],
    ],
    16,
  );
  torso.scale(1, 1, 0.8);
  const hair = new THREE.SphereGeometry(1, 14, 9, 0, Math.PI * 2, 0, 1.78);
  hair.rotateX(-0.52);
  const brim = lathe(
    [
      [0.2, 0.03],
      [0.4, 0.012],
      [0.52, -0.035],
      [0.585, -0.075],
      [0.58, -0.095],
      [0.52, -0.065],
      [0.4, -0.022],
      [0.2, -0.01],
      [0.2, 0.03],
    ],
    18,
  );
  const crown = lathe(
    [
      [0, -0.01],
      [0.29, -0.01],
      [0.285, 0.02],
      [0.272, 0.11],
      [0.235, 0.19],
      [0.15, 0.222],
      [0, 0.225],
    ],
    18,
  );
  const band = new THREE.CylinderGeometry(1, 1.02, 1, 18, 1, true);
  for (const g of [sphere, limb, torso, hair, brim, crown, band]) {
    g.deleteAttribute("uv");
    g.computeBoundingSphere();
  }
  return { sphere, limb, torso, hair, brim, crown, band };
}

let geometries: Record<Kind, THREE.BufferGeometry> | null = null;
export function rigGeometries() {
  return (geometries ??= buildGeometries());
}
let material: THREE.MeshStandardMaterial | null = null;
let doubleMaterial: THREE.MeshStandardMaterial | null = null;
export function rigMaterial(double = false) {
  if (double)
    return (doubleMaterial ??= sculptedMaterial({
      roughness: 0.78,
      side: THREE.DoubleSide,
    }));
  return (material ??= sculptedMaterial({ roughness: 0.72 }));
}

export const KINDS: Kind[] = [
  "sphere",
  "limb",
  "torso",
  "hair",
  "brim",
  "crown",
  "band",
];
export const PARTS_PER_KIND: Record<Kind, number> = Object.fromEntries(
  KINDS.map((kind) => [kind, PARTS.filter((p) => p.kind === kind).length]),
) as Record<Kind, number>;

const FIXED: Record<string, string> = {
  eye: "#2a2522",
  blush: "#ec9c86",
  brow: "#3a302b",
  sole: "#8a6b52",
};

/** Per-part colours for one character, in PARTS order. */
export function paletteColors(palette: Palette) {
  return PARTS.map((part) => {
    const key = part.slot as string;
    const value =
      FIXED[key] ??
      (key === "brow"
        ? palette.hair
        : (palette as unknown as Record<string, string>)[key]);
    return new THREE.Color(value);
  });
}

// --- Pose → joint matrices ------------------------------------------------
const joints: Record<Joint, THREE.Matrix4> = Object.fromEntries(
  [
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
  ].map((j) => [j, new THREE.Matrix4()]),
) as Record<Joint, THREE.Matrix4>;
const local = new THREE.Matrix4(),
  euler = new THREE.Euler(),
  quat = new THREE.Quaternion(),
  pos = new THREE.Vector3(),
  one = new THREE.Vector3(1, 1, 1),
  scl = new THREE.Vector3(),
  partMatrix = new THREE.Matrix4();

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

/** Solve the joint chain for one pose under `base` (root/world transform). */
export function solveJoints(pose: Pose, base: THREE.Matrix4) {
  const seat = pose.seat;
  link(
    joints.body,
    base,
    pose.sway,
    HIP + pose.bob - seat * 0.02,
    0,
    pose.lean,
    0,
    pose.bank,
  );
  link(joints.pelvis, joints.body, 0, 0, 0, 0, pose.hipYaw, pose.hipRoll);
  link(
    joints.chest,
    joints.pelvis,
    0,
    0.1,
    0,
    pose.chestPitch,
    pose.chestYaw,
    pose.chestRoll,
  );
  link(joints.neck, joints.chest, 0, 0.5, 0.0);
  link(
    joints.head,
    joints.neck,
    0,
    0.07,
    0.01,
    pose.headPitch,
    pose.headYaw,
    pose.headRoll,
  );
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
      joints[`shoulder${side}`],
      joints.chest,
      sign * 0.268,
      0.415,
      -0.01,
      -arm,
      0,
      sign * spread,
    );
    link(
      joints[`elbow${side}`],
      joints[`shoulder${side}`],
      0,
      -0.255,
      0,
      -elbow,
      0,
      0,
    );
    link(joints[`hand${side}`], joints[`elbow${side}`], 0, -0.245, 0);
    link(
      joints[`hip${side}`],
      joints.pelvis,
      sign * 0.118,
      -0.035,
      0,
      -hip,
      0,
      sign * 0.025,
    );
    link(joints[`knee${side}`], joints[`hip${side}`], 0, -0.345, 0, knee, 0, 0);
    link(
      joints[`ankle${side}`],
      joints[`knee${side}`],
      0,
      -0.325,
      0,
      -ankle + 0,
      0,
      -sign * 0.025,
    );
  }
  return joints;
}

/** Writes instances for one character into the per-kind buffers. */
export function writeCharacter(
  pose: Pose,
  base: THREE.Matrix4,
  hasHat: boolean,
  emit: (kind: Kind, matrix: THREE.Matrix4, partIndex: number) => void,
) {
  solveJoints(pose, base);
  PARTS.forEach((part, index) => {
    const hidden = (part.hat && !hasHat) || (part.noHat && hasHat);
    euler.set(...(part.r ?? [0, 0, 0]), "XYZ");
    quat.setFromEuler(euler);
    pos.set(...part.p);
    scl.set(...part.s);
    if (part.eye) scl.y *= Math.max(0.12, pose.eyes);
    if (part.breath) {
      scl.x *= 1 + (pose.breath - 1) * 0.6;
      scl.y *= pose.breath;
      scl.z *= 1 + (pose.breath - 1) * 1.2;
    }
    if (hidden) scl.setScalar(0);
    partMatrix.compose(pos, quat, scl);
    partMatrix.premultiply(joints[part.joint]);
    emit(part.kind, partMatrix, index);
  });
}
