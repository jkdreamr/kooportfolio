import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { runtime } from "../core/store";
import { FIELD_GOAL } from "../core/fieldGoal";

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
export function StadiumView({
  flying,
  ballRef,
  controlsRef,
}: {
  flying: boolean;
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

  useFrame(({ camera, size, scene }) => {
    const portrait = size.width < 700 && size.height > size.width;
    if (flying) {
      camera.position.set(0, 14, FIELD_GOAL.startZ + 13);
      camera.lookAt(
        0,
        Math.max(2, Math.min(7, (ballRef.current?.position.y ?? 0) * 0.4)),
        (FIELD_GOAL.startZ + FIELD_GOAL.goalZ) / 2,
      );
    } else {
      camera.position.set(runtime.x + 5, 11, runtime.z + 13);
      camera.lookAt(runtime.x, 1, runtime.z - 3);
    }
    camera.updateMatrixWorld();
    if (controlsRef.current) {
      const panelWidth = Math.min(250, size.width - 144);
      const x = portrait ? size.width - 18 - panelWidth / 2 : size.width - 180;
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
