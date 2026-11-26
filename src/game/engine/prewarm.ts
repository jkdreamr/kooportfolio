import * as THREE from "three";
import {
  TIER_BUDGETS,
  registerWarmup,
  useStage,
  type WarmContext,
} from "../../stage/contract";
import { exposeQa, qaEnabled } from "../../stage/qa";
import { useGame } from "../core/store";
import { useGameMode } from "../core/gameMode";
import { pinPrograms } from "./Engine";
import { usePresented } from "./presented";
import { stats } from "./stats";
import { resolveAo } from "./tier";

/**
 * Idle prewarm of the programs an activity links on its first visit, by
 * proxy, never by mounting the activity (interiors register window listeners
 * and read the global scene).
 *
 * A program's key is (material type + custom key + flags) × (light set, fog,
 * render target). First visits measured on the live build
 * (scratchpad/wsd/firstvisit.cjs) link only a handful of variants the hub
 * never needs:
 * - rooms: the world light set with the hub hidden (2 directional lights, 1
 *   shadow) and materials the hub does not use: the shadow catcher, plain,
 *   mapped and instanced standard/basic materials;
 * - game stages (Kitchen, Pong, Blackjack at y = 1000): their own extra
 *   shadow-casting key light (3 directional, 2 shadows), which re-keys every
 *   material drawn there, plus the matching shadow-depth programs.
 * Each entry is a proxy triangle (or a 1-instance InstancedMesh) with the
 * same flags, in an off-tree scene carrying the same light set and fog type.
 * Sculpted and baked materials are reused from the live hub (found by their
 * customProgramCacheKey), so their keys match exactly even as they evolve.
 *
 * The forward programs compile with `compileAsync` (KHR_parallel_shader_
 * compile), against a 1×1 target that reproduces the real target's key: the
 * composer's input on high (linear, no tone mapping), the canvas otherwise
 * (an `isXRRenderTarget` target keys like the screen). One tiny render of
 * the proxy scene then links the shadow-depth variants. A mismatch costs
 * nothing visible: the activity simply compiles as before.
 */

type Entry = {
  /** Reuse a live hub material whose customProgramCacheKey starts with this. */
  live?: { key: string; side?: THREE.Side };
  /** Or a fresh built-in material (disposed after; its program stays pinned). */
  make?: () => THREE.Material;
  instanced?: boolean;
  instanceColor?: boolean;
  /** Geometry carries a colour attribute (baked vertex colours). */
  colors?: boolean;
  /** Cast into the extra stage light's shadow (links the depth variants). */
  cast?: boolean;
};
type Activity = {
  id: string;
  /** Measured first-visit links before prewarm (for the report). */
  scenes: string;
  /** Adds the game stage's own shadow-casting key light. */
  stageLight?: boolean;
  entries: Entry[];
};

const texture = () => {
  const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  map.needsUpdate = true;
  return map;
};

export const PREWARM_ACTIVITIES: Activity[] = [
  {
    id: "rooms",
    scenes: "office 1, music 1, stadium 5, kappa 2 (entry)",
    entries: [
      // World's shadow catcher under every interior (Game.tsx World).
      { make: () => new THREE.ShadowMaterial({ transparent: true, opacity: 0.12 }) },
      { make: () => new THREE.MeshStandardMaterial() },
      { make: () => new THREE.MeshStandardMaterial({ map: texture() }) },
      { make: () => new THREE.MeshStandardMaterial(), instanced: true, instanceColor: true },
      { make: () => new THREE.MeshBasicMaterial(), instanced: true },
      { make: () => new THREE.MeshBasicMaterial({ toneMapped: false }), instanced: true },
      { make: () => new THREE.MeshBasicMaterial({ toneMapped: false }) },
    ],
  },
  {
    id: "game-stage",
    scenes: "kitchen 8, pong 5 (+1 depth on exit), blackjack",
    stageLight: true,
    entries: [
      { live: { key: "sculpted-surface", side: THREE.FrontSide }, cast: true },
      // Instanced kit pieces carry per-instance colours.
      {
        live: { key: "sculpted-surface", side: THREE.FrontSide },
        instanced: true,
        instanceColor: true,
        cast: true,
      },
      {
        live: { key: "sculpted-surface", side: THREE.DoubleSide },
        instanced: true,
        instanceColor: true,
      },
      { live: { key: "sculpted-bake", side: THREE.FrontSide }, colors: true },
      { live: { key: "sculpted-bake", side: THREE.DoubleSide }, colors: true },
      { make: () => new THREE.MeshStandardMaterial() },
      { make: () => new THREE.MeshStandardMaterial({ map: texture(), transparent: true }) },
      { make: () => new THREE.MeshBasicMaterial({ transparent: true }) },
    ],
  },
];

export type PrewarmReport = {
  state: "idle" | "waiting" | "running" | "done" | "skipped";
  reason?: string;
  activities: { id: string; links: number; programs: number; ms: number; missing: string[] }[];
};
const report: PrewarmReport = { state: "idle", activities: [] };
exposeQa({ prewarm: { report: () => JSON.parse(JSON.stringify(report)) } });

/** A live hub material with this key prefix and side, preferably one drawn
 * the same way (instanced or not, vertex colours or not), so its exact variant (e.g. flat shading)
 * matches what the activity draws. */
function findLive(
  scene: THREE.Scene,
  key: string,
  side: THREE.Side,
  instanced: boolean,
  colors: boolean,
) {
  let fallback: THREE.Material | null = null;
  let found: THREE.Material | null = null;
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (found || !mesh.isMesh) return;
    for (const material of ([] as THREE.Material[]).concat(mesh.material)) {
      if (material.side !== side || !material.customProgramCacheKey().startsWith(key)) continue;
      if (material.vertexColors !== colors) continue;
      if (!!(mesh as THREE.InstancedMesh).isInstancedMesh === instanced) {
        found = material;
        return;
      }
      fallback ??= material;
    }
  });
  return (found ?? fallback) as THREE.Material | null;
}

function proxyGeometry(colors: boolean) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Array(9).fill(1), 3));
  return geometry;
}

/** Same light set (types, counts, shadow casters) and fog type as World. */
function lightsLike(main: THREE.Scene, into: THREE.Scene, stageLight: boolean) {
  const skip = new Set(["hub-root", "scene-root"]);
  const visit = (node: THREE.Object3D) => {
    if (skip.has(node.name) || !node.visible) return;
    const light = node as THREE.Light;
    if (light.isLight) {
      let copy: THREE.Light | null = null;
      if ((light as THREE.HemisphereLight).isHemisphereLight) copy = new THREE.HemisphereLight();
      else if ((light as THREE.AmbientLight).isAmbientLight) copy = new THREE.AmbientLight();
      else if ((light as THREE.DirectionalLight).isDirectionalLight) copy = new THREE.DirectionalLight();
      else if ((light as THREE.PointLight).isPointLight) copy = new THREE.PointLight();
      else if ((light as THREE.SpotLight).isSpotLight) copy = new THREE.SpotLight();
      if (copy) {
        copy.castShadow = light.castShadow;
        into.add(copy);
      }
    }
    node.children.forEach(visit);
  };
  main.children.forEach(visit);
  if (stageLight) {
    const key = new THREE.DirectionalLight();
    key.castShadow = true;
    into.add(key);
  }
  into.traverse((node) => {
    const light = node as THREE.DirectionalLight;
    if (light.isLight && light.castShadow && light.shadow) light.shadow.mapSize.set(16, 16);
  });
  into.fog = main.fog
    ? (main.fog as THREE.FogExp2).isFogExp2
      ? new THREE.FogExp2(0xffffff)
      : new THREE.Fog(0xffffff)
    : null;
}

const nextIdle = () =>
  new Promise<void>((resolve) => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 2000 });
    else window.setTimeout(resolve, 200);
  });

async function warmActivity(ctx: WarmContext, activity: Activity) {
  const gl = ctx.gl as THREE.WebGLRenderer;
  const main = ctx.scene as THREE.Scene;
  const camera = ctx.camera as THREE.Camera;
  const t0 = performance.now();
  const links0 = stats.links;
  const programs0 = gl.info.programs?.length ?? 0;
  const proxy = new THREE.Scene();
  lightsLike(main, proxy, !!activity.stageLight);
  const made: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const missing: string[] = [];
  for (const entry of activity.entries) {
    const material = entry.live
      ? findLive(
          main,
          entry.live.key,
          entry.live.side ?? THREE.FrontSide,
          !!entry.instanced,
          !!entry.colors,
        )
      : entry.make!();
    if (!material) {
      missing.push(`${entry.live?.key}:${entry.live?.side}`);
      continue;
    }
    if (!entry.live) made.push(material);
    const geometry = proxyGeometry(!!entry.colors);
    geometries.push(geometry);
    let mesh: THREE.Mesh;
    if (entry.instanced) {
      const instanced = new THREE.InstancedMesh(geometry, material, 1);
      instanced.setMatrixAt(0, new THREE.Matrix4());
      if (entry.instanceColor) instanced.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh = instanced;
    } else mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = !!entry.cast;
    mesh.receiveShadow = true;
    proxy.add(mesh);
  }
  // The key of a program depends on the target it renders into.
  const composer = resolveAo(TIER_BUDGETS[ctx.tier].ao, gl) !== "none";
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  if (!composer) {
    (target as THREE.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    target.texture.colorSpace = gl.outputColorSpace;
  }
  const previous = gl.getRenderTarget();
  let pending: Promise<unknown> = Promise.resolve();
  try {
    gl.setRenderTarget(target);
    pending = gl.compileAsync(proxy, camera);
  } catch {
    // Compile errors surface on the real render; prewarm is best-effort.
  } finally {
    gl.setRenderTarget(previous);
  }
  await Promise.race([pending.catch(() => {}), new Promise((r) => setTimeout(r, 8000))]);
  // Shadow-depth variants are linked by the shadow pass only: one render of
  // the proxy scene into the 1×1 target (its own 16² shadow maps).
  if (activity.entries.some((entry) => entry.cast)) {
    await nextIdle();
    const shadowMap = gl.shadowMap;
    const { autoUpdate, needsUpdate } = shadowMap;
    try {
      gl.setRenderTarget(target);
      shadowMap.autoUpdate = false;
      shadowMap.needsUpdate = true;
      gl.render(proxy, camera);
    } catch {
      /* best-effort */
    } finally {
      shadowMap.autoUpdate = autoUpdate;
      shadowMap.needsUpdate = needsUpdate;
      gl.setRenderTarget(previous);
    }
  }
  // Keep the programs for the session, then drop everything else.
  pinPrograms(gl);
  for (const material of made) {
    (material as THREE.MeshStandardMaterial).map?.dispose();
    material.dispose();
  }
  geometries.forEach((geometry) => geometry.dispose());
  proxy.traverse((node) => (node as THREE.DirectionalLight).shadow?.dispose?.());
  target.dispose();
  const links = stats.links - links0;
  stats.prewarmLinks += links;
  report.activities.push({
    id: activity.id,
    links,
    programs: (gl.info.programs?.length ?? 0) - programs0,
    ms: Math.round(performance.now() - t0),
    missing,
  });
}

const forced = () => {
  if (!qaEnabled()) return false;
  try {
    return new URLSearchParams(location.search).get("prewarm") === "force";
  } catch {
    return false;
  }
};
function skipReason(gl: THREE.WebGLRenderer): string | null {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  if (nav.connection?.saveData) return "save-data";
  if (/(^|-)2g$/.test(nav.connection?.effectiveType ?? "")) return "2g";
  if (useStage.getState().tier === "low") return "low tier";
  // QA builds can force it on software renderers to measure the link effect
  // (without the extension the compile is synchronous: long tasks).
  if (forced()) return null;
  if (!gl.extensions.has("KHR_parallel_shader_compile")) return "no KHR_parallel_shader_compile";
  return null;
}

/** Calm hub: the visitor is outside, nothing else is loading or open. */
function calm() {
  const stage = useStage.getState();
  const g = useGame.getState();
  return (
    stage.mode === "game" &&
    stage.ready &&
    stage.hudRevealed &&
    g.scene === "hub" &&
    usePresented.getState().scene === "hub" &&
    !g.traveling &&
    !useGameMode.getState().active
  );
}

const IDLE_DELAY_MS = 3000;
let started = false;
/** Start the idle prewarm (once per session): 3 s after the hub is calm,
 * one activity per idle slice. */
export function startIdlePrewarm() {
  if (started || typeof window === "undefined") return;
  started = true;
  report.state = "waiting";
  void (async () => {
    const waitCalm = async () => {
      for (;;) {
        if (calm()) {
          await new Promise((r) => setTimeout(r, IDLE_DELAY_MS));
          if (calm()) return;
        } else await new Promise((r) => setTimeout(r, 1000));
      }
    };
    for (const activity of PREWARM_ACTIVITIES) {
      await waitCalm();
      await nextIdle();
      if (!calm()) {
        await waitCalm();
      }
      const finished = await new Promise<boolean>((resolve) => {
        // The engine may start this task synchronously inside registerWarmup.
        registerWarmup({
          id: `prewarm:${activity.id}`,
          priority: 200,
          async run(ctx) {
            const gl = ctx.gl as THREE.WebGLRenderer;
            const reason = skipReason(gl);
            if (reason) {
              report.state = "skipped";
              report.reason = reason;
              return resolve(false);
            }
            report.state = "running";
            try {
              await warmActivity(ctx, activity);
            } catch (error) {
              console.warn("prewarm failed", activity.id, error);
            }
            resolve(true);
          },
        });
      });
      if (!finished) return;
    }
    report.state = "done";
  })();
}

/* Dev only: on the first present of each scene, log the material variants
 * its meshes draw with (type, custom key, flags). This is how the entries
 * above were built; new rooms add theirs from this table. */
if (import.meta.env.DEV && typeof window !== "undefined") {
  const logged = new Set<string>();
  usePresented.subscribe(({ scene }) => {
    if (logged.has(scene)) return;
    logged.add(scene);
    registerWarmup({
      id: `prewarm:describe:${scene}`,
      priority: 250,
      run(ctx) {
        const root = (ctx.scene as THREE.Scene).getObjectByName(
          scene === "hub" ? "hub-root" : "scene-root",
        );
        const rows = new Map<string, Record<string, unknown>>();
        root?.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const m of ([] as THREE.Material[]).concat(mesh.material)) {
            const row = {
              type: m.type,
              key: m.customProgramCacheKey().slice(0, 40),
              instanced: !!(mesh as THREE.InstancedMesh).isInstancedMesh,
              instanceColor: !!(mesh as THREE.InstancedMesh).instanceColor,
              colors: !!mesh.geometry.attributes.color,
              map: !!(m as THREE.MeshStandardMaterial).map,
              side: m.side,
              transparent: m.transparent,
              toneMapped: m.toneMapped,
              cast: mesh.castShadow,
            };
            rows.set(JSON.stringify(row), row);
          }
        });
        console.info(`[prewarm] variants in ${scene}`);
        console.table([...rows.values()]);
      },
    });
  });
}
