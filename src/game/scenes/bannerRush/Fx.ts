/**
 * The FX layer (§1.3 M5, §1.6): unlit, instanced, instance-coloured quads in
 * one program (MeshBasicMaterial, transparent, no tone mapping, no depth
 * write). Normal and additive blending, and each batch's opacity, are GL
 * state and uniforms: no extra programs. No textures and no vertex colours:
 * shapes are geometry, and the soft disc is three stacked discs, which read
 * as a soft falloff under additive blending.
 */
import * as THREE from "three";

/** Exactly the flags the prewarm entry uses (engine/prewarm.ts "banner-rush"). */
export function fxMaterial(additive: boolean, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false });
  m.opacity = opacity;
  if (additive) m.blending = THREE.AdditiveBlending;
  return m;
}

/** Flat shapes in the XZ plane (normal +Y), unit radius / unit size. */
function plane() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute("uv");
  return g;
}
function disc(segments = 16) {
  const g = new THREE.CircleGeometry(1, segments);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute("uv");
  return g;
}
function ring(inner = 0.78, segments = 24) {
  const g = new THREE.RingGeometry(inner, 1, segments, 1);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute("uv");
  return g;
}
/** Three stacked discs (radii 1, 0.66, 0.36): centre ×3, edge ×1. */
function softDisc() {
  const parts = [1, 0.66, 0.36].map((r, i) => {
    const g = new THREE.CircleGeometry(r, 14);
    g.rotateX(-Math.PI / 2);
    g.translate(0, i * 0.001, 0);
    g.deleteAttribute("uv");
    return g;
  });
  const out = new THREE.BufferGeometry();
  const pos: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const index = g.index!;
    for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + base);
    base += p.count;
    g.dispose();
  }
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  out.setIndex(idx);
  return out;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const qy = new THREE.Quaternion();
const p3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const c3 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
/** Rotation that turns a flat (+Y) quad to face the fixed camera. */
export const billboard = new THREE.Quaternion();
const toFront = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
export function setBillboard(cameraQuaternion: THREE.Quaternion) {
  billboard.copy(cameraQuaternion).multiply(toFront);
}

export class FxBatch {
  readonly mesh: THREE.InstancedMesh;
  count = 0;
  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly capacity: number,
    renderOrder: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, c3.setRGB(1, 1, 1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.noBake = true;
  }
  // @hot
  begin() {
    this.count = 0;
  }
  // @hot
  /** One instance: position (tiles), size x/z, yaw, colour (0..1; additive fades by darkening), billboard. */
  add(x: number, y: number, z: number, sx: number, sz: number, rotY: number, r: number, g: number, b: number, face = false) {
    const i = this.count;
    if (i >= this.capacity) return;
    this.count = i + 1;
    if (face) {
      qy.setFromAxisAngle(UP, rotY);
      q.copy(billboard).multiply(qy);
    } else q.setFromAxisAngle(UP, rotY);
    p3.set(x, y, z);
    s3.set(sx, 1, sz);
    m4.compose(p3, q, s3);
    this.mesh.setMatrixAt(i, m4);
    c3.setRGB(r, g, b);
    this.mesh.setColorAt(i, c3);
  }
  // @hot
  end() {
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** The seven FX batches (draw order: decals, shadows, rings, bars, then additive). */
export class FxLayer {
  readonly tint = new FxBatch(plane(), fxMaterial(false, 0.4), 128, 1);
  /** Blob shadows share the tint batch's opacity class via a soft disc in the disc batch. */
  readonly disc = new FxBatch(disc(), fxMaterial(false, 0.55), 192, 3);
  readonly shadow = this.disc;
  readonly ring = new FxBatch(ring(0.72), fxMaterial(false, 0.8), 64, 3);
  readonly solid = new FxBatch(plane(), fxMaterial(false, 1), 192, 6);
  readonly addPlane = new FxBatch(plane(), fxMaterial(true), 128, 7);
  readonly addRing = new FxBatch(ring(0.82, 32), fxMaterial(true), 64, 7);
  readonly addSoft = new FxBatch(softDisc(), fxMaterial(true), 160, 8);
  readonly all = [this.tint, this.disc, this.ring, this.solid, this.addPlane, this.addRing, this.addSoft];
  // @hot
  begin() {
    for (let i = 0; i < this.all.length; i++) this.all[i].begin();
  }
  // @hot
  end() {
    for (let i = 0; i < this.all.length; i++) this.all[i].end();
  }
  dispose() {
    for (const b of this.all) b.dispose();
  }
}

/** Hex → linear-ish 0..1 components written into `out` (sRGB colour management). */
export function rgb(hex: string, out: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }) {
  c3.set(hex);
  out.r = c3.r;
  out.g = c3.g;
  out.b = c3.b;
  return out;
}
