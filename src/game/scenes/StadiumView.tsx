import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { runtime } from "../core/store";
import { FIELD_GOAL } from "../core/fieldGoal";
import { stadiumCameraFrame, stadiumViewOffset } from "../core/stadiumCamera";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 zenith;
  uniform vec3 horizon;
  varying vec2 vUv;
  void main() {
    vec3 sky = mix(horizon, zenith, smoothstep(0.0, 1.0, vUv.y));
    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Walking stays player-scale; a broadcast cut follows the full kick arc. */
/** The backdrop's shaders, for the idle prewarm (engine/prewarm.ts) to
 * compile its program before the first visit. */
export const STADIUM_BACKDROP_SHADERS = { vertexShader, fragmentShader } as const;

export function StadiumView({
  playing,
  ballRef,
  controlsRef,
}: {
  playing: boolean;
  ballRef: React.RefObject<THREE.Group | null>;
  controlsRef: React.RefObject<THREE.Group | null>;
}) {
  const uniforms = useMemo(
    () => ({
      zenith: { value: new THREE.Color("#10283e") },
      horizon: { value: new THREE.Color("#718d9a") },
    }),
    [],
  );
  const anchor = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const nextTarget = useMemo(() => new THREE.Vector3(), []);
  const wasPlaying = useRef(false);

  useFrame(({ camera, size, scene }, delta) => {
    const portrait = size.width < 700 && size.height > size.width;
    if (camera instanceof THREE.PerspectiveCamera) {
      const offset = playing ? stadiumViewOffset(size.width, size.height) : 0;
      if (
        offset &&
        (!camera.view?.enabled ||
          camera.view.offsetX !== offset ||
          camera.view.fullWidth !== size.width ||
          camera.view.fullHeight !== size.height)
      )
        camera.setViewOffset(
          size.width,
          size.height,
          offset,
          0,
          size.width,
          size.height,
        );
      else if (!offset && camera.view?.enabled) camera.clearViewOffset();
    }
    const frame = stadiumCameraFrame(
      runtime,
      playing,
      ballRef.current?.position.toArray() ?? [0, 0.48, FIELD_GOAL.startZ],
      portrait,
    );
    camera.position.set(...frame.position);
    nextTarget.set(...frame.target);
    if (!playing || !wasPlaying.current) target.copy(nextTarget);
    else target.lerp(nextTarget, 1 - Math.exp(-10 * delta));
    wasPlaying.current = playing;
    camera.lookAt(target);
    camera.updateMatrixWorld();
    if (controlsRef.current) {
      const x = size.width - 78;
      const y = size.height - (size.height < 500 ? 96 : 140);
      controlsRef.current.position.copy(
        anchor
          .set((x / size.width) * 2 - 1, 1 - (y / size.height) * 2, 0)
          .unproject(camera),
      );
      controlsRef.current.updateWorldMatrix(true, false);
    }
    // Shared time-of-day lighting remains readable; only the outdoor backdrop
    // and its distant fog are stadium-specific.
    scene.fog?.color.copy(uniforms.horizon.value);
  });

  return (
    <>
      <PerspectiveCamera makeDefault fov={56} near={0.1} far={180} />
      <mesh frustumCulled={false} renderOrder={-999} raycast={() => {}}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
