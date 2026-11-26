/**
 * Lazy half of the peephole: plugs the WebGL sheet into the engine's render
 * loop as a screen-space pass and warms its program with the world.
 */
import type * as THREE from "three";
import { registerWarmup } from "../contract";
import type { PeepholeController } from "./controller";
import { PaperLayer } from "./PaperLayer";

type AddRenderPass = (pass: {
  id: string;
  order?: number;
  render: (gl: THREE.WebGLRenderer, delta: number) => void;
}) => () => void;

let installed: (() => void) | null = null;

export function installPaper(
  addRenderPass: AddRenderPass,
  controller: PeepholeController,
  invalidate?: () => void,
) {
  if (installed) return installed;
  if (invalidate) controller.setInvalidate(invalidate);
  const layer = new PaperLayer();
  controller.attachSink(layer);
  const removeWarm = registerWarmup({
    id: "peephole:paper",
    priority: 12,
    run: (ctx) => layer.compile(ctx.gl as THREE.WebGLRenderer),
  });
  const removePass = addRenderPass({
    id: "peephole:paper",
    order: 10,
    render(gl, delta) {
      controller.externalTick(delta);
      layer.render(gl);
    },
  });
  installed = () => {
    removeWarm();
    removePass();
    layer.dispose();
    installed = null;
  };
  return installed;
}
