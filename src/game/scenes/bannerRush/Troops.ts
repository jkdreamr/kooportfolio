/**
 * TroopBatch (§1.7): every troop, tower crew and commander of both sides in
 * one instanced mesh per rig kind (≤ 11 draws). Modelled on RigBatch, with
 * a module-level emit (no closure per figure per frame), colour rewrites only
 * when a figure's look or brightness changes, and a fixed capacity.
 */
import * as THREE from "three";
import { KINDS, NO_CAST, rigGeometries, rigKindMaterial, writeLook, type Kind, type Look, type RigLod } from "../../world/character/rig";
import type { Pose } from "../../world/character/locomotion";

export const MAX_DRAWN = 58;
const KIND_INDEX: Record<Kind, number> = Object.fromEntries(KINDS.map((k, i) => [k, i])) as Record<Kind, number>;

const color = new THREE.Color();
const base = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Emit state (module scope: one function for every figure). */
const E = {
  batch: null as TroopBatch | null,
  look: null as Look | null,
  recolor: false,
  bright: 1,
  red: 0,
  start: new Int32Array(KINDS.length),
};

// @hot
function emit(kind: Kind, matrix: THREE.Matrix4, partIndex: number) {
  const b = E.batch!;
  const k = KIND_INDEX[kind];
  const mesh = b.meshes[k];
  if (!mesh) return;
  const at = E.start[k] + E.look!.slot[b.lod][partIndex];
  if (at >= b.capacity[k]) return;
  mesh.setMatrixAt(at, matrix);
  if (E.recolor) {
    const c = E.look!.colors[partIndex];
    const f = E.bright;
    color.setRGB(Math.min(1.6, c.r * f + E.red), c.g * f * (1 - E.red), c.b * f * (1 - E.red));
    mesh.setColorAt(at, color);
  }
}

export class TroopBatch {
  readonly meshes: (THREE.InstancedMesh | null)[] = [];
  readonly capacity = new Int32Array(KINDS.length);
  private cursor = new Int32Array(KINDS.length);
  private prevLook: (Look | null)[] = new Array(MAX_DRAWN).fill(null);
  private prevBright = new Float32Array(MAX_DRAWN);
  private prevRed = new Float32Array(MAX_DRAWN);
  private relayout = false;
  private index = 0;
  private colorDirty = new Uint8Array(KINDS.length);
  constructor(
    readonly lod: RigLod,
    coarse: boolean,
    looks: Look[],
    shadows: boolean,
  ) {
    // Capacity: MAX_DRAWN figures of the largest look per kind.
    for (let k = 0; k < KINDS.length; k++) {
      let most = 0;
      for (const look of looks) most = Math.max(most, look.count[lod][KINDS[k]]);
      this.capacity[k] = most * MAX_DRAWN;
    }
    const geos = rigGeometries(lod, coarse);
    for (let k = 0; k < KINDS.length; k++) {
      const kind = KINDS[k];
      if (!this.capacity[k]) {
        this.meshes.push(null);
        continue;
      }
      const mesh = new THREE.InstancedMesh(geos[kind], rigKindMaterial(kind), this.capacity[k]);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, color.setRGB(1, 1, 1));
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = shadows && !NO_CAST.has(kind);
      mesh.receiveShadow = true;
      mesh.userData.noBake = true;
      this.meshes.push(mesh);
    }
  }
  // @hot
  begin() {
    for (let k = 0; k < KINDS.length; k++) {
      this.cursor[k] = 0;
      this.colorDirty[k] = 0;
    }
    this.relayout = false;
    this.index = 0;
  }
  // @hot
  /**
   * One figure: tile position (x, height, z), yaw, per-axis scale on top of
   * the look's own, pose, brightness (1 normal; 0.85 inert; 1.6 hit flash;
   * 0.75 ghost) and a red tint (0..1, invalid ghost).
   */
  draw(look: Look, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, pose: Pose, bright: number, red: number) {
    const i = this.index;
    if (i >= MAX_DRAWN) return;
    const counts = look.count[this.lod];
    for (let k = 0; k < KINDS.length; k++) if (this.cursor[k] + counts[KINDS[k]] > this.capacity[k]) return;
    this.index = i + 1;
    if (this.prevLook[i] !== look) this.relayout = true;
    const recolor = this.relayout || this.prevBright[i] !== bright || this.prevRed[i] !== red;
    this.prevLook[i] = look;
    this.prevBright[i] = bright;
    this.prevRed[i] = red;
    quat.setFromAxisAngle(UP, yaw);
    pos.set(x, y, z);
    scl.set(sx, sy, sz);
    base.compose(pos, quat, scl);
    E.batch = this;
    E.look = look;
    E.recolor = recolor;
    E.bright = bright;
    E.red = red;
    for (let k = 0; k < KINDS.length; k++) E.start[k] = this.cursor[k];
    writeLook(pose, base, look, this.lod, emit);
    for (let k = 0; k < KINDS.length; k++) {
      const n = counts[KINDS[k]];
      if (recolor && n) this.colorDirty[k] = 1;
      this.cursor[k] += n;
    }
  }
  // @hot
  end() {
    for (let k = 0; k < KINDS.length; k++) {
      const mesh = this.meshes[k];
      if (!mesh) continue;
      mesh.count = this.cursor[k];
      mesh.visible = this.cursor[k] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (this.colorDirty[k] && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (let i = this.index; i < MAX_DRAWN; i++) this.prevLook[i] = null;
  }
  dispose() {
    for (const m of this.meshes) m?.dispose();
  }
}

/** A writable pose scratch (copy of a gait pose with overrides applied). */
export function poseCopy(into: Pose, from: Pose) {
  into.bob = from.bob;
  into.sway = from.sway;
  into.lean = from.lean;
  into.bank = from.bank;
  into.hipRoll = from.hipRoll;
  into.hipYaw = from.hipYaw;
  into.chestPitch = from.chestPitch;
  into.chestYaw = from.chestYaw;
  into.chestRoll = from.chestRoll;
  into.breath = from.breath;
  into.headPitch = from.headPitch;
  into.headYaw = from.headYaw;
  into.headRoll = from.headRoll;
  into.hipL = from.hipL;
  into.hipR = from.hipR;
  into.kneeL = from.kneeL;
  into.kneeR = from.kneeR;
  into.ankleL = from.ankleL;
  into.ankleR = from.ankleR;
  into.armL = from.armL;
  into.armR = from.armR;
  into.spreadL = from.spreadL;
  into.spreadR = from.spreadR;
  into.elbowL = from.elbowL;
  into.elbowR = from.elbowR;
  into.eyes = from.eyes;
  into.walk = from.walk;
  into.seat = from.seat;
  into.talk = from.talk;
  into.point = from.point ?? 0;
  return into;
}
