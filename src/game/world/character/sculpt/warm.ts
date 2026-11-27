import * as THREE from "three";
import { registerWarmup, useStage } from "../../../../stage/contract";
import { boneTexture, paletteTexture, sculptDepthMaterial, sculptMaterial } from "./runtime";

/**
 * The sculpted characters arrive after `ready` (their geometry is lazy), so
 * their programs (colour + batched shadow depth) are linked during warmup by
 * a hidden proxy BatchedMesh with the same material and attribute layout.
 * It sits in the live scene through the warm compile and the warm frame
 * (identical lights, fog and render target) and leaves once ready.
 */
let registered = false;
let keep: THREE.MeshStandardMaterial | null = null;
let keepDepth: THREE.MeshDepthMaterial | null = null;
export function registerSculptWarmup() {
  if (registered) return;
  registered = true;
  registerWarmup({
    id: "character:sculpt-programs",
    priority: 85,
    run(ctx) {
      const scene = ctx.scene as THREE.Scene;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0]), 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0]), 3, true));
      geometry.setAttribute("rigA", new THREE.BufferAttribute(new Uint8Array(12), 4, true));
      geometry.setAttribute("rigB", new THREE.BufferAttribute(new Uint8Array(12), 4, true));
      geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
      const palette = paletteTexture(1);
      const bones = boneTexture(1);
      const material = (keep ??= sculptMaterial(palette, bones));
      const proxy = new THREE.BatchedMesh(1, 3, 3, material);
      proxy.customDepthMaterial = keepDepth ??= sculptDepthMaterial(palette, bones);
      proxy.addInstance(proxy.addGeometry(geometry));
      proxy.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, -80, 0));
      proxy.frustumCulled = false;
      proxy.perObjectFrustumCulled = false;
      proxy.castShadow = true;
      proxy.receiveShadow = true;
      proxy.name = "sculpt-warm-proxy";
      proxy.userData.noBake = true;
      scene.add(proxy);
      const drop = () => {
        scene.remove(proxy);
        proxy.dispose();
        geometry.dispose();
      };
      const off = useStage.subscribe((s) => {
        if (!s.ready) return;
        off();
        // Keep it through the first presented frames, then drop it.
        setTimeout(drop, 2000);
      });
    },
  });
}
