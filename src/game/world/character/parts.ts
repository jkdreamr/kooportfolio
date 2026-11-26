import * as THREE from "three";
import { sculptedMaterial } from "../Surface";

/**
 * Tiny instanced "part soup" for procedurally animated creatures: every
 * creature emits rounded parts through a matrix stack each frame, and all
 * parts of a shape share one InstancedMesh. A whole menagerie costs one draw
 * per shape, whatever its head count.
 */
export type Shape = "sphere" | "cone" | "box" | "capsule";
export const SHAPES: Shape[] = ["sphere", "cone", "box", "capsule"];

let geometries: Record<Shape, THREE.BufferGeometry> | null = null;
export function shapeGeometries() {
  if (geometries) return geometries;
  const capsule = new THREE.CapsuleGeometry(0.5, 1, 3, 8);
  capsule.scale(2, 0.5, 2); // unit radius, total height ≈ 1 (−0.5..0.5) before caps
  geometries = {
    // 10×8 (140 tris): creatures are under a metre tall; 14×10 doubled the
    // menagerie's main and shadow triangles for no visible gain.
    sphere: new THREE.SphereGeometry(1, 10, 8),
    cone: new THREE.ConeGeometry(1, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    capsule,
  };
  for (const g of Object.values(geometries)) g.deleteAttribute("uv");
  return geometries;
}
let material: THREE.MeshStandardMaterial | null = null;
export const partMaterial = () =>
  (material ??= sculptedMaterial({ roughness: 0.84 }));

const tmpQ = new THREE.Quaternion(),
  tmpE = new THREE.Euler(),
  tmpV = new THREE.Vector3(),
  tmpS = new THREE.Vector3(),
  tmpM = new THREE.Matrix4(),
  tmpC = new THREE.Color();

export class PartBatch {
  meshes: Partial<Record<Shape, THREE.InstancedMesh>> = {};
  counts: Record<Shape, number> = { sphere: 0, cone: 0, box: 0, capsule: 0 };
  capacity: Record<Shape, number>;
  stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  depth = 0;
  colorCache = new Map<string, THREE.Color>();
  constructor(capacity: Partial<Record<Shape, number>>) {
    this.capacity = { sphere: 1, cone: 1, box: 1, capsule: 1, ...capacity };
  }
  begin() {
    for (const s of SHAPES) this.counts[s] = 0;
    this.depth = 0;
    this.stack[0].identity();
  }
  get top() {
    return this.stack[this.depth];
  }
  /** Push a joint: translate, then rotate (YXZ), then optional uniform scale. */
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, scale = 1) {
    tmpE.set(rx, ry, rz, "YXZ");
    tmpQ.setFromEuler(tmpE);
    tmpV.set(x, y, z);
    tmpS.setScalar(scale);
    const parent = this.top;
    this.depth++;
    const m = (this.stack[this.depth] ??= new THREE.Matrix4());
    m.compose(tmpV, tmpQ, tmpS).premultiply(parent);
    return this;
  }
  /** Push an absolute base matrix (e.g. a world transform). */
  pushMatrix(matrix: THREE.Matrix4) {
    const parent = this.top;
    this.depth++;
    (this.stack[this.depth] ??= new THREE.Matrix4()).multiplyMatrices(
      parent,
      matrix,
    );
    return this;
  }
  pop() {
    if (this.depth > 0) this.depth--;
    return this;
  }
  /** Emit one part in the current joint space. */
  part(
    shape: Shape,
    color: string,
    p: [number, number, number],
    s: [number, number, number],
    r?: [number, number, number],
  ) {
    const mesh = this.meshes[shape];
    const i = this.counts[shape];
    if (!mesh || i >= this.capacity[shape]) return;
    this.counts[shape] = i + 1;
    tmpE.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0, "XYZ");
    tmpQ.setFromEuler(tmpE);
    tmpV.set(p[0], p[1], p[2]);
    tmpS.set(s[0], s[1], s[2]);
    tmpM.compose(tmpV, tmpQ, tmpS).premultiply(this.top);
    mesh.setMatrixAt(i, tmpM);
    let c = this.colorCache.get(color);
    if (!c) this.colorCache.set(color, (c = tmpC.set(color).clone()));
    mesh.setColorAt(i, c);
  }
  end() {
    for (const s of SHAPES) {
      const mesh = this.meshes[s];
      if (!mesh) continue;
      mesh.count = this.counts[s];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
