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
      prewarmLinks?: number;
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
  /** Links made by the idle prewarm (engine/prewarm.ts), a subset of
   * linksAfterReady reported separately. */
  prewarmLinks: 0,
  /** The ?perf=1 benchmark's per-frame sink (null when not recording). */
  recorder: null as null | ((ms: number, dpr: number) => void),
  frame(ms: number, state: RootState) {
    this.recorder?.(ms, state.viewport.dpr);
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
    perf.prewarmLinks = this.prewarmLinks;
    perf.tier = this.tier ?? "";
    perf.dpr = state.viewport.dpr;
    // A driver query can synchronize the GPU. Read it once, not every frame.
    if (!perf.renderer) {
      const context = gl.getContext();
      // The unmasked GPU name where the browser still offers it (the
      // benchmark's results are only useful with the real device).
      const debug = context.getExtension("WEBGL_debug_renderer_info");
      perf.renderer = String(
        (debug && context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) ||
          context.getParameter(context.RENDERER),
      );
    }
  },
};

export type FrameSummary = {
  frames: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  /** Frame rate over the slowest 1% of frames. */
  low1Fps: number;
  /** Frames slower than 50 ms (visible hitches). */
  over50: number;
  maxMs: number;
};
const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
/** Frame-time statistics for one benchmark segment (pure). */
export function summarizeFrames(ms: readonly number[]): FrameSummary {
  if (ms.length === 0)
    return { frames: 0, avgMs: 0, p95Ms: 0, p99Ms: 0, low1Fps: 0, over50: 0, maxMs: 0 };
  const sorted = [...ms].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const worst = sorted.slice(-Math.max(1, Math.ceil(sorted.length / 100)));
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  return {
    frames: ms.length,
    avgMs: round(avg),
    p95Ms: round(at(0.95)),
    p99Ms: round(at(0.99)),
    low1Fps: round(1000 / Math.max(0.001, worstAvg)),
    over50: ms.filter((value) => value > 50).length,
    maxMs: round(sorted[sorted.length - 1]),
  };
}
/** p95 frame budget the benchmark passes against: 60 fps on high, 30 below. */
export const benchmarkBudgetMs = (tier: Tier | string | null | undefined) =>
  tier === "high" ? 16.7 : 33.3;
