import { useEffect, useRef, useState } from "react";
import { useStage } from "../../stage/contract";
import { runtime, useGame, walkTo, type Scene } from "../core/store";
import { fitIsland, setView, useWorldView } from "../core/worldView";
import { useGameMode } from "../core/gameMode";
import { canWalk, doors, isInterior } from "../core/world";
import { belongsToWorld, type WorldId } from "../core/worlds";
import { leaveRoom, throughDoorway } from "../core/doorway";
import { usePresented } from "./presented";
import { BUILD_COMMIT } from "../../site/buildInfo";
import {
  benchmarkBudgetMs,
  buildStamp,
  stats,
  summarizeFrames,
  type BuildStamp,
  type FrameSummary,
} from "./stats";

const enabled = () => {
  try {
    return new URLSearchParams(location.search).get("perf") === "1";
  } catch {
    return false;
  }
};

/* ── 60 s benchmark ───────────────────────────────────────────────────────
 * A fixed, repeatable sequence for the owner's real devices: the diorama
 * overview, a zoom in, the walk view with a short walking loop, three view
 * toggles, a door in and out (Kitchen on Home, else the world's first room),
 * then the overview again. Each segment records frame-time statistics, the
 * peak draw calls / triangles, the DPR range, program links and context
 * losses; the JSON goes to the clipboard with "Copy results". */
type SegmentId =
  | "overview"
  | "zoom-in"
  | "explore-walk"
  | "toggles"
  | "door"
  | "back-overview";
const SEGMENTS: ReadonlyArray<{ id: SegmentId; seconds: number }> = [
  { id: "overview", seconds: 8 },
  { id: "zoom-in", seconds: 8 },
  { id: "explore-walk", seconds: 20 },
  { id: "toggles", seconds: 6 },
  { id: "door", seconds: 10 },
  { id: "back-overview", seconds: 8 },
];
const ZOOM_IN = 4.5;

type Bucket = {
  ms: number[];
  calls: number;
  tris: number;
  dpr: [number, number];
  links: number;
  losses: number;
};
type SegmentResult = FrameSummary & {
  id: SegmentId;
  seconds: number;
  maxCalls: number;
  maxTris: number;
  dpr: [number, number];
  linksAfterReady: number;
  contextLosses: number;
  pass: boolean;
  note?: string;
};
export type BenchmarkResult = {
  benchmark: "joshua-exe-60s";
  version: 1;
  at: string;
  url: string;
  tier: string;
  renderer: string;
  userAgent: string;
  viewport: [number, number];
  devicePixelRatio: number;
  cores: number | null;
  memoryGB: number | null;
  world: string;
  budgetP95Ms: number;
  segments: SegmentResult[];
  overall: FrameSummary & {
    maxCalls: number;
    maxTris: number;
    dpr: [number, number];
    linksAfterReady: number;
    contextLosses: number;
  };
  pass: boolean;
  aborted?: string;
  /** Which build produced this (A13): results pasted back by the owner are
   * matched to a commit and to the engine chunk's real size. */
  build: BuildStamp;
};

function benchDoor(world: WorldId): Scene | null {
  const rooms = doors.filter(
    (door) => isInterior(door.id) && belongsToWorld(door.id, world),
  );
  return (rooms.find((door) => door.id === "kitchen") ?? rooms[0])?.id as Scene | null;
}
/** A walkable square loop around the start (falls back to standing still). */
function walkLoop(world: WorldId): [number, number][] {
  const [x, z] = [runtime.x, runtime.z];
  for (const r of [7, 5, 3]) {
    const loop: [number, number][] = [
      [x + r, z],
      [x + r, z + r],
      [x, z + r],
      [x, z],
    ];
    if (loop.every(([px, pz]) => canWalk(px, pz, world))) return loop;
    const back: [number, number][] = [
      [x - r, z],
      [x - r, z - r],
      [x, z - r],
      [x, z],
    ];
    if (back.every(([px, pz]) => canWalk(px, pz, world))) return back;
  }
  return [[x, z]];
}

/** Why the benchmark cannot start right now (null when it can). */
function notReady(): string | null {
  const stage = useStage.getState();
  const g = useGame.getState();
  if (stage.mode !== "game" || !stage.ready || !stage.hudRevealed)
    return "Wait until the village is playable.";
  if (useGameMode.getState().active) return "Close the game first.";
  if (g.scene !== "hub" || usePresented.getState().scene !== "hub")
    return "Step outside first.";
  if (g.traveling) return "Wait for the trip to end.";
  return null;
}

function runBenchmark(onProgress: (text: string) => void): {
  done: Promise<BenchmarkResult>;
  stop: () => void;
} {
  const world = useGame.getState().world;
  const door = benchDoor(world);
  const before = useWorldView.getState();
  const loop = walkLoop(world);
  const buckets: Bucket[] = SEGMENTS.map(() => ({
    ms: [],
    calls: 0,
    tris: 0,
    dpr: [Infinity, 0],
    links: 0,
    losses: 0,
  }));
  const notes: Partial<Record<SegmentId, string>> = {};
  let index = -1;
  let segmentStart = 0;
  let frame = 0;
  let stopped = "";
  let finish: (result: BenchmarkResult) => void = () => {};
  const done = new Promise<BenchmarkResult>((resolve) => (finish = resolve));
  // Door segment state.
  let doorEntered = 0;
  let doorLeft = false;
  let waypoint = 0;
  let toggles = 0;

  const close = (bucket: Bucket) => {
    bucket.links = stats.linksAfterReady - bucket.links;
    bucket.losses = stats.contextLosses - bucket.losses;
  };
  const begin = (i: number, now: number) => {
    if (index >= 0) close(buckets[index]);
    index = i;
    segmentStart = now;
    const bucket = buckets[i];
    bucket.links = stats.linksAfterReady;
    bucket.losses = stats.contextLosses;
    const id = SEGMENTS[i].id;
    if (id === "overview" || id === "back-overview") {
      setView("diorama");
      fitIsland();
    } else if (id === "explore-walk") {
      setView("explore");
      waypoint = 0;
      walkTo(...loop[0]);
    } else if (id === "toggles") {
      toggles = 0;
      runtime.path = [];
      runtime.target = null;
    } else if (id === "door") {
      doorEntered = 0;
      doorLeft = false;
      if (door) throughDoorway(door);
      else notes.door = "No room in this world.";
    }
  };
  const tick = (now: number) => {
    if (stopped) return end();
    const elapsed = (now - segmentStart) / 1000;
    if (index < 0 || elapsed >= SEGMENTS[index].seconds) {
      if (index + 1 >= SEGMENTS.length) return end();
      begin(index + 1, now);
    }
    const { id, seconds } = SEGMENTS[index];
    const t = (now - segmentStart) / 1000;
    if (id === "zoom-in")
      useWorldView.setState({ zoom: Math.pow(ZOOM_IN, Math.min(1, t / seconds)) });
    else if (id === "explore-walk") {
      const next = Math.min(loop.length - 1, Math.floor(t / (seconds / loop.length)));
      if (next !== waypoint) {
        waypoint = next;
        walkTo(...loop[next]);
      }
    } else if (id === "toggles") {
      // Three toggles, two seconds apart: walk → village → walk → village.
      const due = Math.min(3, Math.floor(t / 2) + 1);
      for (; toggles < due; toggles++)
        setView(useWorldView.getState().view === "explore" ? "diorama" : "explore");
    } else if (id === "door" && door) {
      const presented = usePresented.getState().scene;
      if (!doorEntered && presented === door) doorEntered = now;
      if (doorEntered && !doorLeft && now - doorEntered > 2500) {
        doorLeft = true;
        leaveRoom();
      }
      if (t > seconds - 0.05 && !(doorLeft && useGame.getState().scene === "hub"))
        notes.door = doorEntered ? "Did not get back outside in time." : "Did not get inside in time.";
    }
    onProgress(`Benchmark: ${id} · ${Math.max(0, seconds - t).toFixed(0)} s`);
    frame = requestAnimationFrame(tick);
  };
  stats.recorder = (ms, dpr) => {
    const bucket = buckets[index];
    if (!bucket) return;
    bucket.ms.push(ms);
    bucket.calls = Math.max(bucket.calls, stats.calls);
    bucket.tris = Math.max(bucket.tris, stats.triangles);
    bucket.dpr = [Math.min(bucket.dpr[0], dpr), Math.max(bucket.dpr[1], dpr)];
  };
  const end = () => {
    cancelAnimationFrame(frame);
    stats.recorder = null;
    if (index >= 0) close(buckets[index]);
    if (useGame.getState().scene !== "hub") leaveRoom();
    setView(before.view);
    useWorldView.setState({ zoom: before.zoom, exploreDistance: before.exploreDistance });
    const tier = stats.tier ?? useStage.getState().tier ?? "";
    const budget = benchmarkBudgetMs(tier);
    const dprOf = (b: Bucket): [number, number] =>
      Number.isFinite(b.dpr[0]) ? [+b.dpr[0].toFixed(2), +b.dpr[1].toFixed(2)] : [0, 0];
    const segments: SegmentResult[] = SEGMENTS.slice(0, index + 1).map((segment, i) => {
      const b = buckets[i];
      const summary = summarizeFrames(b.ms);
      return {
        id: segment.id,
        seconds: segment.seconds,
        ...summary,
        maxCalls: b.calls,
        maxTris: b.tris,
        dpr: dprOf(b),
        linksAfterReady: b.links,
        contextLosses: b.losses,
        pass: summary.frames > 0 && summary.p95Ms <= budget && b.losses === 0,
        ...(notes[segment.id] ? { note: notes[segment.id] } : {}),
      };
    });
    const all = buckets.slice(0, index + 1);
    const overall = summarizeFrames(all.flatMap((b) => b.ms));
    const dprs = all.filter((b) => Number.isFinite(b.dpr[0]));
    const perf = window.__joshuaPerf;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const result: BenchmarkResult = {
      benchmark: "joshua-exe-60s",
      version: 1,
      build: buildStamp(
        BUILD_COMMIT,
        performance.getEntriesByType("resource") as PerformanceResourceTiming[],
      ),
      at: new Date().toISOString(),
      url: location.pathname + location.search,
      tier: String(tier),
      renderer: perf?.renderer ?? "",
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      devicePixelRatio: window.devicePixelRatio || 1,
      cores: navigator.hardwareConcurrency ?? null,
      memoryGB: nav.deviceMemory ?? null,
      world,
      budgetP95Ms: budget,
      segments,
      overall: {
        ...overall,
        maxCalls: Math.max(0, ...all.map((b) => b.calls)),
        maxTris: Math.max(0, ...all.map((b) => b.tris)),
        dpr: dprs.length
          ? [
              +Math.min(...dprs.map((b) => b.dpr[0])).toFixed(2),
              +Math.max(...dprs.map((b) => b.dpr[1])).toFixed(2),
            ]
          : [0, 0],
        linksAfterReady: stats.linksAfterReady,
        contextLosses: stats.contextLosses,
      },
      pass: !stopped && segments.length === SEGMENTS.length && segments.every((s) => s.pass),
      ...(stopped ? { aborted: stopped } : {}),
    };
    finish(result);
  };
  frame = requestAnimationFrame(tick);
  return {
    done,
    stop: () => {
      stopped = "Stopped by the visitor.";
    },
  };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (insecure origin, permissions): legacy path.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

const panelStyle: React.CSSProperties = {
  position: "fixed",
  left: 8,
  bottom: 118,
  zIndex: 10000,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxWidth: "min(420px, calc(100vw - 16px))",
  padding: "8px",
  font: "11px/1.35 ui-monospace, Menlo, monospace",
  color: "#e8f4e8",
  background: "rgba(10,16,20,.82)",
  borderRadius: 6,
};
const buttonStyle: React.CSSProperties = {
  minHeight: 32,
  padding: "4px 10px",
  font: "inherit",
  color: "#0b1418",
  background: "#e8f4e8",
  border: 0,
  borderRadius: 4,
  cursor: "pointer",
};

function Benchmark() {
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [copied, setCopied] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  const start = () => {
    const reason = notReady();
    if (reason) return setStatus(reason);
    setResult(null);
    setCopied("");
    setRunning(true);
    const run = runBenchmark(setStatus);
    stopRef.current = run.stop;
    void run.done.then((r) => {
      stopRef.current = null;
      setRunning(false);
      setResult(r);
      setStatus(r.pass ? "Benchmark: PASS" : r.aborted ? "Benchmark stopped" : "Benchmark: FAIL");
      (window as unknown as { __joshuaBenchmark?: BenchmarkResult }).__joshuaBenchmark = r;
    });
  };
  const json = result ? JSON.stringify(result, null, 2) : "";
  return (
    <section style={panelStyle} aria-label="Performance benchmark" data-benchmark={running ? "running" : result ? "done" : "idle"}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {running ? (
          <button type="button" style={buttonStyle} onClick={() => stopRef.current?.()}>
            Stop benchmark
          </button>
        ) : (
          <button type="button" style={buttonStyle} onClick={start}>
            {result ? "Run again" : "Run 60 s benchmark"}
          </button>
        )}
        {result && !running && (
          <button
            type="button"
            style={buttonStyle}
            onClick={() =>
              void copyText(json).then((ok) =>
                setCopied(ok ? "Copied." : "Copy failed: select the text below."),
              )
            }
          >
            Copy results
          </button>
        )}
      </div>
      <span role="status" aria-live="polite">
        {status}
        {copied ? ` ${copied}` : ""}
      </span>
      {result && (
        <>
          <div style={{ whiteSpace: "pre", overflowX: "auto" }}>
            {[
              `budget p95 ≤ ${result.budgetP95Ms} ms (${result.tier})`,
              ...result.segments.map(
                (s) =>
                  `${s.pass ? "PASS" : "FAIL"} ${s.id.padEnd(13)} avg ${s.avgMs} p95 ${s.p95Ms} p99 ${s.p99Ms} 1%low ${s.low1Fps}fps >50ms ${s.over50}${s.note ? ` (${s.note})` : ""}`,
              ),
            ].join("\n")}
          </div>
          <textarea
            readOnly
            aria-label="Benchmark results (JSON)"
            value={json}
            rows={4}
            style={{ font: "inherit", width: "100%", background: "#0b1418", color: "#e8f4e8" }}
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      )}
    </section>
  );
}

/** `?perf=1`: frame time, draw calls, triangles, programs, links, tier, DPR,
 * and the 60 s benchmark. For real-GPU measurement on the preview; renders
 * nothing otherwise. */
export function PerfOverlay() {
  const [on] = useState(enabled);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!on) return;
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
          `geo ${perf.geometries}  tex ${perf.textures}  lost ${stats.contextLosses}`,
          `tier ${perf.tier || "?"}  dpr ${perf.dpr?.toFixed(2) ?? "?"}`,
          perf.renderer,
        ].join("\n"),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [on]);
  if (!on) return null;
  return (
    <>
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
      <Benchmark />
    </>
  );
}
