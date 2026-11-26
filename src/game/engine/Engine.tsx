import { useEffect, useMemo, useRef } from "react";
import { useFrame, useStore, useThree, type RootState } from "@react-three/fiber";
import * as THREE from "three";
import {
  TIER_BUDGETS,
  completeWarmTask,
  onWarmupRegistered,
  pendingWarmTasks,
  registerWarmup,
  revealHud,
  useStage,
  type Tier,
  type WarmContext,
} from "../../stage/contract";
import { CameraRigRuntime } from "./rig";
import { renderPasses } from "./passes";
import { createStagePost, type StagePost } from "./post";
import { stats } from "./stats";
import { usePresented } from "./presented";
import { islandFollow } from "../core/islandCamera";
import { useWorldView, viewRuntime } from "../core/worldView";

const liveCamera = new THREE.Vector3(),
  liveForward = new THREE.Vector3(),
  liveTarget = new THREE.Vector3();

/** Request one frame while the canvas is in demand mode (W1: the resting
 * peephole counter is pumped at a gentle rate instead of rendering always). */
let invalidate: () => void = () => {};
export function invalidateStage() {
  invalidate();
}

/** The engine-wide rig instance (also used by Game for scene-change blends). */
export const rig = new CameraRigRuntime();

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Keep every linked program alive for the session: three releases a program
 * when its last material is disposed, so a scene swap would relink it on the
 * way back. Variants are bounded (a few hundred), memory is small. */
const pinned = new WeakSet<object>();
export function pinPrograms(gl: THREE.WebGLRenderer) {
  for (const program of gl.info.programs ?? []) {
    if (pinned.has(program)) continue;
    pinned.add(program);
    (program as unknown as { usedTimes: number }).usedTimes++;
  }
}

/** performance.measure without the buffer growing over a session. */
function measure(name: string, start: number) {
  try {
    performance.measure(name, { start, end: performance.now() });
    performance.clearMeasures(name);
  } catch {
    /* User Timing unavailable */
  }
}

/** Count real program links on this context (perf overlay, soak tests). */
function instrument(gl: THREE.WebGLRenderer) {
  const context = gl.getContext() as WebGL2RenderingContext & {
    __stageLinks?: boolean;
  };
  if (context.__stageLinks) return;
  context.__stageLinks = true;
  const link = context.linkProgram.bind(context);
  context.linkProgram = (program: WebGLProgram) => {
    stats.links++;
    if (useStage.getState().ready) stats.linksAfterReady++;
    link(program);
  };
}

/**
 * Engine core, mounted once inside the persistent Canvas:
 * - runs the warm queue (hidden) and flips `ready`;
 * - owns the single render: rig overlay → world (direct or composer) →
 *   extra passes → restore gameplay camera;
 * - renders synchronously on resize/DPR change so no cleared frame is shown;
 * - continuous adaptation only: resolution scale + shadow refresh rate.
 */
export function EngineRuntime({
  tier,
  autoEnter,
  onLost,
}: {
  tier: Tier;
  autoEnter: boolean;
  onLost: (lost: boolean) => void;
}) {
  const gl = useThree((s) => s.gl);
  const store = useStore();
  useEffect(() => {
    invalidate = () => store.getState().invalidate();
    return () => {
      invalidate = () => {};
    };
  }, [store]);
  const budget = TIER_BUDGETS[tier];
  const post = useRef<StagePost | null>(null);
  const postCamera = useRef<THREE.Camera | null>(null);
  const ready = useRef(false);
  const lost = useRef(false);
  const frame = useRef(0);
  const shadowDirty = useRef(true);
  const pinnedAt = useRef(0);
  const dpr = useMemo(
    () => ({
      // Start at the tier's ceiling (bounded by the device), adapt within range.
      value: Math.min(budget.dpr[1], Math.max(budget.dpr[0], window.devicePixelRatio || 1)),
      window: [] as number[],
      lastChange: 0,
      good: 0,
    }),
    [budget],
  );

  // --- the one render function -------------------------------------------
  const renderNow = useRef<(state: RootState, delta: number) => void>(() => {});
  renderNow.current = (state, delta) => {
    if (lost.current) return;
    if (!ready.current) {
      // Nothing compiled may draw yet; keep the buffer sky-coloured (an
      // alpha:false canvas would otherwise show its cleared black).
      state.gl.clear();
      return;
    }
    const { gl: renderer, scene, camera, size } = state;
    renderer.info.reset();
    frame.current++;
    // Shadow refresh rate is a continuous knob: no program changes. At the
    // whole-island overview the shadow pass (every caster on the island) is
    // refreshed at ~5 Hz: only tiny walkers move at that scale.
    if (renderer.shadowMap.enabled) {
      const overview =
        usePresented.getState().scene === "hub" &&
        islandFollow(useWorldView.getState().zoom) === 0 &&
        viewRuntime.blend === 0;
      const every = overview
        ? 12
        : budget.shadowUpdate === "every"
          ? 1
          : budget.shadowUpdate === "alternate"
            ? 2
            : 30;
      renderer.shadowMap.autoUpdate = false;
      if (frame.current % every === 0 || shadowDirty.current) {
        renderer.shadowMap.needsUpdate = true;
        shadowDirty.current = false;
      }
    }
    // Where gameplay aims (the live pose), before the rig overrides it.
    liveCamera.copy(camera.position);
    camera.getWorldDirection(liveForward);
    liveTarget
      .copy(liveCamera)
      .addScaledVector(
        liveForward,
        typeof camera.userData.viewDistance === "number"
          ? camera.userData.viewDistance
          : 24,
      );
    rig.apply(camera, delta);
    // Interiors and activities keep a short fog (65–160 in view depth) tuned
    // for their own camera. While the rig blends in from the previous
    // scene's telephoto pose (2–3× farther away), that fog swallowed the
    // whole room: flat backdrop-coloured frames on every entry. Push the
    // fog out by exactly the extra distance for this frame only.
    const fog = scene.fog;
    let fogShift = 0;
    if (fog instanceof THREE.Fog && usePresented.getState().scene !== "hub") {
      fogShift =
        camera.position.distanceTo(liveTarget) -
        liveCamera.distanceTo(liveTarget);
      if (fogShift > 0.5) {
        fog.near += fogShift;
        fog.far += fogShift;
      } else fogShift = 0;
    }
    const scissor = useStage.getState().worldScissor;
    if (scissor) {
      renderer.setScissorTest(true);
      renderer.setScissor(
        scissor.x,
        size.height - scissor.y - scissor.height,
        scissor.width,
        scissor.height,
      );
    }
    if (post.current) {
      if (postCamera.current !== camera) {
        postCamera.current = camera;
        post.current.setCamera(camera);
      }
      post.current.render(delta);
    }
    else renderer.render(scene, camera);
    if (scissor) renderer.setScissorTest(false);
    const passes = renderPasses();
    if (passes.length) {
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      for (const pass of passes) pass.render(renderer, delta);
      renderer.autoClear = autoClear;
    }
    if (fogShift && fog instanceof THREE.Fog) {
      fog.near -= fogShift;
      fog.far -= fogShift;
    }
    rig.restore(camera);
    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
  };

  useFrame((state, delta) => {
    // JS frame cost for CDP traces (PLAN2 §7.2): "engine:submit" is the
    // render call, "engine:update" the per-frame bookkeeping. Entries are
    // cleared right after they are recorded, so nothing piles up; a trace
    // still sees every measure.
    const submitStart = performance.now();
    renderNow.current(state, delta);
    measure("engine:submit", submitStart);
    if (!ready.current) return;
    const updateStart = performance.now();
    stats.frame(delta * 1000, state);
    adapt(state, delta);
    // Time-based (not frame-based): at low frame rates a frame cadence would
    // let an interior's programs be released before they were pinned.
    if (state.clock.elapsedTime - pinnedAt.current > 1) {
      pinnedAt.current = state.clock.elapsedTime;
      pinPrograms(state.gl);
    }
    measure("engine:update", updateStart);
  }, 1);

  // Continuous resolution scaling against the tier's frame budget.
  const adapt = (state: RootState, delta: number) => {
    if (document.hidden || state.frameloop !== "always") return;
    dpr.window.push(delta * 1000);
    if (dpr.window.length < 90) return;
    const sorted = [...dpr.window].sort((a, b) => a - b);
    dpr.window.length = 0;
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const target = tier === "high" ? 16.7 : 33.3;
    const [min, max] = budget.dpr;
    const ceiling = Math.min(max, Math.max(min, window.devicePixelRatio || 1));
    let next = dpr.value;
    if (p75 > target * 1.15) {
      next = Math.max(min, dpr.value - 0.1);
      dpr.good = 0;
    } else if (p75 < target * 0.7 && ++dpr.good >= 3) {
      next = Math.min(ceiling, dpr.value + 0.05);
      dpr.good = 0;
    }
    if (Math.abs(next - dpr.value) > 0.001) {
      dpr.value = next;
      // setDpr resizes the drawing buffer synchronously (store subscription);
      // the size subscriber below re-renders in the same task: no blank frame.
      state.setDpr(next);
    }
  };

  // A newly presented scene or world gets fresh shadows on its first frame.
  useEffect(
    () =>
      usePresented.subscribe(() => {
        shadowDirty.current = true;
      }),
    [],
  );

  // --- synchronous render after any resize/DPR change ----------------------
  useEffect(() => {
    let last = store.getState();
    return store.subscribe((state) => {
      const resized =
        state.size !== last.size || state.viewport.dpr !== last.viewport.dpr;
      last = state;
      if (!resized) return;
      post.current?.setSize(state.size.width, state.size.height);
      // R3F's own subscriber (registered first) already resized the buffer and
      // camera; draw now so the cleared buffer is never composited.
      renderNow.current(state, 0);
    });
  }, [store]);

  // --- context loss / restore ---------------------------------------------
  useEffect(() => {
    const canvas = gl.domElement;
    let timer = 0;
    const onLostEvent = (event: Event) => {
      event.preventDefault();
      lost.current = true;
      // A lost canvas paints as a blank (white, with the browser's sad-face
      // glyph in some builds). Hide it so the shell's last sky colour shows.
      canvas.style.visibility = "hidden";
      stats.contextLosses++;
      // Give the browser a few seconds to restore before admitting defeat.
      timer = window.setTimeout(() => onLost(true), 4000);
    };
    const onRestored = () => {
      window.clearTimeout(timer);
      lost.current = false;
      onLost(false);
      // Programs, buffers and textures are rebuilt lazily by three; GPU-only
      // content (composer targets, environment bake) must be redone.
      const state = store.getState();
      post.current?.setSize(state.size.width, state.size.height);
      for (const listener of restoreListeners) listener(gl);
      state.invalidate();
      // Show the canvas again once a restored frame has been drawn.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!lost.current) canvas.style.visibility = "";
        }),
      );
    };
    canvas.addEventListener("webglcontextlost", onLostEvent);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      window.clearTimeout(timer);
      canvas.removeEventListener("webglcontextlost", onLostEvent);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, onLost, store]);

  // --- warmup ---------------------------------------------------------------
  useEffect(() => {
    instrument(gl);
    stats.tier = tier;
    const controller = new AbortController();
    const unregister = [
      registerWarmup({
        id: "engine:post",
        priority: 1,
        async run(ctx) {
          const state = store.getState();
          post.current = await createStagePost(
            ctx.gl as THREE.WebGLRenderer,
            state.scene,
            state.camera,
            ctx.tier,
          );
        },
      }),
      registerWarmup({
        id: "engine:compile",
        priority: 90,
        async run(ctx) {
          const state = store.getState();
          const renderer = ctx.gl as THREE.WebGLRenderer;
          // Parallel (KHR_parallel_shader_compile) where available.
          await renderer.compileAsync(state.scene, state.camera);
        },
      }),
    ];
    let running = false;
    const drain = async () => {
      if (running) return;
      running = true;
      try {
        for (;;) {
          const tasks = pendingWarmTasks();
          if (!tasks.length) break;
          const total = tasks.length;
          let index = 0;
          for (const task of tasks) {
            if (controller.signal.aborted) return;
            const state = store.getState();
            const ctx: WarmContext = {
              gl: state.gl,
              scene: state.scene,
              camera: state.camera,
              tier,
              signal: controller.signal,
              yieldToFrame: nextFrame,
            };
            try {
              await task.run(ctx);
            } catch (error) {
              console.warn(`warm task ${task.id} failed`, error);
            }
            completeWarmTask(task.id);
            if (!ready.current)
              useStage.setState({ warmProgress: ++index / (total + 1) });
            await nextFrame();
          }
        }
        if (!ready.current && !controller.signal.aborted) {
          // One warm frame: allocates the shadow map and render lists, uploads
          // remaining buffers, all while the stage is still hidden/veiled.
          ready.current = true;
          renderNow.current(store.getState(), 0);
          pinPrograms(gl);
          stats.linksAtReady = stats.links;
          await nextFrame();
          useStage.setState({ ready: true, warmProgress: 1 });
          if (autoEnter) {
            useStage.getState().setMode("game");
            revealHud();
          }
        }
      } finally {
        running = false;
      }
    };
    // Let the world subtree mount (and its own warm tasks register) first.
    let cancelled = false;
    void (async () => {
      await nextFrame();
      await nextFrame();
      if (!cancelled) await drain();
    })();
    const stop = onWarmupRegistered(() => {
      if (ready.current) void drain();
    });
    return () => {
      cancelled = true;
      controller.abort();
      stop();
      unregister.forEach((fn) => fn());
      post.current?.dispose();
      post.current = null;
    };
    // Engine mounts once per canvas; tier/autoEnter are fixed by then.
  }, [gl]);

  return null;
}

const restoreListeners = new Set<(gl: THREE.WebGLRenderer) => void>();
/** Re-do GPU-only content (bakes, render targets) after a context restore. */
export function onContextRestored(listener: (gl: THREE.WebGLRenderer) => void) {
  restoreListeners.add(listener);
  return () => void restoreListeners.delete(listener);
}
