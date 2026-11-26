import * as THREE from "three";

/** Sky colour of the rim sheen, already scaled (≤0.12). Game's Sun drives it
 * from the live hemisphere light, so it follows the time-of-day rig. */
export const surfaceSky = { value: new THREE.Color(0, 0, 0) };

/** Broad, painted light-to-shade variation, not paper grain or surface noise.
 * The normal comes from Three's normal pipeline, including instancing.
 * Standard lighting, cast shadows and the time-of-day rig still do the work.
 * A faint sky-tinted rim on faces turning away from the camera gives rounded
 * edges a glazed, ceramic read without textures or post-processing.
 */
export function sculptedMaterial(
  options: THREE.MeshStandardMaterialParameters = {},
) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.76,
    metalness: 0,
    ...options,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfaceSky = surfaceSky;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSculptNormal;",
      )
      .replace(
        "#include <defaultnormal_vertex>",
        `#include <defaultnormal_vertex>
        vSculptNormal = inverseTransformDirection(transformedNormal, viewMatrix);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSculptNormal;\nuniform vec3 uSurfaceSky;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float sculptLight = smoothstep(-0.65, 0.85, normalize(vSculptNormal).y);
        diffuseColor.rgb *= mix(vec3(0.78, 0.83, 0.88), vec3(1.04, 1.02, 0.98), sculptLight);`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        float sculptRim = 1.0 - saturate(dot(geometryNormal, geometryViewDir));
        sculptRim = sculptRim * sculptRim * sculptRim * (0.35 + 0.65 * sculptLight);
        reflectedLight.indirectSpecular += uSurfaceSky * sculptRim;`,
      );
  };
  material.customProgramCacheKey = () => "sculpted-surface-v2";
  return material;
}
