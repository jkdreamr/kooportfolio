import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { StaticBatch } from "./StaticBatch";
import { KitPieces } from "./ArchitectureKit";
import { sculptedMaterial, type SurfaceKind } from "./Surface";
import { useGame } from "../core/store";
import { sampleDaylight } from "../core/daylight";
import { daylightClock } from "../core/timeOfDay";
import { CORE_COLOR, coreIntensity } from "../core/townHall";
import { townHallCoreGeometry, townHallPieces, townHallRounds } from "./townHallArt";

/** The turned pieces and the core are built once and shared by every mount. */
let rounds: ReturnType<typeof townHallRounds> | null = null;
let core: THREE.BufferGeometry | null = null;
const roundMaterials = new Map<string, THREE.MeshStandardMaterial>();
function roundMaterial(color: string, kind: SurfaceKind) {
  const key = `${color}|${kind}`;
  let m = roundMaterials.get(key);
  if (!m) roundMaterials.set(key, (m = sculptedMaterial({ color, roughness: kind === "shingle" ? 0.82 : 0.9 }, kind)));
  return m;
}
const coreMaterial = new THREE.MeshStandardMaterial({
  color: "#f6d08a",
  emissive: CORE_COLOR,
  emissiveIntensity: 1.6,
  roughness: 0.6,
});

/**
 * The Town Hall in Home: an original round stone keep with a warm glowing
 * core (see townHallArt.ts). Position, collision and the door are owned by
 * the world (core/townHall.ts); this draws the building in its local frame.
 * Everything but the core bakes into one draw; the core is the second.
 */
export function TownHall() {
  const banner = useGame((s) => s.save.color);
  const pieces = useMemo(() => townHallPieces(banner), [banner]);
  rounds ??= townHallRounds();
  core ??= townHallCoreGeometry();
  const glow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const night = sampleDaylight(daylightClock.hour).night;
    coreMaterial.emissiveIntensity = coreIntensity(night, clock.elapsedTime);
  });
  return (
    <group name="town-hall">
      <StaticBatch id="TownHall">
        <group>
          {rounds.map((piece, i) => (
            <mesh
              key={i}
              geometry={piece.geometry}
              material={roundMaterial(piece.color, piece.kind)}
              castShadow={piece.cast}
              receiveShadow
              dispose={null}
            />
          ))}
          <KitPieces pieces={pieces.stone} material="stone" />
          <KitPieces pieces={pieces.wood} material="wood" />
          <KitPieces pieces={pieces.metal} material="metal" />
          <KitPieces pieces={pieces.paint} material="paint" />
        </group>
      </StaticBatch>
      <mesh ref={glow} geometry={core} material={coreMaterial} dispose={null} userData={{ noBake: true }} />
    </group>
  );
}
