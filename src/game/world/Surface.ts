import * as THREE from "three";

/** Broad, painted light-to-shade variation, not paper grain or surface noise.
 * The normal comes from Three's normal pipeline, including instancing.
 * Standard lighting, cast shadows and the time-of-day rig still do the work.
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
        "#include <common>\nvarying vec3 vSculptNormal;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float sculptLight = smoothstep(-0.65, 0.85, normalize(vSculptNormal).y);
        diffuseColor.rgb *= mix(vec3(0.78, 0.83, 0.88), vec3(1.04, 1.02, 0.98), sculptLight);`,
      );
  };
  material.customProgramCacheKey = () => "sculpted-surface-v1";
  return material;
}
