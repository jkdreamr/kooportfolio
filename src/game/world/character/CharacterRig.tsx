import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { runtime, useGame, walkTo } from "../../core/store";
import { useWorldActive } from "../../engine/active";
import { PlayerMarker } from "../PlayerMarker";
import { exposeQa, qaEnabled } from "../../../stage/qa";
import { createGait, stepGait, type Gait, type Pose } from "./locomotion";
import {
  DEFAULT_PALETTE,
  KINDS,
  PARTS,
  PARTS_PER_KIND_LOD,
  PART_SLOT,
  paletteColors,
  rigGeometries,
  rigMaterial,
  writeCharacter,
  type Palette,
  type RigLod,
} from "./rig";

type Kind = (typeof KINDS)[number];

/**
 * Instanced rig renderer: one InstancedMesh per geometry kind, sized for
 * `capacity` characters. Call `write(index, pose, base, palette)` for each
 * character in a frame, then `commit(count)`.
 */
export class RigBatch {
  meshes: Partial<Record<Kind, THREE.InstancedMesh>> = {};
  capacity: number;
  lod: RigLod;
  perKind: Record<Kind, number>;
  colorKeys: string[] = [];
  /** `lod` "low" draws the distant rig (fewer triangles, no face detail). */
  constructor(capacity: number, lod: RigLod = "high") {
    this.capacity = capacity;
    this.lod = lod;
    this.perKind = PARTS_PER_KIND_LOD[lod];
  }
  write(index: number, pose: Pose, base: THREE.Matrix4, palette: Palette) {
    const key = paletteKey(palette);
    const recolor = this.colorKeys[index] !== key;
    const colors = recolor ? paletteColors(palette) : null;
    if (recolor) this.colorKeys[index] = key;
    const slot = PART_SLOT[this.lod];
    writeCharacter(pose, base, palette.hasHat, (kind, matrix, partIndex) => {
      const mesh = this.meshes[kind];
      const n = slot[partIndex];
      if (!mesh || n < 0) return;
      const at = index * this.perKind[kind] + n;
      mesh.setMatrixAt(at, matrix);
      if (colors) {
        mesh.setColorAt(at, colors[partIndex]);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    });
  }
  commit(count: number) {
    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      if (!mesh) continue;
      mesh.count = count * this.perKind[kind];
      // An empty LOD batch issues no draw at all.
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  /** Character index under a pointer hit on one of the batch meshes. */
  characterAt(kind: Kind, instanceId: number) {
    return Math.floor(instanceId / this.perKind[kind]);
  }
}

const paletteKey = (p: Palette) =>
  `${p.shirt}|${p.pants}|${p.skin}|${p.hair}|${p.shoe}|${p.hat}|${p.band}|${p.hasHat}`;

/** The instanced meshes of a RigBatch. */
export function RigMeshes({
  batch,
  onPointerDown,
  shadows = true,
}: {
  batch: RigBatch;
  onPointerDown?: (kind: Kind, event: ThreeEvent<PointerEvent>) => void;
  shadows?: boolean;
}) {
  const geometries = rigGeometries(batch.lod);
  return (
    <>
      {KINDS.map((kind) => (
        <instancedMesh
          key={kind}
          ref={(mesh) => {
            if (mesh) {
              batch.meshes[kind] = mesh;
              mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
              mesh.count = 0;
            } else delete batch.meshes[kind];
          }}
          args={[
            geometries[kind],
            rigMaterial(kind === "hair" || kind === "band" || kind === "brim"),
            Math.max(1, batch.capacity * batch.perKind[kind]),
          ]}
          frustumCulled={false}
          castShadow={shadows}
          receiveShadow
          userData={{ noBake: true }}
          dispose={null}
          onPointerDown={
            onPointerDown ? (event) => onPointerDown(kind, event) : undefined
          }
        />
      ))}
    </>
  );
}

const scaled = new THREE.Matrix4();
const world = new THREE.Vector3(),
  worldScale = new THREE.Vector3(),
  worldQuat = new THREE.Quaternion(),
  worldEuler = new THREE.Euler();

/**
 * Player-style single character. Drop-in replacement for the old box figure
 * (same props). Locomotion is driven by the measured velocity of its own
 * world position, so whatever moves the parent (Walker, journeys, skate
 * walk) gets a matching walk with eased starts/stops, lean and banking.
 * `walking` (optional) forces walking on/off for movers that teleport.
 */
export function Character({
  npc = false,
  player = false,
  color = DEFAULT_PALETTE.shirt,
  hat = true,
  scale = 1,
  walking,
  palette,
  seed = 7,
}: {
  npc?: boolean;
  player?: boolean;
  color?: string;
  hat?: boolean;
  scale?: number;
  walking?: RefObject<boolean>;
  palette?: Partial<Palette>;
  seed?: number;
}) {
  const root = useRef<THREE.Group>(null);
  const batch = useMemo(() => new RigBatch(1), []);
  const gait = useRef<Gait>(createGait(seed));
  const last = useRef<THREE.Vector3 | null>(null);
  const active = useWorldActive();
  const pal = useMemo<Palette>(
    () => ({ ...DEFAULT_PALETTE, ...palette, shirt: color, hasHat: hat }),
    [color, hat, palette],
  );
  const write = (dt: number) => {
    const g = root.current;
    if (!g) return;
    g.getWorldPosition(world);
    let vx = 0,
      vz = 0;
    if (last.current && dt > 0) {
      const dx = world.x - last.current.x,
        dz = world.z - last.current.z;
      // Ignore teleports (scene swaps, respawns).
      if (Math.hypot(dx, dz) < 1.5) {
        const size = Math.max(0.2, g.getWorldScale(worldScale).x);
        vx = dx / dt / size;
        vz = dz / dt / size;
      }
    }
    (last.current ??= new THREE.Vector3()).copy(world);
    const forced = walking?.current;
    const yaw = worldEuler.setFromQuaternion(
      g.getWorldQuaternion(worldQuat),
      "YXZ",
    ).y;
    const pose = stepGait(gait.current, dt, vx, vz, yaw, {
      forceWalk: forced === true || (npc && walking === undefined),
      still: forced === false,
    });
    scaled.makeScale(1, 1, 1);
    batch.write(0, pose, scaled, pal);
    batch.commit(1);
  };
  useLayoutEffect(() => {
    // First pose immediately so the figure never flashes in a T-pose.
    write(0);
  }, [pal]);
  useFrame(({ camera, size, scene, gl }, delta) => {
    if (!active) return;
    if (player && root.current && qaEnabled()) {
      exposeQa({ scene, camera, gl, player: root.current, game: useGame, runtime, walkTo });
      (window as unknown as { __w4three?: unknown }).__w4three = {
        scene,
        camera,
        gl,
        player: root.current,
        game: useGame,
        runtime,
        walkTo,
      };
      // Dev-only probe for screenshot tooling: player's screen position.
      const g = root.current;
      (window as unknown as { __w4player?: () => number[] }).__w4player =
        () => {
          const v = g.getWorldPosition(new THREE.Vector3());
          v.y += 0.6;
          v.project(camera);
          return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
        };
    }
    if (document.hidden || useGame.getState().paused) return;
    write(Math.min(delta, 0.05));
  });
  return (
    <group scale={scale}>
      <group ref={root} name="character-rig">
        <RigMeshes batch={batch} />
      </group>
      {player && !npc && <PlayerMarker />}
    </group>
  );
}

export { PARTS };
