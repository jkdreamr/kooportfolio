import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldId } from "../../core/worlds";
import { runtime } from "../../core/store";
import { viewRuntime } from "../../core/worldView";
import { useWorldActive } from "../../engine/active";
import { registerWarmup } from "../../../stage/contract";
import { leafAtlas, leafMaterial, leafUniforms } from "./foliage";
import { understoryField, understoryFieldAsync, type UnderstoryClump } from "./placement";
import { nextSlice } from "./slice";
import { envBudget, useEnvTier } from "./tier";

/**
 * Foreground understory for the explore view (PLAN2 §1.3): bushes, ferns,
 * flower clumps and tall grass where lawns meet walls, terraces, lake rims
 * and grove feet. Each clump is three crossed cards from the leaf atlas,
 * drawn with the leaf-shell material (same program), so it sways, glows
 * against the sun and dithers out near the camera like the canopies.
 *
 * Clumps are bucketed into 8 m chunks; when the player moves to another
 * chunk, the chunks within 35 units are copied to the front of the instance
 * buffer (mesh.count). Drawn only while the view blend is above 0; never
 * casts shadows. Visible clump cap per tier: `understory` in the budget.
 */

const CHUNK = 8;
const RADIUS = 35;
const CARDS = 3;
const material = leafMaterial();
const noRaycast = () => undefined;

/** Atlas cell and palette per kind (0 bush, 1 fern, 2 flowers, 3 tall grass). */
const CELL = [0, 3, 1, 2] as const;
const PALETTES: Record<WorldId, readonly (readonly string[])[]> = {
  home: [
    ["#4f7a34", "#5f8a3a", "#6c8f3c", "#8a7a32"],
    ["#3f6a2e", "#4c7a33"],
    ["#d98a9a", "#e8c25a", "#f1ead8", "#b48bd0"],
    ["#7f9a45", "#9aa852", "#b0a85c"],
  ],
  korea: [
    ["#466e34", "#55793c", "#6b7f3e"],
    ["#3a6230", "#46703a"],
    ["#e59ab0", "#f2d36a", "#f4efe2", "#c98a4c"],
    ["#728f4a", "#8a9a56"],
  ],
  stanford: [
    ["#5a7a36", "#6d843a", "#7d8a40"],
    ["#4a6e32", "#587a38"],
    ["#e8b04a", "#f1e6c8", "#c97ab0", "#e07a4a"],
    ["#a4a04e", "#bfae5e", "#c9b46a"],
  ],
};
/** Width / height ratio per kind. */
const ASPECT = [1.35, 1.5, 1.6, 0.9];

type Chunk = {
  cx: number;
  cz: number;
  matrices: Float32Array;
  colors: Float32Array;
  leaf: Float32Array;
  cell: Float32Array;
  count: number;
};
const packed = new Map<WorldId, Chunk[]>();

function pack(world: WorldId, clumps: readonly UnderstoryClump[]): Chunk[] {
  const buckets = new Map<string, UnderstoryClump[]>();
  for (const clump of clumps) {
    const key = `${Math.floor(clump.x / CHUNK)},${Math.floor(clump.z / CHUNK)}`;
    const list = buckets.get(key);
    if (list) list.push(clump);
    else buckets.set(key, [clump]);
  }
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    p = new THREE.Vector3(),
    s = new THREE.Vector3(),
    color = new THREE.Color();
  const chunks: Chunk[] = [];
  for (const [key, list] of buckets) {
    const [i, j] = key.split(",").map(Number);
    const n = list.length * CARDS;
    const chunk: Chunk = {
      cx: (i + 0.5) * CHUNK,
      cz: (j + 0.5) * CHUNK,
      matrices: new Float32Array(n * 16),
      colors: new Float32Array(n * 3),
      leaf: new Float32Array(n * 4),
      cell: new Float32Array(n),
      count: list.length,
    };
    list.forEach((clump, c) => {
      const palette = PALETTES[world][clump.kind];
      const h = clump.size,
        w = h * ASPECT[clump.kind];
      color.set(palette[Math.floor(clump.tone * palette.length) % palette.length]);
      for (let k = 0; k < CARDS; k++) {
        const at = c * CARDS + k;
        q.setFromAxisAngle(up, clump.angle + (k * Math.PI) / CARDS);
        // Cards stand on the ground; the atlas clusters are discs, so the
        // card sinks a little to root them.
        const jitter = (k - 1) * 0.06;
        p.set(clump.x + jitter, clump.y + h * 0.4, clump.z - jitter);
        s.set(w * (0.9 + k * 0.08), h * (1 - k * 0.06), 1);
        matrix.compose(p, q, s).toArray(chunk.matrices, at * 16);
        const shade = 0.9 + k * 0.07;
        chunk.colors[at * 3] = color.r * shade;
        chunk.colors[at * 3 + 1] = color.g * shade;
        chunk.colors[at * 3 + 2] = color.b * shade;
        // Spherised normals round a point low in the clump.
        chunk.leaf.set([clump.x, clump.y + h * 0.15, clump.z, (clump.tone * 7.3 + k * 0.31) % 1], at * 4);
        chunk.cell[at] = CELL[clump.kind];
      }
    });
    chunks.push(chunk);
  }
  return chunks;
}

const pending = new Map<WorldId, Promise<Chunk[]>>();
function chunksAsync(world: WorldId) {
  const ready = packed.get(world);
  if (ready) return Promise.resolve(ready);
  let job = pending.get(world);
  if (!job) {
    job = understoryFieldAsync(world, nextSlice).then(async () => {
      await nextSlice();
      let chunks = packed.get(world);
      if (!chunks) packed.set(world, (chunks = pack(world, understoryField(world))));
      return chunks;
    });
    pending.set(world, job);
  }
  return job;
}
for (const world of ["home", "korea", "stanford"] as const)
  registerWarmup({
    id: `env-understory-${world}`,
    priority: world === "home" ? 22 : 46,
    run: async ({ tier }) => {
      if (envBudget(tier).understory > 0) await chunksAsync(world);
    },
  });

export function Understory({ world }: { world: WorldId }) {
  const tier = useEnvTier();
  const cap = envBudget(tier).understory;
  const active = useWorldActive();
  const ref = useRef<THREE.InstancedMesh>(null);
  const [, setReady] = useState(0);
  const chunks = packed.get(world) ?? null;
  useEffect(() => {
    if (chunks || !cap) return;
    let live = true;
    void chunksAsync(world).then(() => live && setReady((n) => n + 1));
    return () => void (live = false);
  }, [chunks, world, cap]);
  const capacity = cap * CARDS;
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.setAttribute("aLeaf", new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 4), 4));
    plane.setAttribute("aCell", new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1));
    return plane;
  }, [capacity]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    if (!leafUniforms.uLeafAtlas.value) leafUniforms.uLeafAtlas.value = leafAtlas();
  }, []);
  const last = useRef("");
  useLayoutEffect(() => {
    last.current = "";
    const mesh = ref.current;
    if (mesh) mesh.count = 0;
  }, [world, chunks, geometry]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !active || !chunks || !capacity) return;
    // Hidden by count (0 instances draw nothing), never by `visible`, so
    // the program is compiled in warmup and toggling the view links nothing.
    const on = viewRuntime.blend > 0;
    if (!on) {
      if (mesh.count) {
        mesh.count = 0;
        last.current = "";
      }
      return;
    }
    const fx = runtime.x,
      fz = runtime.z;
    const key = `${Math.floor(fx / 4)},${Math.floor(fz / 4)}`;
    if (key === last.current) return;
    last.current = key;
    const near = chunks
      .map((chunk) => ({ chunk, d: Math.hypot(chunk.cx - fx, chunk.cz - fz) }))
      .filter(({ d }) => d < RADIUS + CHUNK * 0.75)
      .sort((a, b) => a.d - b.d);
    const matrices = mesh.instanceMatrix.array as Float32Array;
    const colors = mesh.instanceColor!.array as Float32Array;
    const leaf = geometry.getAttribute("aLeaf") as THREE.InstancedBufferAttribute;
    const cell = geometry.getAttribute("aCell") as THREE.InstancedBufferAttribute;
    const leafArray = leaf.array as Float32Array,
      cellArray = cell.array as Float32Array;
    let n = 0;
    for (const { chunk } of near) {
      const take = Math.min(chunk.count * CARDS, capacity - n);
      if (take <= 0) break;
      matrices.set(chunk.matrices.subarray(0, take * 16), n * 16);
      colors.set(chunk.colors.subarray(0, take * 3), n * 3);
      leafArray.set(chunk.leaf.subarray(0, take * 4), n * 4);
      cellArray.set(chunk.cell.subarray(0, take), n);
      n += take;
    }
    mesh.count = n;
    for (const [attribute, size] of [
      [mesh.instanceMatrix, 16],
      [mesh.instanceColor!, 3],
      [leaf, 4],
      [cell, 1],
    ] as const) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, n * size);
      attribute.needsUpdate = true;
    }
  });
  if (!capacity) return null;
  return (
    <instancedMesh
      key={capacity}
      ref={(mesh) => {
        ref.current = mesh;
        if (mesh && !mesh.instanceColor)
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      }}
      name="env-understory"
      args={[geometry, material, capacity]}
      receiveShadow
      frustumCulled={false}
      raycast={noRaycast}
      dispose={null}
    />
  );
}
