import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { onStanfordLand } from "../../shared/stanford-ground";
import {
  forest,
  grassSites,
  koreaForest,
  type GroundFootprint,
} from "../core/scenery";
import { isKoreaGardenWalk, isKoreaLandmarkArea } from "../core/koreaLandmarks";
import type { WorldId } from "../core/worlds";
import { NaturalTrees } from "./TreeArt";
import { sculptedMaterial } from "./Surface";
import {
  isStanfordTownSpace,
  isStanfordTreeSite,
} from "../core/stanfordLayout";

type Part = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
};
const crown = new THREE.IcosahedronGeometry(1, 1);
const reed = new THREE.ConeGeometry(1, 1, 5);
const matte = sculptedMaterial({ roughness: 0.92 });
function Instances({
  parts,
  geometry,
}: {
  parts: Part[];
  geometry: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!,
      object = new THREE.Object3D(),
      color = new THREE.Color();
    parts.forEach(({ p, s, c }, i) => {
      object.position.set(...p);
      object.scale.set(...s);
      object.rotation.y = i * 1.7;
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, matte, parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
const rocks: Part[] = [];
const trees = forest.map(({ x, z, height }, i) => ({
  p: [x, 0, z] as const,
  size: (height + 1.8) / 4.8,
  variant: i % 7,
}));
const koreaTrunks = new Set(koreaForest);
const koreaTrees = trees.filter((_, i) => koreaTrunks.has(forest[i]));
forest.forEach(({ x, z }, i) => {
  if (i % 3 === 0)
    rocks.push({
      p: [x + 1.7, 0.5, z - 0.7],
      s: [1.2, 0.85, 0.9],
      c: i % 2 ? "#8c9380" : "#aaa78c",
    });
});
export function GroundGrass({
  avoid,
  stanford = false,
}: {
  avoid: readonly GroundFootprint[];
  stanford?: boolean;
}) {
  const parts = useMemo(
    () =>
      grassSites(avoid)
        .filter(({ x, z }) => !stanford || onStanfordLand(x, z, 0.3))
        .map<Part>(({ x, z, variant }) => ({
          p: [x, 0.32, z],
          s: [0.12, 0.35 + (variant % 4) * 0.1, 0.12],
          c: variant % 3 ? "#638143" : "#8b9c59",
        })),
    [avoid, stanford],
  );
  return <Instances parts={parts} geometry={reed} />;
}
const stanfordTrees = trees.filter(({ p }) => isStanfordTreeSite(p[0], p[2]));
const stanfordRocks = rocks.filter(
  ({ p }) =>
    !isStanfordTownSpace(p[0], p[2], 3) && onStanfordLand(p[0], p[2], 2),
);
const outsideLandmarks = ({ p: [x, , z] }: Part) =>
  !isKoreaLandmarkArea(x, z, 0.6) && !isKoreaGardenWalk(x, z, 0.6);
const koreaRocks = rocks.filter(outsideLandmarks);

export function Scenery({ world }: { world: WorldId }) {
  const korea = world === "korea";
  return (
    <>
      <NaturalTrees
        trees={
          korea ? koreaTrees : world === "stanford" ? stanfordTrees : trees
        }
      />
      <Instances
        key={`${world}-rocks`}
        parts={
          korea ? koreaRocks : world === "stanford" ? stanfordRocks : rocks
        }
        geometry={crown}
      />
    </>
  );
}
