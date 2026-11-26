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
 *   tall, every 4th frame, 45-unit far plane (60 on high), off on
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
// Alpha 0: "open sky" to the water shader, which shades it itself.
const fallback = new THREE.DataTexture(new Uint8Array([150, 180, 200, 0]), 1, 1);
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

/**
 * Reflection culling (budget §1.5). A reflected object can only show where
 * there is water on screen, so the pass draws only what the mirrored camera
 * sees through the water's own screen rectangle (a sub-frustum whose near
 * plane is the water plane), within the far plane, and not too small to read
 * at the target's resolution. Layer-1 meshes outside it leave the layer for
 * the one render (a layer bit, never a material or program change). The pass
 * is also scissored to that rectangle.
 */
const waterMeshes = new Set<THREE.Mesh>();
const subFrustum = new THREE.Frustum(),
  subMatrix = new THREE.Matrix4(),
  rectMatrix = new THREE.Matrix4(),
  rectView = new THREE.Matrix4(),
  clearColor = new THREE.Color(),
  waterBox = new THREE.Box3(),
  sphere = new THREE.Sphere(),
  camWorld = new THREE.Vector3();
let reflectList: THREE.Object3D[] = [];
let listScene: THREE.Scene | null = null;
let listAge = 0;
const hidden: THREE.Object3D[] = [];
/** Smallest angular radius (radians) still worth reflecting. */
const MIN_ANGULAR = 0.022;

function reflectedMeshes(scene: THREE.Scene) {
  if (listScene !== scene || ++listAge > 240) {
    listScene = scene;
    listAge = 0;
    reflectList = [];
    scene.traverse((object) => {
      const renderable = (object as THREE.Mesh).isMesh || (object as THREE.Points).isPoints || (object as THREE.Line).isLine;
      if (renderable && object.layers.isEnabled(REFLECT_LAYER) && !waterMeshes.has(object as THREE.Mesh))
        reflectList.push(object);
    });
  }
  return reflectList;
}

const tri = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
let polyA: THREE.Vector4[] = Array.from({ length: 12 }, () => new THREE.Vector4());
let polyB: THREE.Vector4[] = Array.from({ length: 12 }, () => new THREE.Vector4());
const toClip = new THREE.Matrix4();
/** Clip-space plane tests: z + w, w − x, w + x, w − y, w + y ≥ 0. */
const planeDistance = [
  (v: THREE.Vector4) => v.z + v.w,
  (v: THREE.Vector4) => v.w - v.x,
  (v: THREE.Vector4) => v.w + v.x,
  (v: THREE.Vector4) => v.w - v.y,
  (v: THREE.Vector4) => v.w + v.y,
];
/** Screen rectangle (mirrored camera NDC) actually covered by the water
 * surfaces at `height`: every water triangle is clipped against the view
 * volume in clip space (Sutherland–Hodgman), so a lake under, behind or
 * beside the camera yields only its visible part, or nothing. */
function waterRect(height: number, viewProjection: THREE.Matrix4) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const mesh of waterMeshes) {
    if (!mesh.parent) {
      waterMeshes.delete(mesh);
      continue;
    }
    let shown = true;
    for (let node: THREE.Object3D | null = mesh; node && shown; node = node.parent) shown = node.visible;
    if (!shown) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    waterBox.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    if (Math.abs((waterBox.min.y + waterBox.max.y) / 2 - height) > 0.05) continue;
    toClip.multiplyMatrices(viewProjection, mesh.matrixWorld);
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let t = 0; t + 2 < count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = index ? index.getX(t + k) : t + k;
        tri[k].set(position.getX(i), position.getY(i), position.getZ(i), 1).applyMatrix4(toClip);
      }
      let n = 3;
      for (let k = 0; k < 3; k++) polyA[k].copy(tri[k]);
      for (const distance of planeDistance) {
        let m = 0;
        for (let i = 0; i < n && m < 11; i++) {
          const a = polyA[i],
            b = polyA[(i + 1) % n];
          const da = distance(a),
            db = distance(b);
          if (da >= 0) polyB[m++].copy(a);
          if (da >= 0 !== db >= 0 && m < 12) polyB[m++].copy(a).lerp(b, da / (da - db));
        }
        [polyA, polyB] = [polyB, polyA];
        n = m;
        if (!n) break;
      }
      for (let i = 0; i < n; i++) {
        const v = polyA[i];
        const w = Math.max(v.w, 1e-5);
        x0 = Math.min(x0, v.x / w);
        x1 = Math.max(x1, v.x / w);
        y0 = Math.min(y0, v.y / w);
        y1 = Math.max(y1, v.y / w);
      }
    }
  }
  // Ripples bend the lookup by up to ~0.012 uv: pad by 0.04 NDC.
  x0 = Math.max(-1, x0 - 0.04);
  y0 = Math.max(-1, y0 - 0.04);
  x1 = Math.min(1, x1 + 0.04);
  y1 = Math.min(1, y1 + 0.04);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
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
  virtualCamera.far = Math.min(camera.far, lite ? 45 : 60);
  virtualCamera.updateProjectionMatrix();
  virtualCamera.updateMatrixWorld();
  reflectionUniforms.uWaterReflectMatrix.value
    .copy(bias)
    .multiply(virtualCamera.projectionMatrix)
    .multiply(virtualCamera.matrixWorldInverse);

  // The water's screen rectangle comes from the standard projection (the
  // oblique one puts the water on its near plane; x and y are the same).
  rectView.multiplyMatrices(virtualCamera.projectionMatrix, virtualCamera.matrixWorldInverse);

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

  // The water's screen rectangle in the mirrored view; nothing to draw when
  // it is empty.
  subMatrix.multiplyMatrices(virtualCamera.projectionMatrix, virtualCamera.matrixWorldInverse);
  const rect = waterRect(height, rectView);
  if (rect.x1 <= rect.x0 || rect.y1 <= rect.y0) {
    reflectionStats.calls = 0;
    reflectionStats.triangles = 0;
    return;
  }
  const hx = (rect.x1 - rect.x0) / 2,
    hy = (rect.y1 - rect.y0) / 2,
    cx = (rect.x1 + rect.x0) / 2,
    cy = (rect.y1 + rect.y0) / 2;
  rectMatrix.set(1 / hx, 0, 0, -cx / hx, 0, 1 / hy, 0, -cy / hy, 0, 0, 1, 0, 0, 0, 0, 1);
  subFrustum.setFromProjectionMatrix(rectMatrix.multiply(subMatrix));
  camWorld.copy(virtualCamera.position);
  hidden.length = 0;
  for (const object of reflectedMeshes(scene)) {
    if (!object.visible || !object.frustumCulled) continue;
    const mesh = object as THREE.Mesh;
    let keep: boolean;
    if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) {
      const instanced = mesh as unknown as THREE.InstancedMesh;
      if (instanced.boundingSphere === null) instanced.computeBoundingSphere();
      sphere.copy(instanced.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    } else {
      if (!mesh.geometry?.boundingSphere) mesh.geometry?.computeBoundingSphere();
      if (!mesh.geometry?.boundingSphere) continue;
      sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
    }
    keep = subFrustum.intersectsSphere(sphere);
    if (keep) {
      const distance = Math.max(0.001, sphere.center.distanceTo(camWorld) - sphere.radius);
      keep = sphere.radius / distance > MIN_ANGULAR || distance < 2;
    }
    if (!keep) {
      object.layers.disable(REFLECT_LAYER);
      hidden.push(object);
    }
  }

  const shadowAuto = gl.shadowMap.autoUpdate,
    shadowNeeds = gl.shadowMap.needsUpdate,
    infoReset = gl.info.autoReset;
  const calls = gl.info.render.calls,
    triangles = gl.info.render.triangles;
  gl.shadowMap.autoUpdate = false;
  gl.shadowMap.needsUpdate = false;
  gl.info.autoReset = false;
  // Scissor to the water's rectangle: fill is spent only where it is read.
  const sx = Math.floor(((rect.x0 + 1) / 2) * w),
    sy = Math.floor(((rect.y0 + 1) / 2) * h);
  target.scissor.set(sx, sy, Math.ceil(((rect.x1 + 1) / 2) * w) - sx, Math.ceil(((rect.y1 + 1) / 2) * h) - sy);
  target.scissorTest = true;
  // Clear to transparent with no backdrop: alpha is then the mirrored
  // geometry's coverage, and the water shades the open sky itself (the
  // flat, pale backdrop colour is what read as milky water).
  const background = scene.background,
    clearAlpha = gl.getClearAlpha();
  gl.getClearColor(clearColor);
  scene.background = null;
  gl.setClearColor(clearColor, 0);
  gl.setRenderTarget(target);
  gl.state.buffers.depth.setMask(true);
  if (!gl.autoClear) gl.clear();
  try {
    gl.render(scene, virtualCamera);
  } finally {
    for (const object of hidden) object.layers.enable(REFLECT_LAYER);
    hidden.length = 0;
    scene.background = background;
    gl.setClearColor(clearColor, clearAlpha);
  }
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
  waterMeshes.add(mesh);
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
