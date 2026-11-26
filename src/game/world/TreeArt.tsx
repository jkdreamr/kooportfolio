import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sculptedMaterial } from "./Surface";
import { lookWorld } from "./env/look";
import type { WorldId } from "../core/worlds";
import { registerCrowns, type Crown } from "./env/foliage";

type V3 = [number, number, number];
export type TreePlacement = {
  p: readonly [number, number, number];
  size?: number;
  variant?: number;
  species?: "oak" | "pine" | "redwood" | "palm";
};
type Part = { p: V3; s: V3; r: V3; c: string };

/** Per-island species character. Crown colours are the inner mass; the leaf
 * shell (env/foliage) is tinted from the same hue a touch lighter. */
type Look = {
  /** Broadleaf palettes; one is chosen per tree. */
  broad: readonly (readonly string[])[];
  /** Weight of each broadleaf palette (same length as broad). */
  weights: readonly number[];
  conifer: readonly string[];
  oak: readonly string[];
  bark: readonly string[];
  /** Share of broadleaf trees with pale birch trunks (and the first palette
   * that birches take). */
  birch: number;
  birchPalette: number;
  /** Conifer bark: Korea's red pines glow orange in the upper trunk. */
  pineBark: string;
};
const LOOKS: Record<WorldId, Look> = {
  // Home: a cozy autumn village — orange, amber and gold over fresh greens,
  // white birches with yellow crowns, deep green spruces for contrast.
  home: {
    broad: [
      ["#5d8a46", "#6c9a4c", "#7fa955"],
      ["#d47a2c", "#e08f36", "#c9662a"],
      ["#e2ad3f", "#d99a33", "#ebc055"],
      ["#4f7c45", "#5f8d4b", "#73a053"],
    ],
    weights: [0.34, 0.26, 0.2, 0.2],
    conifer: ["#3b6048", "#476d4d", "#335640"],
    oak: ["#5a8644", "#6b9649", "#7aa451"],
    bark: ["#6f5a46", "#6c5744", "#5e4c3d"],
    birch: 0.26,
    birchPalette: 2,
    pineBark: "#6a5240",
  },
  // Korea: red pines (sonamu) and zelkova greens, maple reds and ginkgo gold
  // as accents around the palaces.
  korea: {
    broad: [
      ["#4f7a48", "#5e8a4d", "#6f9852"],
      ["#b8452e", "#c95a34", "#a83b2c"],
      ["#dcae3c", "#e6bf4e", "#d29f33"],
    ],
    weights: [0.62, 0.22, 0.16],
    conifer: ["#355c44", "#41684a", "#2f533e"],
    oak: ["#557f4a", "#62904f", "#4a7444"],
    bark: ["#76604c", "#6f5846", "#5f4c3e"],
    birch: 0,
    birchPalette: 0,
    pineBark: "#a5583a",
  },
  // Stanford: dry-summer olive oaks, dark redwoods and palms on golden grass.
  stanford: {
    broad: [
      ["#66784a", "#77894f", "#5a6d44"],
      ["#6f8a4e", "#7e9a56", "#647c49"],
    ],
    weights: [0.6, 0.4],
    conifer: ["#34573d", "#3f6445", "#2e4d38"],
    oak: ["#62764a", "#718650", "#566b44"],
    bark: ["#6e5a48", "#6a5644", "#5c4b3d"],
    birch: 0,
    birchPalette: 0,
    pineBark: "#7a5040",
  },
};

// Closed canopy mass and small ridged leaf edges share one baked geometry.
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
  const volume = (center: V3, scale: V3, phase: number) => {
    const levels = [-0.52, -0.2, 0.19, 0.48];
    const radii = [0.3, 0.92, 0.86, 0.34];
    const rings = levels.map((height, ring) =>
      Array.from({ length: 7 }, (_, i): V3 => {
        const angle = phase + (i / 7) * Math.PI * 2 + ring * 0.12;
        const radius = radii[ring] * (1 + Math.sin(i * 4.3 + phase) * 0.12);
        return [
          center[0] + Math.cos(angle) * radius * scale[0],
          center[1] +
            (height + Math.sin(i * 2.3 + ring + phase) * 0.06) * scale[1],
          center[2] + Math.sin(angle) * radius * scale[2],
        ];
      }),
    );
    const triangle = (a: V3, b: V3, c: V3) => {
      for (const point of [a, b, c]) {
        positions.push(...point);
        const light = 0.82 + ((point[1] - center[1]) / scale[1] + 0.65) * 0.14;
        colors.push(light * 0.97, light, light * 0.9);
      }
    };
    const bottom: V3 = [
      center[0] + scale[0] * 0.04,
      center[1] - scale[1] * 0.65,
      center[2],
    ];
    const top: V3 = [
      center[0] - scale[0] * 0.08,
      center[1] + scale[1] * 0.64,
      center[2] + scale[2] * 0.05,
    ];
    for (let i = 0; i < 7; i++) {
      const next = (i + 1) % 7;
      triangle(bottom, rings[0][i], rings[0][next]);
      triangle(top, rings[3][next], rings[3][i]);
      for (let ring = 0; ring < 3; ring++) {
        triangle(rings[ring][i], rings[ring + 1][i], rings[ring][next]);
        triangle(rings[ring][next], rings[ring + 1][i], rings[ring + 1][next]);
      }
    }
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
  return { leaf, volume, geometry };
}
function leafGeometry(flat: boolean) {
  const builder = foliageBuilder();
  if (flat) {
    builder.volume([-0.25, -0.04, 0], [0.7, 0.58, 0.65], 0.4);
    builder.volume([0.32, 0.04, 0.05], [0.62, 0.62, 0.56], 1.7);
  } else {
    builder.volume([-0.34, -0.05, -0.15], [0.66, 0.8, 0.65], 0.3);
    builder.volume([0.3, 0.08, -0.08], [0.68, 0.84, 0.66], 1.8);
    builder.volume([0.02, 0.13, 0.35], [0.66, 0.83, 0.67], 3.1);
  }
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996,
      radius = 0.47 + Math.sqrt((i + 0.5) / count) * 0.42;
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius;
    const y = flat ? Math.sin(i * 2.7) * 0.15 : Math.sin(i * 2.7) * 0.28;
    const length = (flat ? 0.4 : 0.3) + Math.sin(i * 3.7) * 0.06;
    builder.leaf(
      [
        x - Math.cos(angle) * length * 0.45,
        y,
        z - Math.sin(angle) * length * 0.45,
      ],
      [
        x + Math.cos(angle) * length * 0.55,
        y + (flat ? 0.1 : 0.16),
        z + Math.sin(angle) * length * 0.55,
      ],
      flat ? 0.1 : 0.14,
      flat ? 0.04 : 0.055,
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
  look: Look,
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
  // Palette and bark by island character; the pick is position-seeded.
  const pick = rand();
  const birch = kind !== 0 && rand() < look.birch;
  let broadPalette = look.broad[0];
  for (let i = 0, acc = 0; i < look.broad.length; i++) {
    acc += look.weights[i];
    if (pick < acc) {
      broadPalette = look.broad[i];
      break;
    }
  }
  if (birch) broadPalette = look.broad[look.birchPalette];
  const woodColor = redwood
    ? "#8a5a40"
    : palm
      ? "#99754f"
      : birch
        ? "#e4dfd2"
        : kind === 0
          ? look.pineBark
          : look.bark[kind];
  const palette =
    kind === 0 ? look.conifer : species === "oak" ? look.oak : broadPalette;
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
        const radius = 0.95 + rand() * 0.2;
        leaf(
          [tip[0], tip[1] + 0.2, tip[2]],
          [radius, 0.9 + rand() * 0.25, radius * 0.9],
          a,
        );
      }
    }
    leaf(
      [leanX * 1.8 - 0.35, height - 0.6, leanZ * 1.8],
      [0.95, 0.9, 0.9],
      rotation,
    );
    leaf(
      [leanX * 1.8 + 0.4, height - 0.55, leanZ * 1.8 + 0.25],
      [0.9, 0.95, 0.92],
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
      receiveShadow={geometry === woodGeometry}
      dispose={null}
    />
  );
}

/** Three opaque grove batches, plus one when palms are present. Placement stays external. */
export function NaturalTrees({ trees }: { trees: readonly TreePlacement[] }) {
  const world = lookWorld();
  const { wood, broad, pine, palms } = useMemo(() => {
    const wood: Part[] = [],
      broad: Part[] = [],
      pine: Part[] = [],
      palms: Part[] = [];
    const look = LOOKS[world] ?? LOOKS.home;
    trees.forEach((tree) => makeTree(tree, look, wood, broad, pine, palms));
    return { wood, broad, pine, palms };
  }, [trees, world]);
  // With the leaf shell over them, closed crowns become the darker, slightly
  // smaller inner mass: gaps between leaf clusters read as depth.
  const inner = useMemo(() => {
    const color = new THREE.Color();
    const shrink = (parts: Part[]) =>
      parts.map(
        (part): Part => ({
          ...part,
          s: [part.s[0] * 0.88, part.s[1] * 0.9, part.s[2] * 0.88],
          c: `#${color.set(part.c).multiplyScalar(0.55).getHexString()}`,
        }),
      );
    return { broad: shrink(broad), pine: shrink(pine) };
  }, [broad, pine]);
  // The leaf-cluster shell (one draw for every grove) follows these crowns,
  // in world space: groves inside moved/rotated parents (campus district,
  // underside islets) are carried through their parents' transforms.
  const anchor = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const group = anchor.current;
    const matrix = new THREE.Matrix4();
    if (group) {
      group.updateWorldMatrix(true, false);
      matrix.copy(group.matrixWorld);
    }
    const position = new THREE.Vector3(),
      parentQ = new THREE.Quaternion(),
      parentS = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler();
    matrix.decompose(position, parentQ, parentS);
    const scale = (parentS.x + parentS.y + parentS.z) / 3;
    const place = (part: Part, kind: Crown["kind"]): Crown => {
      const p = new THREE.Vector3(...part.p).applyMatrix4(matrix);
      q.setFromEuler(e.set(...part.r));
      e.setFromQuaternion(q.premultiply(parentQ));
      return {
        p: [p.x, p.y, p.z],
        s: [part.s[0] * scale, part.s[1] * scale, part.s[2] * scale],
        r: [e.x, e.y, e.z],
        color: part.c,
        kind,
      };
    };
    return registerCrowns([
      ...broad.map((part) => place(part, "broad")),
      ...pine.map((part) => place(part, "pine")),
    ]);
  }, [broad, pine]);
  return (
    <group ref={anchor}>
      {wood.length > 0 && (
        <TreeInstances
          parts={wood}
          geometry={woodGeometry}
          material={barkMaterial}
        />
      )}
      {broad.length > 0 && (
        <TreeInstances
          parts={inner.broad}
          geometry={broadGeometry}
          material={leafMaterial}
        />
      )}
      {pine.length > 0 && (
        <TreeInstances
          parts={inner.pine}
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
    </group>
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
