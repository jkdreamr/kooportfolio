import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sculptedMaterial } from "./Surface";

type V3 = [number, number, number];
export type TreePlacement = {
  p: readonly [number, number, number];
  size?: number;
  variant?: number;
  species?: "oak" | "pine" | "redwood" | "palm";
};
type Part = { p: V3; s: V3; r: V3; c: string };

// Closed ridged leaves, not leaf cards or solid ball crowns.
function foliageBuilder() {
  const positions: number[] = [],
    colors: number[] = [];
  const leaf = (
    a: V3,
    b: V3,
    width: number,
    thickness: number,
    shade: number,
  ) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start).normalize();
    const side = direction
      .clone()
      .cross(new THREE.Vector3(0, 1, 0))
      .normalize()
      .multiplyScalar(width);
    const normal = side
      .clone()
      .cross(direction)
      .normalize()
      .multiplyScalar(thickness);
    const center = start.clone().add(end).multiplyScalar(0.5);
    const points = [
      start,
      end,
      center.clone().add(side),
      center.clone().sub(side),
      center.clone().add(normal),
      center.clone().sub(normal),
    ];
    const faces = [
      [0, 2, 4],
      [2, 1, 4],
      [1, 3, 4],
      [3, 0, 4],
      [2, 0, 5],
      [1, 2, 5],
      [3, 1, 5],
      [0, 3, 5],
    ];
    faces.forEach((face, i) =>
      face.forEach((index) => {
        positions.push(points[index].x, points[index].y, points[index].z);
        const light = shade * (i < 4 ? 1 : 0.82);
        colors.push(light * 0.97, light, light * 0.9);
      }),
    );
  };
  const geometry = () => {
    const out = new THREE.BufferGeometry();
    out.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    out.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    out.computeVertexNormals();
    return out;
  };
  return { leaf, geometry };
}
function leafGeometry(flat: boolean) {
  const builder = foliageBuilder();
  const count = flat ? 24 : 32;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996,
      radius = 0.12 + Math.sqrt((i + 0.5) / count) * 0.5;
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius;
    const y = flat ? ((i % 5) - 2) * 0.14 : Math.sin(i * 2.7) * 0.5;
    const length = 0.55 + Math.sin(i * 3.7) * 0.12;
    builder.leaf(
      [
        x - Math.cos(angle) * length * 0.45,
        y,
        z - Math.sin(angle) * length * 0.45,
      ],
      [
        x + Math.cos(angle) * length * 0.55,
        y + (flat ? 0.14 : 0.24),
        z + Math.sin(angle) * length * 0.55,
      ],
      flat ? 0.12 : 0.23,
      0.065,
      0.88 + (i % 4) * 0.045,
    );
  }
  return builder.geometry();
}
function palmFrondGeometry() {
  const builder = foliageBuilder();
  const spine = (t: number): V3 => [
    t * 2.6,
    Math.sin(t * Math.PI) * 0.45 - t * t * 0.8,
    0,
  ];
  for (let i = 0; i < 10; i++) {
    const t = (i + 1) / 11,
      at = spine(t);
    builder.leaf(spine(i / 11), at, 0.03, 0.025, 1);
    for (const side of [-1, 1]) {
      const reach = 0.22 + Math.sin(t * Math.PI) * 0.62;
      builder.leaf(
        at,
        [at[0] + 0.22 - t * 0.12, at[1] - 0.14 - reach * 0.12, side * reach],
        0.11 - t * 0.04,
        0.028,
        0.88 + (i % 3) * 0.05,
      );
    }
  }
  builder.leaf(spine(10 / 11), spine(1), 0.045, 0.025, 0.98);
  return builder.geometry();
}
const broadGeometry = leafGeometry(false);
const pineGeometry = leafGeometry(true);
const palmGeometry = palmFrondGeometry();
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
  palms: Part[],
) {
  const { p, size = 1, variant = 0, species } = tree;
  const redwood = species === "redwood",
    palm = species === "palm";
  const kind =
    palm || redwood || species === "pine"
      ? 0
      : species === "oak"
        ? variant % 2
          ? 1
          : 2
        : ((variant % 3) + 3) % 3;
  const rand = randomGenerator(
    Math.round(p[0] * 937 + p[2] * 527 + variant * 673 + 113),
  );
  const rotation = rand() * Math.PI * 2;
  const leanX = (rand() - 0.5) * 0.42;
  const leanZ = (rand() - 0.5) * 0.4;
  const height = (redwood ? 8.5 : 4.5) + rand() * (redwood ? 1 : 0.5);
  const world = (v: V3): V3 => [
    p[0] + v[0] * size,
    p[1] + v[1] * size,
    p[2] + v[2] * size,
  ];
  const woodColor = redwood
    ? "#885b43"
    : palm
      ? "#99754f"
      : ["#79634c", "#78604b", "#655343"][kind];
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

  // Curved palm stems and long, tapering redwood spines retain their own proportions.
  if (redwood || palm) {
    const segments = palm ? 5 : 4;
    const point = (t: number): V3 => [
      leanX * t * (palm ? 1.8 : 0.9),
      height * t,
      leanZ * t * (palm ? 1.4 : 0.8),
    ];
    for (let i = 0; i < segments; i++)
      branch(
        point(i / segments),
        point((i + 1) / segments),
        (palm ? 0.23 : 0.34) * (1 - (i / segments) * 0.7),
      );
  } else {
    // A flared, rooted base and a bent, tapering spine anchor the crown.
    branch(
      [0, 0.03, 0],
      [leanX * 0.3, 1.25, leanZ * 0.3],
      kind === 0 ? 0.2 : 0.25,
    );
    branch([leanX * 0.3, 1.15, leanZ * 0.3], [leanX, 2.65, leanZ], 0.15);
    branch(
      [leanX, 2.5, leanZ],
      [leanX * 1.8, height - 0.35, leanZ * 1.8],
      0.085,
    );
  }
  for (let i = 0; i < 5; i++) {
    const angle = rotation + i * 1.256 + rand() * 0.35;
    const reach = 0.48 + rand() * 0.27;
    branch(
      [leanX * 0.04, 0.35, leanZ * 0.04],
      [Math.cos(angle) * reach, 0.025, Math.sin(angle) * reach],
      0.09,
    );
  }

  if (palm) {
    for (let i = 0; i < 9; i++) {
      const length = 0.82 + rand() * 0.2;
      palms.push({
        p: world([leanX * 1.8, height - (i % 3) * 0.07, leanZ * 1.4]),
        s: [length * size, size, (0.8 + rand() * 0.3) * size],
        r: [0, rotation + i * 2.39996, i < 3 ? 0.3 : -rand() * 0.16],
        c: ["#507448", "#64844e", "#758d54"][i % 3],
      });
    }
    return;
  }
  if (kind === 0) {
    // Uneven whorls with separate branch fans leave real gaps around the trunk.
    const tiers = redwood ? 9 : 4;
    for (let tier = 0; tier < tiers; tier++) {
      const y = redwood
        ? 2.7 + tier * ((height - 3.4) / (tiers - 1))
        : 1.45 + tier * 0.75;
      for (let j = 0; j < 3; j++) {
        const angle = rotation + tier * 2.4 + j * 2.094 + rand() * 0.45;
        const reach =
          (1.25 - (tier / (tiers - 1)) * (redwood ? 0.85 : 0.6)) *
          (0.8 + rand() * 0.35);
        const x = leanX + Math.cos(angle) * reach,
          z = leanZ + Math.sin(angle) * reach;
        branch(
          [leanX, y + 0.2, leanZ],
          [x, y + 0.05, z],
          0.065 - tier * (redwood ? 0.007 : 0.01),
        );
        leaf(
          [x * 0.78, y + 0.22 + rand() * 0.2, z * 0.78],
          [reach * 0.85, redwood ? 0.9 : 0.65, reach * 0.62],
          angle,
        );
        leaf(
          [x * 1.05, y + 0.2, z * 1.05],
          [reach * 0.5, redwood ? 0.65 : 0.42, reach * 0.45],
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

/** Three opaque grove batches, plus one when palms are present. Placement stays external. */
export function NaturalTrees({ trees }: { trees: readonly TreePlacement[] }) {
  const { wood, broad, pine, palms } = useMemo(() => {
    const wood: Part[] = [],
      broad: Part[] = [],
      pine: Part[] = [],
      palms: Part[] = [];
    trees.forEach((tree) => makeTree(tree, wood, broad, pine, palms));
    return { wood, broad, pine, palms };
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
      {palms.length > 0 && (
        <TreeInstances
          parts={palms}
          geometry={palmGeometry}
          material={leafMaterial}
        />
      )}
    </>
  );
}

export function TreeArt({ p, size = 1, variant = 0, species }: TreePlacement) {
  const [x, y, z] = p;
  const trees = useMemo(
    () => [{ p: [x, y, z] as const, size, variant, species }],
    [x, y, z, size, variant, species],
  );
  return <NaturalTrees trees={trees} />;
}
