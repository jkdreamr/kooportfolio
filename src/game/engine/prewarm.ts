import * as THREE from "three";
import { LineMaterial } from "three-stdlib";
import {
  TIER_BUDGETS,
  registerWarmup,
  useStage,
  type Tier,
  type WarmContext,
} from "../../stage/contract";
import { exposeQa, qaEnabled } from "../../stage/qa";
import { useGame } from "../core/store";
import { useGameMode } from "../core/gameMode";
import { pinPrograms } from "./Engine";
import { usePresented } from "./presented";
import { stats } from "./stats";
import { resolveAo } from "./tier";
import { STADIUM_BACKDROP_SHADERS } from "../scenes/StadiumView";
import { pondWater } from "../world/Landscape";
import { PLAYER_MARKER_MATERIALS } from "../world/PlayerMarker";
import { riverMaterial } from "../world/KoreaWorldEnvironment";

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
  /** Reuse a live hub material whose customProgramCacheKey starts with this
   * (any side when `side` is left out). */
  live?: { key: string; side?: THREE.Side };
  /** Or a fresh built-in material (disposed after; its program stays pinned). */
  make?: () => THREE.Material;
  /** Or a long-lived module material of another world (compiled as is,
   * never disposed). */
  shared?: () => THREE.Material;
  instanced?: boolean;
  instanceColor?: boolean;
  /** Geometry carries a colour attribute (baked vertex colours). */
  colors?: boolean;
  /** Cast into the extra stage light's shadow (links the depth variants). */
  cast?: boolean;
  /** Instead of a colour program: the shadow-depth program three's shadow
   * pass uses for a caster of this side drawn this way (MeshDepthMaterial,
   * RGBA packing, the opposite face), compiled against a plain target like
   * the shadow map, so it builds in parallel instead of in a render. */
  depth?: THREE.Side;
};
/** Lights a scene adds to the world's own set (every one re-keys every
 * material drawn under it). */
type ExtraLight = "key-shadow" | "spot-shadow" | "point";
type Activity = {
  id: string;
  /** Measured first-visit links before prewarm (for the report). */
  scenes: string;
  /** The scene's own lights, added to a copy of the world's. */
  lights?: ExtraLight[];
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
      // Shadow-depth variants of instanced room furniture (office: 1 link).
      { depth: THREE.FrontSide, instanced: true },
      { depth: THREE.FrontSide, instanced: true, instanceColor: true },
      { depth: THREE.FrontSide },
      // drei <Line> (court markings, skate rails): one program per
      // transparency; the shader stage itself is kept for the session
      // (Engine.keepShaderStages), so later mounts never relink.
      { make: () => new LineMaterial() },
      // A see-through line keys twice: its first compile has no
      // USE_LINE_COLOR_ALPHA define yet (LineMaterial adds it in
      // onBeforeCompile, after the key), every later one has it.
      { make: () => new LineMaterial({ transparent: true }) },
      {
        make: () => {
          const line = new LineMaterial({ transparent: true });
          line.defines.USE_LINE_COLOR_ALPHA = "1";
          return line;
        },
      },
      // The basketball court's grain-painted floor and ball (map + bump, bump).
      { make: () => new THREE.MeshStandardMaterial({ map: texture(), bumpMap: texture() }) },
      { make: () => new THREE.MeshStandardMaterial({ bumpMap: texture() }) },
      // The 49ers stadium's sky backdrop (its own shader: 1 link on entry).
      {
        make: () =>
          new THREE.ShaderMaterial({
            ...STADIUM_BACKDROP_SHADERS,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
          }),
      },
    ],
  },
  {
    // Travel arrivals: what Stanford and Korea draw that Home does not
    // (measured: 3–5 links at the swap). The journey also compiles the new
    // world behind its full veil (veilCompile.ts); this makes most of that
    // work happen in idle time instead.
    id: "worlds",
    scenes: "Stanford arrival 3, Korea arrival 4-5 (during the travel hold)",
    entries: [
      { shared: () => pondWater },
      { shared: () => riverMaterial },
      { make: () => new THREE.MeshStandardMaterial({ map: texture(), transparent: true }), instanced: true },
      {
        make: () => new THREE.MeshBasicMaterial({ map: texture(), transparent: true, alphaTest: 0.1 }),
        instanced: true,
      },
    ],
  },
  {
    // The gym's own spot (a shadow caster on the high look) and fill point
    // light re-key everything drawn there: 11 programs + 4 depth variants.
    id: "badminton",
    scenes: "badminton 22 (11 under a doubled light set, fixed in Game.tsx), exit 2",
    lights: ["spot-shadow", "point"],
    entries: [
      { live: { key: "sculpted-surface", side: THREE.FrontSide } },
      { live: { key: "sculpted-surface", side: THREE.FrontSide }, instanced: true, instanceColor: true },
      { live: { key: "sculpted-surface", side: THREE.DoubleSide }, instanced: true, instanceColor: true },
      { live: { key: "sculpted-bake", side: THREE.FrontSide }, colors: true },
      { live: { key: "gloss-glass-v1:0:1" }, instanced: true },
      // The player's locator arrow (fog-free glass and its rim lines).
      { shared: () => PLAYER_MARKER_MATERIALS[0] },
      { shared: () => PLAYER_MARKER_MATERIALS[1] },
      { live: { key: "env-contact-blob" }, instanced: true },
      { make: () => new THREE.MeshStandardMaterial() },
      { make: () => new THREE.MeshStandardMaterial({ map: texture(), transparent: true }) },
      { make: () => new THREE.MeshBasicMaterial({ transparent: true }) },
      { make: () => new THREE.ShadowMaterial({ transparent: true, opacity: 0.12 }) },
      // GlazedPanel's pane: clear-coated, see-through, no environment map.
      { make: () => new THREE.MeshPhysicalMaterial({ clearcoat: 1, transparent: true }) },
      { depth: THREE.FrontSide },
      { depth: THREE.FrontSide, instanced: true },
      { depth: THREE.FrontSide, instanced: true, instanceColor: true },
    ],
  },
  {
    id: "game-stage",
    scenes: "kitchen 8, pong 5 (+1 depth on exit), blackjack",
    lights: ["key-shadow"],
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
      // The key light's shadow-depth variants for the two `cast` casters
      // above, compiled in parallel so the shadow render below links nothing.
      { depth: THREE.FrontSide },
      { depth: THREE.FrontSide, instanced: true, instanceColor: true },
    ],
  },
];

export type PrewarmReport = {
  state: "idle" | "waiting" | "running" | "done" | "skipped";
  reason?: string;
  activities: {
    id: string;
    links: number;
    programs: number;
    ms: number;
    /** Longest synchronous main-thread slice (compile call or render). */
    longestSliceMs: number;
    missing: string[];
  }[];
};
const report: PrewarmReport = { state: "idle", activities: [] };
exposeQa({ prewarm: { report: () => JSON.parse(JSON.stringify(report)) } });

/** A live hub material with this key prefix and side, preferably one drawn
 * the same way (instanced or not, vertex colours or not), so its exact variant (e.g. flat shading)
 * matches what the activity draws. */
function findLive(
  scene: THREE.Scene,
  key: string,
  side: THREE.Side | undefined,
  instanced: boolean,
  colors: boolean,
) {
  let fallback: THREE.Material | null = null;
  let found: THREE.Material | null = null;
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (found || !mesh.isMesh) return;
    for (const material of ([] as THREE.Material[]).concat(mesh.material)) {
      if (side !== undefined && material.side !== side) continue;
      if (!material.customProgramCacheKey().startsWith(key)) continue;
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
function lightsLike(main: THREE.Scene, into: THREE.Scene, extra: readonly ExtraLight[]) {
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
  for (const kind of extra) {
    const light =
      kind === "key-shadow"
        ? new THREE.DirectionalLight()
        : kind === "spot-shadow"
          ? new THREE.SpotLight()
          : new THREE.PointLight();
    // Scenes cast from their key and spot lights only on the "high" legacy
    // look (every tier prewarm runs on).
    light.castShadow = kind !== "point" && useGame.getState().quality === "high";
    into.add(light);
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

/** A 1×1 target whose programs key exactly like the real frame's: the
 * composer's input on high (linear, no tone mapping), the canvas otherwise
 * (an `isXRRenderTarget` target keys like the screen). Dispose after use. */
export function keyTarget(gl: THREE.WebGLRenderer, tier: Tier) {
  const composer = resolveAo(TIER_BUDGETS[tier].ao, gl) !== "none";
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  if (!composer) {
    (target as THREE.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    target.texture.colorSpace = gl.outputColorSpace;
  }
  return target;
}

/**
 * The material walk of `group` for `compile(view, camera, scene)` without
 * its lights. three gathers lights from the target scene *and* from the
 * object it compiles; when that object is already a child of the scene its
 * own lights count twice, and every material compiles for a light set no
 * frame ever draws (badminton: 11 wasted links, then the 11 real ones on the
 * first frame after the swap).
 */
export function materialsOf(group: THREE.Object3D): THREE.Object3D {
  return {
    traverse: (callback: (object: THREE.Object3D) => void) => group.traverse(callback),
    traverseVisible: () => {},
  } as unknown as THREE.Object3D;
}

/**
 * One shadow pass of `scene` into a 1×1 target, so the shadow-depth programs
 * its casters need are linked now (behind a hold, or in idle time) rather
 * than on the first frame that shows them. `hide` objects are left out (the
 * hub behind an incoming room). Best-effort; never throws.
 */
export function linkShadowDepth(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  tier: Tier,
  hide: THREE.Object3D[] = [],
) {
  if (!gl.shadowMap.enabled) return;
  const target = keyTarget(gl, tier);
  const previous = gl.getRenderTarget();
  const shadowMap = gl.shadowMap;
  const { autoUpdate } = shadowMap;
  const shown = hide.map((object) => object.visible);
  try {
    hide.forEach((object) => (object.visible = false));
    gl.setRenderTarget(target);
    shadowMap.autoUpdate = false;
    shadowMap.needsUpdate = true;
    gl.render(scene, camera);
  } catch {
    /* best-effort */
  } finally {
    hide.forEach((object, i) => (object.visible = shown[i]));
    shadowMap.autoUpdate = autoUpdate;
    // The next real frame redraws its own shadows.
    shadowMap.needsUpdate = true;
    gl.setRenderTarget(previous);
    target.dispose();
  }
}

const nextIdle = () =>
  new Promise<void>((resolve) => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 2000 });
    else window.setTimeout(resolve, 200);
  });

/** Programs compiled per idle slice: each costs ~2–6 ms of main-thread
 * work (parameters, key, source) before the driver compiles in parallel, so
 * a slice stays well under 50 ms. */
const SLICE = 4;

async function warmActivity(ctx: WarmContext, activity: Activity) {
  const gl = ctx.gl as THREE.WebGLRenderer;
  const main = ctx.scene as THREE.Scene;
  const camera = ctx.camera as THREE.Camera;
  const t0 = performance.now();
  const links0 = stats.links;
  const programs0 = gl.info.programs?.length ?? 0;
  const proxy = new THREE.Scene();
  lightsLike(main, proxy, activity.lights ?? []);
  const made: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const missing: string[] = [];
  const colour: THREE.Mesh[] = [];
  const depth: THREE.Mesh[] = [];
  for (const entry of activity.entries) {
    let material: THREE.Material | null;
    if (entry.depth !== undefined) {
      material = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        side: entry.depth === THREE.DoubleSide ? THREE.DoubleSide : entry.depth === THREE.BackSide ? THREE.FrontSide : THREE.BackSide,
      });
    } else if (entry.live) {
      material = findLive(main, entry.live.key, entry.live.side, !!entry.instanced, !!entry.colors);
    } else if (entry.shared) material = entry.shared();
    else material = entry.make!();
    if (!material) {
      missing.push(`${entry.live?.key}:${entry.live?.side ?? "any"}`);
      continue;
    }
    if (!entry.live && !entry.shared) made.push(material);
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
    (entry.depth !== undefined ? depth : colour).push(mesh);
  }
  // Every mesh sits in the proxy (for the shadow render below); each slice
  // compiles its own few through a light-free view (materialsOf), so the
  // proxy's lights count once.
  const all = new THREE.Group();
  for (const mesh of [...colour, ...depth]) all.add(mesh);
  proxy.add(all);
  let longest = 0;
  const compileSlices = async (meshes: THREE.Mesh[], target: THREE.WebGLRenderTarget) => {
    for (let i = 0; i < meshes.length; i += SLICE) {
      if (i) await nextIdle();
      const part = meshes.slice(i, i + SLICE);
      const start = performance.now();
      const previous = gl.getRenderTarget();
      let pending: Promise<unknown> = Promise.resolve();
      try {
        gl.setRenderTarget(target);
        // compile() walks `scene` for materials only; the meshes stay where
        // they are (in the proxy) while a light-free view lists them.
        pending = gl.compileAsync(
          materialsOf({ traverse: (cb: (o: THREE.Object3D) => void) => part.forEach(cb) } as unknown as THREE.Object3D),
          camera,
          proxy,
        );
      } catch {
        // Compile errors surface on the real render; prewarm is best-effort.
      } finally {
        gl.setRenderTarget(previous);
      }
      longest = Math.max(longest, performance.now() - start);
      await Promise.race([pending.catch(() => {}), new Promise((r) => setTimeout(r, 8000))]);
    }
  };
  // Colour programs key like the real frame; depth programs like a shadow
  // map (a plain linear target, no tone mapping).
  const target = keyTarget(gl, ctx.tier);
  const shadowTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  await compileSlices(colour, target);
  // The shadow pass draws with no scene (no fog): neither may the depth
  // compiles, or the fog bits re-key them.
  const fog = proxy.fog;
  proxy.fog = null;
  await compileSlices(depth, shadowTarget);
  proxy.fog = fog;
  // Shadow-depth variants of `cast` entries: one tiny render of the proxy
  // scene into the 1×1 target (its own 16² shadow maps). Depth entries above
  // normally compiled them already; this only catches what they missed.
  if (activity.entries.some((entry) => entry.cast)) {
    await nextIdle();
    for (const mesh of depth) mesh.visible = false;
    const shadowMap = gl.shadowMap;
    const { autoUpdate, needsUpdate } = shadowMap;
    const previous = gl.getRenderTarget();
    const start = performance.now();
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
    longest = Math.max(longest, performance.now() - start);
  }
  // Keep the programs for the session, then drop everything else.
  pinPrograms(gl);
  for (const material of made) {
    (material as THREE.MeshStandardMaterial).map?.dispose();
    (material as THREE.MeshStandardMaterial).bumpMap?.dispose();
    material.dispose();
  }
  geometries.forEach((geometry) => geometry.dispose());
  proxy.traverse((node) => (node as THREE.DirectionalLight).shadow?.dispose?.());
  target.dispose();
  shadowTarget.dispose();
  const links = stats.links - links0;
  stats.prewarmLinks += links;
  report.activities.push({
    id: activity.id,
    links,
    programs: (gl.info.programs?.length ?? 0) - programs0,
    ms: Math.round(performance.now() - t0),
    longestSliceMs: Math.round(longest),
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
