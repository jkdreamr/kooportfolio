import * as THREE from "three";
import { STANFORD_COAST, STANFORD_SHORE } from "../../shared/stanford-ground";
import { ccwLoop, offsetLoop, type P2 } from "../core/coast";
import { STANFORD_VERGE_Y } from "../core/terrain";
import { sculptedMaterial } from "./Surface";

function slab(outline: readonly P2[], top: number, bottom: number) {
  const shape = new THREE.Shape(
    outline.map(([x, z]) => new THREE.Vector2(x, z)),
  );
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: top - bottom,
    steps: 1,
    bevelEnabled: false,
  });
  // Shape lives in XY; map its Y to world Z and extrude downward from `top`.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, top, 0);
  geometry.computeVertexNormals();
  return geometry;
}

// The mown campus lawn is the walkable parcel, edged in sandstone. A kerb's
// drop below it, an unmown summer-gold verge rolls out along the viaduct on
// the rounded coast, over a sandstone lip and dark soil down to the shelf.
const lawn = ccwLoop(STANFORD_SHORE);
const layers = [
  [slab(offsetLoop(STANFORD_COAST, 0.42), -1.3, -4.2), "#655e3e"],
  [
    slab(offsetLoop(STANFORD_COAST, 0.24), STANFORD_VERGE_Y - 0.4, -1.3),
    "#a49564",
  ],
  [slab(STANFORD_COAST, STANFORD_VERGE_Y, STANFORD_VERGE_Y - 0.4), "#a9ab55"],
  [slab(offsetLoop(lawn, 0.16), -0.02, STANFORD_VERGE_Y - 0.1), "#c9b88a"],
  [slab(lawn, 0.14, -0.02), "#6e9148"],
] as const;

const materials = new Map<string, THREE.Material>();
const groundMaterial = (color: string) => {
  let material = materials.get(color);
  if (!material)
    materials.set(color, (material = sculptedMaterial({ color, roughness: 0.97 })));
  return material;
};

/** A compact Stanford-only coastline; no changes to other islands or landmark scale. */
export function StanfordGround() {
  return (
    <group>
      {layers.map(([geometry, color]) => (
        <mesh
          key={color}
          geometry={geometry}
          material={groundMaterial(color)}
          receiveShadow
          dispose={null}
        />
      ))}
    </group>
  );
}
