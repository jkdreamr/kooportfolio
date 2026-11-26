import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { Cylinder, Ball, Bench } from "./Models";
import { HomeCoastArt } from "./HomeCoastArt";
import { NaturalTrees, type TreePlacement } from "./TreeArt";
import { KoreaRiverGround } from "./KoreaRiverGround";
import { Scenery } from "./Scenery";
import { NationalFlag } from "./NationalFlag";
import { CampusDistrict } from "./CampusDistrict";
import { campus } from "../core/campus";
import { POND, POND_SURFACE } from "../core/pond";
import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import { onStanfordLand } from "../../shared/stanford-ground";
import { StanfordGround } from "./StanfordGround";
import type { WorldId } from "../core/worlds";
import { waterMaterial } from "./GlossKit";
import { MicroDetail } from "./MicroDetail";
import { STANFORD_WALKS } from "../core/stanfordLayout";
import { setLookWorld } from "./env/look";

const pondDisc = new THREE.CircleGeometry(1, 48);
const pondWater = waterMaterial({
  color: "#4aa9b0",
  deep: "#22667a",
  shallow: "#8dcdc0",
  bank: "#57703f",
  shore: "disc",
  scale: 0.55,
});

type Block = [number, number, number, number, number, number, string, number?];
function Blocks({
  items,
  shadow = false,
}: {
  items: Block[];
  shadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!,
      object = new THREE.Object3D(),
      color = new THREE.Color();
    items.forEach(([x, y, z, sx, sy, sz, c, angle = 0], i) => {
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      object.rotation.y = angle;
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, items.length]}
      castShadow={shadow}
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  );
}

// A single lawn avoids thousands of near-coplanar tile edges shimmering as
// the camera moves. Keep coastal foliage a full canopy clear of the railway.
const rimTrees: TreePlacement[] = Array.from({ length: 40 }, (_, i) => {
  const angle = Math.PI + (i / 39) * Math.PI;
  return {
    p: [
      Math.cos(angle) * (WORLD_ELLIPSE.radiusX - 7),
      0,
      Math.sin(angle) * (WORLD_ELLIPSE.radiusZ - 7) + WORLD_ELLIPSE.centerZ,
    ],
    size: 0.8 + (i % 3) * 0.15,
    variant: i % 3 === 0 ? 0 : 2,
  };
});
const rimGroves = Array.from({ length: 8 }, (_, i) =>
  rimTrees.slice(i * 5, i * 5 + 5),
);
const stanfordRimGroves = rimGroves
  .map((grove) => grove.filter(({ p: [x, , z] }) => onStanfordLand(x, z, 6)))
  .filter((grove) => grove.length);
const roads: Block[] = STANFORD_WALKS.map(([x, z, width, depth]) => [
  x,
  0.17,
  z,
  width,
  0.1,
  depth,
  "#c9b381",
]);
export function Landscape({ world = "stanford" }: { world?: WorldId }) {
  // Species character for every grove rendered after this in the island.
  setLookWorld(world);
  if (world === "home") return <HomeCoast />;
  return (
    <group>
      {world === "stanford" ? (
        <StanfordGround />
      ) : world === "korea" ? (
        <KoreaRiverGround />
      ) : (
        <>
          <Cylinder
            p={[0, -2.1, WORLD_ELLIPSE.centerZ]}
            s={[86.8, 4.2, WORLD_ELLIPSE.radiusZ + 2.3]}
            c="#655e3e"
          />
          <Cylinder
            p={[0, -0.5, WORLD_ELLIPSE.centerZ]}
            s={[87, 1, WORLD_ELLIPSE.radiusZ + 2.5]}
            c="#a49564"
          />
          <Cylinder
            p={[0, -0.01, WORLD_ELLIPSE.centerZ]}
            s={[86.5, 0.3, WORLD_ELLIPSE.radiusZ + 2]}
            c="#639343"
          />
        </>
      )}
      <Scenery world={world} />
      <MicroDetail world={world} />
      {world === "stanford" && (
        <group position={[campus.x, 0, campus.z]} rotation={[0, Math.PI, 0]}>
          <CampusDistrict />
        </group>
      )}
      <Cylinder
        p={[POND.x, POND_SURFACE.bedY, POND.z]}
        s={[6.4, POND_SURFACE.bedDepth, 4.4]}
        c="#736c50"
      />
      {/* Glossy pool: one flat disc at the old water surface height, so the
          bed below and the lawn around it keep their depth intervals. */}
      <mesh
        geometry={pondDisc}
        material={pondWater}
        position={[
          POND.x,
          POND_SURFACE.waterY + POND_SURFACE.waterDepth / 2,
          POND.z,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[POND.radiusX, POND.radiusZ, 1]}
        receiveShadow
        dispose={null}
      />
      {Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return (
          <Ball
            key={`pond-${i}`}
            p={[POND.x + Math.cos(a) * 6.3, 0.32, POND.z + Math.sin(a) * 4.3]}
            s={[0.5, 0.35, 0.45]}
            c={i % 2 ? "#8f9276" : "#b4b49a"}
          />
        );
      })}
      {/* Home and Korea own their paths. Stacking Stanford's grid beneath
          them produced coplanar intersections and paths through the river. */}
      {world === "stanford" && (
        <>
          <Blocks items={roads} />
        </>
      )}
      {world === "stanford" &&
        stanfordRimGroves.map((trees, i) => (
          <NaturalTrees key={i} trees={trees} />
        ))}
      <Bench p={[-2.7, 0.2, 3.4]} />
      <Bench p={[2.8, 0.2, -2.9]} rotation={Math.PI} />
      <NationalFlag
        nation={world === "korea" ? "kr" : "stanford"}
        p={[2.4, 0, -4.3]}
        height={4.5}
      />
    </group>
  );
}

function HomeCoast() {
  return (
    <group name="home-compact-coast">
      <HomeCoastArt />
      <MicroDetail world="home" />
      <Bench p={[-2.7, 0.2, 3.4]} />
      <Bench p={[2.8, 0.2, -2.9]} rotation={Math.PI} />
      <NationalFlag nation="us" p={[2.4, 0, -4.3]} height={4.5} />
    </group>
  );
}
