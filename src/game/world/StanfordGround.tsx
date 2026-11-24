import * as THREE from "three";
import { STANFORD_SHORE } from "../../shared/stanford-ground";

const shore = new THREE.Shape();
STANFORD_SHORE.forEach(([x, z], i) =>
  i ? shore.lineTo(x, z) : shore.moveTo(x, z),
);
shore.closePath();
const ground = new THREE.ExtrudeGeometry(shore, {
  depth: 1,
  steps: 1,
  bevelEnabled: false,
}).rotateX(Math.PI / 2);

/** A compact Stanford-only coastline; no changes to other islands or landmark scale. */
export function StanfordGround() {
  return (
    <group>
      {(
        [
          [-0.8, 3.4, 1.02, "#655e3e"],
          [-0.16, 0.64, 1.012, "#a49564"],
          [0.14, 0.3, 1, "#639343"],
        ] as const
      ).map(([y, depth, rim, color]) => (
        <mesh
          key={color}
          geometry={ground}
          position={[0, y, 0]}
          scale={[rim, depth, rim]}
          receiveShadow
          dispose={null}
        >
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
