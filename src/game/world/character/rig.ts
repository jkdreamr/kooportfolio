import * as THREE from "three";
import { sculptedMaterial } from "../Surface";
import { chamferBoxSized } from "../chamferBox";
import type { Pose } from "./locomotion";
import { solveJoints, type Joint } from "./skeleton";
export type { Joint };

/**
 * Rounded stylised character rig, drawn entirely with instancing: every
 * character (player, NPC crowd) is a list of parts on a joint chain, and each
 * part is one instance of a small kit of shared unit geometries. A whole
 * crowd costs one draw per geometry kind (≤11), not one per limb per person.
 *
 * What a character wears is data: an `Outfit` (wardrobe.ts) compiles to a
 * `Look`, the flat part list this file poses and writes. Proportions
 * (character units, before the avatar scale): big readable head (≈1/3.3 of
 * height), short tapered torso, two-segment limbs, chunky shoes. Hips at 0.77.
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

/**
 * Geometry kinds. Each is one InstancedMesh per batch.
 * - sphere: heads, buns, balls          - bead: eyes, brows, buttons, hands (glossy)
 * - limb: arms, legs, necks, poles      - torso: chests, jackets
 * - hair: lobed hair shell              - lock: bent hair clumps (fringe, tails)
 * - brim / crown / band: hats, belts, cuffs, collars, rings
 * - skirt: half-cone cloth panel (skirts, coat tails, aprons; flares with gait)
 * - box: leather/hard goods (shoes, bags, books, cameras)
 */
export type Kind =
  | "sphere"
  | "limb"
  | "torso"
  | "hair"
  | "lock"
  | "brim"
  | "crown"
  | "band"
  | "skirt"
  | "box"
  | "bead";
export const KINDS: Kind[] = [
  "sphere",
  "limb",
  "torso",
  "hair",
  "lock",
  "brim",
  "crown",
  "band",
  "skirt",
  "box",
  "bead",
];
/** Kinds the distant (low) rig can draw at all. */
export const FAR_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  "sphere",
  "limb",
  "torso",
  "hair",
  "brim",
  "crown",
  "skirt",
  "box",
]);
/** Small kinds whose shadow is under a pixel: they never cast. */
export const NO_CAST: ReadonlySet<Kind> = new Set<Kind>(["band", "box", "bead"]);

export type Vec3 = [number, number, number];
export type Part = {
  kind: Kind;
  joint: Joint;
  p: Vec3;
  s: Vec3;
  r?: Vec3;
  /** Hex colour; `glow` multiplies it (>1 reads as a specular glint). */
  color: string;
  glow?: number;
  /** "near": full rig only. "far": distant rig only. Default: both (if the
   * kind exists in the far rig). */
  lod?: "near" | "far";
  eye?: boolean;
  mouth?: boolean;
  breath?: boolean;
  /** Cloth flare amplitude: the panel widens with the stride and trails
   * back with the walk. */
  flare?: number;
};
/** Arm override for a held prop: shoulder pitch / elbow bend, blended over
 * the gait (the walk swing is damped, not removed). */
export type Hold = { arm: number; elbow: number; spread?: number };

/** "high": the full rig. "low": the distant crowd rig (≈⅓ the triangles,
 * no face/shoe detail, no shadows); see VillageNpcs. */
export type RigLod = "high" | "low";

export type Look = {
  key: string;
  parts: Part[];
  colors: THREE.Color[];
  /** Instances per kind at each LOD. */
  count: Record<RigLod, Record<Kind, number>>;
  /** Part index → instance slot within its kind (−1: not drawn at this LOD). */
  slot: Record<RigLod, Int16Array>;
  holdL?: Hold;
  holdR?: Hold;
  /** Uniform size (build height). */
  scale: number;
};

export const drawnAt = (part: Part, lod: RigLod) =>
  lod === "high"
    ? part.lod !== "far"
    : part.lod !== "near" && FAR_KINDS.has(part.kind);

/** Freezes a part list into a Look (colour objects, per-kind slots). */
export function makeLook(
  key: string,
  parts: Part[],
  extra: { holdL?: Hold; holdR?: Hold; scale?: number } = {},
): Look {
  const count = {} as Look["count"];
  const slot = {} as Look["slot"];
  for (const lod of ["high", "low"] as const) {
    const n = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<
      Kind,
      number
    >;
    slot[lod] = Int16Array.from(parts, (part) =>
      drawnAt(part, lod) ? n[part.kind]++ : -1,
    );
    count[lod] = n;
  }
  return {
    key,
    parts,
    colors: parts.map((part) =>
      new THREE.Color(part.color).multiplyScalar(part.glow ?? 1),
    ),
    count,
    slot,
    holdL: extra.holdL,
    holdR: extra.holdR,
    scale: extra.scale ?? 1,
  };
}

/** Triangles one character costs at a LOD (for budgets and tests). */
export function lookTriangles(look: Look, lod: RigLod, coarse = false) {
  const g = rigGeometries(lod, coarse);
  return KINDS.reduce((sum, kind) => {
    const geo = g[kind];
    const n = geo.index
      ? geo.index.count / 3
      : geo.attributes.position.count / 3;
    return sum + n * look.count[lod][kind];
  }, 0);
}

// --- Geometry kit -----------------------------------------------------------
const lathe = (
  points: [number, number][],
  segments: number,
  phiStart = 0,
  phiLength = Math.PI * 2,
) =>
  new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
    phiStart,
    phiLength,
  );

/** Hair shell: the old cap, but with chunky clump lobes around it and a
 * scalloped lower edge, so it reads as sculpted volume, not a helmet. */
function hairShell(width: number, height: number) {
  const g = new THREE.SphereGeometry(1, width, height, 0, Math.PI * 2, 0, 1.92);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const phi = Math.atan2(v.x, v.z);
    const down = THREE.MathUtils.clamp((0.35 - v.y) / 1.2, 0, 1);
    const lobe = Math.cos(phi * 7) * 0.5 + 0.5;
    const r = 1 + 0.045 * lobe * (0.4 + down) + 0.02 * Math.cos(phi * 3 + 1);
    v.multiplyScalar(r);
    // Scalloped hem: clumps hang a little lower than the gaps between them.
    v.y -= down * down * lobe * 0.07;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.rotateX(-0.52);
  g.computeVertexNormals();
  return g;
}

/** A tapered hair clump: round root at the top (y≈0.1), point at y=−1,
 * curling toward +z as it hangs. */
function hairLock(segments: number, low: boolean) {
  const g = lathe(
    low
      ? [
          [0, -1],
          [0.3, -0.45],
          [0.28, 0.02],
          [0, 0.12],
        ]
      : [
          [0, -1],
          [0.22, -0.7],
          [0.31, -0.3],
          [0.22, 0.06],
          [0, 0.13],
        ],
    segments,
  );
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) * 0.7 + 0.32 * y * y);
  }
  g.computeVertexNormals();
  return g;
}

function buildGeometries(
  lod: RigLod,
  coarse = false,
): Record<Kind, THREE.BufferGeometry> {
  const low = lod === "low";
  // Coarse (low rig below the high tier): fewer segments again.
  const seg = (high: number, lowSeg: number, coarseSeg: number) =>
    !low ? high : coarse ? coarseSeg : lowSeg;
  const sphere = new THREE.SphereGeometry(1, seg(12, 8, 6), seg(8, 6, 4));
  const bead = new THREE.SphereGeometry(1, seg(6, 4, 4), seg(4, 3, 3));
  const limb = lathe(
    low
      ? [
          [0, -1.07],
          [0.8, -0.96],
          [0.97, -0.4],
          [0.95, 0.0],
          [0, 0.1],
        ]
      : [
          [0, -1.07],
          [0.76, -0.98],
          [1, -0.5],
          [0.84, 0.04],
          [0, 0.1],
        ],
    seg(6, 5, 4),
  );
  const torso = lathe(
    low
      ? [
          [0, -0.09],
          [0.21, -0.07],
          [0.25, 0.15],
          [0.265, 0.38],
          [0.2, 0.515],
          [0, 0.552],
        ]
      : [
          [0, -0.09],
          [0.2, -0.08],
          [0.238, 0.06],
          [0.252, 0.24],
          [0.268, 0.38],
          [0.235, 0.48],
          [0.13, 0.54],
          [0, 0.552],
        ],
    seg(12, 8, 6),
  );
  torso.scale(1, 1, 0.8);
  const hair = hairShell(seg(14, 8, 6), seg(6, 4, 3));
  const lock = hairLock(seg(6, 4, 4), low);
  const brim = lathe(
    low
      ? [
          [0.2, 0.03],
          [0.585, -0.075],
          [0.2, -0.01],
          [0.2, 0.03],
        ]
      : [
          [0.2, 0.03],
          [0.46, 0.0],
          [0.585, -0.075],
          [0.2, 0.03],
        ],
    seg(14, 8, 6),
  );
  const crown = lathe(
    low
      ? [
          [0, -0.01],
          [0.29, -0.01],
          [0.272, 0.11],
          [0.15, 0.222],
          [0, 0.225],
        ]
      : [
          [0, -0.01],
          [0.29, -0.01],
          [0.278, 0.12],
          [0.2, 0.205],
          [0, 0.225],
        ],
    seg(12, 8, 6),
  );
  const band = new THREE.CylinderGeometry(1, 1.02, 1, seg(12, 8, 6), 1, true);
  // Front half of a flared cloth cone: top radius 0.62 at y=0, hem radius 1
  // at y=−1, a slight bell. Two panels make a skirt, two with a gap a coat.
  const skirt = lathe(
    low
      ? [
          [0.62, 0],
          [1, -1],
        ]
      : [
          [0.62, 0],
          [0.7, -0.36],
          [0.84, -0.72],
          [1, -1],
        ],
    seg(8, 4, 3),
    -Math.PI / 2,
    Math.PI,
  );
  const box = low ? new THREE.BoxGeometry(1, 1, 1) : chamferBoxSized([1, 1, 1], 0.22);
  const all = { sphere, bead, limb, torso, hair, lock, brim, crown, band, skirt, box };
  for (const g of Object.values(all)) {
    g.deleteAttribute("uv");
    g.computeBoundingSphere();
  }
  return all;
}

const geometries: Partial<
  Record<RigLod | "low-coarse", Record<Kind, THREE.BufferGeometry>>
> = {};
/** `coarse` (low rig only): the medium/low-tier crowd, a few pixels tall. */
export function rigGeometries(lod: RigLod = "high", coarse = false) {
  if (lod === "low" && coarse)
    return (geometries["low-coarse"] ??= buildGeometries(lod, true));
  return (geometries[lod] ??= buildGeometries(lod));
}

// --- Materials --------------------------------------------------------------
// All are the one sculpted program (same onBeforeCompile source, front or
// double side, instanced with instance colours): only uniforms differ, so
// the fabric / leather / gloss split costs no program links.
let material: THREE.MeshStandardMaterial | null = null;
let doubleMaterial: THREE.MeshStandardMaterial | null = null;
let leather: THREE.MeshStandardMaterial | null = null;
let gloss: THREE.MeshStandardMaterial | null = null;
export function rigMaterial(double = false) {
  if (double)
    return (doubleMaterial ??= sculptedMaterial({
      roughness: 0.8,
      side: THREE.DoubleSide,
    }));
  return (material ??= sculptedMaterial({ roughness: 0.72 }));
}
/** Material for a kind: cloth panels/shells double-sided and matte, hard
 * goods semi-gloss leather, beads (eyes, buckles, buttons) glossy. */
export function rigKindMaterial(kind: Kind) {
  switch (kind) {
    case "hair":
    case "band":
    case "brim":
    case "skirt":
      return rigMaterial(true);
    case "box":
      return (leather ??= sculptedMaterial({ roughness: 0.5, metalness: 0.04 }));
    case "bead":
      return (gloss ??= sculptedMaterial({ roughness: 0.34, metalness: 0.08 }));
    default:
      return rigMaterial();
  }
}

// --- Pose → joint matrices (skeleton.ts) ------------------------------------
const euler = new THREE.Euler(),
  quat = new THREE.Quaternion(),
  pos = new THREE.Vector3(),
  scl = new THREE.Vector3(),
  partMatrix = new THREE.Matrix4(),
  sized = new THREE.Matrix4();
export { solveJoints };

const held: Pose = {} as Pose;
function applyHold(pose: Pose, look: Look): Pose {
  if (!look.holdL && !look.holdR) return pose;
  Object.assign(held, pose);
  const seated = pose.seat;
  for (const [hold, side] of [
    [look.holdL, "L"],
    [look.holdR, "R"],
  ] as const) {
    if (!hold) continue;
    const k = 1 - seated * 0.5;
    if (side === "L") {
      held.armL = pose.armL * 0.25 + hold.arm * k;
      held.elbowL = hold.elbow;
      if (hold.spread !== undefined) held.spreadL = hold.spread;
    } else {
      held.armR = pose.armR * 0.25 + hold.arm * k;
      held.elbowR = hold.elbow;
      if (hold.spread !== undefined) held.spreadR = hold.spread;
    }
  }
  return held;
}

/** Writes instances for one character: `emit(kind, matrix, partIndex)` for
 * every part drawn at `lod`. */
export function writeLook(
  pose: Pose,
  base: THREE.Matrix4,
  look: Look,
  lod: RigLod,
  emit: (kind: Kind, matrix: THREE.Matrix4, partIndex: number) => void,
) {
  const posed = applyHold(pose, look);
  if (look.scale !== 1) {
    sized.makeScale(look.scale, look.scale, look.scale).premultiply(base);
    solveJoints(posed, sized);
  } else solveJoints(posed, base);
  // Stride spread (0 standing … ≈1 at full stride) drives cloth flare.
  const stride = Math.min(1.2, Math.abs(posed.hipL - posed.hipR));
  const slots = look.slot[lod];
  const parts = look.parts;
  for (let index = 0; index < parts.length; index++) {
    if (slots[index] < 0) continue;
    const part = parts[index];
    const r = part.r;
    let rx = r ? r[0] : 0;
    pos.set(part.p[0], part.p[1], part.p[2]);
    scl.set(part.s[0], part.s[1], part.s[2]);
    if (part.eye) scl.y *= Math.max(0.12, posed.eyes);
    if (part.mouth) scl.y *= 1 + (posed.talk ?? 0) * 2.2;
    if (part.breath) {
      scl.x *= 1 + (posed.breath - 1) * 0.6;
      scl.y *= posed.breath;
      scl.z *= 1 + (posed.breath - 1) * 1.2;
    }
    if (part.flare) {
      const f = part.flare;
      const widen = 1 + f * (stride * 0.42 + posed.walk * 0.06);
      scl.x *= widen;
      scl.z *= 1 + f * (stride * 0.6 + posed.walk * 0.08);
      // Hem trails back with the walk and lifts a touch when seated.
      rx += f * (posed.walk * 0.1 - posed.lean * 0.5);
      if (posed.seat > 0) {
        rx -= posed.seat * 0.9 * Math.min(1, f);
        scl.y *= 1 - posed.seat * 0.35;
      }
    }
    euler.set(rx, r ? r[1] : 0, r ? r[2] : 0, "XYZ");
    quat.setFromEuler(euler);
    partMatrix.compose(pos, quat, scl);
    partMatrix.premultiply(joints[part.joint]);
    emit(part.kind, partMatrix, index);
  }
}

/* --- Crowd LOD ----------------------------------------------------------- */
/** Beyond this screen-size-equivalent distance (explore lens, fov 42°) a
 * villager is drawn with the low rig. Medium keeps the full rig only for
 * the few closest (the low rig carries the outfit's silhouette and colours). */
export const NEAR_RIG = { high: 25, medium: 9, low: 0 } as const;
const TAN_EXPLORE = Math.tan(THREE.MathUtils.degToRad(21));
const HYSTERESIS = 1.5;

/** Should a villager at camera distance `distance` use the full rig?
 * `fov` is the camera's vertical fov: a telephoto lens makes far things
 * big, so distances are compared at the explore lens's scale. */
export function nearRig(
  distance: number,
  fov: number,
  radius: number,
  wasNear: boolean,
) {
  const equivalent =
    (distance * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / TAN_EXPLORE;
  return equivalent < radius + (wasNear ? HYSTERESIS : 0);
}
