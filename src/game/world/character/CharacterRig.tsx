import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { runtime, useGame, walkTo } from "../../core/store";
import { useWorldActive } from "../../engine/active";
import { PlayerMarker } from "../PlayerMarker";
import { exposeQa, qaEnabled } from "../../../stage/qa";
import { useStage } from "../../../stage/contract";
import { createGait, stepGait, type Gait, type Pose } from "./locomotion";
import {
  DEFAULT_PALETTE,
  KINDS,
  NO_CAST,
  rigGeometries,
  rigKindMaterial,
  writeLook,
  type Kind,
  type Look,
  type Palette,
  type RigLod,
} from "./rig";
import { compileOutfit, lookFromPalette, type Outfit } from "./wardrobe";
import { SculptBatch } from "./sculpt/runtime";
import { PLAYER_SCULPT, sculptPaletteFor, useCast } from "./sculpt/useSculpt";
import { registerSculptWarmup } from "./sculpt/warm";

registerSculptWarmup();

const isLook = (x: Look | Palette): x is Look => "parts" in x;
const zeroKinds = () =>
  Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;

/**
 * Instanced rig renderer: one InstancedMesh per geometry kind. Characters can
 * wear different outfits (different part counts), so instances are packed
 * per frame: call `write(index, pose, base, look)` for characters 0…n−1 in
 * order, then `commit(n)`. Colours and the instance → character map are
 * rewritten only when the sequence of looks changes.
 */
export class RigBatch {
  meshes: Partial<Record<Kind, THREE.InstancedMesh>> = {};
  lod: RigLod;
  /** Instance capacity per kind. */
  capacity: Record<Kind, number>;
  private cursor = zeroKinds();
  private written: (Look | undefined)[] = [];
  private relayout = false;
  private owner: Partial<Record<Kind, Int16Array>> = {};
  /**
   * `looks`: every look this batch may draw at once (capacity is their sum),
   * or a character count sized for the classic palette look.
   * `lod` "low" draws the distant rig (fewer triangles, no face detail).
   */
  constructor(looks: Look[] | number, lod: RigLod = "high") {
    this.lod = lod;
    const list =
      typeof looks === "number"
        ? Array.from({ length: looks }, () => [
            lookFromPalette(DEFAULT_PALETTE),
            lookFromPalette({ ...DEFAULT_PALETTE, hasHat: false }),
          ]).map(([a, b]) => ({ a, b }))
        : looks.map((a) => ({ a, b: a }));
    this.capacity = zeroKinds();
    for (const { a, b } of list)
      for (const kind of KINDS)
        this.capacity[kind] += Math.max(a.count[lod][kind], b.count[lod][kind]);
  }
  write(index: number, pose: Pose, base: THREE.Matrix4, lookOrPalette: Look | Palette) {
    const look = isLook(lookOrPalette) ? lookOrPalette : lookFromPalette(lookOrPalette);
    if (this.written[index] !== look) this.relayout = true;
    this.written[index] = look;
    const recolor = this.relayout;
    const counts = look.count[this.lod];
    // Never overflow a kind (a look outside the declared set).
    for (const kind of KINDS)
      if (this.cursor[kind] + counts[kind] > this.capacity[kind]) return;
    const start = this.cursor;
    const slot = look.slot[this.lod];
    writeLook(pose, base, look, this.lod, (kind, matrix, partIndex) => {
      const mesh = this.meshes[kind];
      if (!mesh) return;
      const at = start[kind] + slot[partIndex];
      mesh.setMatrixAt(at, matrix);
      if (recolor) {
        mesh.setColorAt(at, look.colors[partIndex]);
        (this.owner[kind] ??= new Int16Array(this.capacity[kind]))[at] = index;
      }
    });
    for (const kind of KINDS) start[kind] += counts[kind];
    if (recolor)
      for (const kind of KINDS) {
        const mesh = this.meshes[kind];
        if (mesh?.instanceColor && counts[kind]) mesh.instanceColor.needsUpdate = true;
      }
  }
  commit(count: number) {
    if (count === 0) this.cursor = zeroKinds();
    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      if (!mesh) continue;
      mesh.count = this.cursor[kind];
      // An empty kind issues no draw at all.
      mesh.visible = this.cursor[kind] > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.cursor = zeroKinds();
    this.relayout = false;
    this.written.length = Math.min(this.written.length, count);
  }
  /** Character index under a pointer hit on one of the batch meshes. */
  characterAt(kind: Kind, instanceId: number) {
    return this.owner[kind]?.[instanceId] ?? -1;
  }
}

/** The instanced meshes of a RigBatch (kinds it never draws are skipped). */
export function RigMeshes({
  batch,
  onPointerDown,
  shadows = true,
}: {
  batch: RigBatch;
  onPointerDown?: (kind: Kind, event: ThreeEvent<PointerEvent>) => void;
  shadows?: boolean;
}) {
  // Below high, the distant crowd rig is coarser again (few pixels tall).
  const geometries = rigGeometries(
    batch.lod,
    (useStage.getState().tier ?? "high") !== "high",
  );
  return (
    <>
      {KINDS.filter((kind) => batch.capacity[kind] > 0).map((kind) => (
        <instancedMesh
          key={kind}
          ref={(mesh) => {
            if (mesh) {
              batch.meshes[kind] = mesh;
              mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
              mesh.count = 0;
            } else delete batch.meshes[kind];
          }}
          args={[geometries[kind], rigKindMaterial(kind), batch.capacity[kind]]}
          frustumCulled={false}
          castShadow={shadows && !NO_CAST.has(kind)}
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
  outfit,
  seed = 7,
}: {
  npc?: boolean;
  player?: boolean;
  color?: string;
  hat?: boolean;
  scale?: number;
  walking?: RefObject<boolean>;
  palette?: Partial<Palette>;
  /** A full wardrobe outfit (overrides color/hat/palette). */
  outfit?: Outfit;
  seed?: number;
}) {
  const root = useRef<THREE.Group>(null);
  const gait = useRef<Gait>(createGait(seed));
  const last = useRef<THREE.Vector3 | null>(null);
  const active = useWorldActive();
  const pal = useMemo<Palette>(
    () => ({ ...DEFAULT_PALETTE, ...palette, shirt: color, hasHat: hat }),
    [color, hat, palette],
  );
  const look = useMemo(
    () => (outfit ? compileOutfit(outfit) : lookFromPalette(pal)),
    [outfit, pal],
  );
  const batch = useMemo(() => new RigBatch([look]), [look]);
  // In the hub, the baked sculpted figure (hero on high, mid on medium)
  // replaces the primitive rig once the cast has loaded.
  const cast = useCast();
  const scene = useGame((s) => s.scene);
  const tier = useStage((s) => s.tier) ?? "high";
  const sculptLod = !cast || outfit || scene !== "hub" || tier === "low" || !cast.has(PLAYER_SCULPT.hat) ? null : tier === "high" ? "hero" : "mid";
  const sculpt = useMemo(() => {
    if (!cast || !sculptLod) return null;
    const chars = [PLAYER_SCULPT.hat, PLAYER_SCULPT.bare].map((id) => ({ id, palette: sculptPaletteFor(DEFAULT_PALETTE), holds: {}, scale: 1 }));
    return new SculptBatch(cast, chars, sculptLod);
  }, [cast, sculptLod]);
  useEffect(() => () => sculpt?.dispose(), [sculpt]);
  useEffect(() => {
    if (!sculpt) return;
    const p = sculptPaletteFor(pal);
    sculpt.setPalette(0, p);
    sculpt.setPalette(1, p);
  }, [sculpt, pal]);
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
    if (sculpt) {
      sculpt.write(pal.hasHat ? 0 : 1, pose, scaled);
      sculpt.hide(pal.hasHat ? 1 : 0);
      return;
    }
    batch.write(0, pose, scaled, look);
    batch.commit(1);
  };
  useLayoutEffect(() => {
    // First pose immediately so the figure never flashes in a T-pose.
    write(0);
  }, [batch, sculpt]);
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
        {sculpt ? (
          <primitive object={sculpt.mesh} castShadow receiveShadow />
        ) : (
          <RigMeshes batch={batch} />
        )}
      </group>
      {player && !npc && <PlayerMarker />}
    </group>
  );
}

