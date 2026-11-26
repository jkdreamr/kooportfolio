import { useMemo } from "react";
import * as THREE from "three";
import { hash01, type P2 } from "../core/coast";
import { TERRAIN, terrainTierLoop, type TerrainFeature } from "../core/terrain";
import type { WorldId } from "../core/worlds";
import { sculptedMaterial } from "./Surface";
import { reflect } from "./env/reflection";
import { NaturalTrees, type TreePlacement } from "./TreeArt";

// Relief art for the land nobody walks on: terraces, knolls, granite and the
// lowered cove shelves described by core/terrain. One merged, vertex-coloured,
// flat-faceted mesh per world; no textures, lights or per-frame work.

type V3 = readonly [number, number, number];
type Builder = { positions: number[]; colors: number[] };

const scratch = new THREE.Color();
function tone(hex: string, factor: number): V3 {
  scratch.set(hex).multiplyScalar(factor);
  return [scratch.r, scratch.g, scratch.b];
}
function triangle(out: Builder, a: V3, b: V3, c: V3, color: V3) {
  out.positions.push(...a, ...b, ...c);
  for (let i = 0; i < 3; i++) out.colors.push(...color);
}
/** Faces between two equal-length rings; `lower` first. Counter-clockwise
 * loops (x, z) viewed from above give outward-facing walls with this order. */
function band(
  out: Builder,
  lower: readonly V3[],
  upper: readonly V3[],
  color: (segment: number) => V3,
) {
  const n = lower.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const shade = color(i);
    triangle(out, lower[i], upper[i], lower[j], shade);
    triangle(out, lower[j], upper[i], upper[j], shade);
  }
}
/** A flat, upward-facing cap over a (possibly concave) loop. */
function cap(
  out: Builder,
  loop: readonly P2[],
  y: number,
  color: (i: number) => V3,
) {
  const faces = THREE.ShapeUtils.triangulateShape(
    loop.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  );
  faces.forEach(([a, b, c], i) => {
    const pa: V3 = [loop[a][0], y, loop[a][1]],
      pb: V3 = [loop[b][0], y, loop[b][1]],
      pc: V3 = [loop[c][0], y, loop[c][1]];
    // Keep the face normal pointing up whatever the triangulator's winding.
    const up =
      (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]);
    if (up >= 0) triangle(out, pa, pb, pc, color(i));
    else triangle(out, pa, pc, pb, color(i));
  });
}
const lift = (loop: readonly P2[], y: number | ((i: number) => number)): V3[] =>
  loop.map(([x, z], i) => [x, typeof y === "number" ? y : y(i), z]);

/** Upright dry-stone or earth walls in courses, with a flat planted top. */
function stepped(out: Builder, feature: TerrainFeature, tiers: number[]) {
  const { seed, rock, cap: grass } = feature;
  tiers.forEach((tier, order) => {
    const loop = terrainTierLoop(feature, tier);
    const top = feature.tiers[tier].y;
    // Each wall starts just below the step it stands on: no seam, no gap.
    const foot = order
      ? feature.tiers[tiers[order - 1]].y - 0.06
      : feature.baseY;
    const courses = Math.max(1, Math.min(6, Math.round((top - foot) / 0.48)));
    for (let row = 0; row < courses; row++) {
      const y0 = foot + ((top - foot) * row) / courses,
        y1 = foot + ((top - foot) * (row + 1)) / courses;
      const coping = row === courses - 1;
      band(out, lift(loop, y0), lift(loop, y1), (i) =>
        tone(
          rock,
          (coping ? 1.1 : 0.84 + 0.08 * (row % 2)) +
            0.1 * (hash01(seed, tier, row, i >> row % 2) - 0.5),
        ),
      );
    }
    cap(out, loop, top, (i) =>
      tone(grass, 0.95 + 0.1 * hash01(seed, tier, i, 7)),
    );
  });
}

/** Faceted slopes from a buried foot up through each ring to a summit. */
function sloped(out: Builder, feature: TerrainFeature, tiers: number[]) {
  const { seed, rock, cap: crown, focus, kind } = feature;
  const rugged = kind === "outcrop";
  const count = feature.outline.length;
  const ringAt = (scale: number, y: number, k: number): V3[] =>
    feature.outline.map(([x, z], i) => {
      // Jitter only ever pulls a vertex inward: the footprint is a promise.
      const pull = rugged
        ? 0.16 * hash01(seed, k, i, 3)
        : 0.05 * hash01(seed, k, i, 3);
      const s = scale * (1 - pull);
      const bump = (rugged ? 0.3 : 0.1) * (hash01(seed, k, i, 5) - 0.5);
      return [
        focus[0] + (x - focus[0]) * s,
        y + (k ? bump * Math.min(1, y) : 0),
        focus[1] + (z - focus[1]) * s,
      ];
    });
  const top = feature.tiers[tiers[tiers.length - 1]].y;
  const base = feature.tiers[tiers[0]].y;
  let lower = ringAt(1, feature.baseY, 0);
  tiers.forEach((tier, order) => {
    const next = tiers[order + 1];
    const own = feature.tiers[tier].scale;
    // Each ring is drawn between its own contour and the next one up, so the
    // slope leaves the ground at the footprint instead of rising as a wall.
    const scale =
      (own + (next === undefined ? own * 0.45 : feature.tiers[next].scale)) / 2;
    const y = feature.tiers[tier].y;
    const upper = ringAt(scale, y, order + 1);
    const height = (y - base) / Math.max(0.01, top - base);
    band(out, lower, upper, (i) =>
      tone(
        height > 0.55 || !rugged ? crown : rock,
        (rugged ? 0.86 + 0.2 * height : 0.93 + 0.1 * height) +
          0.1 * (hash01(seed, tier, i, 11) - 0.5),
      ),
    );
    lower = upper;
  });
  const summit: V3 = [focus[0], top + (rugged ? 0.5 : 0.18), focus[1]];
  for (let i = 0; i < count; i++)
    triangle(
      out,
      lower[i],
      summit,
      lower[(i + 1) % count],
      tone(crown, 1.04 + 0.08 * (hash01(seed, i, 13) - 0.5)),
    );
}

function buildTerrain(world: WorldId, detail: boolean) {
  const out: Builder = { positions: [], colors: [] };
  for (const feature of TERRAIN[world]) {
    const all = feature.tiers.map((_, i) => i);
    // Low quality halves the steps; the footprint and the summit stay put.
    const tiers =
      detail || all.length < 3
        ? all
        : all.filter((i) => i === all.length - 1 || i % 2 === 0);
    if (feature.kind === "terrace" || feature.kind === "shelf")
      stepped(out, feature, tiers);
    else sloped(out, feature, tiers);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(out.positions, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(out.colors, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const geometries = new Map<string, THREE.BufferGeometry>();
function terrainGeometry(world: WorldId, detail: boolean) {
  const key = `${world}:${detail}`;
  let geometry = geometries.get(key);
  if (!geometry) geometries.set(key, (geometry = buildTerrain(world, detail)));
  return geometry;
}
const material = sculptedMaterial(
  {
    vertexColors: true,
    flatShading: true,
    roughness: 0.94,
  },
  "ground",
);
const trees = new Map<WorldId, TreePlacement[]>();
function terrainTrees(world: WorldId) {
  let placed = trees.get(world);
  if (!placed)
    trees.set(
      world,
      (placed = TERRAIN[world].flatMap((feature, f) =>
        feature.trees.map(({ species, size, p }, i) => ({
          p,
          size,
          species,
          variant: (f * 3 + i) % 7,
        })),
      )),
    );
  return placed;
}
const noRaycast = () => undefined;

/** Scenic relief on unwalkable land. Clicks pass through to the ground. */
export function IslandTerrain({
  world,
  detail = true,
}: {
  world: WorldId;
  detail?: boolean;
}) {
  const geometry = useMemo(
    () => terrainGeometry(world, detail),
    [world, detail],
  );
  const placed = terrainTrees(world);
  return (
    <group name="island-terrain" ref={reflect}>
      <mesh
        geometry={geometry}
        material={material}
        raycast={noRaycast}
        castShadow
        receiveShadow
        dispose={null}
      />
      {placed.length > 0 && <NaturalTrees trees={placed} />}
    </group>
  );
}
