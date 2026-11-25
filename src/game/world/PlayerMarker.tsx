import { useRef } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// A small, solid-cut arrow: the point stays anchored above the hat while the
// rest grows upward at overview zoom. No texture or scene-transmission pass.
const outline = new THREE.Shape();
outline.moveTo(0, 0);
outline.lineTo(-0.36, 0.4);
outline.lineTo(-0.13, 0.4);
outline.lineTo(-0.13, 0.8);
outline.lineTo(0.13, 0.8);
outline.lineTo(0.13, 0.4);
outline.lineTo(0.36, 0.4);
outline.closePath();
const glass = new THREE.ExtrudeGeometry(outline, {
  depth: 0.13,
  bevelEnabled: true,
  bevelThickness: 0.035,
  bevelSize: 0.025,
  bevelSegments: 2,
  steps: 1,
  curveSegments: 1,
});
glass.translate(0, 0.025, -0.065);
const rim = new THREE.EdgesGeometry(glass, 35);
const glints = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-0.095, 0.75, 0.105),
  new THREE.Vector3(-0.095, 0.48, 0.105),
  new THREE.Vector3(-0.28, 0.405, 0.105),
  new THREE.Vector3(-0.025, 0.12, 0.105),
]);
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: "#c2e0ec",
  metalness: 0.12,
  roughness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
  transparent: true,
  opacity: 0.74,
  emissive: "#64899b",
  emissiveIntensity: 0.22,
  depthTest: false,
  depthWrite: false,
  fog: false,
});
const rimMaterial = new THREE.LineBasicMaterial({
  color: "#426779",
  transparent: true,
  opacity: 0.8,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
  fog: false,
});
const glintMaterial = new THREE.LineBasicMaterial({
  color: "#ffffff",
  transparent: true,
  opacity: 0.95,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
  fog: false,
});
const noRaycast = () => {};

export function PlayerMarker() {
  const marker = useRef<THREE.Group>(null);
  const worldScale = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const group = marker.current;
    if (!group?.parent || !(camera instanceof THREE.OrthographicCamera)) return;
    group.parent.getWorldScale(worldScale.current);
    // Remain legible on a whole-island/mobile view, without changing the
    // avatar, camera or collision size. Facing the camera prevents edge-on turns.
    group.scale.setScalar(
      Math.max(1, 24 / (0.85 * camera.zoom * worldScale.current.y)),
    );
  });
  return (
    <Billboard ref={marker} name="player-location-arrow" position={[0, 2.5, 0]}>
      <group dispose={null}>
        <mesh
          geometry={glass}
          material={glassMaterial}
          renderOrder={1000}
          raycast={noRaycast}
        />
        <lineSegments
          geometry={rim}
          material={rimMaterial}
          renderOrder={1001}
          raycast={noRaycast}
        />
        <lineSegments
          geometry={glints}
          material={glintMaterial}
          renderOrder={1002}
          raycast={noRaycast}
        />
      </group>
    </Billboard>
  );
}
