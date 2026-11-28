import * as THREE from "three";

/**
 * One instanced, self-lit batch for every court cue (shuttle shadow, landing
 * ring, reach ring, line-call highlight, trail): one draw, one program. Each
 * instance carries `aMark` = (inner radius, edge softness, alpha) in the
 * unit quad's radius; inner < 0 makes a soft-edged rectangle instead of a
 * disc (stretched by the instance scale into a line highlight).
 * A module material so the idle prewarm (engine/prewarm.ts) links this exact
 * program before the first match.
 */
export const BADMINTON_MARK_COUNT = 16;

export const badmintonMarkMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  fog: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
badmintonMarkMaterial.customProgramCacheKey = () => "badminton-mark-v1";
badmintonMarkMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec3 aMark;\nvarying vec3 vMark;\nvarying vec2 vMarkUv;",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvMark = aMark;\nvMarkUv = uv - 0.5;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vMark;\nvarying vec2 vMarkUv;",
    )
    .replace(
      "#include <alphamap_fragment>",
      `#include <alphamap_fragment>
float markR = vMark.x < 0.0 ? 2.0 * max(abs(vMarkUv.x), abs(vMarkUv.y)) : 2.0 * length(vMarkUv);
float markA = 1.0 - smoothstep(1.0 - vMark.y, 1.0, markR);
if (vMark.x > 0.0) markA *= smoothstep(vMark.x - vMark.y, vMark.x, markR);
diffuseColor.a *= markA * vMark.z;
if (diffuseColor.a < 0.004) discard;`,
    );
};

/** Unit quad facing +z; floor marks rotate it flat per instance. */
export function badmintonMarkGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute(
    "aMark",
    new THREE.InstancedBufferAttribute(
      new Float32Array(BADMINTON_MARK_COUNT * 3),
      3,
    ),
  );
  return geometry;
}
