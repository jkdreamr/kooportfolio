import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
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
import { useTimeOfDay } from "./core/timeOfDay";
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
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const quality = useGame((s) => s.quality);
  useFrame(({ camera }) => {
    const scene = useGame.getState().scene;
    const race = scene === "rowing";
    const x = race ? camera.position.x : scene === "hub" ? runtime.x : 0;
    const z = race ? camera.position.z - 18 : scene === "hub" ? runtime.z : 0;
    // Snap the tracking light in its own texel space. Fractional shadow-map
    // motion otherwise makes stationary roofs/grass sparkle while walking.
    const right =
      Math.round(((x + z) * Math.SQRT1_2) / (70 / 2048)) * (70 / 2048);
    const up = Math.round((x - z) / Math.sqrt(3) / (64 / 2048)) * (64 / 2048);
    target.position.set(
      (right / Math.SQRT1_2 + up * Math.sqrt(3)) / 2,
      0,
      (right / Math.SQRT1_2 - up * Math.sqrt(3)) / 2,
    );
    target.updateMatrixWorld();
    light.current?.position.set(
      target.position.x - 12,
      24,
      target.position.z + 12,
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
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-camera-far={100}
        shadow-normalBias={0.05}
        shadow-bias={-0.0003}
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
  const paperToss = useGameMode((s) => scene === "office" && s.active?.id === "paper-toss");
  const flat = !paperToss && (scene === "hub" || isInterior(scene));
  return (
    <>
      {flat ? (
        <OrthographicCamera
          makeDefault
          position={[28, 34, 38]}
          zoom={29}
          near={0.1}
          far={220}
        />
      ) : (
        <PerspectiveCamera
          makeDefault
          position={scene === "rowing" ? [3, 9.5, 17] : paperToss ? [0, 9, 16] : [7, 12, 18]}
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
          scene === "rowing" ? 65 : 65,
          scene === "rowing" ? 120 : 160,
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
      {scene !== "rowing" && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -2.2, 0]}
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <shadowMaterial transparent opacity={0.12} />
        </mesh>
      )}
      {scene === "hub" && <Hub key={world} />}
      {isInterior(scene) && scene !== "skate" && !paperToss && <Interior key={scene} />}
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
      g.build ||
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
      useGame.setState({ save: claimHooverStash(g.save), notice: "+75 coins" });
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
          frameloop={
            paused || traveling || photoBooth ? "demand" : "always"
          }
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
      {!gameMode && <TimeOfDayControls />}
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
