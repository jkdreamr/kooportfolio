import * as THREE from "three";
import { TIER_BUDGETS, useStage } from "../../../stage/contract";
import { viewRuntime } from "../../core/worldView";

/**
 * Planar water reflection (PLAN2 §1.5): one shared reflector, rendered from
 * a water mesh's `onBeforeRender` (the three.js Reflector pattern: mirrored
 * camera, oblique near-plane clipping, never `renderer.clippingPlanes`).
 *
 * - Renders layer `REFLECT_LAYER` only: terrain, cliffs, rocks, bakes,
 *   crowns, leaf shell and the sky. Grass, understory, NPCs and labels stay
 *   on layer 0. The scene's lights are put on the layer too, so the light
 *   set (part of every program key) is the same as the main pass.
 * - Runs only inside a render-target pass (the composer's scene pass): the
 *   output colour space and tone mapping then match the main pass, so the
 *   reflection never links a program. Direct-to-canvas tiers keep the
 *   painted streaks.
 * - Saves and restores the render target, forces no shadow update and keeps
 *   `renderer.info` counting the whole frame.
 * - Tier: "planar" = half-resolution, every 2nd frame; "planar-lite" = 256 px
 *   tall, every 4th frame, 60-unit far plane (80 on high), off on
 *   software renderers;
 *   "none" = the painted streaks only. Only while the view blend is above
 *   0.3 and the camera's elevation is below 30°. The diorama keeps the
 *   painted reflection.
 */

export const REFLECT_LAYER = 1;

/** Shared by every water material (bound from the first compile). */
export const reflectionUniforms = {
  uWaterReflection: { value: null as THREE.Texture | null },
  uWaterReflectMatrix: { value: new THREE.Matrix4() },
};
const fallback = new THREE.DataTexture(new Uint8Array([150, 180, 200, 255]), 1, 1);
fallback.name = "env-reflection-fallback";
fallback.needsUpdate = true;
reflectionUniforms.uWaterReflection.value = fallback;

/** Reflection statistics for QA (calls / triangles of the last pass). */
export const reflectionStats = { frames: 0, calls: 0, triangles: 0, active: false, height: 0 };

let target: THREE.WebGLRenderTarget | null = null;
const virtualCamera = new THREE.PerspectiveCamera();
virtualCamera.userData.reflection = true;
virtualCamera.layers.set(REFLECT_LAYER);
const plane = new THREE.Plane(),
  clip = new THREE.Vector4(),
  q = new THREE.Vector4(),
  normal = new THREE.Vector3(0, 1, 0),
  planePoint = new THREE.Vector3(),
  eye = new THREE.Vector3(),
  look = new THREE.Vector3(),
  mirrorEye = new THREE.Vector3(),
  mirrorLook = new THREE.Vector3(),
  forward = new THREE.Vector3(),
  rotation = new THREE.Matrix4(),
  bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

let software: boolean | null = null;
function isSoftware(gl: THREE.WebGLRenderer) {
  if (software !== null) return software;
  const context = gl.getContext();
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const name = String(
    info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER),
  );
  return (software = /swiftshader|llvmpipe|software|basic render/i.test(name));
}

let lastFrame = -1;
let tick = 0;
/** Called once per frame by the environment driver (cadence + guard). */
export function tickReflection() {
  tick++;
}
const bufferSize = new THREE.Vector2();
let litScene: THREE.Scene | null = null;
let renderedPlane = NaN;
/** Strength of the projected reflection this frame (0 = painted only). */
let mix = 0;

/** Per-water-material uniform objects, so each surface takes the mirror only
 * when it lies in the reflector's plane. */
export function reflectMixUniform(material: THREE.Material) {
  return ((material.userData.reflectMix as { value: number } | undefined) ??=
    (material.userData.reflectMix = { value: 0 }));
}

function enableLights(scene: THREE.Scene) {
  if (litScene === scene) return;
  litScene = scene;
  scene.traverse((object) => {
    if ((object as THREE.Light).isLight) object.layers.enable(REFLECT_LAYER);
  });
}

function mode(gl: THREE.WebGLRenderer) {
  const tier = useStage.getState().tier ?? "low";
  const reflection = TIER_BUDGETS[tier].reflection;
  if (reflection === "planar-lite" && isSoftware(gl)) return "none";
  return reflection;
}

function render(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  height: number,
  lite: boolean,
) {
  const current = gl.getRenderTarget();
  const size = gl.getDrawingBufferSize(bufferSize);
  const h = lite ? 256 : Math.max(64, Math.round(size.y / 2));
  const w = Math.max(64, Math.round((h * size.x) / Math.max(1, size.y)));
  if (!target) {
    target = new THREE.WebGLRenderTarget(w, h, {
      type: current?.texture.type ?? THREE.HalfFloatType,
      depthBuffer: true,
      samples: 0,
    });
    target.texture.name = "env-reflection";
    target.texture.generateMipmaps = false;
  } else if (target.width !== w || target.height !== h) target.setSize(w, h);

  // Mirror the eye and the look point through y = height.
  camera.updateMatrixWorld();
  eye.setFromMatrixPosition(camera.matrixWorld);
  rotation.extractRotation(camera.matrixWorld);
  forward.set(0, 0, -1).applyMatrix4(rotation);
  look.copy(eye).add(forward);
  planePoint.set(eye.x, height, eye.z);
  mirrorEye.copy(eye).setY(2 * height - eye.y);
  mirrorLook.copy(look).setY(2 * height - look.y);
  virtualCamera.position.copy(mirrorEye);
  virtualCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
  virtualCamera.lookAt(mirrorLook);
  virtualCamera.fov = camera.fov;
  virtualCamera.aspect = camera.aspect;
  virtualCamera.near = camera.near;
  // Far plane: what a water surface can plausibly mirror (budget §1.5).
  virtualCamera.far = Math.min(camera.far, lite ? 60 : 80);
  virtualCamera.updateProjectionMatrix();
  virtualCamera.updateMatrixWorld();
  reflectionUniforms.uWaterReflectMatrix.value
    .copy(bias)
    .multiply(virtualCamera.projectionMatrix)
    .multiply(virtualCamera.matrixWorldInverse);

  // Oblique near plane = the water plane (Lengyel), in the mirrored view.
  plane.setFromNormalAndCoplanarPoint(normal, planePoint).applyMatrix4(virtualCamera.matrixWorldInverse);
  clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const p = virtualCamera.projectionMatrix.elements;
  q.set((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
  clip.multiplyScalar(2 / clip.dot(q));
  p[2] = clip.x;
  p[6] = clip.y;
  p[10] = clip.z + 1 - 0.003;
  p[14] = clip.w;
  virtualCamera.projectionMatrixInverse.copy(virtualCamera.projectionMatrix).invert();

  const shadowAuto = gl.shadowMap.autoUpdate,
    shadowNeeds = gl.shadowMap.needsUpdate,
    infoReset = gl.info.autoReset;
  const calls = gl.info.render.calls,
    triangles = gl.info.render.triangles;
  gl.shadowMap.autoUpdate = false;
  gl.shadowMap.needsUpdate = false;
  gl.info.autoReset = false;
  gl.setRenderTarget(target);
  gl.state.buffers.depth.setMask(true);
  if (!gl.autoClear) gl.clear();
  gl.render(scene, virtualCamera);
  gl.setRenderTarget(current);
  gl.info.autoReset = infoReset;
  gl.shadowMap.autoUpdate = shadowAuto;
  gl.shadowMap.needsUpdate = shadowNeeds;
  reflectionStats.calls = gl.info.render.calls - calls;
  reflectionStats.triangles = gl.info.render.triangles - triangles;
  reflectionStats.frames++;
  reflectionUniforms.uWaterReflection.value = target.texture;
}

const inRender = { value: false };
/**
 * Give a water mesh the reflector. Its material must come from
 * `waterMaterial` (it reads `reflectMixUniform`).
 */
export function attachReflection(mesh: THREE.Mesh) {
  const material = mesh.material as THREE.Material;
  const own = reflectMixUniform(material);
  const box = new THREE.Box3();
  let height = NaN;
  mesh.onBeforeRender = (gl, scene, camera) => {
    if (inRender.value || camera.userData.reflection) return;
    const frame = tick;
    if (!Number.isFinite(height)) {
      // The water plane's world height (static meshes: measured once).
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
      height = (box.min.y + box.max.y) / 2;
    }
    if (frame !== lastFrame) {
      lastFrame = frame;
      const reflection = mode(gl);
      const blend = viewRuntime.blend;
      const perspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
      camera.getWorldDirection(forward);
      const elevation = Math.asin(THREE.MathUtils.clamp(-forward.y, -1, 1));
      const ok =
        reflection !== "none" &&
        perspective &&
        blend > 0.3 &&
        elevation < THREE.MathUtils.degToRad(30) &&
        camera.position.y > height + 0.2 &&
        gl.getRenderTarget() !== null;
      reflectionStats.active = ok;
      mix = ok ? THREE.MathUtils.smoothstep(blend, 0.3, 0.7) : 0;
      if (ok) {
        const every = reflection === "planar" ? 2 : 4;
        if (!Number.isFinite(renderedPlane) || frame % every === 0 || Math.abs(renderedPlane - height) > 0.05) {
          enableLights(scene);
          inRender.value = true;
          try {
            render(gl, scene, camera as THREE.PerspectiveCamera, height, reflection === "planar-lite");
            renderedPlane = height;
            reflectionStats.height = height;
          } finally {
            inRender.value = false;
          }
        }
      } else renderedPlane = NaN;
    }
    own.value = Math.abs(height - renderedPlane) < 0.05 ? mix : 0;
  };
}

/** Put an object (and its subtree) in the reflection as well as the view. */
export function reflect(object: THREE.Object3D | null): void {
  object?.traverse((child) => child.layers.enable(REFLECT_LAYER));
}
