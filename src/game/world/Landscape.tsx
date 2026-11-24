import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Box, Cylinder, Ball, Bench, Boat, Cone } from "./Models";
import { NaturalTrees, type TreePlacement } from "./TreeArt";
import { KoreaRiverGround } from "./KoreaRiverGround";
import { GroundGrass, Scenery } from "./Scenery";
import type { GroundFootprint } from "../core/scenery";
import { NationalFlag } from "./NationalFlag";
import { CampusDistrict } from "./CampusDistrict";
import { campus } from "../core/campus";
import { POND, POND_SURFACE } from "../core/pond";
import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import type { WorldId } from "../core/worlds";
import { STANFORD_WALKS } from "../core/stanfordLayout";
import { doorsInWorld } from "../core/world";
import {
  isKoreaLandmarkArea,
  KOREA_LANDMARK_CANOPY_CLEARANCE,
} from "../core/koreaLandmarks";

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
const koreaRimGroves = rimGroves.map((grove) =>
  grove.filter(
    ({ p: [x, , z] }) =>
      !isKoreaLandmarkArea(x, z, KOREA_LANDMARK_CANOPY_CLEARANCE),
  ),
);
const masonry: Block[] = [];
for (let i = 0; i < 125; i++) {
  const angle = Math.PI + (i / 124) * Math.PI;
  const x = Math.cos(angle) * WORLD_ELLIPSE.radiusX,
    z = Math.sin(angle) * (WORLD_ELLIPSE.radiusZ - 0.5) + WORLD_ELLIPSE.centerZ;
  masonry.push([
    x,
    0.55,
    z,
    1.14,
    1,
    0.85,
    i % 2 ? "#8f9276" : "#a4a98c",
    -angle,
  ]);
  masonry.push([x, 1.13, z, 1.23, 0.24, 0.98, "#c2c3a0", -angle]);
  if (i % 5 === 0)
    masonry.push([x, 1.48, z, 0.72, 0.55, 0.8, "#b1b48f", -angle]);
}
const roads: Block[] = STANFORD_WALKS.map(([x, z, width, depth]) => [
  x,
  0.17,
  z,
  width,
  0.1,
  depth,
  "#c9b381",
]);
const roadFootprints = roads.map<GroundFootprint>(
  ([x, , z, width, , depth]) => [x, z, width, depth],
);

export function Landscape({ world = "stanford" }: { world?: WorldId }) {
  const grassAvoid = useMemo(
    () => [
      ...roadFootprints,
      ...doorsInWorld("stanford").map<GroundFootprint>(
        ({ footprint: [x, z, hx, hz] }) => [x, z, hx * 2 + 1, hz * 2 + 1],
      ),
    ],
    [],
  );
  return (
    <group>
      {world === "korea" ? (
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
      <Cylinder
        p={[POND.x, POND_SURFACE.waterY, POND.z]}
        s={[POND.radiusX, POND_SURFACE.waterDepth, POND.radiusZ]}
        c="#459d96"
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
      <Blocks items={masonry} shadow />
      {/* Home and Korea own their paths. Stacking Stanford's grid beneath
          them produced coplanar intersections and paths through the river. */}
      {world === "stanford" && (
        <>
          <Blocks items={roads} />
          <GroundGrass avoid={grassAvoid} />
        </>
      )}
      <Cylinder p={[-9, -1.1, 98]} s={[55, 1.8, 13.5]} c="#387b78" />
      <Cylinder p={[-9, -0.12, 98]} s={[54.2, 0.25, 13.2]} c="#459d96" />
      {Array.from({ length: 17 }, (_, i) => (
        <Box
          key={i}
          p={[Math.sin(i * 3.2) * 40 - 9, 0.03, 97.2 + (i % 5)]}
          s={[1.1 + (i % 3), 0.01, 0.035]}
          c="#99d4bf"
        />
      ))}
      <group position={[-28, 0.2, world === "stanford" ? 94.8 : 93]}>
        <Box s={[3.3, 0.25, 6.1]} c="#805d36" />
        {Array.from({ length: 14 }, (_, i) => (
          <Box
            key={i}
            p={[0, 0.15, i * 0.42 - 2.65]}
            s={[3.5, 0.15, 0.36]}
            c={i % 2 ? "#b88a54" : "#c69b61"}
          />
        ))}
        {[-1.4, 1.4].flatMap((x) =>
          [-2.7, 2.7].map((z) => (
            <Cylinder
              key={`${x}:${z}`}
              p={[x, -0.5, z]}
              s={[0.16, 1.7, 0.16]}
              c="#6e5138"
            />
          )),
        )}
      </group>
      <group
        position={world === "stanford" ? [-23, 0.075, 105.5] : [-23, 0.1, 98]}
        rotation={[0, 1.4, 0]}
      >
        <Boat pace={0} color="#edc96e" />
      </group>
      {(world === "korea" ? koreaRimGroves : rimGroves).map((trees, i) => (
        <NaturalTrees key={i} trees={trees} />
      ))}
      {world === "home" && <Windmill />}
      <Bench p={[-2.7, 0.2, 3.4]} />
      <Bench p={[2.8, 0.2, -2.9]} rotation={Math.PI} />
      {[-1, 1].map((side) => (
        <NationalFlag
          key={side}
          nation={side === 1 ? "us" : "kr"}
          p={[side * 2.4, 0, -4.3]}
          height={4.5}
        />
      ))}
    </group>
  );
}

function Windmill() {
  return (
    <group position={[-34, 0, -24]} scale={0.8}>
      <Cylinder p={[0, 1.9, 0]} s={[1.5, 3.8, 1.5]} c="#c5b188" />
      <Box p={[0, 4.2, 0]} s={[2.5, 1.6, 2.1]} c="#8d593b" />
      <Cone p={[0, 5.6, 0]} s={[2, 1.5, 1.8]} c="#c25132" />
      <group position={[0, 4.4, 1.3]} rotation={[0, 0, 0.7]}>
        <Box s={[6, 0.25, 0.25]} c="#68492f" />
        <Box s={[0.25, 6, 0.25]} c="#68492f" />
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <Box p={[1.9, 0.4, 0]} s={[1.7, 0.8, 0.15]} c="#e9d59b" />
          </group>
        ))}
        <Ball s={[0.35, 0.35, 0.25]} c="#c7984f" />
      </group>
    </group>
  );
}
