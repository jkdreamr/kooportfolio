import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "../../core/store";
import { useWorldView, viewRuntime } from "../../core/worldView";
import { useWorldActive } from "../../engine/active";
import {
  allCrowns,
  crownVersion,
  layoutCards,
  leafAtlas,
  leafDepthMaterial,
  leafMaterial,
  leafUniforms,
  subscribeCrowns,
  type Card,
} from "./foliage";
import { ENV_DENSITY, useEnvTier } from "./tier";
import { REFLECT_LAYER } from "./reflection";

/**
 * One instanced draw of leaf-cluster cards for every registered crown.
 *
 * Cards are bucketed into 16 m chunks (PLAN2 §1.3). When the camera's focus
 * moves to another chunk, the chunks worth drawing are copied to the front of
 * the instance buffers and `mesh.count` is set (one draw, + its shadow pass):
 *  - diorama: every chunk within the telephoto's footprint (all of them at
 *    the overview, so it looks as before), at the tier's density;
 *  - explore: chunks in front of the camera; keep 1.0 within 30 units of the
 *    player, easing to 0.4 at 60, through each chunk's rank order. Crowns
 *    within 30 units also get a second, sparser layout (×1.5 cards).
 */

const CAPACITY = 24_000;
const CHUNK = 16;
const material = leafMaterial();
const depthMaterial = leafDepthMaterial();
const noRaycast = () => undefined;

type Chunk = {
  cx: number;
  cz: number;
  /** Base cards, then explore-only extra cards (each in rank order). */
  base: number;
  extra: number;
  matrices: Float32Array;
  colors: Float32Array;
  leaf: Float32Array;
  cell: Float32Array;
};

function pack(base: readonly Card[], extra: readonly Card[]): Chunk[] {
  const buckets = new Map<string, { base: Card[]; extra: Card[] }>();
  const bucket = (card: Card) => {
    const key = `${Math.floor(card.centre.x / CHUNK)},${Math.floor(card.centre.z / CHUNK)}`;
    let entry = buckets.get(key);
    if (!entry) buckets.set(key, (entry = { base: [], extra: [] }));
    return entry;
  };
  for (const card of base) bucket(card).base.push(card);
  for (const card of extra) bucket(card).extra.push(card);
  const matrix = new THREE.Matrix4(),
    scale = new THREE.Vector3();
  const chunks: Chunk[] = [];
  for (const [key, entry] of buckets) {
    const [i, j] = key.split(",").map(Number);
    const cards = [...entry.base, ...entry.extra];
    const chunk: Chunk = {
      cx: (i + 0.5) * CHUNK,
      cz: (j + 0.5) * CHUNK,
      base: entry.base.length,
      extra: entry.extra.length,
      matrices: new Float32Array(cards.length * 16),
      colors: new Float32Array(cards.length * 3),
      leaf: new Float32Array(cards.length * 4),
      cell: new Float32Array(cards.length),
    };
    cards.forEach((card, n) => {
      scale.setScalar(card.size);
      matrix.compose(card.p, card.q, scale).toArray(chunk.matrices, n * 16);
      card.color.toArray(chunk.colors, n * 3);
      chunk.leaf.set([card.centre.x, card.centre.y, card.centre.z, card.phase], n * 4);
      chunk.cell[n] = card.cell;
    });
    chunks.push(chunk);
  }
  return chunks;
}

const forward = new THREE.Vector3(),
  focus = new THREE.Vector3();

export function LeafShell() {
  const version = useSyncExternalStore(subscribeCrowns, crownVersion, crownVersion);
  const tier = useEnvTier();
  const active = useWorldActive();
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.setAttribute(
      "aLeaf",
      new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4),
    );
    plane.setAttribute(
      "aCell",
      new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1),
    );
    return plane;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    if (!leafUniforms.uLeafAtlas.value) leafUniforms.uLeafAtlas.value = leafAtlas();
  }, []);
  const chunks = useMemo(() => {
    void version;
    const crowns = allCrowns();
    // Medium and low never take the explore extras (budget §2).
    const extra = tier === "high" ? layoutCards(crowns, false, 0.5, 7919) : [];
    // Medium: scenic grove crowns take half their cards (budget §2).
    return pack(layoutCards(crowns, false, 1, 0, tier === "medium" ? 0.5 : 1), extra);
  }, [version, tier]);
  const last = useRef("");
  const shadowCount = useRef(0);
  const drawn = useRef(0);
  useLayoutEffect(() => {
    last.current = "";
    const mesh = ref.current;
    if (!mesh) return;
    mesh.layers.enable(REFLECT_LAYER);
    if (!mesh.instanceColor)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    mesh.count = 0;
  }, [chunks]);
  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh || !active) return;
    const density = ENV_DENSITY[tier].leaves;
    const explore = viewRuntime.blend > 0.5;
    camera.getWorldDirection(forward);
    const zoom = useWorldView.getState().zoom;
    let reach = Infinity;
    if (explore) focus.set(runtime.x, 0, runtime.z);
    else {
      const t = forward.y < -0.05 ? camera.position.y / -forward.y : 100;
      focus.copy(camera.position).addScaledVector(forward, t);
      // The telephoto's ground footprint: the whole island at the overview.
      reach = zoom < 1.6 ? Infinity : Math.max(34, 120 / zoom) + CHUNK;
    }
    const key = explore
      ? `e:${Math.floor(focus.x / CHUNK)},${Math.floor(focus.z / CHUNK)},${Math.round(Math.atan2(forward.x, forward.z) * 3)}`
      : `d:${Math.floor(focus.x / CHUNK)},${Math.floor(focus.z / CHUNK)},${reach === Infinity ? "all" : Math.round(reach)}`;
    if (key === last.current) return;
    last.current = key;
    const cx = camera.position.x,
      cz = camera.position.z;
    const picks = chunks
      .map((chunk) => ({ chunk, d: Math.hypot(chunk.cx - focus.x, chunk.cz - focus.z) }))
      .filter(
        ({ chunk, d }) =>
          d < reach &&
          (!explore || (chunk.cx - cx) * forward.x + (chunk.cz - cz) * forward.z > -CHUNK),
      )
      .sort((a, b) => a.d - b.d);
    const matrices = mesh.instanceMatrix.array as Float32Array;
    const colors = mesh.instanceColor!.array as Float32Array;
    const leaf = geometry.getAttribute("aLeaf") as THREE.InstancedBufferAttribute;
    const cell = geometry.getAttribute("aCell") as THREE.InstancedBufferAttribute;
    const leafArray = leaf.array as Float32Array,
      cellArray = cell.array as Float32Array;
    let n = 0;
    const copy = (chunk: Chunk, from: number, count: number) => {
      const take = Math.min(count, CAPACITY - n);
      if (take <= 0) return;
      matrices.set(chunk.matrices.subarray(from * 16, (from + take) * 16), n * 16);
      colors.set(chunk.colors.subarray(from * 3, (from + take) * 3), n * 3);
      leafArray.set(chunk.leaf.subarray(from * 4, (from + take) * 4), n * 4);
      cellArray.set(chunk.cell.subarray(from, from + take), n);
      n += take;
    };
    for (const { chunk, d } of picks) {
      const keep = explore
        ? THREE.MathUtils.lerp(1, 0.4, THREE.MathUtils.clamp((d - 30) / 30, 0, 1))
        : 1;
      copy(chunk, 0, Math.ceil(chunk.base * keep * density));
      if (n >= CAPACITY) break;
    }
    // The explore extras go after every base card: they fill canopies for
    // the low camera but do not cast (the base cards already shape the
    // canopy's shadow; high's shadow budget, §2).
    shadowCount.current = n;
    if (explore)
      for (const { chunk, d } of picks) {
        if (d >= 30 + CHUNK * 0.5) continue;
        copy(chunk, chunk.base, chunk.extra);
        if (n >= CAPACITY) break;
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
  return (
    <instancedMesh
      ref={ref}
      name="env-leaf-shell"
      args={[geometry, material, CAPACITY]}
      customDepthMaterial={depthMaterial}
      onBeforeShadow={() => {
        const mesh = ref.current;
        if (!mesh) return;
        drawn.current = mesh.count;
        mesh.count = Math.min(mesh.count, shadowCount.current);
      }}
      onAfterShadow={() => {
        if (ref.current) ref.current.count = drawn.current;
      }}
      castShadow
      receiveShadow
      frustumCulled={false}
      raycast={noRaycast}
      dispose={null}
    />
  );
}
