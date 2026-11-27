import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { isInterior } from "../../core/world";
import { usePresented } from "../../engine/presented";
import { contactBlobGeometry, contactBlobMaterial } from "./ContactShadows";

/**
 * B10: soft contact blobs under every interior prop group shorter than 2 m
 * (chairs, tables, counters, stools), so furniture stops floating on bright
 * floors where there is no screen-space AO. One instanced draw per room,
 * sharing the hub blobs' program. The props are found from the room's own
 * scene graph once it is on screen (the static bake keeps its originals, so
 * individual pieces are still there to measure): touching pieces are grouped,
 * and each group under 2 m tall, standing on the floor, with a 0.25–3.5 m
 * footprint gets one blob of radius footprint × 0.6.
 */

const CAPACITY = 160;
const OPACITY = 0.28;
const noRaycast = () => undefined;

export type PropBox = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
export type PropBlob = { x: number; y: number; z: number; rx: number; rz: number };

/** Pure (tests): group touching boxes and keep the floor-standing props. */
export function propBlobs(boxes: readonly PropBox[], gap = 0.08): PropBlob[] {
  if (!boxes.length) return [];
  // The floor: the top of the largest flat piece near the bottom.
  const floorPiece = boxes
    .filter((b) => b.maxY - b.minY < 0.6 && (b.maxX - b.minX) * (b.maxZ - b.minZ) > 12)
    .sort((a, b) => (b.maxX - b.minX) * (b.maxZ - b.minZ) - (a.maxX - a.minX) * (a.maxZ - a.minZ))[0];
  const floor = floorPiece ? floorPiece.maxY : Math.min(...boxes.map((b) => b.minY));
  // Walls, rugs and floor planks never join a prop group (they would merge
  // every chair in the room into one).
  const pieces = boxes.filter(
    (b) =>
      b !== floorPiece &&
      b.maxY > floor + 0.02 &&
      b.minY < floor + 2 &&
      b.maxY - b.minY > 0.05 &&
      b.maxY - b.minY < 2.2 &&
      b.maxX - b.minX < 4 &&
      b.maxZ - b.minZ < 4,
  );
  const parent = pieces.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j];
      if (a.minX - gap <= b.maxX && b.minX - gap <= a.maxX && a.minZ - gap <= b.maxZ && b.minZ - gap <= a.maxZ && a.minY - gap <= b.maxY && b.minY - gap <= a.maxY)
        parent[find(i)] = find(j);
    }
  const groups = new Map<number, PropBox>();
  pieces.forEach((p, i) => {
    const k = find(i);
    const g = groups.get(k);
    if (!g) groups.set(k, { ...p });
    else {
      g.minX = Math.min(g.minX, p.minX); g.maxX = Math.max(g.maxX, p.maxX);
      g.minY = Math.min(g.minY, p.minY); g.maxY = Math.max(g.maxY, p.maxY);
      g.minZ = Math.min(g.minZ, p.minZ); g.maxZ = Math.max(g.maxZ, p.maxZ);
    }
  });
  const out: PropBlob[] = [];
  for (const g of groups.values()) {
    const w = g.maxX - g.minX, d = g.maxZ - g.minZ, h = g.maxY - floor;
    if (h > 2 || g.minY > floor + 0.35) continue;
    if (Math.max(w, d) < 0.25 || Math.max(w, d) > 3.5) continue;
    out.push({ x: (g.minX + g.maxX) / 2, y: floor + 0.012, z: (g.minZ + g.maxZ) / 2, rx: Math.max(0.3, w * 0.6), rz: Math.max(0.3, d * 0.6) });
  }
  return out.slice(0, CAPACITY);
}

const box = new THREE.Box3();
export function PropShadows() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => contactBlobMaterial(OPACITY), []);
  const scene = usePresented((s) => s.scene);
  const scanned = useRef({ scene: "", frames: 0 });
  useFrame(({ scene: world }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const s = scanned.current;
    if (!isInterior(scene)) {
      mesh.count = 0;
      s.scene = "";
      return;
    }
    if (s.scene === scene) return;
    // Let the room settle (bakes, layout effects) before measuring it.
    if (++s.frames < 20) return;
    s.scene = scene;
    s.frames = 0;
    const root = world.getObjectByName("scene-root");
    if (!root) return;
    root.updateMatrixWorld(true);
    const boxes: PropBox[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.bakeOutput || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      if (!m.geometry?.attributes.position) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      if (box.isEmpty()) return;
      boxes.push({ minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z });
    });
    const blobs = propBlobs(boxes);
    const matrix = new THREE.Matrix4();
    blobs.forEach((b, i) => {
      matrix.makeScale(b.rx * 2, 1, b.rz * 2).setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.count = blobs.length;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      name="interior-contact-blobs"
      args={[contactBlobGeometry, material, CAPACITY]}
      count={0}
      renderOrder={-1}
      frustumCulled={false}
      raycast={noRaycast}
      dispose={null}
    />
  );
}
