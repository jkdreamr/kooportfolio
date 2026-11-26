import * as THREE from "three";
import { TELEPHOTO_FOV, zoomToDistance } from "../../stage/contract";

/**
 * Camera helpers shared by every scene that used to drive an
 * OrthographicCamera. Gameplay code thinks in "view zoom" (pixels per world
 * unit at the target, the old ortho zoom); the persistent perspective camera
 * converts that to a viewing distance along the same offset direction.
 */
const scratch = new THREE.Vector3();

/** The old ortho zoom this camera currently represents. */
export function viewZoom(camera: THREE.Camera): number {
  if (camera instanceof THREE.OrthographicCamera) return camera.zoom;
  const stored = camera.userData.viewZoom;
  return typeof stored === "number" ? stored : 1;
}

/**
 * Frame `target` from the direction of `offset` at the given view zoom.
 * Ortho cameras: position = target + offset, zoom = zoom (old behaviour).
 * Perspective cameras: position = target + |offset|̂ · distance(zoom).
 */
export function aimCamera(
  camera: THREE.Camera,
  target: THREE.Vector3Like,
  offset: THREE.Vector3Like,
  zoom: number,
  viewportHeight: number,
) {
  if (camera instanceof THREE.OrthographicCamera) {
    camera.position.set(
      target.x + offset.x,
      target.y + offset.y,
      target.z + offset.z,
    );
    camera.lookAt(target.x, target.y, target.z);
    if (camera.zoom !== zoom) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    return;
  }
  const perspective = camera as THREE.PerspectiveCamera;
  const fov = perspective.isPerspectiveCamera ? perspective.fov : TELEPHOTO_FOV;
  const distance = zoomToDistance(zoom, Math.max(1, viewportHeight), fov);
  scratch.set(offset.x, offset.y, offset.z).normalize();
  camera.position.set(
    target.x + scratch.x * distance,
    target.y + scratch.y * distance,
    target.z + scratch.z * distance,
  );
  camera.lookAt(target.x, target.y, target.z);
  camera.userData.viewZoom = zoom;
  camera.userData.viewDistance = distance;
  if (perspective.isPerspectiveCamera) {
    // Keep depth precision proportional to distance; the island hangs below.
    const near = Math.max(0.1, distance * 0.04);
    const far = distance + 700;
    if (perspective.near !== near || perspective.far !== far) {
      perspective.near = near;
      perspective.far = far;
      perspective.updateProjectionMatrix();
    }
  }
}
