import { useEffect, useState } from "react";
import { cameraRig, useStage } from "../../stage/contract";
import { useGame } from "../core/store";
import { useWorldView } from "../core/worldView";

const enabled = () => {
  try {
    return new URLSearchParams(location.search).get("perf") === "1";
  } catch {
    return false;
  }
};

/** `?perf=1`: frame time, draw calls, triangles, programs, links, tier, DPR.
 * For real-GPU measurement on the preview; renders nothing otherwise. */
export function PerfOverlay() {
  const [on] = useState(enabled);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!on) return;
    // Handles for measurement scripts on production builds (no /src imports).
    (window as unknown as { __stageDebug?: unknown }).__stageDebug = {
      useGame,
      useStage,
      useWorldView,
      cameraRig,
    };
    let seen = 0;
    const timer = window.setInterval(() => {
      const perf = window.__joshuaPerf;
      if (!perf) return;
      const recent = perf.frames.slice(-120);
      const sorted = [...recent].sort((a, b) => a - b);
      const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      const worst = sorted.at(-1) ?? 0;
      const fresh = perf.frames.length !== seen;
      seen = perf.frames.length;
      setText(
        [
          `${(1000 / Math.max(1, avg)).toFixed(0)} fps  ${avg.toFixed(1)} ms  p95 ${p95.toFixed(1)}  max ${worst.toFixed(0)}${fresh ? "" : " (idle)"}`,
          `calls ${perf.calls}  tris ${(perf.triangles / 1000).toFixed(0)}k`,
          `programs ${perf.programs ?? "?"}  links ${perf.links ?? "?"} (+${perf.linksAfterReady ?? 0} after ready)`,
          `geo ${perf.geometries}  tex ${perf.textures}`,
          `tier ${perf.tier || "?"}  dpr ${perf.dpr?.toFixed(2) ?? "?"}`,
          perf.renderer,
        ].join("\n"),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [on]);
  if (!on) return null;
  return (
    <pre
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 10000,
        margin: 0,
        padding: "6px 8px",
        font: "11px/1.35 ui-monospace, Menlo, monospace",
        color: "#e8f4e8",
        background: "rgba(10,16,20,.72)",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {text}
    </pre>
  );
}
