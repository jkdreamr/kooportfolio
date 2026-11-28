/**
 * Props (§1.4): carts, kites, the balloon, card buildings, projectiles,
 * spell props, debris and pennants, drawn through one instanced mesh per
 * shape with the rig's part material (an M2 program, prewarmed). A numeric
 * matrix-stack API: no arrays or objects per part.
 */
import * as THREE from "three";
import type { Shape } from "../../world/character/parts";
import { engine } from "./engineApi";

export const SPHERE = 0;
export const CONE = 1;
export const BOX = 2;
export const CAPSULE = 3;
const SHAPE_NAMES: Shape[] = ["sphere", "cone", "box", "capsule"];

const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const tv = new THREE.Vector3();
const ts = new THREE.Vector3();
const tm = new THREE.Matrix4();
const tc = new THREE.Color();

const colors = new Map<string, THREE.Color>();
/** A cached colour object for a hex string (resolve once, outside the frame loop). */
export function col(hex: string) {
  let c = colors.get(hex);
  if (!c) colors.set(hex, (c = new THREE.Color(hex)));
  return c;
}

export class PropBatch {
  readonly meshes: THREE.InstancedMesh[] = [];
  readonly counts = new Int32Array(4);
  readonly capacity: Int32Array;
  private stack: THREE.Matrix4[] = [];
  private depth = 0;
  constructor(cap: [number, number, number, number], lod: "high" | "low", shadows: boolean) {
    this.capacity = Int32Array.from(cap);
    const g = engine().parts.shapeGeometries(lod);
    for (let k = 0; k < 4; k++) {
      const mesh = new THREE.InstancedMesh(g[SHAPE_NAMES[k]], engine().parts.partMaterial(), cap[k]);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, tc.setRGB(1, 1, 1));
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.userData.noBake = true;
      this.meshes.push(mesh);
    }
    for (let i = 0; i < 12; i++) this.stack.push(new THREE.Matrix4());
  }
  // @hot
  begin() {
    for (let k = 0; k < 4; k++) this.counts[k] = 0;
    this.depth = 0;
    this.stack[0].identity();
  }
  // @hot
  /** Push a joint: translate, rotate (YXZ), uniform scale. */
  push(x: number, y: number, z: number, rx: number, ry: number, rz: number, scale: number) {
    te.set(rx, ry, rz, "YXZ");
    tq.setFromEuler(te);
    tv.set(x, y, z);
    ts.set(scale, scale, scale);
    const parent = this.stack[this.depth];
    if (this.depth < this.stack.length - 1) this.depth++;
    this.stack[this.depth].compose(tv, tq, ts).premultiply(parent);
  }
  // @hot
  pop() {
    if (this.depth > 0) this.depth--;
  }
  // @hot
  /** One part in the current joint space; colour × bright. */
  part(shape: number, c: THREE.Color, bright: number, px: number, py: number, pz: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number) {
    const i = this.counts[shape];
    if (i >= this.capacity[shape]) return;
    this.counts[shape] = i + 1;
    te.set(rx, ry, rz, "XYZ");
    tq.setFromEuler(te);
    tv.set(px, py, pz);
    ts.set(sx, sy, sz);
    tm.compose(tv, tq, ts).premultiply(this.stack[this.depth]);
    const mesh = this.meshes[shape];
    mesh.setMatrixAt(i, tm);
    tc.setRGB(c.r * bright, c.g * bright, c.b * bright);
    mesh.setColorAt(i, tc);
  }
  // @hot
  end() {
    for (let k = 0; k < 4; k++) {
      const mesh = this.meshes[k];
      mesh.count = this.counts[k];
      mesh.visible = this.counts[k] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  dispose() {
    for (const m of this.meshes) m.dispose();
  }
}
