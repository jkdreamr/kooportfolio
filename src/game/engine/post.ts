import * as THREE from "three";
import { GRADE_GLSL } from "./grade";
import type { Tier } from "../../stage/contract";
import { TIER_BUDGETS } from "../../stage/contract";

/**
 * High-tier composer: scene → half-res N8AO → one effect pass (ACES + grade).
 * Loaded lazily, only for tiers that use it, inside a warm task. Medium/low
 * render straight to the canvas with the grade folded into tone mapping.
 */
export interface StagePost {
  render: (delta: number) => void;
  setSize: (width: number, height: number) => void;
  setCamera: (camera: THREE.Camera) => void;
  dispose: () => void;
}

const ACES_GLSL = /* glsl */ `
vec3 stageRRT( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}
vec3 stageACES( vec3 color, float exposure ) {
  const mat3 inputMat = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
  const mat3 outputMat = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
  color *= exposure / 0.6;
  color = inputMat * color;
  color = stageRRT( color );
  color = outputMat * color;
  return clamp( color, 0.0, 1.0 );
}
`;

export async function createStagePost(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  tier: Tier,
): Promise<StagePost | null> {
  if (TIER_BUDGETS[tier].ao !== "full") return null;
  const [pp, n8] = await Promise.all([import("postprocessing"), import("n8ao")]);
  const { EffectComposer, RenderPass, EffectPass, Effect, BlendFunction } = pp;
  class GradeEffect extends Effect {
    constructor() {
      super(
        "StageGrade",
        `${ACES_GLSL}\n${GRADE_GLSL}\nuniform float exposure;\nvoid mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {\n  outputColor = vec4(stageGrade(stageACES(inputColor.rgb, exposure)), inputColor.a);\n}`,
        {
          blendFunction: BlendFunction.SRC,
          uniforms: new Map([["exposure", new THREE.Uniform(gl.toneMappingExposure)]]),
        },
      );
    }
  }
  const size = gl.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(gl, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: Math.min(4, gl.capabilities.maxSamples),
  });
  const render = new RenderPass(scene, camera);
  const ao = new n8.N8AOPostPass(scene, camera, size.x, size.y);
  Object.assign(ao.configuration, {
    halfRes: true,
    depthAwareUpsampling: true,
    aoRadius: 2.2,
    distanceFalloff: 1.2,
    intensity: 2.2,
    aoSamples: 12,
    denoiseSamples: 6,
    denoiseRadius: 10,
    color: new THREE.Color("#1c2a3a"),
    gammaCorrection: false,
  });
  // Perspective/world-space radius tuned for metre-scale props.
  const grade = new GradeEffect();
  composer.addPass(render);
  composer.addPass(ao);
  composer.addPass(new EffectPass(camera, grade));
  composer.setSize(gl.domElement.clientWidth, gl.domElement.clientHeight, false);
  return {
    render(delta) {
      composer.render(delta);
    },
    setSize(width, height) {
      composer.setSize(width, height, false);
    },
    setCamera(next) {
      render.mainCamera = next;
      ao.camera = next;
    },
    dispose() {
      composer.dispose();
    },
  };
}
