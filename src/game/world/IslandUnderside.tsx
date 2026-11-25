import * as THREE from "three";
import { undersideModel } from "../core/islandUnderside";
import type { WorldId } from "../core/worlds";
import { sculptedMaterial } from "./Surface";

const rockGeometries = new Map<WorldId, THREE.BufferGeometry>();
function rockGeometry(world: WorldId) {
  let geometry = rockGeometries.get(world);
  if (!geometry) {
    const { rock } = undersideModel(world);
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(rock.positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(rock.colors, 3),
    );
    // Non-indexed: every facet keeps its own normal and painted strata shade.
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    rockGeometries.set(world, geometry);
  }
  return geometry;
}
const rockMaterial = sculptedMaterial({ vertexColors: true, roughness: 1 });

/** Faceted rock strata hanging beneath each island. Art only: no colliders. */
export function IslandUnderside({
  world,
}: {
  world: WorldId;
  detail?: boolean;
}) {
  return (
    <group name="island-underside">
      <mesh
        geometry={rockGeometry(world)}
        material={rockMaterial}
        raycast={() => {}}
        dispose={null}
      />
    </group>
  );
}
