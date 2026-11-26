import type { RootState } from "@react-three/fiber";
import type { Tier } from "../../stage/contract";
import { runtime, useGame } from "../core/store";

declare global {
  interface Window {
    __joshuaPerf?: {
      frames: number[];
      calls: number;
      triangles: number;
      geometries: number;
      textures: number;
      renderer: string;
      programs?: number;
      links?: number;
      linksAfterReady?: number;
      tier?: string;
      dpr?: number;
    };
  }
}

/** Engine counters: read by the ?perf=1 overlay and by soak scripts through
 * window.__joshuaPerf (kept compatible with the old FrameMetrics shape). */
export const stats = {
  tier: null as Tier | null,
  calls: 0,
  triangles: 0,
  links: 0,
  linksAfterReady: 0,
  linksAtReady: 0,
  contextLosses: 0,
  frame(ms: number, state: RootState) {
    const perf = (window.__joshuaPerf ??= {
      frames: [],
      calls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      renderer: "",
    });
    if (!useGame.getState().paused && runtime.active) {
      perf.frames.push(ms);
      if (perf.frames.length > 2400) perf.frames.shift();
    }
    const { gl } = state;
    perf.calls = this.calls;
    perf.triangles = this.triangles;
    perf.geometries = gl.info.memory.geometries;
    perf.textures = gl.info.memory.textures;
    perf.programs = gl.info.programs?.length ?? 0;
    perf.links = this.links;
    perf.linksAfterReady = this.linksAfterReady;
    perf.tier = this.tier ?? "";
    perf.dpr = state.viewport.dpr;
    // A driver query can synchronize the GPU. Read it once, not every frame.
    if (!perf.renderer)
      perf.renderer = String(gl.getContext().getParameter(gl.getContext().RENDERER));
  },
};
