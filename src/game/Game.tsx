import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrthographicCamera,
  PerspectiveCamera,
  PerformanceMonitor,
} from "@react-three/drei";
import * as THREE from "three";
import { Hub } from "./world/Hub";
import { Interior } from "./scenes/Interior";
import { Rowing } from "./scenes/Rowing";
import { StudyPaperToss } from "./scenes/StudyPaperToss";
import { Basketball } from "./scenes/Basketball";
import { Hud } from "./ui/Hud";
import { TimeOfDayLighting } from "./world/TimeOfDayLighting";
import { TimeOfDayControls } from "./ui/TimeOfDayControls";
import { WorldZoomControls, WorldZoomInput } from "./ui/WorldZoom";
import { daylightClock, useTimeOfDay } from "./core/timeOfDay";
import { sampleDaylight } from "./core/daylight";
import { islandFollow } from "./core/islandCamera";
import { islandForWorld } from "./core/homeIsland";
import { useWorldView } from "./core/worldView";
import { updateGloss } from "./world/GlossKit";
import { WORLDS } from "./core/worlds";
import { runtime, useGame, type Scene } from "./core/store";
import { useInput } from "./core/input";
import { endGameMode, useGameMode } from "./core/gameMode";
import { doors, isInterior } from "./core/world";
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
declare global {
  interface Window {
    __joshuaPerf?: {
      frames: number[];
      calls: number;
      triangles: number;
      geometries: number;
      textures: number;
      renderer: string;
    };
  }
}
function FrameMetrics() {
  useFrame(({ gl }, dt) => {
    const stat = (window.__joshuaPerf ??= {
      frames: [],
      calls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      renderer: "",
    });
    if (!useGame.getState().paused && runtime.active) {
      stat.frames.push(dt * 1000);
      if (stat.frames.length > 2400) stat.frames.shift();
    }
    stat.calls = gl.info.render.calls;
    stat.triangles = gl.info.render.triangles;
    stat.geometries = gl.info.memory.geometries;
    stat.textures = gl.info.memory.textures;
    // A driver query can synchronize the GPU. Read it once, not every frame.
    if (!stat.renderer)
      stat.renderer = gl.getContext().getParameter(gl.getContext().RENDERER);
  });
  return null;
}
// The key light's fixed direction; the shadow camera sits far enough back
// that a whole island fits between its near and far planes.
const SUN_OFFSET = [-60, 120, 60] as const;
const reducedMotion =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null);
  const hemisphere = useRef<THREE.HemisphereLight | undefined>(undefined);
  const target = useMemo(() => new THREE.Object3D(), []);
  const quality = useGame((s) => s.quality);
  // Desktop gets a 4096 map so the island-wide overview frustum keeps roughly
  // the texel density the old player-sized 2048 frustum had; phones stay 2048.
  // Software rasterisers (SwiftShader, llvmpipe) and small-texture GPUs keep
  // 2048 too: a 4096 depth target there risks losing the WebGL context.
  const gl = useThree((s) => s.gl);
  const capable = useMemo(() => {
    const context = gl.getContext();
    const info = context.getExtension("WEBGL_debug_renderer_info");
    const name = String(
      context.getParameter(
        info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER,
      ),
    );
    return (
      gl.capabilities.maxTextureSize >= 8192 &&
      !/swiftshader|llvmpipe|software|basic render/i.test(name)
    );
  }, [gl]);
  const wide = useThree((s) => s.size.width >= 700);
  const mapSize = capable && wide ? 4096 : 2048;
  useEffect(() => {
    // Three allocates the depth target once; a new size needs a new target.
    const shadow = light.current?.shadow;
    if (!shadow?.map || shadow.map.width === mapSize) return;
    shadow.mapSize.set(mapSize, mapSize);
    shadow.map.dispose();
    shadow.map = null;
  }, [mapSize]);
  useFrame(({ camera, scene: root }, delta) => {
    const { scene, world, quality: tier, paused } = useGame.getState();
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
    const halfRight = THREE.MathUtils.lerp(reach * Math.SQRT1_2, 35, follow);
    const halfUp = THREE.MathUtils.lerp(reach / Math.sqrt(3), 32, follow);
    // Roofs and towers lean toward the top of the light's view.
    const top = halfUp + 14 * (1 - follow);
    const sun = light.current;
    if (sun) {
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
    // Snap the tracking light in its own texel space. Fractional shadow-map
    // motion otherwise makes stationary roofs/grass sparkle while walking.
    const texelRight = (halfRight * 2) / mapSize;
    const texelUp = (top + halfUp) / mapSize;
    const right = Math.round(((x + z) * Math.SQRT1_2) / texelRight) * texelRight;
    const up = Math.round((x - z) / Math.sqrt(3) / texelUp) * texelUp;
    target.position.set(
      (right / Math.SQRT1_2 + up * Math.sqrt(3)) / 2,
      0,
      (right / Math.SQRT1_2 - up * Math.sqrt(3)) / 2,
    );
    target.updateMatrixWorld();
    sun?.position.set(
      target.position.x + SUN_OFFSET[0],
      SUN_OFFSET[1],
      target.position.z + SUN_OFFSET[2],
    );
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
      tier === "high",
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
        castShadow={quality === "high"}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-near={1}
        shadow-camera-far={320}
        shadow-normalBias={0.05}
        shadow-bias={-0.0001}
      />
    </>
  );
}
function World() {
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
  const flat = !paperToss && (scene === "hub" || isInterior(scene));
  return (
    <>
      {flat ? (
        <OrthographicCamera
          makeDefault
          position={[70, 85, 95]}
          zoom={29}
          near={0.1}
          far={350}
        />
      ) : (
        <PerspectiveCamera
          makeDefault
          position={
            scene === "rowing"
              ? [3, 9.5, 17]
              : paperToss
                ? [0, 9, 16]
                : [7, 12, 18]
          }
          fov={55}
          near={0.1}
          far={130}
        />
      )}
      <color
        attach="background"
        args={[scene === "rowing" ? "#d5e0ce" : "#dce5c7"]}
      />
      <fog
        attach="fog"
        args={[
          scene === "rowing" ? "#d5e0ce" : "#dce5c7",
          scene === "hub" ? 300 : 65,
          scene === "hub" ? 500 : scene === "rowing" ? 120 : 160,
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
      <Sun />
      <TimeOfDayLighting dimmed={scene === "theater" && filmPlaying} />
      <WorldAmbience />
      <WorldZoomInput />
      {/* Islands float in open sky: a mid-air catcher would print shadows on
          nothing and clip transparent falls beneath it. */}
      {scene !== "rowing" && scene !== "hub" && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -2.2, 0]}
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <shadowMaterial transparent opacity={0.12} />
        </mesh>
      )}
      {scene === "hub" && <Hub />}
      {isInterior(scene) && scene !== "skate" && !paperToss && (
        <Interior key={scene} />
      )}
      {scene === "office" && <StudyPaperToss playing={paperToss} />}
      {scene === "skate" && <SkateParkInterior key={`skate-${run}`} />}
      {scene === "rowing" && <Rowing key={`race-${run}`} />}
      {scene === "basketball" && <Basketball key={`basket-${run}`} />}
      <FrameMetrics />
    </>
  );
}
export default function Game() {
  useEffect(
    () =>
      useGame.subscribe((state, previous) => {
        if (state.scene !== previous.scene || state.world !== previous.world)
          endGameMode();
      }),
    [],
  );
  const [lost, setLost] = useState(false),
    [supported] = useState(() => {
      try {
        const c = document.createElement("canvas");
        return !!c.getContext("webgl2");
      } catch {
        return false;
      }
    });
  const quality = useGame((s) => s.quality),
    traveling = useGame((s) => s.traveling),
    paused = useGame((s) => s.paused),
    panel = useGame((s) => s.panel);
  const gameMode = useGameMode((s) => s.active);
  const photoBooth = gameMode?.id === "photo-booth";
  const interact = useCallback(() => {
    const g = useGame.getState();
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
      g.go(g.near as Scene);
    else if (g.near === "exit") g.go("hub");
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
  if (!supported || lost) return <WorldFallback />;
  return (
    <div className="game-shell" data-game-mode={gameMode?.id}>
      <WorldBoundary>
        <Canvas
          shadows={quality === "high" ? "soft" : false}
          dpr={quality === "high" ? [1, 1.6] : 1}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
          }}
          frameloop={paused || photoBooth ? "demand" : "always"}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.98;
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              setLost(true);
            });
          }}
          fallback={<WorldFallback />}
        >
          {!paused && !traveling && !photoBooth && (
            <PerformanceMonitor
              onDecline={() => useGame.setState({ quality: "low" })}
              flipflops={1}
              onFallback={() => useGame.setState({ quality: "low" })}
            />
          )}
          <World />
        </Canvas>
      </WorldBoundary>
      <Hud interact={interact} />
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
    </div>
  );
}
