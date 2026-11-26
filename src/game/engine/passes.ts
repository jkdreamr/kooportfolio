import type * as THREE from "three";

/**
 * Extra render passes drawn by the engine's single render loop, in `order`,
 * after the world (and its post-processing) has been drawn for this frame.
 * The renderer has autoClear disabled while passes run; clear what you need.
 * Use for screen-space layers that must share the world canvas (W1's paper).
 */
export interface RenderPass {
  id: string;
  order?: number;
  render: (gl: THREE.WebGLRenderer, delta: number) => void;
}
const passes = new Map<string, RenderPass>();
let sorted: RenderPass[] = [];
export function addRenderPass(pass: RenderPass) {
  passes.set(pass.id, pass);
  sorted = [...passes.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return () => {
    if (passes.get(pass.id) !== pass) return;
    passes.delete(pass.id);
    sorted = [...passes.values()].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
  };
}
export const renderPasses = () => sorted;
