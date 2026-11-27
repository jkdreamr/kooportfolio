import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Canvas,
  events as createPointerEvents,
  useFrame,
  useThree,
  type RootState,
} from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import {
  ACTIVITY_FOV,
  TELEPHOTO_FOV,
  setFlightObstacles,
  type FlightObstacleBox,
  TIER_BUDGETS,
  gameInputEnabled,
  useStage,
  type Tier,
} from "../stage/contract";
import { EngineRuntime, pinPrograms, rig } from "./engine/Engine";
import { WorldActiveContext } from "./engine/active";
import { usePresented } from "./engine/presented";
import { PerfOverlay } from "./engine/PerfOverlay";
import { installGradeToneMapping } from "./engine/grade";
import { legacyQuality, pickTier, resolveAo } from "./engine/tier";
import { setBoomObstacles } from "./engine/view";
import { Hub } from "./world/Hub";
import { Interior } from "./scenes/Interior";
import { Rowing } from "./scenes/Rowing";
import { StudyPaperToss } from "./scenes/StudyPaperToss";
import { Basketball } from "./scenes/Basketball";
import { Hud } from "./ui/Hud";
import { leaveRoom, throughDoorway } from "./core/doorway";
import { TimeOfDayLighting } from "./world/TimeOfDayLighting";
import { TimeOfDayControls } from "./ui/TimeOfDayControls";
import { WorldZoomControls, WorldZoomInput } from "./ui/WorldZoom";
import { daylightClock, useTimeOfDay } from "./core/timeOfDay";
import { sampleDaylight } from "./core/daylight";
import { islandFollow } from "./core/islandCamera";
import { islandForWorld } from "./core/homeIsland";
import { useWorldView, viewRuntime } from "./core/worldView";
import { ISLAND_CAMERA_OFFSET } from "./core/islandView";
import { updateGloss } from "./world/GlossKit";
import { WORLDS } from "./core/worlds";
import { runtime, useGame, type Scene } from "./core/store";
import { useInput } from "./core/input";
import { endGameMode, useGameMode } from "./core/gameMode";
import { doors, doorsInWorld, isInterior } from "./core/world";
import { FLIGHT_OBSTACLES } from "./core/heroSpots";
import type { WorldId } from "../shared/worlds";
import { useGym } from "./scenes/CognitionGym";
import { interactWithNpc } from "./core/npcState";
import { NpcDialog } from "./ui/NpcConversation";
import { WorldAmbience } from "./world/WorldAmbience";
import { PhotoBoothDialog, openPhotoBooth } from "./ui/PhotoBoothDialog";
import { TelescopeView } from "./ui/TelescopeView";
import { SkateParkInterior } from "./scenes/SkatePark";
import { useTheater } from "./scenes/MovieTheater";
import {
  collectHooverKey,
  claimHooverStash,
  HOOVER_KEY,
  HOOVER_STASH,
} from "./core/hoover";
import "./game.css";
import "./game-mode.css";

class WorldBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <WorldFallback /> : this.props.children;
  }
}
function WorldFallback() {
  return (
    <div className="world-fallback">
      <h1>3D unavailable</h1>
      <p>
        WebGL may be unavailable. Your local progress is not reset.
        <br />
        Try another browser, or explore the real-world version below.
      </p>
      <a className="primary-button" href="/work">
        See Joshua’s work ↗
      </a>
      <a href="/contact">Get in touch</a>
      <button onClick={() => location.reload()}>Try the world again</button>
    </div>
  );
}
// Key light at noon: the shadow camera sits far enough back that a whole
// island fits between its near and far planes. The azimuth and elevation
// follow the hour (late afternoon gives long warm shadows).
const SUN_DISTANCE = Math.hypot(-60, 120, 60);
const NOON_AZIMUTH = Math.atan2(60, -60);
const NOON_ELEVATION = Math.atan2(120, Math.hypot(60, 60));
const reducedMotion =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;
const sunDirection = new THREE.Vector3();
/** Unit vector toward the sun for an hour of day (interiors keep noon). */
export function sunDirectionFor(hour: number, out = sunDirection) {
  // Day arc 6:00 → 18:30; outside it the (moon) light parks near noon so
  // night shadows stay short and readable.
  const day = Math.min(1, Math.max(0, (hour - 6) / 12.5));
  const isDay = hour >= 6 && hour <= 18.5;
  const swing = isDay ? (day - 0.5) * 1.6 : 0.35;
  // Quantised to 0.25° so a slowly moving sun never crawls shadow texels.
  const step = (0.25 * Math.PI) / 180;
  const azimuth = Math.round((NOON_AZIMUTH + swing) / step) * step;
  const height = isDay ? Math.sin(day * Math.PI) : 0.8;
  const elevation =
    Math.round(
      THREE.MathUtils.lerp(0.42, NOON_ELEVATION, Math.min(1, height * 1.15)) /
        step,
    ) * step;
  return out.set(
    Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.sin(azimuth) * Math.cos(elevation),
  );
}
/** Horizontal view direction of both hub views (toward -ISLAND_CAMERA_OFFSET). */
const EXPLORE_AHEAD = (() => {
  const [ox, , oz] = ISLAND_CAMERA_OFFSET;
  const length = Math.hypot(ox, oz);
  return [-ox / length, -oz / length] as const;
})();
const lightRight = new THREE.Vector3(),
  lightUp = new THREE.Vector3(),
  worldUp = new THREE.Vector3(0, 1, 0),
  snapped = new THREE.Vector3();
function Sun({ tier }: { tier: Tier }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const hemisphere = useRef<THREE.HemisphereLight | undefined>(undefined);
  const target = useMemo(() => new THREE.Object3D(), []);
  // One map for the session: 2048 at most (4096 depth targets risked context
  // loss on mobile and software rasterisers), chosen with the tier.
  const mapSize = TIER_BUDGETS[tier].shadowMapSize || 512;
  const casts = TIER_BUDGETS[tier].shadowMapSize > 0;
  const gl = useThree((s) => s.gl);
  useFrame(({ camera, scene: root }, delta) => {
    const { world, quality, paused } = useGame.getState();
    const scene = usePresented.getState().scene;
    const race = scene === "rowing";
    const hub = scene === "hub";
    let x = race ? camera.position.x : hub ? runtime.x : 0;
    let z = race ? camera.position.z - 18 : hub ? runtime.z : 0;
    // At the overview the whole island is on screen, so the whole island is
    // shadowed; walking views shrink back to a crisp player-sized frustum.
    const follow = hub ? islandFollow(useWorldView.getState().zoom) : 1;
    const island = islandForWorld(world);
    const reach = Math.hypot(
      island.radiusX + (world === "home" ? 9 : 4),
      island.radiusZ + (world === "home" ? 9 : 4),
    );
    x = THREE.MathUtils.lerp(island.centerX, x, follow);
    z = THREE.MathUtils.lerp(island.centerZ, z, follow);
    // Tight follow frustum when walking; island-wide only at the overview.
    let halfRight = THREE.MathUtils.lerp(reach * Math.SQRT1_2, 26, follow);
    let halfUp = THREE.MathUtils.lerp(reach / Math.sqrt(3), 24, follow);
    // Roofs and towers lean toward the top of the light's view.
    let top = halfUp + 14 * (1 - follow);
    // Explore view: a 45-unit frustum centred 18 units ahead of the player
    // along the view direction, mixed in with the view blend.
    const explore = hub ? viewRuntime.blend : 0;
    if (explore > 0) {
      x = THREE.MathUtils.lerp(x, runtime.x + EXPLORE_AHEAD[0] * 18, explore);
      z = THREE.MathUtils.lerp(z, runtime.z + EXPLORE_AHEAD[1] * 18, explore);
      halfRight = THREE.MathUtils.lerp(halfRight, 45, explore);
      halfUp = THREE.MathUtils.lerp(halfUp, 45, explore);
      top = THREE.MathUtils.lerp(top, 45, explore);
    }
    const sun = light.current;
    if (sun) {
      // PCF radius is a uniform: softer explore shadows cost no relink.
      sun.shadow.radius = 3 + explore;
      const view = sun.shadow.camera;
      if (
        view.right !== halfRight ||
        view.top !== top ||
        view.bottom !== -halfUp
      ) {
        view.left = -halfRight;
        view.right = halfRight;
        view.top = top;
        view.bottom = -halfUp;
        view.updateProjectionMatrix();
      }
    }
    const direction = hub || race
      ? sunDirectionFor(daylightClock.hour)
      : sunDirectionFor(12.25);
    // Snap the tracking light in its own texel space. Fractional shadow-map
    // motion otherwise makes stationary roofs/grass sparkle while walking.
    lightRight.crossVectors(worldUp, direction).normalize();
    lightUp.crossVectors(direction, lightRight).normalize();
    const texelRight = (halfRight * 2) / mapSize;
    const texelUp = (top + halfUp) / mapSize;
    const right = Math.round((x * lightRight.x + z * lightRight.z) / texelRight) * texelRight;
    const up = Math.round((x * lightUp.x + z * lightUp.z) / texelUp) * texelUp;
    // Solve for the ground point (y = 0) with those light-space coordinates.
    const det = lightRight.x * lightUp.z - lightRight.z * lightUp.x;
    if (Math.abs(det) > 1e-5)
      snapped.set(
        (right * lightUp.z - up * lightRight.z) / det,
        0,
        (up * lightRight.x - right * lightUp.x) / det,
      );
    else snapped.set(x, 0, z);
    target.position.copy(snapped);
    target.updateMatrixWorld();
    sun?.position.copy(snapped).addScaledVector(direction, SUN_DISTANCE);
    // One driver for every glossy surface: sky tint, night glow, water time.
    if (!hemisphere.current) {
      const found = root.getObjectByName("world-hemisphere");
      if (found instanceof THREE.HemisphereLight) hemisphere.current = found;
    }
    updateGloss(
      gl,
      hemisphere.current,
      sampleDaylight(daylightClock.hour).night,
      delta,
      quality === "high",
      !paused && !reducedMotion?.matches,
    );
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight
        name="world-sun"
        ref={light}
        target={target}
        intensity={3.1}
        color="#fff0cc"
        castShadow={casts}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-near={1}
        shadow-camera-far={320}
        shadow-normalBias={0.04}
        shadow-bias={-0.0002}
        shadow-radius={3}
      />
    </>
  );
}

/** Where activity scenes used to mount their own camera. */
const ACTIVITY_START: Record<string, [number, number, number]> = {
  rowing: [3, 9.5, 17],
  "paper-toss": [0, 9, 16],
  basketball: [7, 12, 18],
};

/**
 * One persistent perspective camera. Hub and interiors use a 20° telephoto
 * lens (Walker maps the old ortho zoom to distance); activities use 55°.
 * A scene change never cuts: the rig blends from the on-screen pose.
 */
function SceneCamera() {
  const camera = useThree((s) => s.camera);
  const key = useRef("");
  useFrame(() => {
    const { scene } = useGame.getState();
    const paperToss =
      scene === "office" && useGameMode.getState().active?.id === "paper-toss";
    const activity = paperToss || !(scene === "hub" || isInterior(scene));
    const next = `${scene}:${paperToss}`;
    if (next === key.current) return;
    const first = key.current === "";
    key.current = next;
    const perspective = camera as THREE.PerspectiveCamera;
    if (activity) {
      const start = ACTIVITY_START[paperToss ? "paper-toss" : scene] ??
        ACTIVITY_START.basketball;
      perspective.position.set(...start);
      perspective.lookAt(0, 0, 0);
      perspective.fov = ACTIVITY_FOV;
      perspective.near = 0.1;
      perspective.far = 130;
      perspective.userData.viewDistance = Math.hypot(...start);
      perspective.updateProjectionMatrix();
    } else if (perspective.fov !== TELEPHOTO_FOV) {
      perspective.fov = TELEPHOTO_FOV;
      perspective.updateProjectionMatrix();
    }
    usePresented.setState({ activity });
    if (!first) rig.blend(0.6);
  }, -10);
  return null;
}

/** Scenes other than the hub mount hidden, compile (parallel where the
 * driver allows), then take over: the previous frame stays on screen with
 * the camera held, so there is no stall-frame or blank between them. */
function useIncomingScene(scene: Scene) {
  const gl = useThree((s) => s.gl);
  const incoming = useRef<THREE.Group>(null);
  const presented = usePresented((s) => s.scene);
  useEffect(() => {
    if (presented === scene) return;
    if (scene === "hub") {
      // The hub never unmounts: it is compiled and current already. Nothing
      // was held on the way out, so blend from the interior's last frame
      // (release() alone only blends after a hold: walking out was a cut).
      usePresented.setState({ scene });
      rig.release(0.6);
      rig.blend(0.6);
      return;
    }
    let cancelled = false;
    rig.hold();
    void (async () => {
      // Let the incoming subtree mount and its effects run.
      await new Promise((r) => requestAnimationFrame(r));
      const group = incoming.current;
      const root = useThreeRoot.current;
      if (group && root) {
        let pending: Promise<unknown> = Promise.resolve();
        group.visible = true;
        try {
          pending = gl.compileAsync(group, root.camera, root.scene);
        } catch {
          // Compile errors surface on render; never block the swap on them.
        } finally {
          group.visible = false;
        }
        // Never hold the camera longer than 2.5 s, whatever the driver does.
        await Promise.race([
          pending.catch(() => {}),
          new Promise((r) => setTimeout(r, 2500)),
        ]);
        // Keep these programs for the session: leaving this scene later
        // must not release (and re-entering relink) them.
        pinPrograms(gl);
      }
      if (cancelled) return;
      rig.release(0.6);
      usePresented.setState({ scene });
    })();
    return () => {
      cancelled = true;
      // Superseded before it presented (e.g. straight back outside).
      rig.release(0.3);
    };
  }, [gl, presented, scene]);
  return { incoming, presented };
}
const useThreeRoot: { current: RootState | null } = { current: null };
function RootCapture() {
  const state = useThree();
  useThreeRoot.current = state;
  return null;
}

function World({ tier }: { tier: Tier }) {
  const scene = useGame((s) => s.scene),
    world = useGame((s) => s.world),
    run = useGame((s) => s.run);
  const filmPlaying = useTheater((s) => s.filmId !== null);
  useEffect(() => {
    useTimeOfDay.getState().setTimeZone(WORLDS[world].timeZone);
  }, [world]);
  const paperToss = useGameMode(
    (s) => scene === "office" && s.active?.id === "paper-toss",
  );
  const { incoming, presented } = useIncomingScene(scene);
  const hubShown = presented === "hub";
  const backdrop = presented === "rowing" ? "#d5e0ce" : "#dce5c7";
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[70, 85, 95]}
        fov={TELEPHOTO_FOV}
        near={0.5}
        far={1200}
      />
      <RootCapture />
      <SceneCamera />
      <color attach="background" args={[backdrop]} />
      <fog
        attach="fog"
        args={[
          backdrop,
          presented === "hub" ? 300 : 65,
          presented === "hub" ? 500 : presented === "rowing" ? 120 : 160,
        ]}
      />
      <hemisphereLight
        name="world-hemisphere"
        args={["#dceaff", "#465638", 0.95]}
      />
      <ambientLight name="world-ambient" intensity={0.16} color="#f1e2c8" />
      <directionalLight
        name="world-fill"
        position={[16, 15, -24]}
        intensity={0.8}
        color="#c7e6ff"
      />
      <Sun tier={tier} />
      <TimeOfDayLighting dimmed={scene === "theater" && filmPlaying} />
      <WorldAmbience />
      <WorldZoomInput />
      {/* Islands float in open sky: a mid-air catcher would print shadows on
          nothing and clip transparent falls beneath it. */}
      {presented !== "rowing" && presented !== "hub" && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -2.2, 0]}
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <shadowMaterial transparent opacity={0.12} />
        </mesh>
      )}
      {/* The hub stays mounted (hidden, frame work gated) while interiors and
          activities are shown: returning outside relinks nothing. */}
      <WorldActiveContext.Provider value={scene === "hub" && hubShown}>
        <group name="hub-root" visible={hubShown}>
          <Hub />
        </group>
      </WorldActiveContext.Provider>
      <group
        name="scene-root"
        ref={incoming}
        visible={!hubShown && presented === scene}
      >
        {isInterior(scene) && scene !== "skate" && !paperToss && (
          <Interior key={scene} />
        )}
        {scene === "office" && <StudyPaperToss playing={paperToss} />}
        {scene === "skate" && <SkateParkInterior key={`skate-${run}`} />}
        {scene === "rowing" && <Rowing key={`race-${run}`} />}
        {scene === "basketball" && <Basketball key={`basket-${run}`} />}
      </group>
    </>
  );
}

/** Sky colour behind the canvas and on the shell, so a cleared, resized or
 * lost drawing buffer never shows white. */
function ShellSky({ shell }: { shell: React.RefObject<HTMLDivElement | null> }) {
  const last = useRef("");
  const elapsed = useRef(1);
  useFrame(({ scene, gl }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    // Until the first real frame the page keeps the boot sky (index.html):
    // the canvas fades in over it, nothing else changes colour first.
    if (!useStage.getState().ready) return;
    if (!(scene.background instanceof THREE.Color)) return;
    const hex = `#${scene.background.getHexString(THREE.SRGBColorSpace)}`;
    if (hex === last.current) return;
    last.current = hex;
    gl.domElement.style.background = hex;
    shell.current?.style.setProperty("--stage-sky", hex);
    if (shell.current) shell.current.style.background = hex;
    // The page's own sky (html/body on /play, the stage behind the
    // portfolio, the browser chrome in game) follows the world's.
    const root = document.documentElement;
    root.style.setProperty("--sky", hex);
    if (root.classList.contains("play")) root.style.background = hex;
    if (useStage.getState().mode === "game")
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", hex);
  });
  return null;
}

/** The first real frame fades in from the boot sky over 0.5 s (0.15 s with
 * reduced motion), stepped by rendered frames rather than wall time: on a
 * device that renders slowly at first, the fade takes more frames instead
 * of skipping to the end in one (each frame moves at most 1/30 s). */
function CanvasFade({ wrap }: { wrap: React.RefObject<HTMLDivElement | null> }) {
  const t = useRef(0);
  useFrame((_, delta) => {
    const el = wrap.current;
    if (!el || t.current >= 1 || !useStage.getState().ready) return;
    const seconds = reducedMotion?.matches ? 0.15 : 0.5;
    t.current = Math.min(1, t.current + Math.min(delta, 1 / 30) / seconds);
    const x = t.current;
    el.style.opacity = (x * x * x * (x * (x * 6 - 15) + 10)).toFixed(3);
  });
  return null;
}

/** Pointer hits on hidden subtrees (the parked hub) are ignored. */
function visibleChain(object: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent)
    if (!node.visible) return false;
  return true;
}
const events = (store: Parameters<typeof createPointerEvents>[0]) => ({
  ...createPointerEvents(store),
  filter: (items: THREE.Intersection[]) =>
    items.filter((hit) => visibleChain(hit.object)),
});

const webgl2 = () => {
  try {
    return typeof WebGL2RenderingContext !== "undefined";
  } catch {
    return false;
  }
};
/** The sky the page opened on: the inline head script in index.html
 * computes the world's horizon colour for this hour into --sky before first
 * paint. The shell, the canvas and its clear colour all start on it, so
 * nothing changes colour until the first real frame fades in. */
function bootSky() {
  if (typeof document === "undefined") return "#dce5c7";
  return document.documentElement.style.getPropertyValue("--sky").trim() || "#dce5c7";
}

/** What a camera flight or the explore boom must clear in `world`: the tall
 * props listed in heroSpots.ts and every building footprint up to its roof. */
export function worldObstacles(world: WorldId): FlightObstacleBox[] {
  return [
    ...FLIGHT_OBSTACLES[world],
    ...doorsInWorld(world).map(
      ({ footprint, anchor }) => [footprint[0], footprint[1], footprint[2] + 0.4, footprint[3] + 0.4, anchor[1]] as const,
    ),
  ];
}

export default function Game({ autoEnter = true }: { autoEnter?: boolean } = {}) {
  // The tear flight (portfolio chunk) reads these through the contract.
  useEffect(() => {
    const publish = (world: WorldId) => {
      const list = worldObstacles(world);
      setFlightObstacles(list);
      setBoomObstacles(list);
    };
    publish(useGame.getState().world);
    return useGame.subscribe((state, previous) => {
      if (state.world !== previous.world) publish(state.world);
    });
  }, []);
  useEffect(
    () =>
      useGame.subscribe((state, previous) => {
        if (state.scene !== previous.scene || state.world !== previous.world)
          endGameMode();
      }),
    [],
  );
  const [lost, setLost] = useState(false),
    [supported] = useState(webgl2),
    [tier, setTier] = useState<Tier | null>(() => useStage.getState().tier);
  const shell = useRef<HTMLDivElement>(null);
  const [sky] = useState(bootSky);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const traveling = useGame((s) => s.traveling),
    paused = useGame((s) => s.paused),
    panel = useGame((s) => s.panel);
  const mode = useStage((s) => s.mode),
    ready = useStage((s) => s.ready),
    hudRevealed = useStage((s) => s.hudRevealed),
    worldVisible = useStage((s) => s.worldVisible);
  const gameMode = useGameMode((s) => s.active);
  const presentedScene = usePresented((s) => s.scene);
  const photoBooth = gameMode?.id === "photo-booth";
  const interact = useCallback(() => {
    const g = useGame.getState();
    if (!gameInputEnabled(useStage.getState())) return;
    if (interactWithNpc()) return;
    if (
      g.paused ||
      useGameMode.getState().active ||
      g.overlayLocked ||
      g.traveling ||
      g.panel !== "none"
    )
      return;
    if (g.scene === "hub" && doors.some((door) => door.id === g.near))
      throughDoorway(g.near as Scene);
    else if (g.near === "exit") leaveRoom();
    else if (g.near === "race") {
      runtime.raceCadence = 30;
      g.go("rowing");
    } else if (g.near === "read") useGame.setState({ panel: "profile" });
    else if (g.near === "photo") openPhotoBooth();
    else if (g.near === "stargazing") useGame.setState({ panel: "telescope" });
    else if (g.near === "desk") useGame.setState({ panel: "desk" });
    else if (g.near === "lift") useGym.getState().startSession();
    else if (g.near === "hoover-key") {
      useGame.setState({
        save: collectHooverKey(g.save),
        notice: "Hoover key found.",
      });
      g.persist();
    } else if (g.near === "hoover-door" && g.save.memories.includes(HOOVER_KEY))
      g.go("secret");
    else if (g.near === "stash" && !g.save.memories.includes(HOOVER_STASH)) {
      useGame.setState({ save: claimHooverStash(g.save), notice: "You found the stash." });
      g.persist();
    }
  }, []);
  useInput(interact);
  useEffect(() => {
    const save = () => useGame.getState().persist();
    const interval = setInterval(save, 4000);
    const visibility = () => {
      runtime.active = !document.hidden;
      if (document.hidden) {
        save();
        useGame.setState({ paused: true });
      }
    };
    const storage = (e: StorageEvent) => {
      if (e.key === "joshua-exe-save-v1" && e.newValue)
        useGame.setState({
          notice:
            "Another tab updated your save. Please use one tab to avoid conflicting local progress.",
        });
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("beforeunload", save);
    window.addEventListener("storage", storage);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("beforeunload", save);
      window.removeEventListener("storage", storage);
    };
  }, []);
  if (!supported) return <WorldFallback />;
  const budget = tier ? TIER_BUDGETS[tier] : null;
  const idle = paused || photoBooth || (mode === "site" && !worldVisible);
  return (
    <div
      ref={shell}
      className="game-shell"
      data-game-mode={gameMode?.id}
      data-stage-mode={mode}
      data-stage-ready={ready ? "true" : "false"}
      data-scene={presentedScene}
      data-hud={hudRevealed ? "revealed" : "hidden"}
      // Set once at mount and owned by the HUD from then on (Hud.tsx writes
      // the dataset): until it mounts, nothing but the canvas may show.
      data-hud-motion="hidden"
      style={{ background: sky }}
    >
      <WorldBoundary>
        {/* Large-viewport height: mobile URL-bar show/hide never resizes the
            drawing buffer (the shell clips the overflow instead). */}
        <div
          className="stage-canvas"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100lvh",
            // Faded in by CanvasFade from the first real frame (never a pop).
            opacity: 0,
          }}
          ref={canvasWrap}
        >
          <Canvas
            shadows={budget && budget.shadowMapSize > 0 ? "soft" : false}
            dpr={budget ? Math.min(budget.dpr[1], Math.max(budget.dpr[0], window.devicePixelRatio || 1)) : 1}
            gl={{
              alpha: false,
              antialias: true,
              stencil: false,
              powerPreference: "high-performance",
            }}
            style={{ background: sky }}
            events={events}
            frameloop={idle ? "demand" : "always"}
            onCreated={({ gl }) => {
              installGradeToneMapping();
              gl.setClearColor(sky, 1);
              gl.clear();
              const chosen = useStage.getState().tier ?? pickTier(gl);
              gl.toneMapping =
                TIER_BUDGETS[chosen].grade &&
                resolveAo(TIER_BUDGETS[chosen].ao, gl) === "none"
                  ? THREE.CustomToneMapping
                  : THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 0.98;
              gl.info.autoReset = false;
              useStage.setState({ tier: chosen });
              useGame.setState({ quality: legacyQuality(chosen) });
              setTier(chosen);
            }}
            // Canvas fallback content lives inside <canvas>: never painted,
            // but its links were keyboard-focusable and read out ("3D
            // unavailable") on every working page. Real failures are covered
            // by the support check, WorldBoundary and the context-loss card.
            fallback={null}
          >
            {tier && (
              <>
                <EngineRuntime tier={tier} autoEnter={autoEnter} onLost={setLost} />
                <ShellSky shell={shell} />
                <CanvasFade wrap={canvasWrap} />
                <World tier={tier} />
              </>
            )}
          </Canvas>
          {/* Inside the canvas layer: it arrives with the first frame. */}
          {budget?.vignette && (
            <div
              className="stage-vignette"
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 1,
                background:
                  "radial-gradient(ellipse 120% 95% at 50% 46%, transparent 58%, rgba(20,28,36,.2) 100%)",
              }}
            />
          )}
        </div>
      </WorldBoundary>
      <Hud interact={interact} />
      {/* A lost context keeps the canvas mounted (so the browser can still
          restore it); the card covers the stage meanwhile and leaves again
          on restore instead of replacing the world for good. */}
      {lost && <WorldFallback />}
      {!gameMode && !traveling && <TimeOfDayControls />}
      {!gameMode && <WorldZoomControls />}
      <NpcDialog />
      <PhotoBoothDialog />
      {panel === "telescope" && !paused && (
        <TelescopeView
          worldId={useGame.getState().world}
          onClose={() => useGame.setState({ panel: "none" })}
        />
      )}
      <PerfOverlay />
    </div>
  );
}
