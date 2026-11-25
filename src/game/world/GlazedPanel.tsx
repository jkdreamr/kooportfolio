import * as THREE from "three";

// Shared, inexpensive glazing: no screen-space transmission render pass.
// Authored glints keep it readable in the village's environment-map-free light.
const pane = new THREE.BoxGeometry(1, 1, 1);
const glass = new THREE.MeshPhysicalMaterial({
  color: "#b5d1e0",
  roughness: 0.14,
  metalness: 0.16,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  transparent: true,
  opacity: 0.44,
  depthWrite: false,
});
const glint = new THREE.MeshBasicMaterial({
  color: "#edf7ff",
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
  toneMapped: false,
});

/** Decorative glazing only; never changes the world's walking/click surfaces. */
export function GlazedPanel({
  position,
  size,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
}) {
  const [width, height, depth] = size;
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={pane} material={glass} scale={size} dispose={null} />
      <mesh
        geometry={pane}
        material={glint}
        position={[-width * 0.22, height * 0.08, depth / 2 + 0.006]}
        scale={[width * 0.055, height * 0.66, 0.008]}
        rotation={[0, 0, -0.32]}
        dispose={null}
      />
      <mesh
        geometry={pane}
        material={glint}
        position={[0, height / 2 - 0.015, depth / 2 + 0.008]}
        scale={[width * 0.94, 0.018, 0.008]}
        dispose={null}
      />
    </group>
  );
}
