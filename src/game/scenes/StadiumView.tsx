import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

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

/** Walker owns movement; the stadium keeps both end zones in its own camera. */
export function StadiumView() {
  const uniforms = useMemo(
    () => ({
      zenith: { value: new THREE.Color("#10283e") },
      horizon: { value: new THREE.Color("#718d9a") },
    }),
    [],
  );

  useFrame(({ camera, size, scene }) => {
    const portrait = size.width < 700 && size.height > size.width;
    // Follow-free portrait framing keeps both end zones in view, instead of
    // pushing the entire stadium into the upper half as the player exits.
    camera.position.set(
      portrait ? 4.5 : 18,
      portrait ? 38 : 28,
      portrait ? 22 : 30,
    );
    camera.lookAt(0, 0.5, 0);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.max(
        5,
        portrait
          ? Math.min((size.width - 24) / 13.5, (size.height - 240) / 23)
          : Math.min(36, (size.width - 60) / 32, (size.height - 170) / 26),
      );
      camera.updateProjectionMatrix();
    }
    // Shared time-of-day lighting remains readable; only the outdoor backdrop
    // and its distant fog are stadium-specific.
    scene.fog?.color.copy(uniforms.horizon.value);
  });

  return (
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
  );
}
