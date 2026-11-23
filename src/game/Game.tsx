import {
  Component,
  useCallback,
  useEffect,
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
import { Basketball } from "./scenes/Basketball";
import { Hud } from "./ui/Hud";
import { runtime, useGame, type Scene } from "./core/store";
import { useInput } from "./core/input";
import { doors, isInterior } from "./core/world";
import { useGym } from "./scenes/CognitionGym";
import "./game.css";

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
    stat.renderer = gl.getContext().getParameter(gl.getContext().RENDERER);
  });
  return null;
}
function World() {
  const scene = useGame((s) => s.scene),
    run = useGame((s) => s.run),
    quality = useGame((s) => s.quality);
  const flat = scene === "hub" || isInterior(scene);
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
          position={scene === "rowing" ? [3, 9.5, 17] : [7, 12, 18]}
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
      <hemisphereLight args={["#fff6e4", "#4f713b", 1.4]} />
      <ambientLight intensity={0.3} color="#f1e2c8" />
      <directionalLight
        position={[-12, 24, 12]}
        intensity={2.4}
        color="#fff0cc"
        castShadow={quality === "high" && scene !== "rowing"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-normalBias={0.05}
        shadow-bias={-0.0003}
      />
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
      {scene === "hub" && <Hub />}
      {isInterior(scene) && <Interior key={scene} />}
      {scene === "rowing" && <Rowing key={`race-${run}`} />}
      {scene === "basketball" && <Basketball key={`basket-${run}`} />}
      <FrameMetrics />
    </>
  );
}
export default function Game() {
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
    paused = useGame((s) => s.paused);
  const interact = useCallback(() => {
    const g = useGame.getState();
    if (g.paused || g.build || g.panel !== "none") return;
    if (g.scene === "hub" && doors.some((door) => door.id === g.near))
      g.go(g.near as Scene);
    else if (g.near === "exit") g.go("hub");
    else if (g.near === "race") {
      runtime.raceCadence = 30;
      g.go("rowing");
    } else if (g.near === "read") useGame.setState({ panel: "profile" });
    else if (g.near === "desk") useGame.setState({ panel: "desk" });
    else if (g.near === "lift") useGym.getState().lift();
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
    <div className="game-shell">
      <WorldBoundary>
        <Canvas
          shadows={quality === "high" ? "soft" : false}
          dpr={quality === "high" ? [1, 1.6] : 1}
          gl={{
            antialias: quality === "high",
            powerPreference: "high-performance",
          }}
          frameloop={paused ? "demand" : "always"}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              setLost(true);
            });
          }}
          fallback={<WorldFallback />}
        >
          <PerformanceMonitor
            onDecline={() => useGame.setState({ quality: "low" })}
            flipflops={1}
            onFallback={() => useGame.setState({ quality: "low" })}
          >
            <World />
          </PerformanceMonitor>
        </Canvas>
      </WorldBoundary>
      <Hud interact={interact} />
    </div>
  );
}
