import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { activeNpcActors } from "../../core/npcState";
import { runtime } from "../../core/store";
import { useWorldActive } from "../../engine/active";
import type { WorldId } from "../../core/worlds";
import { terrainHeightAt } from "../../core/terrain";
import { allCrowns, crownVersion, subscribeCrowns } from "./foliage";
import { groveField, LAND, rockField } from "./placement";
import { useEnvTier } from "./tier";

/**
 * Contact blobs (PLAN2 §1.4): one instanced, depth-tested soft dark disc
 * under every tree, grove trunk and granite outcrop, plus moving ones under
 * the player and every villager (the low NPC rig casts no shadow), in one
 * draw (≤600 instances; the moving tail is rewritten each frame). They ground objects where there is no screen-space AO (medium
 * and low) and add a faint occlusion under the AO on high. Never cast or
 * receive shadows; fogged like the ground beneath them.
 */

const CAPACITY = 600;
const noRaycast = () => undefined;

let blobTexture: THREE.DataTexture | null = null;
/** 64² radial falloff (alphaMap reads green; every channel carries it). */
function blob() {
  if (blobTexture) return blobTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5,
        dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - r * r, 2.2) * (1 - Math.pow(r, 6));
      data.fill(Math.round(a * 255), (y * size + x) * 4, (y * size + x) * 4 + 4);
    }
  blobTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  blobTexture.magFilter = THREE.LinearFilter;
  blobTexture.minFilter = THREE.LinearMipmapLinearFilter;
  blobTexture.generateMipmaps = true;
  blobTexture.name = "env-contact-blob";
  blobTexture.needsUpdate = true;
  return blobTexture;
}

const material = new THREE.MeshBasicMaterial({
  color: "#1d2416",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  alphaMap: blob(),
});
material.customProgramCacheKey = () => "env-contact-blob-v1";
/** Same parameters (same program) with its own opacity: interior props. */
export function contactBlobMaterial(opacity: number) {
  const own = material.clone();
  own.opacity = opacity;
  own.customProgramCacheKey = () => "env-contact-blob-v1";
  return own;
}
export const contactBlobGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const geometry = contactBlobGeometry;

type Spot = { x: number; y: number; z: number; r: number; k: number };

/** Every blob for a world: grove trunks, registered crowns (village trees),
 * granite. Clustered so one tree's crown parts make one blob. */
function spots(world: WorldId): Spot[] {
  const out: Spot[] = [];
  const near = (x: number, z: number, gap: number) =>
    out.find((s) => Math.abs(s.x - x) < gap && Math.abs(s.z - z) < gap);
  for (const tree of groveField(world)) {
    const [x, y, z] = tree.p;
    out.push({ x, y: y + 0.03, z, r: 2.1 * tree.size, k: 1 });
  }
  for (const crown of allCrowns()) {
    const [x, , z] = crown.p;
    if (!LAND[world](x, z, 0.3)) continue;
    const radius = (Math.abs(crown.s[0]) + Math.abs(crown.s[2])) * 0.75;
    const hit = near(x, z, 1.4);
    if (hit) {
      hit.r = Math.max(hit.r, radius);
      continue;
    }
    const h = terrainHeightAt(x, z, world);
    out.push({ x, y: (h === 0 ? 0.14 : h) + 0.03, z, r: Math.max(1.2, radius), k: 1 });
  }
  for (const rock of rockField(world))
    out.push({ x: rock.x, y: rock.y + 0.03, z: rock.z, r: rock.size * 2.3, k: 0.8 });
  return out;
}

export function ContactShadows({ world }: { world: WorldId }) {
  const version = useSyncExternalStore(subscribeCrowns, crownVersion, crownVersion);
  const tier = useEnvTier();
  const active = useWorldActive();
  const ref = useRef<THREE.InstancedMesh>(null);
  const actors = activeNpcActors(world);
  // Moving blobs (player + villagers) take the tail of the buffer.
  const movers = Math.min(CAPACITY, actors.length + 1);
  const list = useMemo(() => {
    void version;
    return spots(world).slice(0, CAPACITY - movers);
  }, [world, version, movers]);
  useLayoutEffect(() => {
    // Heavier where they replace screen-space AO.
    material.opacity = tier === "high" ? 0.24 : 0.34;
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3();
    list.forEach((spot, i) => {
      p.set(spot.x, spot.y, spot.z);
      s.set(spot.r, 1, spot.r * (0.92 + ((i * 37) % 10) * 0.016));
      matrix.compose(p, q, s);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.count = list.length + movers;
    mesh.instanceMatrix.needsUpdate = true;
  }, [list, tier, movers]);
  const moving = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !active) return;
    const array = mesh.instanceMatrix.array as Float32Array;
    const start = list.length;
    const put = (i: number, x: number, z: number, r: number) => {
      const h = terrainHeightAt(x, z, world);
      moving.makeScale(r, 1, r).setPosition(x, (h === 0 ? 0.14 : h) + 0.03, z);
      moving.toArray(array, (start + i) * 16);
    };
    put(0, runtime.x, runtime.z, 0.9);
    for (let i = 0; i < movers - 1; i++) put(i + 1, actors[i].x, actors[i].z, 0.85);
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(start * 16, movers * 16);
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      name="env-contact-blobs"
      args={[geometry, material, CAPACITY]}
      renderOrder={-1}
      frustumCulled={false}
      raycast={noRaycast}
      dispose={null}
    />
  );
}
