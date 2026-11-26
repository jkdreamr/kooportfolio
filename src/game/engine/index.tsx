/**
 * Engine public surface. W1's persistent Stage imports this module lazily:
 *
 *   const Engine = lazy(() => import("../game/engine"));
 *   <Engine.default />   // or: import("../game/engine").then(m => m.GameStage)
 *
 * See scratchpad/overhaul/CONTRACT_READY.md for the full protocol.
 */
export { default, default as GameStage } from "../Game";
export { useWorldActive } from "./active";
export { aimCamera, viewZoom } from "./camera";
export { addRenderPass, type RenderPass } from "./passes";
