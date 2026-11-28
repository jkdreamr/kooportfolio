import { useRef } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { viewZoom } from "../engine/camera";
import { viewRuntime } from "../core/worldView";

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
/** For the idle prewarm (engine/prewarm.ts): the marker is drawn in every
 * room, under each room's own light set. */
export const PLAYER_MARKER_MATERIALS = [glassMaterial, rimMaterial] as const;
const noRaycast = () => {};
const at = new THREE.Vector3();

/**
 * How much to grow the arrow. The village cameras store their view zoom
 * (orthographic zoom, or `userData.viewZoom` on the perspective rig) and the
 * arrow grows as that zooms out. A room's own perspective camera (the
 * stadium's broadcast camera) stores none: reading it as zoom 1 blew the
 * arrow up 28× into a glass wedge across the field, so there the arrow keeps
 * a small on-screen size from its real distance instead.
 */
export function markerScale(camera: THREE.Camera, marker: THREE.Object3D): number {
  if (camera instanceof THREE.PerspectiveCamera && typeof camera.userData.viewZoom !== "number") {
    marker.getWorldPosition(at);
    const view = 2 * camera.position.distanceTo(at) * Math.tan((camera.fov * Math.PI) / 360);
    // About 4% of the screen height for the 0.8-unit arrow.
    return (0.04 * view) / 0.8;
  }
  return 24 / (0.85 * viewZoom(camera));
}

export function PlayerMarker() {
  const marker = useRef<THREE.Group>(null);
  const worldScale = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const group = marker.current;
    if (!group?.parent) return;
    // The explore camera sits right behind the player: no locator arrow.
    group.visible = viewRuntime.blend < 0.5;
    if (!group.visible) return;
    group.parent.getWorldScale(worldScale.current);
    // Remain legible on a whole-island/mobile view, without changing the
    // avatar, camera or collision size. Facing the camera prevents edge-on turns.
    group.scale.setScalar(Math.max(1, markerScale(camera, group) / worldScale.current.y));
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
