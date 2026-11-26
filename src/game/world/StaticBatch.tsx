import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sculptedMaterial } from "./Surface";
import { useWorldActive } from "../engine/active";

/**
 * Self-correcting static batcher.
 *
 * Everything inside renders exactly as authored (Box/Ball/instanced Pieces…).
 * After mount the opaque, untextured standard-material meshes are baked into
 * one vertex-coloured geometry per material class (usually one or two draws
 * per building) and the originals are hidden — they stay in the tree, so
 * pointer events, React updates and raycasts keep working.
 *
 * The baker watches its originals round-robin: a piece that moves (useFrame
 * animation, instance matrix updates), changes material/visibility, mounts or
 * unmounts triggers a rebake, and a piece that keeps moving is permanently
 * left live. Mark known-dynamic subtrees with `userData.noBake = true` (or wrap
 * them in <Live>) to skip the detection frames.
 *
 * Merged geometries are cached by `id` + a content hash, so remounting a
 * building (scene swaps) reuses the bake instead of rebuilding it.
 */

type Bucket = {
  key: string;
  side: THREE.Side;
  flat: boolean;
};
type Entry = {
  object: THREE.Mesh;
  relative: THREE.Matrix4;
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
  instanceVersion: number;
  colorVersion: number;
  changes: number;
};
/** One baked piece: an ordinary mesh, or one instance of an instanced mesh. */
type Item = {
  entry: Entry;
  /** Instance index, or -1 for a plain mesh. */
  k: number;
  /** Root-local transform of this piece. */
  matrix: THREE.Matrix4;
  /** Root-local bounds. */
  box: THREE.Box3;
  cast: boolean;
  /** Loose bounds (rotated piece): not used as an AO occluder. */
  loose: boolean;
};

/** Bakes wider than this (XZ, root-local units) split into CELL-sized
 * chunks, so the main and shadow passes can frustum-cull them. */
export const CHUNK_MIN_EXTENT = 48;
export const CHUNK_CELL = 32;
/** Pieces whose largest dimension is below this cast no shadow. */
export const MIN_CASTER_SIZE = 0.25;

const cache = new Map<
  string,
  { geometry: THREE.BufferGeometry; users: number }
>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
const noRaycast = () => {};
const defaultOnBeforeCompile = THREE.Material.prototype.onBeforeCompile;

/** Surface kind byte per vertex (see Surface.ts); 0 = plain. */
function kindIndex(material: THREE.Material) {
  const kind = material.userData.surfaceKind as string | undefined;
  return kind ? (SURFACE_KIND_INDEX[kind as SurfaceKind] ?? 0) : 0;
}

function bakeMaterial(bucket: { side: THREE.Side; flat: boolean }) {
  const key = `${bucket.side}:${bucket.flat}`;
  let material = materials.get(key);
  if (!material) {
    material = sculptedMaterial({
      vertexColors: true,
      side: bucket.side,
      flatShading: bucket.flat,
    });
    const sculpt = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      // Per-vertex surface kind (detail layer) instead of a uniform: the
      // sculpted chunk reads it from a flat varying under this define.
      shader.vertexShader = "#define SCULPT_KIND_VARYING\n" + shader.vertexShader;
      shader.fragmentShader =
        "#define SCULPT_KIND_VARYING\n" + shader.fragmentShader;
      sculpt(shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec3 bakeRM;\nvarying vec2 vBakeRM;",
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvBakeRM = bakeRM.xy;\n${SCULPT_KIND_VERTEX("bakeRM.z * 255.0")}`,
        )
        // Colours are stored sqrt-encoded in bytes; square back to linear.
        .replace(
          "#include <color_vertex>",
          "#include <color_vertex>\nvColor.rgb *= vColor.rgb;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 vBakeRM;",
        )
        .replace(
          "#include <roughnessmap_fragment>",
          "float roughnessFactor = vBakeRM.x;",
        )
        .replace(
          "#include <metalnessmap_fragment>",
          "float metalnessFactor = vBakeRM.y;",
        );
    };
    material.customProgramCacheKey = () => "sculpted-bake-v2";
    materials.set(key, material);
  }
  return material;
}

/** Shared bake materials, for shader warmup. */
export function staticBatchMaterials() {
  for (const side of [THREE.FrontSide, THREE.DoubleSide])
    for (const flat of [false, true]) bakeMaterial({ side, flat });
  return [...materials.values()];
}

function bakeable(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) return false;
  const m = material as THREE.MeshStandardMaterial;
  if (
    !m.isMeshStandardMaterial ||
    (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial
  )
    return false;
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.wireframe)
    return false;
  if (
    m.map ||
    m.normalMap ||
    m.alphaMap ||
    m.emissiveMap ||
    m.roughnessMap ||
    m.aoMap ||
    m.envMap ||
    m.bumpMap ||
    m.displacementMap ||
    m.lightMap ||
    m.metalnessMap
  )
    return false;
  if (
    m.emissiveIntensity > 0 &&
    (m.emissive.r > 0.004 || m.emissive.g > 0.004 || m.emissive.b > 0.004)
  )
    return false;
  if (m.side === THREE.BackSide) return false;
  if (m.onBeforeCompile !== defaultOnBeforeCompile) {
    const key = m.customProgramCacheKey?.();
    if (!key?.startsWith("sculpted-surface")) return false;
  }
  return true;
}

function excluded(object: THREE.Object3D, root: THREE.Object3D) {
  let node: THREE.Object3D | null = object;
  while (node && node !== root) {
    if (node.userData.noBake) return true;
    node = node.parent;
  }
  return node !== root;
}

const scratch = new THREE.Matrix4(),
  normalMatrix = new THREE.Matrix3(),
  instance = new THREE.Matrix4(),
  v = new THREE.Vector3(),
  n = new THREE.Vector3(),
  q = new THREE.Vector3(),
  size = new THREE.Vector3(),
  color = new THREE.Color(),
  tint = new THREE.Color();

function hashMatrix(h: number, m: THREE.Matrix4) {
  for (let i = 0; i < 16; i++)
    h = Math.imul(h ^ Math.round(m.elements[i] * 1000), 16777619) >>> 0;
  return h;
}
const mix = (h: number, x: number) => Math.imul(h ^ x, 16777619) >>> 0;

/** Draw only the shadow-casting prefix of a baked mesh in the shadow pass. */
function castPrefix(mesh: THREE.Mesh, count: number) {
  let saved = Infinity;
  mesh.onBeforeShadow = (_r, _o, _c, _s, geometry) => {
    saved = geometry.drawRange.count;
    geometry.drawRange.count = count;
  };
  mesh.onAfterShadow = (_r, _o, _c, _s, geometry) => {
    geometry.drawRange.count = saved;
  };
}

/**
 * Baked contact AO helpers. Ground: per 2 m XZ cell, the lowest piece bottom
 * (a stand-in for "the building's base"). Occluders: the tight (axis-aligned)
 * pieces, binned on the same grid.
 */
const AO_CELL = 2;
class AoField {
  ground = new Map<number, number>();
  bins = new Map<number, number[]>();
  boxes: THREE.Box3[] = [];
  static key(x: number, z: number) {
    return (Math.floor(x / AO_CELL) + 4096) * 8192 + Math.floor(z / AO_CELL) + 4096;
  }
  constructor(items: Item[]) {
    items.forEach((item, i) => {
      const { min, max } = item.box;
      const x0 = Math.floor(min.x / AO_CELL),
        x1 = Math.floor(max.x / AO_CELL),
        z0 = Math.floor(min.z / AO_CELL),
        z1 = Math.floor(max.z / AO_CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) return;
      this.boxes[i] = item.box;
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const key = (x + 4096) * 8192 + z + 4096;
          const g = this.ground.get(key);
          if (g === undefined || min.y < g) this.ground.set(key, min.y);
          if (!item.loose) {
            let bin = this.bins.get(key);
            if (!bin) this.bins.set(key, (bin = []));
            bin.push(i);
          }
        }
    });
  }
  /** 0.78..1 (linear colour multiplier) for a vertex of piece `self`. */
  sample(self: number, p: THREE.Vector3, nrm: THREE.Vector3) {
    let ao = 1;
    const ground = this.ground.get(AoField.key(p.x, p.z));
    if (ground !== undefined) {
      // Walls and undersides darken toward the base; open tops do not.
      const t = THREE.MathUtils.clamp((p.y - ground) / 0.9, 0, 1);
      const h = 0.78 + 0.22 * t * t * (3 - 2 * t);
      ao *= 1 - (1 - h) * (1 - Math.max(0, nrm.y));
    }
    // Crease: the normal runs into another piece within 0.15 units.
    q.copy(nrm).multiplyScalar(0.15).add(p);
    const bin = this.bins.get(AoField.key(q.x, q.z));
    if (bin)
      for (const i of bin) {
        if (i === self) continue;
        const b = this.boxes[i];
        if (
          q.x >= b.min.x - 0.01 &&
          q.x <= b.max.x + 0.01 &&
          q.y >= b.min.y - 0.01 &&
          q.y <= b.max.y + 0.01 &&
          q.z >= b.min.z - 0.01 &&
          q.z <= b.max.z + 0.01
        ) {
          ao *= 0.82;
          break;
        }
      }
    return ao;
  }
}

export type BakerOptions = {
  /** Split wide bakes into spatial cells (default true). */
  chunk?: boolean;
  /** Bake contact AO into vertex colours (default false; hub bakes on). */
  ao?: boolean;
};

export class Baker {
  root: THREE.Group;
  id: string;
  chunk: boolean;
  ao: boolean;
  entries: Entry[] = [];
  meshes: THREE.Mesh[] = [];
  live = new WeakSet<THREE.Object3D>();
  cacheKeys: string[] = [];
  cursor = 0;
  frame = 0;
  dirty = 0;
  disposed = false;
  rootInverse = new THREE.Matrix4();

  constructor(root: THREE.Group, id: string, options: BakerOptions = {}) {
    this.root = root;
    this.id = id;
    this.chunk = options.chunk ?? true;
    this.ao = options.ao ?? false;
  }

  collect() {
    const found: THREE.Mesh[] = [];
    const visit = (node: THREE.Object3D, visible: boolean) => {
      if (node.userData.noBake || node.userData.bakeOutput) return;
      const mesh = node as THREE.Mesh;
      // Our own hidden originals count as visible; anything else hidden
      // (conditionally shown props) is left alone.
      const own = mesh.userData.baked === this;
      if (!own && !node.visible) return;
      if (
        mesh.isMesh &&
        !(mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh &&
        !mesh.morphTargetInfluences &&
        !this.live.has(mesh) &&
        mesh.geometry?.attributes.position &&
        mesh.geometry.attributes.normal &&
        bakeable(mesh.material)
      )
        found.push(mesh);
      for (const child of node.children) visit(child, visible);
    };
    for (const child of this.root.children) visit(child, true);
    return found;
  }

  restore() {
    for (const entry of this.entries) {
      if (entry.object.userData.baked === this) {
        entry.object.visible = true;
        delete entry.object.userData.baked;
      }
    }
    this.entries = [];
    for (const mesh of this.meshes) this.root.remove(mesh);
    this.meshes = [];
    this.release();
  }

  release() {
    for (const key of this.cacheKeys) {
      const hit = cache.get(key);
      if (hit && --hit.users <= 0) {
        hit.geometry.dispose();
        cache.delete(key);
      }
    }
    this.cacheKeys = [];
  }

  bakes = 0;
  liveCount = 0;
  stamps: number[] = [];
  gaveUp = false;
  bake() {
    this.bakes++;
    // Safety valve: content that keeps changing (a live score, a remounting
    // prop) would rebake every few frames; give up and render it as authored.
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    this.stamps = this.stamps.filter((t) => now - t < 12000);
    this.stamps.push(now);
    if (this.stamps.length > 8 && now > 0) {
      this.gaveUp = true;
      this.restore();
      return;
    }
    const previous = new Map(this.entries.map((e) => [e.object, e.changes]));
    this.restore();
    this.root.updateWorldMatrix(true, true);
    this.rootInverse.copy(this.root.matrixWorld).invert();
    const found = this.collect();
    const entries: Entry[] = [];
    const items: Item[] = [];
    const bounds = new THREE.Box3();
    for (const object of found) {
      const material = object.material as THREE.MeshStandardMaterial;
      const relative = new THREE.Matrix4().multiplyMatrices(
        this.rootInverse,
        object.matrixWorld,
      );
      const inst = object as unknown as THREE.InstancedMesh;
      const entry: Entry = {
        object,
        relative,
        material,
        geometry: object.geometry,
        instanceVersion: inst.isInstancedMesh ? inst.instanceMatrix.version : 0,
        colorVersion:
          inst.isInstancedMesh && inst.instanceColor
            ? inst.instanceColor.version
            : 0,
        changes: previous.get(object) ?? 0,
      };
      entries.push(entry);
      const geometry = object.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const local = geometry.boundingBox!;
      const localVolume =
        Math.max(1e-6, local.max.x - local.min.x) *
        Math.max(1e-6, local.max.y - local.min.y) *
        Math.max(1e-6, local.max.z - local.min.z);
      const count = inst.isInstancedMesh ? inst.count : 1;
      for (let k = 0; k < count; k++) {
        const matrix = new THREE.Matrix4();
        if (inst.isInstancedMesh) {
          inst.getMatrixAt(k, instance);
          matrix.multiplyMatrices(relative, instance);
        } else matrix.copy(relative);
        const box = local.clone().applyMatrix4(matrix);
        box.getSize(size);
        bounds.union(box);
        const volume = size.x * size.y * size.z;
        const tight = Math.abs(matrix.determinant()) * localVolume;
        items.push({
          entry,
          k: inst.isInstancedMesh ? k : -1,
          matrix,
          box,
          cast:
            object.castShadow && Math.max(size.x, size.y, size.z) >= MIN_CASTER_SIZE,
          loose: volume > tight * 1.6 + 1e-4,
        });
      }
    }
    // Spatial chunks: only for wide bakes, by piece centre.
    const wide =
      this.chunk &&
      !bounds.isEmpty() &&
      Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) >
        CHUNK_MIN_EXTENT;
    const field = this.ao ? new AoField(items) : null;
    const buckets = new Map<string, { bucket: Bucket; items: number[] }>();
    items.forEach((item, i) => {
      const material = item.entry.material;
      const side =
        material.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide;
      const flat = !!(material as THREE.MeshStandardMaterial).flatShading;
      let cell = "0:0";
      if (wide) {
        item.box.getCenter(v);
        cell = `${Math.floor(v.x / CHUNK_CELL)}:${Math.floor(v.z / CHUNK_CELL)}`;
      }
      const key = `${side}:${flat}:${cell}`;
      let group = buckets.get(key);
      if (!group)
        buckets.set(key, (group = { bucket: { key, side, flat }, items: [] }));
      group.items.push(i);
    });
    for (const { bucket, items: members } of buckets.values()) {
      // Casters first: the shadow pass draws only that prefix.
      members.sort((a, b) => Number(items[b].cast) - Number(items[a].cast));
      const merged = this.merge(bucket, items, members, field);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged.geometry, bakeMaterial(bucket));
      mesh.castShadow = merged.castIndices > 0;
      if (mesh.castShadow && merged.castIndices < merged.geometry.index!.count)
        castPrefix(mesh, merged.castIndices);
      mesh.receiveShadow = true;
      mesh.raycast = noRaycast;
      // Layer 1: the planar water reflection renders bakes (WS-B).
      mesh.layers.enable(1);
      mesh.userData.bakeOutput = true;
      mesh.name = `${this.id}-baked`;
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
    for (const entry of entries) {
      entry.object.visible = false;
      entry.object.userData.baked = this;
      this.entries.push(entry);
    }
    this.cursor = 0;
    this.dirty = 0;
  }

  merge(
    bucket: Bucket,
    items: Item[],
    members: number[],
    field: AoField | null,
  ) {
    // Content hash: geometry shape + placement + colour, so a remount with the
    // same authored content reuses the cached bake.
    let hash = 2166136261;
    let vertices = 0,
      indices = 0,
      castIndices = 0;
    for (const i of members) {
      const { entry, k, matrix, cast } = items[i];
      const { object, material, geometry } = entry;
      const vc = geometry.attributes.position.count;
      const ic = geometry.index ? geometry.index.count : vc;
      vertices += vc;
      indices += ic;
      if (cast) castIndices += ic;
      hash = mix(hash, vc);
      hash = mix(hash, ic);
      const pos = geometry.attributes.position.array as ArrayLike<number>;
      hash = mix(
        hash,
        Math.round((pos[0] ?? 0) * 997 + (pos[vc * 3 - 1] ?? 0) * 991),
      );
      hash = hashMatrix(hash, matrix);
      hash = mix(hash, (material as THREE.MeshStandardMaterial).color.getHex());
      hash = mix(hash, kindIndex(material) * 2 + Number(cast));
      const inst = object as unknown as THREE.InstancedMesh;
      if (k >= 0 && inst.instanceColor) {
        inst.getColorAt(k, color);
        hash = mix(hash, color.getHex());
      }
    }
    if (!vertices) return null;
    const key = `${this.id}|${bucket.key}|${this.ao ? "ao" : ""}|${hash}|${vertices}|${indices}|${castIndices}`;
    const hit = cache.get(key);
    if (hit) {
      hit.users++;
      this.cacheKeys.push(key);
      return { geometry: hit.geometry, castIndices };
    }
    const position = new Float32Array(vertices * 3),
      normal = new Float32Array(vertices * 3),
      colors = new Uint8Array(vertices * 3),
      rmk = new Uint8Array(vertices * 3),
      index =
        vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let vo = 0,
      io = 0;
    for (const i of members) {
      const { entry, k, matrix } = items[i];
      const { object, geometry } = entry;
      const m = entry.material as THREE.MeshStandardMaterial;
      const inst = object as unknown as THREE.InstancedMesh;
      const pa = geometry.attributes.position,
        na = geometry.attributes.normal,
        ca = m.vertexColors ? geometry.attributes.color : undefined,
        gi = geometry.index;
      const rough = Math.round(THREE.MathUtils.clamp(m.roughness, 0, 1) * 255),
        metal = Math.round(THREE.MathUtils.clamp(m.metalness, 0, 1) * 255),
        kind = kindIndex(m);
      normalMatrix.getNormalMatrix(matrix);
      const flip = matrix.determinant() < 0;
      tint.copy(m.color);
      if (k >= 0 && inst.instanceColor) {
        inst.getColorAt(k, color);
        tint.multiply(color);
      }
      // Store sqrt-encoded bytes of the linear working colour (squared back
      // in the vertex shader).
      const base = vo;
      for (let j = 0; j < pa.count; j++) {
        v.fromBufferAttribute(pa, j).applyMatrix4(matrix);
        n.fromBufferAttribute(na, j).applyMatrix3(normalMatrix).normalize();
        const o = (base + j) * 3;
        position[o] = v.x;
        position[o + 1] = v.y;
        position[o + 2] = v.z;
        normal[o] = n.x;
        normal[o + 1] = n.y;
        normal[o + 2] = n.z;
        let r = tint.r,
          g = tint.g,
          b = tint.b;
        if (ca) {
          r *= ca.getX(j);
          g *= ca.getY(j);
          b *= ca.getZ(j);
        }
        if (field) {
          const ao = field.sample(i, v, n);
          r *= ao;
          g *= ao;
          b *= ao;
        }
        colors[o] = Math.round(Math.sqrt(THREE.MathUtils.clamp(r, 0, 1)) * 255);
        colors[o + 1] = Math.round(
          Math.sqrt(THREE.MathUtils.clamp(g, 0, 1)) * 255,
        );
        colors[o + 2] = Math.round(
          Math.sqrt(THREE.MathUtils.clamp(b, 0, 1)) * 255,
        );
        rmk[o] = rough;
        rmk[o + 1] = metal;
        rmk[o + 2] = kind;
      }
      const ic = gi ? gi.count : pa.count;
      for (let t = 0; t < ic; t += 3) {
        const a = gi ? gi.getX(t) : t,
          b = gi ? gi.getX(t + 1) : t + 1,
          c = gi ? gi.getX(t + 2) : t + 2;
        index[io++] = base + a;
        index[io++] = base + (flip ? c : b);
        index[io++] = base + (flip ? b : c);
      }
      vo += pa.count;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    // sqrt-encoded colour (cheap gamma), squared back in the vertex shader.
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3, true));
    // Roughness, metalness and surface kind (kind is read back ×255).
    geometry.setAttribute("bakeRM", new THREE.BufferAttribute(rmk, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    cache.set(key, { geometry, users: 1 });
    this.cacheKeys.push(key);
    return { geometry, castIndices };
  }

  tick() {
    if (this.disposed || this.gaveUp) return;
    this.frame++;
    if (this.dirty && --this.dirty === 0) {
      this.bake();
      return;
    }
    if (this.dirty) return;
    // Periodic structural rescan: mounts and conditional props.
    if (this.frame % 45 === 0) {
      const found = this.collect();
      const known = this.entries.length;
      if (found.length !== known) {
        this.dirty = 2;
        return;
      }
    }
    const total = this.entries.length;
    if (!total) return;
    const step = Math.min(total, 48);
    this.rootInverse.copy(this.root.matrixWorld).invert();
    for (let s = 0; s < step; s++) {
      const entry = this.entries[this.cursor];
      this.cursor = (this.cursor + 1) % total;
      const object = entry.object;
      let changed = false,
        moved = false;
      if (excluded(object, this.root)) changed = true;
      else if (object.visible) changed = true;
      else if (
        object.material !== entry.material ||
        object.geometry !== entry.geometry
      )
        changed = true;
      else {
        const inst = object as unknown as THREE.InstancedMesh;
        if (
          inst.isInstancedMesh &&
          (inst.instanceMatrix.version !== entry.instanceVersion ||
            (inst.instanceColor?.version ?? 0) !== entry.colorVersion)
        )
          moved = true;
        else {
          let node: THREE.Object3D | null = object.parent;
          while (node && node !== this.root) {
            if (!node.visible) {
              changed = true;
              break;
            }
            node = node.parent;
          }
          if (!changed) {
            scratch.multiplyMatrices(this.rootInverse, object.matrixWorld);
            const a = scratch.elements,
              b = entry.relative.elements;
            for (let i = 0; i < 16; i++)
              if (Math.abs(a[i] - b[i]) > 1e-4) {
                moved = true;
                break;
              }
          }
          const m = entry.material as THREE.MeshStandardMaterial;
          if (
            !changed &&
            !moved &&
            m.version !== (entry as Entry & { mv?: number }).mv &&
            (entry as Entry & { mv?: number }).mv !== undefined
          )
            changed = true;
          (entry as Entry & { mv?: number }).mv = m.version;
        }
      }
      if (moved) {
        entry.changes++;
        // Animated: leave it live from now on.
        if (entry.changes >= 1) {
          this.live.add(object);
          this.liveCount++;
        }
        changed = true;
      }
      if (changed) {
        this.dirty = 3;
        return;
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.restore();
  }
}

const InBatch = createContext(false);

/** Wrap static architecture/props; see file comment. `soft` batches only
 * when not already inside another StaticBatch (small reusable props). */
export function StaticBatch({
  id,
  children,
  enabled = true,
  soft = false,
  ao,
}: {
  id: string;
  children?: ReactNode;
  enabled?: boolean;
  soft?: boolean;
  /** Baked contact AO; default: on under the hub, off in interiors. */
  ao?: boolean;
}) {
  const nested = useContext(InBatch);
  if (soft && nested) return <>{children}</>;
  return (
    <BatchRoot id={id} enabled={enabled} ao={ao}>
      {children}
    </BatchRoot>
  );
}

/** True when `node` sits under the hub world (Game.tsx "hub-root"). */
function underHub(node: THREE.Object3D) {
  for (let p: THREE.Object3D | null = node; p; p = p.parent)
    if (p.name === "hub-root") return true;
  return false;
}

function BatchRoot({
  id,
  children,
  enabled,
  ao,
}: {
  id: string;
  children?: ReactNode;
  enabled: boolean;
  ao?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const baker = useRef<Baker | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !root.current) return;
    const b = new Baker(root.current, id, {
      ao: ao ?? underHub(root.current),
    });
    baker.current = b;
    if (import.meta.env.DEV) {
      const w = window as unknown as { __w4bakers?: Set<Baker> };
      (w.__w4bakers ??= new Set()).add(b);
    }
    b.bake();
    return () => {
      if (import.meta.env.DEV)
        (window as unknown as { __w4bakers?: Set<Baker> }).__w4bakers?.delete(
          b,
        );
      b.dispose();
      baker.current = null;
    };
  }, [id, enabled, ao]);
  const active = useWorldActive();
  useFrame(() => {
    if (active) baker.current?.tick();
  });
  return (
    <InBatch.Provider value={true}>
      <group ref={root}>{children}</group>
    </InBatch.Provider>
  );
}

/** A subtree the batcher must never bake (animated or interactive art). */
export function Live({ children }: { children?: ReactNode }) {
  return <group userData={{ noBake: true }}>{children}</group>;
}
