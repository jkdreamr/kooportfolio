import { useLayoutEffect, useRef, type ReactNode } from "react";
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
  cast: boolean;
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

const cache = new Map<
  string,
  { geometry: THREE.BufferGeometry; users: number }
>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
const noRaycast = () => {};
const defaultOnBeforeCompile = THREE.Material.prototype.onBeforeCompile;

function bakeMaterial(bucket: Bucket) {
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
      sculpt(shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec2 bakeRM;\nvarying vec2 vBakeRM;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvBakeRM = bakeRM;",
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
    material.customProgramCacheKey = () => "sculpted-bake-v1";
    materials.set(key, material);
  }
  return material;
}

/** Shared bake materials, for shader warmup. */
export function staticBatchMaterials() {
  for (const side of [THREE.FrontSide, THREE.DoubleSide])
    for (const flat of [false, true])
      bakeMaterial({ key: "", side, flat, cast: true });
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
  color = new THREE.Color(),
  tint = new THREE.Color();

function hashMatrix(h: number, m: THREE.Matrix4) {
  for (let i = 0; i < 16; i++)
    h = Math.imul(h ^ Math.round(m.elements[i] * 1000), 16777619) >>> 0;
  return h;
}

class Baker {
  root: THREE.Group;
  id: string;
  entries: Entry[] = [];
  meshes: THREE.Mesh[] = [];
  live = new WeakSet<THREE.Object3D>();
  cacheKeys: string[] = [];
  cursor = 0;
  frame = 0;
  dirty = 0;
  disposed = false;
  rootInverse = new THREE.Matrix4();

  constructor(root: THREE.Group, id: string) {
    this.root = root;
    this.id = id;
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
  bake() {
    this.bakes++;
    const previous = new Map(this.entries.map((e) => [e.object, e.changes]));
    this.restore();
    this.root.updateWorldMatrix(true, true);
    this.rootInverse.copy(this.root.matrixWorld).invert();
    const found = this.collect();
    const buckets = new Map<string, { bucket: Bucket; entries: Entry[] }>();
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
      const side =
        material.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide;
      const flat = !!material.flatShading;
      const cast = object.castShadow;
      const key = `${side}:${flat}:${cast}`;
      if (!buckets.has(key))
        buckets.set(key, { bucket: { key, side, flat, cast }, entries: [] });
      buckets.get(key)!.entries.push(entry);
    }
    for (const { bucket, entries } of buckets.values()) {
      const geometry = this.merge(bucket, entries);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, bakeMaterial(bucket));
      mesh.castShadow = bucket.cast;
      mesh.receiveShadow = true;
      mesh.raycast = noRaycast;
      mesh.userData.bakeOutput = true;
      mesh.name = `${this.id}-baked`;
      this.root.add(mesh);
      this.meshes.push(mesh);
      for (const entry of entries) {
        entry.object.visible = false;
        entry.object.userData.baked = this;
        this.entries.push(entry);
      }
    }
    this.cursor = 0;
    this.dirty = 0;
  }

  merge(bucket: Bucket, entries: Entry[]) {
    // Content hash: geometry shape + placement + colour, so a remount with the
    // same authored content reuses the cached bake.
    let hash = 2166136261;
    let vertices = 0,
      indices = 0;
    for (const { object, relative, material, geometry } of entries) {
      const inst = object as unknown as THREE.InstancedMesh;
      const count = inst.isInstancedMesh ? inst.count : 1;
      const vc = geometry.attributes.position.count;
      const ic = geometry.index ? geometry.index.count : vc;
      vertices += vc * count;
      indices += ic * count;
      hash = Math.imul(hash ^ vc, 16777619) >>> 0;
      hash = Math.imul(hash ^ ic, 16777619) >>> 0;
      const pos = geometry.attributes.position.array as ArrayLike<number>;
      hash =
        Math.imul(
          hash ^ Math.round((pos[0] ?? 0) * 997 + (pos[vc * 3 - 1] ?? 0) * 991),
          16777619,
        ) >>> 0;
      hash = hashMatrix(hash, relative);
      hash =
        Math.imul(
          hash ^ (material as THREE.MeshStandardMaterial).color.getHex(),
          16777619,
        ) >>> 0;
      if (inst.isInstancedMesh) {
        for (let i = 0; i < count; i += Math.max(1, count >> 3)) {
          inst.getMatrixAt(i, instance);
          hash = hashMatrix(hash, instance);
        }
        hash = Math.imul(hash ^ count, 16777619) >>> 0;
      }
    }
    if (!vertices) return null;
    const key = `${this.id}|${bucket.key}|${hash}|${vertices}|${indices}`;
    const hit = cache.get(key);
    if (hit) {
      hit.users++;
      this.cacheKeys.push(key);
      return hit.geometry;
    }
    const position = new Float32Array(vertices * 3),
      normal = new Float32Array(vertices * 3),
      colors = new Uint8Array(vertices * 3),
      rm = new Uint8Array(vertices * 2),
      index =
        vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let vo = 0,
      io = 0;
    for (const { object, relative, material, geometry } of entries) {
      const m = material as THREE.MeshStandardMaterial;
      const inst = object as unknown as THREE.InstancedMesh;
      const count = inst.isInstancedMesh ? inst.count : 1;
      const pa = geometry.attributes.position,
        na = geometry.attributes.normal,
        ca = m.vertexColors ? geometry.attributes.color : undefined,
        gi = geometry.index;
      const rough = Math.round(THREE.MathUtils.clamp(m.roughness, 0, 1) * 255),
        metal = Math.round(THREE.MathUtils.clamp(m.metalness, 0, 1) * 255);
      for (let k = 0; k < count; k++) {
        if (inst.isInstancedMesh) {
          inst.getMatrixAt(k, instance);
          scratch.multiplyMatrices(relative, instance);
        } else scratch.copy(relative);
        normalMatrix.getNormalMatrix(scratch);
        const flip = scratch.determinant() < 0;
        tint.copy(m.color);
        if (inst.isInstancedMesh && inst.instanceColor) {
          inst.getColorAt(k, color);
          tint.multiply(color);
        }
        // Store sRGB-ish bytes of the linear working colour; normalized
        // attribute is read back linear, so keep linear values directly.
        const base = vo;
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(scratch);
          n.fromBufferAttribute(na, i).applyMatrix3(normalMatrix).normalize();
          const o = (base + i) * 3;
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
            r *= ca.getX(i);
            g *= ca.getY(i);
            b *= ca.getZ(i);
          }
          colors[o] = Math.round(
            Math.sqrt(THREE.MathUtils.clamp(r, 0, 1)) * 255,
          );
          colors[o + 1] = Math.round(
            Math.sqrt(THREE.MathUtils.clamp(g, 0, 1)) * 255,
          );
          colors[o + 2] = Math.round(
            Math.sqrt(THREE.MathUtils.clamp(b, 0, 1)) * 255,
          );
          rm[(base + i) * 2] = rough;
          rm[(base + i) * 2 + 1] = metal;
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
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    // sqrt-encoded colour (cheap gamma) is squared back in the shader chunk
    // below via the normalized attribute; see bakeColor in onBeforeCompile.
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3, true));
    geometry.setAttribute("bakeRM", new THREE.BufferAttribute(rm, 2, true));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    cache.set(key, { geometry, users: 1 });
    this.cacheKeys.push(key);
    return geometry;
  }

  tick() {
    if (this.disposed) return;
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
        if (entry.changes >= 1) this.live.add(object);
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

/** Wrap static architecture/props; see file comment. */
export function StaticBatch({
  id,
  children,
  enabled = true,
}: {
  id: string;
  children?: ReactNode;
  enabled?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const baker = useRef<Baker | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !root.current) return;
    const b = new Baker(root.current, id);
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
  }, [id, enabled]);
  const active = useWorldActive();
  useFrame(() => {
    if (active) baker.current?.tick();
  });
  return <group ref={root}>{children}</group>;
}

/** A subtree the batcher must never bake (animated or interactive art). */
export function Live({ children }: { children?: ReactNode }) {
  return <group userData={{ noBake: true }}>{children}</group>;
}
