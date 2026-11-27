/**
 * Shared contract between the portfolio stage (W1), the engine (W2) and every
 * world/UI workstream. Pure data and zustand: no Three.js import, so the
 * portfolio entry chunk can read it without pulling the renderer in.
 *
 * Owner: W2 (engine). Other workstreams extend through the lead.
 */
import { create } from "zustand";

/* ------------------------------------------------------------------ modes */

/**
 * site    – portfolio DOM is the page; the world may be warming behind it.
 * peek    – the visitor is dragging the "o": world visible through the hole.
 * tearing – tension passed the tear threshold; seam/flaps animating.
 * flying  – camera cinematic through the opening over the village.
 * game    – playable. Input, HUD and labels belong to the game.
 */
export type StageMode = "site" | "peek" | "tearing" | "flying" | "game";

const NEXT: Record<StageMode, readonly StageMode[]> = {
  site: ["peek", "game"],
  peek: ["site", "tearing", "game"],
  tearing: ["peek", "flying", "game"],
  flying: ["game"],
  // Back to the portfolio (popstate to "/").
  game: ["site"],
};
export const canEnterMode = (from: StageMode, to: StageMode) =>
  from === to || NEXT[from].includes(to);

/* ------------------------------------------------------------------ tiers */

export type Tier = "high" | "medium" | "low";

export interface TierBudget {
  /** Draw calls per frame in the busiest hub view. */
  maxDrawCalls: number;
  maxTriangles: number;
  /** Device-pixel-ratio range the adaptive resolution knob may move within. */
  dpr: readonly [min: number, max: number];
  /** 0 = no shadow map (blob shadows only). */
  shadowMapSize: 0 | 1024 | 2048;
  /** Shadow map refresh: every frame, every other frame, or ~2 Hz. */
  shadowUpdate: "every" | "alternate" | "slow";
  /** Screen-space AO: full N8AO (high), half-res "lite" N8AO (medium on a
   * hardware, fine-pointer GPU only; see post.ts), or none (baked AO only). */
  ao: "full" | "lite" | "none";
  /** Planar water reflection (WS-B): full half-res, a 256 px "lite" pass, or
   * the painted streaks only. */
  reflection: "planar" | "planar-lite" | "none";
  /** Shadow-caster triangle budget per shadow update (0 = no shadow map). */
  maxShadowTriangles: number;
  grade: boolean;
  vignette: boolean;
  bloom: boolean;
  /** Upper bound for instanced grass blades (W3 scales mesh.count under it). */
  grassInstances: number;
  /** Visible grass tuft cap in the explore view (diorama keeps grassInstances). */
  grassVisible: number;
  /** Visible understory clump cap (bushes, ferns, flowers), explore only. */
  understory: number;
  /** Max simultaneous backdrop-filter panes (W5). */
  backdropPanes: number;
}

export const TIER_BUDGETS: Record<Tier, TierBudget> = {
  high: {
    maxDrawCalls: 250,
    maxTriangles: 900_000,
    dpr: [1, 1.5],
    shadowMapSize: 2048,
    shadowUpdate: "every",
    ao: "full",
    reflection: "planar",
    maxShadowTriangles: 300_000,
    grade: true,
    vignette: true,
    bloom: true,
    grassInstances: 25_000,
    grassVisible: 14_000,
    understory: 1_800,
    backdropPanes: 8,
  },
  medium: {
    maxDrawCalls: 180,
    maxTriangles: 450_000,
    dpr: [0.85, 1.25],
    shadowMapSize: 1024,
    shadowUpdate: "alternate",
    ao: "lite",
    reflection: "planar-lite",
    maxShadowTriangles: 120_000,
    grade: true,
    vignette: true,
    bloom: false,
    grassInstances: 8_000,
    grassVisible: 6_000,
    understory: 800,
    backdropPanes: 2,
  },
  low: {
    maxDrawCalls: 120,
    maxTriangles: 200_000,
    dpr: [0.75, 1],
    shadowMapSize: 0,
    shadowUpdate: "slow",
    ao: "none",
    reflection: "none",
    maxShadowTriangles: 0,
    grade: false,
    vignette: false,
    bloom: false,
    grassInstances: 2_000,
    grassVisible: 1_500,
    understory: 0,
    backdropPanes: 0,
  },
};

/* ------------------------------------------------------------- stage store */

/** CSS-pixel rectangle in viewport coordinates (top-left origin). */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageState {
  mode: StageMode;
  /** Chosen once by the engine during warmup; never flips at runtime. */
  tier: Tier | null;
  /** True once every registered warm task has finished and one warm frame
   * has been rendered. The hole may show the world / the tear may arm only
   * when this is true. */
  ready: boolean;
  /** 0..1 progress of the warm queue (for a W1 discovery cue, never a bar). */
  warmProgress: number;
  /** The world is visible somewhere on screen (hole, tear, game). While false
   * in "site" mode the engine renders on demand only. */
  worldVisible: boolean;
  /** Restrict the world pass to this rect (the peephole bbox); null = full. */
  worldScissor: ScreenRect | null;
  /** HUD reveal has fired (W5 staggers its entrance off this). */
  hudRevealed: boolean;
  /** Returns false (and does nothing) for an illegal transition. */
  setMode: (mode: StageMode) => boolean;
  setWorldVisible: (visible: boolean) => void;
  setWorldScissor: (rect: ScreenRect | null) => void;
}

export const useStage = create<StageState>((set, get) => ({
  mode: "site",
  tier: null,
  ready: false,
  warmProgress: 0,
  worldVisible: false,
  worldScissor: null,
  hudRevealed: false,
  setMode(mode) {
    const from = get().mode;
    if (!canEnterMode(from, mode)) return false;
    if (from === mode) return true;
    set({
      mode,
      // Leaving the game hides the HUD again; re-entry reveals it again.
      ...(mode === "site" ? { hudRevealed: false, worldScissor: null } : {}),
      ...(mode !== "site" ? { worldVisible: true } : {}),
    });
    // Mirrored on <html> in the same task (page CSS hides the HUD outside
    // the game): a React effect could land seconds later on a busy frame,
    // after the page had already started fading in under the HUD.
    if (typeof document !== "undefined") document.documentElement.dataset.stageMode = mode;
    return true;
  },
  setWorldVisible(worldVisible) {
    if (get().worldVisible !== worldVisible) set({ worldVisible });
  },
  setWorldScissor(worldScissor) {
    set({ worldScissor });
  },
}));

/** True when the player may control the avatar / HUD may take input. */
export const gameInputEnabled = (s: Pick<StageState, "mode" | "hudRevealed">) =>
  s.mode === "game" && s.hudRevealed;

/* -------------------------------------------------------------- HUD reveal */

type HudListener = () => void;
const hudListeners = new Set<HudListener>();
/** Fire the HUD entrance. W1 calls it at the start of the final camera blend
 * (or immediately on direct /play once ready). Idempotent while revealed. */
export function revealHud() {
  if (useStage.getState().hudRevealed) return;
  useStage.setState({ hudRevealed: true });
  for (const listener of [...hudListeners]) listener();
}
export function onHudReveal(listener: HudListener) {
  hudListeners.add(listener);
  return () => void hudListeners.delete(listener);
}

/* --------------------------------------------------------- warmup registry */

/**
 * Everything that would otherwise compile, upload or allocate on a visible
 * frame registers here: shader programs (gl.compileAsync), PMREM bakes,
 * shadow-map allocation, texture uploads, interior pre-compiles.
 *
 * The engine owns the WebGL objects; the context is typed loosely here so this
 * file stays Three-free. Engine-side code casts it with `warmContext()` from
 * src/game/engine/warmup.ts.
 */
export interface WarmContext {
  /** THREE.WebGLRenderer */
  gl: unknown;
  /** THREE.Scene (the persistent world scene) */
  scene: unknown;
  /** THREE.Camera (the persistent rig camera) */
  camera: unknown;
  tier: Tier;
  signal: AbortSignal;
  /** Await between chunks of work to keep tasks under ~8 ms. */
  yieldToFrame: () => Promise<void>;
}

export interface WarmTask {
  /** Unique; re-registering an id replaces the previous task. */
  id: string;
  /** Lower runs first. Engine core: 0–9, world/env: 10–49, interiors: 50+. */
  priority?: number;
  run: (ctx: WarmContext) => unknown;
}

const warmTasks = new Map<string, WarmTask>();
const warmListeners = new Set<() => void>();

/** Register a warm task. Tasks registered after `ready` are run by the engine
 * as soon as possible in idle time (they never block `ready` again).
 * Returns an unregister function. */
export function registerWarmup(task: WarmTask) {
  warmTasks.set(task.id, task);
  for (const listener of [...warmListeners]) listener();
  return () => {
    if (warmTasks.get(task.id) === task) warmTasks.delete(task.id);
  };
}
/** Engine-side: the queue snapshot, sorted by priority. */
export function pendingWarmTasks() {
  return [...warmTasks.values()].sort(
    (a, b) => (a.priority ?? 20) - (b.priority ?? 20),
  );
}
/** Engine-side: drop a task once it has run. */
export function completeWarmTask(id: string, task?: unknown) {
  // A task re-registered under the same id while the old one ran must survive.
  if (task !== undefined && warmTasks.get(id) !== task) return;
  warmTasks.delete(id);
}
/** Engine-side: be told when new work is registered. */
export function onWarmupRegistered(listener: () => void) {
  warmListeners.add(listener);
  return () => void warmListeners.delete(listener);
}
/** Resolves once the stage is ready (immediately if it already is). */
export function whenStageReady(): Promise<void> {
  if (useStage.getState().ready) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = useStage.subscribe((s) => {
      if (!s.ready) return;
      stop();
      resolve();
    });
  });
}

/* -------------------------------------------------------------- camera rig */

export type Vec3 = readonly [number, number, number];

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Bank about the view axis, radians (≤ 4° for flights). */
  roll?: number;
}

/** "smootherstep": t³(10 − 15t + 6t²), zero velocity and acceleration at
 * both ends (the tear flight). */
export type RigEase = "linear" | "quintic-out" | "cubic-in-out" | "smootherstep";

export interface CameraPathOptions {
  /** Control poses for a centripetal Catmull-Rom spline (positions and
   * targets are splined separately; fov and roll interpolate). Two or more. */
  points: readonly CameraPose[];
  /** Seconds, at time scale 1. */
  duration: number;
  ease?: RigEase;
  /** Final seconds over which the spline pose blends into the LIVE follow
   * pose (what gameplay would render this frame). The last cinematic frame
   * is therefore exactly the first gameplay frame. Default 0.6. */
  blendToLive?: number;
  /** Fired once when the live blend begins (unlock input, reveal HUD). */
  onBlendStart?: () => void;
  /** Fired once when the path has fully handed over to the live pose. */
  onDone?: () => void;
}

/**
 * Rig command. The engine applies the active command at render time on top of
 * the pose gameplay code wrote this frame (the "live" pose), so gameplay code
 * never sees the override and nothing feeds back.
 *
 * - live:  render the live pose. `blend` seconds smooth from whatever was on
 *          screen (default 0 = immediate).
 * - pose:  hold a fixed pose, blending in from the on-screen pose over `blend`.
 * - path:  fly a spline, blending into the live pose at its end; when done
 *          the rig returns to `live` by itself.
 */
export type CameraCommand =
  | { kind: "live"; blend?: number }
  | { kind: "pose"; pose: CameraPose; blend?: number }
  | ({ kind: "path" } & CameraPathOptions);

interface RigState {
  command: CameraCommand;
  /** Incremented per command so the engine can restart timers. */
  serial: number;
  /** Multiplies rig time (skip = 6). */
  timeScale: number;
  /** Last live pose the engine saw (gameplay follow pose), for building paths. */
  live: CameraPose | null;
  /** Last pose actually rendered. */
  rendered: CameraPose | null;
}

export const useCameraRig = create<RigState>(() => ({
  command: { kind: "live" },
  serial: 0,
  timeScale: 1,
  live: null,
  rendered: null,
}));

export const cameraRig = {
  /** Return to gameplay control, optionally smoothing over `blend` seconds. */
  live(blend = 0) {
    issue({ kind: "live", blend });
  },
  /** Hold an explicit pose (peek). */
  pose(pose: CameraPose, blend = 0) {
    issue({ kind: "pose", pose, blend });
  },
  /** Fly a spline that blends into the live follow pose at its end. */
  path(options: CameraPathOptions) {
    issue({ kind: "path", ...options });
  },
  /** Speed up (skip ×6) or restore (1) the current cinematic. Never a cut. */
  setTimeScale(timeScale: number) {
    useCameraRig.setState({ timeScale: Math.max(0.01, timeScale) });
  },
  /** The gameplay follow pose as of the last rendered frame. */
  livePose() {
    return useCameraRig.getState().live;
  },
  renderedPose() {
    return useCameraRig.getState().rendered;
  },
};
function issue(command: CameraCommand) {
  useCameraRig.setState((s) => ({ command, serial: s.serial + 1 }));
}

/* ------------------------------------------------------ flight obstacles */

/** [centre x, centre z, half x, half z, top y] of something a camera flight
 * must clear (tall props from heroSpots.ts, building footprints). */
export type FlightObstacleBox = readonly [number, number, number, number, number];
let obstacles: readonly FlightObstacleBox[] = [];
/** Engine-side: the current world's obstacles (the portfolio chunk cannot
 * import world data, so the engine publishes them here). */
export function setFlightObstacles(list: readonly FlightObstacleBox[]) {
  obstacles = list;
}
export function flightObstacles() {
  return obstacles;
}

/* --------------------------------------------- ortho-zoom ↔ distance mapping */

/** Telephoto lens for hub and interiors. */
export const TELEPHOTO_FOV = 20;
/** Lens for activity scenes (rowing, basketball, paper toss). */
export const ACTIVITY_FOV = 55;

/**
 * An orthographic camera at `zoom` shows `viewportHeight / zoom` world units
 * vertically. A perspective camera of vertical `fovDeg` shows the same height
 * at its target plane from distance d = (h / zoom) / (2·tan(fov/2)).
 */
export function zoomToDistance(
  zoom: number,
  viewportHeight: number,
  fovDeg = TELEPHOTO_FOV,
) {
  const height = viewportHeight / Math.max(1e-6, zoom);
  return height / (2 * Math.tan((fovDeg * Math.PI) / 360));
}
export function distanceToZoom(
  distance: number,
  viewportHeight: number,
  fovDeg = TELEPHOTO_FOV,
) {
  return viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360) * distance);
}
