import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sculptedMaterial } from "./Surface";

type V3 = [number, number, number];
export type TreePlacement = {
  p: readonly [number, number, number];
  size?: number;
  variant?: number;
};
type Part = { p: V3; s: V3; r: V3; c: string };

// Closed, irregular volumes, not transparent leaf cards or smooth spheres.
function leafGeometry(flat: boolean) {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const positions = geometry.getAttribute("position");
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const lobe = 1 + Math.sin(x * 11 + z * 7 + y * 4) * 0.12;
    positions.setXYZ(i, x * lobe, y * (flat ? 0.52 : 0.9) * lobe, z * lobe);
    const light = 0.84 + (y + 1) * 0.09 + Math.sin(x * 17 + z * 9) * 0.04;
    colors.push(light * 0.97, light, light * 0.91);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
const broadGeometry = leafGeometry(false);
const pineGeometry = leafGeometry(true);
const woodGeometry = new THREE.CylinderGeometry(0.62, 1, 1, 7);
const barkColors = [];
const barkPositions = woodGeometry.getAttribute("position");
for (let i = 0; i < barkPositions.count; i++) {
  const angle = Math.atan2(barkPositions.getZ(i), barkPositions.getX(i));
  const shade = 0.82 + (Math.sin(angle * 5) + 1) * 0.09;
  barkColors.push(shade, shade * 0.94, shade * 0.86);
}
woodGeometry.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(barkColors, 3),
);
const barkMaterial = sculptedMaterial({ roughness: 0.98, vertexColors: true });
const leafMaterial = sculptedMaterial({ roughness: 0.91, vertexColors: true });
const up = new THREE.Vector3(0, 1, 0);

function randomGenerator(seed: number) {
  let state = seed | 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function makeTree(
  tree: TreePlacement,
  wood: Part[],
  broad: Part[],
  pine: Part[],
) {
  const { p, size = 1, variant = 0 } = tree;
  const kind = ((variant % 3) + 3) % 3;
  const rand = randomGenerator(
    Math.round(p[0] * 937 + p[2] * 527 + variant * 673 + 113),
  );
  const rotation = rand() * Math.PI * 2;
  const leanX = (rand() - 0.5) * 0.42;
  const leanZ = (rand() - 0.5) * 0.4;
  const height = 4.5 + rand() * 0.5;
  const world = (v: V3): V3 => [
    p[0] + v[0] * size,
    p[1] + v[1] * size,
    p[2] + v[2] * size,
  ];
  const woodColor = ["#79634c", "#78604b", "#655343"][kind];
  const palette =
    kind === 0
      ? ["#3f614c", "#526f50", "#607c56"]
      : kind === 1
        ? ["#697a4b", "#7c8c56", "#8a995f"]
        : ["#456d4f", "#587d54", "#71915e"];
  const branch = (a: V3, b: V3, radius: number) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b);
    const delta = to.clone().sub(from);
    const r = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize()),
    );
    const center = from.add(to).multiplyScalar(0.5);
    wood.push({
      p: world([center.x, center.y, center.z]),
      s: [radius * size, delta.length() * size, radius * size],
      r: [r.x, r.y, r.z],
      c: woodColor,
    });
  };
  const leaf = (at: V3, scale: V3, angle: number) => {
    (kind === 0 ? pine : broad).push({
      p: world(at),
      s: [scale[0] * size, scale[1] * size, scale[2] * size],
      r: [(rand() - 0.5) * 0.35, angle, (rand() - 0.5) * 0.3],
      c: palette[Math.floor(rand() * palette.length)],
    });
  };

  // A flared, rooted base and a bent, tapering spine anchor the crown.
  branch(
    [0, 0.03, 0],
    [leanX * 0.3, 1.25, leanZ * 0.3],
    kind === 0 ? 0.2 : 0.25,
  );
  branch([leanX * 0.3, 1.15, leanZ * 0.3], [leanX, 2.65, leanZ], 0.15);
  branch([leanX, 2.5, leanZ], [leanX * 1.8, height - 0.35, leanZ * 1.8], 0.085);
  for (let i = 0; i < 5; i++) {
    const angle = rotation + i * 1.256 + rand() * 0.35;
    const reach = 0.48 + rand() * 0.27;
    branch(
      [leanX * 0.04, 0.35, leanZ * 0.04],
      [Math.cos(angle) * reach, 0.025, Math.sin(angle) * reach],
      0.09,
    );
  }

  if (kind === 0) {
    // Uneven whorls with separate branch fans leave real gaps around the trunk.
    for (let tier = 0; tier < 4; tier++) {
      const y = 1.45 + tier * 0.75;
      for (let j = 0; j < 3; j++) {
        const angle = rotation + tier * 2.4 + j * 2.094 + rand() * 0.45;
        const reach = (1.25 - tier * 0.2) * (0.8 + rand() * 0.35);
        const x = leanX + Math.cos(angle) * reach,
          z = leanZ + Math.sin(angle) * reach;
        branch([leanX, y + 0.2, leanZ], [x, y + 0.05, z], 0.065 - tier * 0.01);
        leaf(
          [x * 0.78, y + 0.22 + rand() * 0.2, z * 0.78],
          [reach * 0.85, 0.65, reach * 0.62],
          angle,
        );
        leaf(
          [x * 1.05, y + 0.2, z * 1.05],
          [reach * 0.5, 0.42, reach * 0.45],
          angle + 0.4,
        );
      }
    }
    leaf([leanX * 1.8, height - 0.3, leanZ * 1.8], [0.4, 0.95, 0.36], rotation);
  } else {
    // Forks grow outwards, then lift; the foliage follows their actual tips.
    for (let i = 0; i < 5; i++) {
      const angle = rotation + i * 2.39996 + rand() * 0.4;
      const y = 1.5 + i * 0.23;
      const reach = 1.05 + rand() * 0.4;
      const joint: V3 = [
        leanX + Math.cos(angle) * reach,
        y + 0.6,
        leanZ + Math.sin(angle) * reach,
      ];
      branch([leanX * 0.7, y, leanZ * 0.7], joint, 0.105 - i * 0.009);
      for (let fork = 0; fork < 2; fork++) {
        const a = angle + (fork ? 0.55 : -0.5);
        const tip: V3 = [
          joint[0] + Math.cos(a) * 0.55,
          joint[1] + 0.55 + rand() * 0.3,
          joint[2] + Math.sin(a) * 0.55,
        ];
        branch(joint, tip, 0.048);
        const radius = 0.64 + rand() * 0.22;
        leaf(
          [tip[0], tip[1] + 0.2, tip[2]],
          [radius, 0.62 + rand() * 0.18, radius * 0.86],
          a,
        );
      }
    }
    leaf(
      [leanX * 1.8 - 0.35, height - 0.6, leanZ * 1.8],
      [0.78, 0.7, 0.7],
      rotation,
    );
    leaf(
      [leanX * 1.8 + 0.4, height - 0.55, leanZ * 1.8 + 0.25],
      [0.66, 0.76, 0.74],
      rotation + 1,
    );
  }
}

function TreeInstances({
  parts,
  geometry,
  material,
}: {
  parts: Part[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!,
      object = new THREE.Object3D(),
      color = new THREE.Color();
    parts.forEach((part, i) => {
      object.position.set(...part.p);
      object.scale.set(...part.s);
      object.rotation.set(...part.r);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(part.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return () => {
      mesh.dispose();
    };
  }, [parts]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

/** Any number of trees in three opaque batches; placement/collision data stays external. */
export function NaturalTrees({ trees }: { trees: readonly TreePlacement[] }) {
  const { wood, broad, pine } = useMemo(() => {
    const wood: Part[] = [],
      broad: Part[] = [],
      pine: Part[] = [];
    trees.forEach((tree) => makeTree(tree, wood, broad, pine));
    return { wood, broad, pine };
  }, [trees]);
  return (
    <>
      {wood.length > 0 && (
        <TreeInstances
          parts={wood}
          geometry={woodGeometry}
          material={barkMaterial}
        />
      )}
      {broad.length > 0 && (
        <TreeInstances
          parts={broad}
          geometry={broadGeometry}
          material={leafMaterial}
        />
      )}
      {pine.length > 0 && (
        <TreeInstances
          parts={pine}
          geometry={pineGeometry}
          material={leafMaterial}
        />
      )}
    </>
  );
}

export function TreeArt({ p, size = 1, variant = 0 }: TreePlacement) {
  const [x, y, z] = p;
  const trees = useMemo(
    () => [{ p: [x, y, z] as const, size, variant }],
    [x, y, z, size, variant],
  );
  return <NaturalTrees trees={trees} />;
}
