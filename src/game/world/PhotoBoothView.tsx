import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, OrthographicCamera, Quaternion, Vector3 } from "three";
import { useGameMode } from "../core/gameMode";
import { PHOTO_BOOTH_ORIGIN } from "../core/photoBoothLayout";

const [x, , z] = PHOTO_BOOTH_ORIGIN;
const forward = new Quaternion();

export function PhotoBoothView() {
  const active = useGameMode((state) => state.active?.id === "photo-booth");
  const invalidate = useThree((state) => state.invalidate);
  const from = useRef<{
    position: Vector3;
    rotation: Quaternion;
    zoom: number;
    elapsed: number;
  }>(null);
  const target = useRef(new Vector3());

  useEffect(() => invalidate(), [active, invalidate]);

  useFrame(({ camera, size }, delta) => {
    if (!(camera instanceof OrthographicCamera)) return;
    if (!active) {
      if (from.current) {
        camera.position.copy(from.current.position);
        camera.quaternion.copy(from.current.rotation);
        camera.zoom = from.current.zoom;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        from.current = null;
      }
      return;
    }
    const start = (from.current ??= {
      position: camera.position.clone(),
      rotation: camera.quaternion.clone(),
      zoom: camera.zoom,
      elapsed: 0,
    });
    start.elapsed += Math.max(1 / 60, Math.min(delta, 0.05));
    const progress = MathUtils.smoothstep(start.elapsed, 0, 0.42);
    const stacked = size.width <= 760;
    const zoom = stacked
      ? Math.min(240, size.width / 3, size.height / 3.4)
      : Math.min(340, size.width / 3.9, size.height / 2.5);
    target.current.set(x + (stacked ? 0 : 0.85), stacked ? 0.8 : 1.62, z + 1.1);
    camera.position.lerpVectors(start.position, target.current, progress);
    camera.quaternion.slerpQuaternions(start.rotation, forward, progress);
    camera.zoom = MathUtils.lerp(start.zoom, zoom, progress);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    if (progress < 1) invalidate();
  }, -1);
  return null;
}
