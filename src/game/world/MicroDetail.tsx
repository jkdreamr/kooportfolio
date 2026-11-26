import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldActive } from "../engine/active";
import {
  insidePolygon,
  loopNormals,
  resampleLoop,
  signedDistanceToPolygon,
  type P2,
} from "../core/coast";
import { HOME_FLOWER_BEDS } from "../core/homeGardens";
import { HOME_SHORE, isHomeEllipse } from "../core/homeIsland";
import { KOREA_COAST, KOREA_MARKET, KOREA_SHORE } from "../core/koreaDistrict";
import { KOREA_LANDMARK_SOLIDS } from "../core/koreaLandmarks";
import { terrainHeightAt } from "../core/terrain";
import { STANFORD_WALKS } from "../core/stanfordLayout";
import { canWalk, doorsInWorld } from "../core/world";
import type { WorldId } from "../core/worlds";
import { useGame } from "../core/store";
import { STANFORD_COAST } from "../../shared/stanford-ground";
import { gemGeometry, gloss, glassMaterial, haloMaterial } from "./GlossKit";
import { sculptedMaterial } from "./Surface";

// Small, non-interactive dressing: lamp posts with clear lanterns, cliff-top
// fences, flower drifts, shore rocks and quartz. Four instanced batches per
// island (solids, rocks, glass, night halos). Nothing here is a collider, so
// every piece stands where `canWalk` is already false: the 0.3 skirt around a
// building or planter, or the scenic verge between the walking limit and the
// drawn coast. Paths, doorways and open lawn are never touched.

type Piece = {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  r?: [number, number, number];
};
type Kit = { solids: Piece[]; rocks: Piece[]; glass: Piece[]; halos: Piece[] };

const solidGeometry = new THREE.BoxGeometry();
const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
const haloGeometry = new THREE.PlaneGeometry(1, 1);
const solidMaterial = sculptedMaterial({ roughness: 0.86 });
const rockMaterial = sculptedMaterial({ roughness: 0.95, flatShading: true }, "stone");
const gemMaterial = glassMaterial({ tint: true, env: 1.1 });
gemMaterial.flatShading = true;
const glowMaterial = haloMaterial();

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const themes = {
  home: {
    post: "#6f5238",
    foot: "#a59c86",
    iron: "#3f4a45",
    cap: "#4f6f66",
    light: "#ffcf86",
    rocks: ["#a39a86", "#b5ab94", "#8f8875"],
    quartz: ["#f4dfb4", "#f7efe0", "#e9c88e"],
    blooms: ["#e58f6c", "#f1cf6a", "#f3ede0", "#c97f9c"],
    leaf: "#6f8b4f",
  },
  korea: {
    post: "#9aa097",
    foot: "#b9bbb0",
    iron: "#7d2f2a",
    cap: "#59615c",
    light: "#ffc27a",
    rocks: ["#a9ada5", "#bcc0b7", "#8f958e"],
    quartz: ["#cfe8dc", "#eef4f1", "#9fd0c0"],
    blooms: ["#e58aa9", "#f4c6d4", "#f6f2ee", "#d86a8c"],
    leaf: "#5f7f56",
  },
  stanford: {
    post: "#cbb086",
    foot: "#d9c39b",
    iron: "#4a3f36",
    cap: "#b4573a",
    light: "#ffd9a0",
    rocks: ["#c9ad7c", "#d8c096", "#b3925f"],
    quartz: ["#f6d38a", "#fbeed2", "#eaa55e"],
    blooms: ["#f2a12c", "#f7c64a", "#f08a2a", "#f6e3a8"],
    leaf: "#8a8a4a",
  },
} as const;

/** A lantern on its post. Home hangs a honey lantern from a timber bracket,
 * Korea stands a granite seokdeung with a red-and-blue silk lantern, Stanford
 * sets a globe lamp on a sandstone pier under a red-tile cap. */
function lamp(kit: Kit, world: WorldId, x: number, y: number, z: number, side: number) {
  const t = themes[world];
  const solid = (
    px: number,
    py: number,
    pz: number,
    sx: number,
    sy: number,
    sz: number,
    c: string,
    r?: Piece["r"],
  ) => kit.solids.push({ p: [x + px, y + py, z + pz], s: [sx, sy, sz], c, r });
  let lantern: [number, number, number];
  if (world === "home") {
    solid(0, 0.12, 0, 0.36, 0.2, 0.36, t.foot);
    solid(0, 1.42, 0, 0.14, 2.6, 0.14, t.post);
    solid(side * 0.26, 2.62, 0, 0.62, 0.09, 0.09, t.iron);
    solid(side * 0.13, 2.42, 0, 0.07, 0.42, 0.07, t.iron, [0, 0, side * 0.7]);
    solid(0, 2.76, 0, 0.22, 0.1, 0.22, t.cap);
    lantern = [x + side * 0.46, y + 2.2, z];
    solid(side * 0.46, 2.5, 0, 0.04, 0.2, 0.04, t.iron);
    solid(side * 0.46, 2.42, 0, 0.34, 0.07, 0.34, t.cap);
    solid(side * 0.46, 1.98, 0, 0.24, 0.05, 0.24, t.iron);
    kit.glass.push({ p: lantern, s: [0.3, 0.42, 0.3], c: t.light });
  } else if (world === "korea") {
    solid(0, 0.1, 0, 0.62, 0.16, 0.62, t.foot);
    solid(0, 0.26, 0, 0.44, 0.16, 0.44, t.post);
    solid(0, 0.86, 0, 0.2, 1.05, 0.2, t.post);
    solid(0, 1.45, 0, 0.5, 0.12, 0.5, t.foot);
    lantern = [x, y + 1.78, z];
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      solid(dx * 0.19, 1.78, dz * 0.19, 0.05, 0.56, 0.05, t.iron);
    // Cheongsachorong: red silk above blue.
    kit.glass.push({ p: [x, y + 1.9, z], s: [0.3, 0.3, 0.3], c: "#ff8a66" });
    kit.glass.push({ p: [x, y + 1.63, z], s: [0.3, 0.22, 0.3], c: "#8fb6ff", r: [Math.PI, 0, 0] });
    solid(0, 2.12, 0, 0.74, 0.1, 0.74, t.cap);
    solid(0, 2.22, 0, 0.46, 0.1, 0.46, t.cap);
    solid(0, 2.33, 0, 0.14, 0.14, 0.14, t.foot);
  } else {
    solid(0, 0.14, 0, 0.6, 0.24, 0.6, t.foot);
    solid(0, 0.82, 0, 0.44, 1.14, 0.44, t.post);
    solid(0, 1.44, 0, 0.58, 0.12, 0.58, t.foot);
    solid(0, 1.8, 0, 0.07, 0.62, 0.07, t.iron);
    lantern = [x, y + 2.26, z];
    solid(0, 2.03, 0, 0.26, 0.05, 0.26, t.iron);
    kit.glass.push({ p: lantern, s: [0.36, 0.46, 0.36], c: t.light });
    solid(0, 2.53, 0, 0.44, 0.07, 0.44, t.cap);
    solid(0, 2.61, 0, 0.24, 0.09, 0.24, t.cap);
  }
  kit.halos.push({ p: lantern, s: [4.2, 4.2, 4.2], c: t.light });
}

/** A handful of blossoms and leaf blades; low enough to never hide anything. */
function drift(kit: Kit, world: WorldId, x: number, y: number, z: number, radius: number, count: number, next: () => number) {
  const t = themes[world];
  for (let i = 0; i < count; i++) {
    const a = next() * Math.PI * 2,
      d = Math.sqrt(next()) * radius,
      px = x + Math.cos(a) * d,
      pz = z + Math.sin(a) * d,
      h = 0.2 + next() * 0.22;
    const bloom = t.blooms[Math.floor(next() * t.blooms.length)],
      turn = next() * 1.5;
    if (canWalk(px, pz, world)) continue;
    kit.solids.push({
      p: [px, y + h / 2, pz],
      s: [0.035, h, 0.035],
      c: t.leaf,
    });
    kit.solids.push({
      p: [px, y + h + 0.03, pz],
      s: [0.15, 0.08, 0.15],
      c: bloom,
      r: [0, turn, 0],
    });
    if (i % 2 === 0)
      kit.solids.push({
        p: [px + 0.07, y + 0.1, pz + 0.05],
        s: [0.16, 0.03, 0.07],
        c: t.leaf,
        r: [0.2, a, 0.5],
      });
  }
}

function rocks(kit: Kit, world: WorldId, x: number, y: number, z: number, radius: number, count: number, next: () => number) {
  const t = themes[world];
  for (let i = 0; i < count; i++) {
    const a = next() * Math.PI * 2,
      d = Math.sqrt(next()) * radius,
      size = 0.16 + next() * 0.3;
    const rock: Piece = {
      p: [x + Math.cos(a) * d, y + size * 0.42, z + Math.sin(a) * d],
      s: [size * (0.9 + next() * 0.5), size * (0.6 + next() * 0.3), size],
      c: t.rocks[Math.floor(next() * t.rocks.length)],
      r: [next() * 0.5, next() * 3, next() * 0.5],
    };
    if (!canWalk(rock.p[0], rock.p[2], world)) kit.rocks.push(rock);
  }
}

function quartz(kit: Kit, world: WorldId, x: number, y: number, z: number, next: () => number) {
  const t = themes[world];
  const points = 3 + Math.floor(next() * 3);
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 + next(),
      lean = i === 0 ? 0 : 0.28 + next() * 0.3,
      height = i === 0 ? 0.85 + next() * 0.3 : 0.4 + next() * 0.35,
      width = height * (0.3 + next() * 0.08),
      d = i === 0 ? 0 : 0.17;
    kit.glass.push({
      p: [x + Math.cos(a) * d, y + height * 0.42, z + Math.sin(a) * d],
      s: [width, height, width],
      c: t.quartz[i % t.quartz.length],
      r: [Math.sin(a) * lean, next() * 1, -Math.cos(a) * lean],
    });
  }
}

/** Split-rail fence along a loop segment; posts every ~1.5 units. */
function fence(kit: Kit, world: WorldId, points: readonly (readonly [number, number, number])[]) {
  const t = themes[world];
  points.forEach(([x, y, z], i) => {
    kit.solids.push({ p: [x, y + 0.36, z], s: [0.13, 0.76, 0.13], c: t.post });
    kit.solids.push({ p: [x, y + 0.77, z], s: [0.18, 0.06, 0.18], c: t.foot });
    const next = points[i + 1];
    if (!next) return;
    const dx = next[0] - x,
      dy = next[1] - y,
      dz = next[2] - z,
      run = Math.hypot(dx, dz);
    if (run > 2.4 || Math.abs(dy) > 0.5) return;
    for (const h of [0.3, 0.58])
      kit.solids.push({
        p: [x + dx / 2, y + dy / 2 + h, z + dz / 2],
        s: [run, 0.07, 0.06],
        c: world === "home" ? "#8a6b49" : t.post,
        r: [0, -Math.atan2(dz, dx), Math.atan2(dy, run)],
      });
  });
}

/** The jet taxis and lands at ground level: nothing above ankle height may
 * stand in its corridor (wings reach 4.25 either side). */
function jetCorridor(world: WorldId, x: number, z: number) {
  if (world === "home") return x > 20.5 && x < 36.5 && z > -46.5 && z < 15.5;
  return (
    (x > 52 && x < 68 && z > 56 && z < 88) ||
    (x > 51 && x < 79 && z > 14 && z < 46)
  );
}

const coasts: Record<WorldId, readonly P2[]> = {
  home: HOME_SHORE,
  korea: KOREA_COAST,
  stanford: STANFORD_COAST,
};

/** Scenic ground: inside the drawn coast, flat, and nowhere near a walker. */
function scenic(world: WorldId, x: number, z: number, clear: number) {
  if (jetCorridor(world, x, z)) return false;
  if (!insidePolygon(x, z, coasts[world])) return false;
  if (signedDistanceToPolygon(x, z, coasts[world]) < 0.35) return false;
  if (terrainHeightAt(x, z, world) !== 0) return false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (canWalk(x + Math.cos(a) * clear, z + Math.sin(a) * clear, world))
      return false;
  }
  return !canWalk(x, z, world);
}

function build(world: WorldId): Kit {
  const kit: Kit = { solids: [], rocks: [], glass: [], halos: [] };
  const next = random(world === "home" ? 11 : world === "korea" ? 23 : 37);
  const lampSites: [number, number, number][] = [];
  // A lantern at each front corner of every building, tucked into the skirt
  // that already keeps walkers off the wall.
  for (const door of doorsInWorld(world)) {
    const [cx, cz, hx, hz] = door.footprint;
    const front = door.rotation ? -1 : 1;
    for (const side of [-1, 1])
      lampSites.push([cx + side * (hx + 0.2), cz + front * (hz + 0.2), side]);
  }
  if (world === "home")
    for (const [x, z, , depth] of HOME_FLOWER_BEDS)
      lampSites.push([x, z + depth / 2 + 0.2, x < 0 ? 1 : -1]);
  if (world === "korea") {
    for (const x of [-5, 13, 31]) lampSites.push([x + 1.95, 53.5, 1]);
    for (const x of KOREA_MARKET.stalls)
      for (const side of [-1, 1])
        lampSites.push([x + side * 4.9, KOREA_MARKET.z + 3.4, side]);
    for (const [x, z, hw, hd] of KOREA_LANDMARK_SOLIDS)
      if (hw > 1.5)
        for (const side of [-1, 1])
          lampSites.push([x + side * (hw + 0.2), z + hd + 0.2, side]);
  }
  const placed: [number, number][] = [];
  for (const [x, z, side] of lampSites) {
    if (canWalk(x, z, world) || terrainHeightAt(x, z, world) !== 0) continue;
    if (jetCorridor(world, x, z)) continue;
    if (world === "korea" ? !insidePolygon(x, z, KOREA_SHORE) : !insidePolygon(x, z, coasts[world])) continue;
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3)) continue;
    placed.push([x, z]);
    lamp(kit, world, x, 0.14, z, side);
    drift(kit, world, x, 0.16, z, 0.28, 3, next);
  }

  if (world === "home") {
    // Honey lanterns strung under the reading pergola's two long beams.
    for (const dz of [-4.3, 4.3])
      for (const dx of [-3.6, 0, 3.6]) {
        const x = 10 + dx,
          z = 2 + dz;
        kit.solids.push({ p: [x, 4.2, z], s: [0.03, 0.4, 0.03], c: themes.home.iron });
        kit.solids.push({ p: [x, 4.0, z], s: [0.3, 0.06, 0.3], c: themes.home.cap });
        kit.glass.push({ p: [x, 3.8, z], s: [0.26, 0.36, 0.26], c: themes.home.light });
        kit.halos.push({ p: [x, 3.8, z], s: [3.4, 3.4, 3.4], c: themes.home.light });
      }
  }
  if (world === "stanford") {
    // Sandstone kerbs along the campus frontage, broken wherever another walk
    // joins, with a red-tile inlay closing each run like an arcade plinth.
    const t = themes.stanford;
    for (const [cx, cz, width, depth] of STANFORD_WALKS.slice(0, 1).concat([STANFORD_WALKS[10]]))
      for (const side of [-1, 1]) {
        const z = cz + side * (depth / 2 + 0.14);
        let open = false;
        for (let x = cx - width / 2 + 0.65; x < cx + width / 2; x += 1.3) {
          const joined = STANFORD_WALKS.some(
            ([wx, wz, ww, wd]) =>
              !(wx === cx && wz === cz) &&
              Math.abs(x - wx) < ww / 2 + 0.75 &&
              Math.abs(z - wz) < wd / 2 + 0.3,
          );
          if (joined || canWalk(x, z, world) === false) {
            open = false;
            continue;
          }
          kit.solids.push({ p: [x, 0.2, z], s: [1.26, 0.13, 0.22], c: x % 2.6 < 1.3 ? t.post : t.foot });
          if (!open) {
            kit.solids.push({ p: [x - 0.63, 0.21, z], s: [0.3, 0.15, 0.3], c: t.foot });
            kit.solids.push({ p: [x - 0.63, 0.295, z], s: [0.19, 0.02, 0.19], c: t.cap, r: [0, Math.PI / 4, 0] });
          }
          open = true;
        }
      }
  }

  // Coast dressing: walk the drawn shore and dress the verge wherever the
  // ground just inside it is scenic. Rock groups, quartz and flower drifts
  // alternate so no stretch of coast repeats.
  const ring = resampleLoop(coasts[world], world === "home" ? 150 : 220);
  const normals = loopNormals(ring);
  // Home's walkers come within 0.6 of the cliff, so its verge is a thin rim.
  const inset = world === "stanford" ? 0.62 : world === "korea" ? 1.4 : 0.42;
  const clear = world === "stanford" ? 0.3 : world === "korea" ? 0.55 : 0.1;
  let cluster = 0;
  const rail: [number, number, number][][] = [[]];
  ring.forEach(([rx, rz], i) => {
    const [nx, nz] = normals[i];
    // loopNormals point outward on a counter-clockwise loop; step back inland.
    const sign = insidePolygon(rx - nx * 0.5, rz - nz * 0.5, coasts[world]) ? -1 : 1;
    const x = rx + sign * nx * inset,
      z = rz + sign * nz * inset;
    const ok = scenic(world, x, z, clear);
    // Home headlands beyond the old ellipse get a cliff-top split-rail fence.
    if (world === "home") {
      const fx = rx + sign * nx * 0.7,
        fz = rz + sign * nz * 0.7;
      const headland =
        !isHomeEllipse(rx + sign * nx * 2.4, rz + sign * nz * 2.4) &&
        scenic(world, fx, fz, 0.3);
      if (headland) rail[rail.length - 1].push([fx, 0.14, fz]);
      else if (rail[rail.length - 1].length) rail.push([]);
    }
    if (!ok || i % (world === "home" ? 2 : 3) !== 0) return;
    const kind = cluster++ % 4;
    if (kind === 0 || kind === 2) rocks(kit, world, x, 0.14, z, Math.min(0.8, clear + 0.25), 3 + Math.floor(next() * 3), next);
    if (kind === 1) {
      quartz(kit, world, x, 0.14, z, next);
      rocks(kit, world, x, 0.14, z, 0.5, 2, next);
    }
    if (kind === 3 || kind === 2) drift(kit, world, x, 0.16, z, Math.min(0.9, clear + 0.35), 5 + Math.floor(next() * 4), next);
  });
  for (const run of rail) if (run.length >= 3) fence(kit, world, run);
  return kit;
}

const kits = new Map<WorldId, Kit>();
function kitFor(world: WorldId) {
  let kit = kits.get(world);
  if (!kit) kits.set(world, (kit = build(world)));
  return kit;
}
/** Exposed for tests: every piece must stay off walkable ground. */
export const microDetail = kitFor;

function Batch({
  pieces,
  geometry,
  material,
  shadows = false,
  night = false,
}: {
  pieces: Piece[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  shadows?: boolean;
  night?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    pieces.forEach(({ p, s, c, r = [0, 0, 0] }, i) => {
      object.position.set(...p);
      object.scale.set(...s);
      object.rotation.set(...r);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pieces]);
  // Halos cost nothing by day: the mesh is simply not drawn.
  const active = useWorldActive();
  useFrame(() => {
    if (!active) return;
    if (night && ref.current) ref.current.visible = gloss.night.value > 0.26;
  });
  if (!pieces.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, pieces.length]}
      castShadow={shadows}
      receiveShadow={shadows}
      raycast={noRaycast}
      renderOrder={night ? 3 : 0}
      dispose={null}
    />
  );
}
const noRaycast = () => {};

/** Mounted once per island, beside the ground. Art only. */
export function MicroDetail({ world }: { world: WorldId }) {
  const high = useGame((state) => state.quality === "high");
  const kit = useMemo(() => kitFor(world), [world]);
  return (
    <group name="island-micro-detail">
      <Batch pieces={kit.solids} geometry={solidGeometry} material={solidMaterial} shadows />
      <Batch pieces={kit.rocks} geometry={rockGeometry} material={rockMaterial} shadows />
      <Batch pieces={kit.glass} geometry={gemGeometry} material={gemMaterial} />
      {high && (
        <Batch pieces={kit.halos} geometry={haloGeometry} material={glowMaterial} night />
      )}
    </group>
  );
}
