import type * as THREE from "three";
import { useStage } from "../../stage/contract";
import { linkShadowDepth, materialsOf } from "../engine/prewarm";

/**
 * Compile a freshly swapped world behind the journey's full veil, off the
 * render path. At v = 1 every frame is fog, sky, the vehicle and the wisps,
 * so the rest of the hub can stop drawing while `compileAsync` (parallel on
 * drivers with KHR_parallel_shader_compile) builds the new world's programs;
 * the wisps keep streaming instead of freezing on in-render links.
 *
 * `keep` (the journey's own group) stays drawn; every other branch of the
 * hub is hidden until `reveal()`, which then draws the whole scene once into
 * a 1×1 target (culling off) while the veil still hides everything: the new
 * casters' shadow-depth programs and any variant the compile missed link
 * there.
 */
export function compileBehindVeil(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  keep: THREE.Object3D,
) {
  const root = scene.getObjectByName("hub-root");
  const hidden: THREE.Object3D[] = [];
  let state: "compiling" | "ready" | "revealed" = "compiling";
  if (!root) return { ready: () => true, reveal: () => {} };
  for (let node: THREE.Object3D = keep; node !== root && node.parent; node = node.parent) {
    for (const sibling of node.parent.children) {
      if (sibling === node || !sibling.visible) continue;
      sibling.visible = false;
      hidden.push(sibling);
    }
  }
  let pending: Promise<unknown> = Promise.resolve();
  try {
    pending = gl.compileAsync(materialsOf(root), camera, scene);
  } catch {
    // Compile errors surface on the real render; this is best-effort.
  }
  void pending.then(
    () => {
      if (state === "compiling") state = "ready";
    },
    () => {
      if (state === "compiling") state = "ready";
    },
  );
  return {
    ready: () => state !== "compiling",
    reveal() {
      if (state === "revealed") return;
      state = "revealed";
      for (const object of hidden) object.visible = true;
      hidden.length = 0;
      const tier = useStage.getState().tier;
      // One pass of everything (in view or not) still behind the veil:
      // what the compile could not foresee (two-pass see-through faces,
      // materials finished on mount) links here, not in a visible frame.
      if (tier) linkShadowDepth(gl, scene, camera, tier, [], true);
    },
  };
}
