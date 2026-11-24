import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { Html, OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import { Ball, Box, Cylinder, Ring, Sign } from "../world/Models";
import { Plant, Stool, Table, gameIsActive } from "./InteriorProps";
import { runtime, useGame } from "../core/store";
import { roomFor } from "../core/room";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import {
  advanceBeat,
  BEAT_INTERVAL,
  BEAT_PAD_KEYS,
  beatPadLane,
  flipLights,
  hitBeat,
  LIGHTS_TARGET,
  lightsHint,
  lightsPar,
  lightsReach,
  newBeatGame,
  newLightsBoard,
  type BeatGame,
} from "../core/labGames";
import { newRunId } from "../../shared/run-id";
import { labTone } from "./labAudio";
import "./lab-rooms.css";

const colors = ["#7699bb", "#75a59a", "#bf8791", "#aa9cc0"];
const laneX = [-3.3, -1.1, 1.1, 3.3];
const PAD_FLASH_MS = 220;

function labZoom(id: "music" | "math", width: number, height: number) {
  return id === "math"
    ? Math.max(6, Math.min(76, (width - 28) / 9.1, (height - 196) / 9.1))
    : Math.max(6, Math.min(65, (width - 36) / 11.8, (height - 220) / 12.8));
}

function LabCamera({ id }: { id: "music" | "math" }) {
  const size = useThree((s) => s.size);
  return (
    <OrthographicCamera
      makeDefault
      position={id === "math" ? [0, 22, -2] : [0, 18, 9]}
      up={id === "math" ? [0, 0, -1] : [0, 1, 0]}
      zoom={labZoom(id, size.width, size.height)}
      near={0.1}
      far={100}
      onUpdate={(camera) => {
        camera.lookAt(0, 0, id === "math" ? -2 : -4.8);
        camera.updateProjectionMatrix();
      }}
    />
  );
}

function LabGameActions({ onClose }: { onClose: () => void }) {
  const muted = useGame((s) => s.muted);
  return (
    <div className="lab-game-actions">
      <button onClick={() => useGame.setState({ muted: !muted })}>
        Sound {muted ? "off" : "on"}
      </button>
      <button className="lab-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function useLabClose(id: "music" | "math", cancelRound: () => void) {
  const close = useCallback(() => {
    cancelRound();
    if (useGameMode.getState().active?.id === id) endGameMode();
  }, [id, cancelRound]);
  useEffect(() => {
    window.addEventListener("interior-game-close", close);
    return () => {
      window.removeEventListener("interior-game-close", close);
      if (useGameMode.getState().active?.id === id) endGameMode();
    };
  }, [id, close]);
  return close;
}

function LabControls({
  name,
  active = false,
  tone,
  children,
}: {
  name: string;
  active?: boolean;
  tone?: "beat" | "math";
  children: ReactNode;
}) {
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.build);
  const focusGame = useCallback(
    (node: HTMLElement | null) => {
      if (active) node?.focus({ preventScroll: true });
    },
    [active],
  );
  if (hidden) return null;
  return (
    <Html
      fullscreen
      portal={portal}
      zIndexRange={active ? [70, 70] : [25, 25]}
      style={{ pointerEvents: "none" }}
      calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
    >
      <section
        key={active ? "game" : "room"}
        className={`lab-controls${active ? " lab-game" : ""}${tone ? ` lab-slate lab-${tone}` : ""}`}
        aria-label={name}
        tabIndex={-1}
        ref={focusGame}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Keep native button activation; movement and Escape still bubble.
          if (e.key === " " && (e.target as HTMLElement).closest("button"))
            e.stopPropagation();
        }}
      >
        {children}
      </section>
    </Html>
  );
}

function WalkFloor() {
  const scene = useGame((s) => s.scene);
  const room = roomFor(scene);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.13, 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!gameIsActive() || useGameMode.getState().active) return;
        runtime.path = [];
        runtime.target = [
          Math.max(-room.walkX, Math.min(room.walkX, e.point.x)),
          Math.max(room.minZ, Math.min(room.maxZ, e.point.z)),
        ];
      }}
    >
      <planeGeometry args={[room.width, room.depth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function Speaker({ x, z = -8 }: { x: number; z?: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.18, 0]} s={[2.7, 0.36, 2]} c="#343e4a" />
      <Box p={[0, 2.2, 0]} s={[2.1, 4.1, 1.65]} c="#3b4654" />
      <Box p={[0, 2.2, 0.85]} s={[1.85, 3.8, 0.14]} c="#242c37" />
      {[1.4, 3.1].map((y, i) => (
        <group key={y} position={[0, y, 1]}>
          <Cylinder
            s={[i ? 0.42 : 0.72, 0.18, i ? 0.42 : 0.72]}
            r={[Math.PI / 2, 0, 0]}
            c="#7d8b9a"
          />
          <Cylinder
            p={[0, 0, 0.12]}
            s={[i ? 0.31 : 0.59, 0.12, i ? 0.31 : 0.59]}
            r={[Math.PI / 2, 0, 0]}
            c="#273241"
          />
          <Ball p={[0, 0, 0.2]} s={[0.2, 0.2, 0.1]} c="#627486" />
        </group>
      ))}
      {[-0.85, 0.85].flatMap((sx) =>
        [0.5, 3.9].map((y) => (
          <Ball
            key={`${sx}${y}`}
            p={[sx, y, 0.96]}
            s={[0.07, 0.07, 0.05]}
            c="#a6b3c1"
          />
        )),
      )}
    </group>
  );
}

function StudioDressing() {
  const room = roomFor("music");
  return (
    <>
      <Box p={[0, 0.18, -4.6]} s={[11.2, 0.2, 14]} c="#262e39" />
      <Box p={[0, 0.3, -4.6]} s={[10.7, 0.1, 13.7]} c="#414d5c" />
      {[-5.4, 5.4].map((x) => (
        <Box key={x} p={[x, 0.32, -4.6]} s={[0.08, 0.07, 14]} c="#8894a1" />
      ))}
      <Speaker x={-7.7} />
      <Speaker x={7.7} />
      <Speaker x={-room.width / 2 + 2} z={-room.depth / 2 + 3} />
      <Speaker x={room.width / 2 - 2} z={-room.depth / 2 + 3} />
      {[-7.8, -2.6, 2.6, 7.8].map((x) => (
        <group key={x} position={[x, 2.7, -room.depth / 2 + 0.8]}>
          <Box s={[2.6, 3.7, 0.35]} c="#63362f" />
          {[-0.8, -0.4, 0, 0.4, 0.8].map((slat) => (
            <Box
              key={slat}
              p={[slat, 0, 0.22]}
              s={[0.16, 3.5, 0.3]}
              c="#9a5141"
            />
          ))}
        </group>
      ))}
      <group
        position={[-room.width / 2 + 2.2, 0, -0.4]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <Table size={[4.4, 1.7]} />
        <Box p={[0, 1.38, 0]} s={[4.2, 0.32, 1.55]} c="#35433e" />
        {Array.from({ length: 12 }, (_, i) => (
          <group key={i}>
            <Box
              p={[-1.8 + i * 0.32, 1.58, 0.4]}
              s={[0.26, 0.1, 0.65]}
              c="#e6ebf1"
            />
            <Cylinder
              p={[-1.8 + i * 0.32, 1.64, -0.35]}
              s={[0.07, 0.16, 0.07]}
              c={colors[i % 4]}
            />
          </group>
        ))}
        <Stool p={[0, 0, 2]} color="#466f60" />
      </group>
      <group position={[room.width / 2 - 2.5, 0, 0.8]}>
        <Cylinder p={[0, 0.15, 0]} s={[0.9, 0.25, 0.9]} c="#4e5448" />
        <Cylinder p={[0, 1.8, 0]} s={[0.08, 3.5, 0.08]} c="#8894a1" />
        <Cylinder p={[0, 3.7, 0]} s={[0.22, 0.65, 0.22]} c="#343c37" />
        <Ring
          p={[0, 3.6, 0.4]}
          radius={0.5}
          tube={0.04}
          c="#8894a1"
          r={[0, 0, 0]}
        />
      </group>
      <Plant p={[-room.width / 2 + 2, 0, 8]} />
      <Plant p={[room.width / 2 - 2, 0, 8]} />
      <Sign
        text={BEAT_PAD_KEYS.join("     ")}
        p={[0, 1.8, -10.8]}
        size={[7, 0.8]}
        color="#2b3543"
        ink="#f8fafc"
      />
    </>
  );
}

function BeatVisuals({
  game,
  lit,
  onHit,
}: {
  game: RefObject<BeatGame>;
  lit: readonly boolean[];
  onHit: (lane: number) => void;
}) {
  const notes = useRef<Group>(null),
    pulse = useRef<Group>(null);
  useFrame(() => {
    const g = game.current;
    notes.current?.children.forEach((child, i) => {
      const note = g.notes[i],
        until = note.at - g.time;
      child.visible =
        g.phase === "playing" &&
        !note.hit &&
        !note.missed &&
        until > -0.21 &&
        until < 2.7;
      child.position.z = -2 - until * 3;
    });
    if (pulse.current) {
      const scale =
        1 +
        Math.max(0, 1 - ((g.time % BEAT_INTERVAL) / BEAT_INTERVAL) * 4) * 0.13;
      pulse.current.scale.set(scale, 1, scale);
    }
  });
  return (
    <>
      {laneX.map((x, lane) => (
        <group key={x}>
          <Box p={[x, 0.4, -6]} s={[0.055, 0.04, 9.8]} c="#8894a1" />
          <group
            position={[x, 0.4, -2]}
            onPointerDown={(e) => {
              if (
                !gameIsActive() ||
                useGameMode.getState().active?.id !== "music" ||
                e.button !== 0
              )
                return;
              e.stopPropagation();
              onHit(lane);
            }}
          >
            <Cylinder p={[0, 0.14, 0]} s={[0.95, 0.28, 0.95]} c="#25303d" />
            <Cylinder p={[0, 0.33, 0]} s={[0.79, 0.2, 0.79]} c={colors[lane]} />
            <Ring p={[0, 0.46, 0]} radius={0.61} tube={0.025} c="#d7e0e9" />
            <mesh
              position={[0, 0.445, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              visible={!!lit[lane]}
            >
              <circleGeometry args={[0.59, 24]} />
              <meshBasicMaterial color={colors[lane]} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
      <group ref={pulse} position={[0, 0.43, 1.3]}>
        <Ring radius={0.8} tube={0.045} c="#b1bdca" />
      </group>
      <group ref={notes}>
        {game.current.notes.map((note, i) => (
          <group
            key={i}
            position={[laneX[note.lane], 0.72, -11]}
            visible={false}
          >
            <Box s={[1.4, 0.27, 0.55]} c={colors[note.lane]} />
            <Box p={[0, 0.18, 0]} s={[0.9, 0.06, 0.25]} c="#eef2f6" />
          </group>
        ))}
      </group>
    </>
  );
}

type BeatLaunch = "ready" | "playing";

export function BeatLabInterior() {
  const active = useGameMode((s) => s.active?.id === "music");
  const game = useRef(newBeatGame()),
    rewarded = useRef(false),
    lastPulse = useRef(-1);
  const [view, setView] = useState(game.current),
    [near, setNear] = useState(false);
  const [lit, setLit] = useState<readonly boolean[]>([]);
  const flashTimers = useRef<(number | undefined)[]>([]);
  const launcher = useRef<BeatLaunch | null>(null);
  const returnFocus = useRef<BeatLaunch | null>(null);
  const focusLauncher = useCallback((button: HTMLButtonElement | null) => {
    if (button && button.dataset.beatLauncher === returnFocus.current) {
      returnFocus.current = null;
      button.focus({ preventScroll: true });
    }
  }, []);
  const clearFlashTimers = useCallback(() => {
    flashTimers.current.forEach((timer) => window.clearTimeout(timer));
    flashTimers.current = [];
  }, []);
  useEffect(() => clearFlashTimers, [clearFlashTimers]);
  const refresh = useRef(0);
  const cancelRound = useCallback(() => {
    game.current = newBeatGame();
    rewarded.current = false;
    lastPulse.current = -1;
    setView(game.current);
    clearFlashTimers();
    setLit([]);
  }, [clearFlashTimers]);
  const close = useLabClose(
    "music",
    useCallback(() => {
      if (useGameMode.getState().active?.id === "music")
        returnFocus.current = launcher.current;
      cancelRound();
    }, [cancelRound]),
  );
  const play = useCallback((lane: number) => {
    if (!gameIsActive() || useGameMode.getState().active?.id !== "music")
      return;
    labTone(lane);
    if (game.current.phase === "playing") {
      game.current = hitBeat(game.current, lane);
      setView(game.current);
    }
    const setPadLit = (value: boolean) =>
      setLit((previous) => {
        const next = [...previous];
        next[lane] = value;
        return next;
      });
    setPadLit(true);
    window.clearTimeout(flashTimers.current[lane]);
    flashTimers.current[lane] = window.setTimeout(
      () => setPadLit(false),
      PAD_FLASH_MS,
    );
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!gameIsActive() || useGameMode.getState().active?.id !== "music")
        return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input,textarea,select"))
      )
        return;
      const lane = beatPadLane(e);
      if (lane < 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) play(lane);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [play]);
  useFrame((_, dt) => {
    if (!gameIsActive() || !runtime.active) return;
    if (useGameMode.getState().active?.id !== "music") {
      const nearby = Math.hypot(runtime.x, runtime.z + 2) <= 8;
      if (nearby !== near) setNear(nearby);
      return;
    }
    game.current = advanceBeat(game.current, Math.min(dt, 0.05));
    const g = game.current;
    const pulse = Math.floor(g.time / BEAT_INTERVAL);
    if (g.phase === "playing" && pulse !== lastPulse.current) {
      lastPulse.current = pulse;
      labTone(0, true);
    }
    if (g.phase === "done" && !rewarded.current) {
      rewarded.current = true;
      const hits = g.notes.filter((n) => n.hit).length;
      if (hits >= 20)
        useGame
          .getState()
          .award(`music-${newRunId()}`, g.points >= 2600 ? 20 : 12, 10);
    }
    refresh.current += dt;
    if (refresh.current > 0.08) {
      refresh.current = 0;
      setView(g);
    }
  });
  const start = (phase: BeatLaunch) => {
    if (!gameIsActive()) return;
    if (!active) {
      if (!near || !startGameMode("music")) return;
      launcher.current = phase;
    }
    cancelRound();
    if (phase === "playing") {
      game.current = { ...game.current, phase };
      lastPulse.current = 0;
      setView(game.current);
    }
    labTone(0, true);
  };
  const hits = view.notes.filter((note) => note.hit).length;
  return (
    <>
      {active && <LabCamera id="music" />}
      <WalkFloor />
      <StudioDressing />
      <BeatVisuals game={game} lit={lit} onHit={play} />
      <LabControls name="Beat Lab controls" active={active} tone="beat">
        {active ? (
          <>
            <header className="lab-game-topbar">
              <div>
                <strong>Beat Lab</strong>
                <span>
                  {view.phase === "ready"
                    ? "Freestyle"
                    : `${view.points} points · ${view.combo}×`}
                </span>
              </div>
              <LabGameActions onClose={close} />
            </header>
            <div className="lab-game-bottom">
              <div className="beat-toolbar">
                {view.phase !== "ready" && (
                  <p className="lab-feedback" role="status">
                    {view.phase === "done"
                      ? `${hits}/32 hits · best ${view.best}×${hits >= 20 ? ` · +${view.points >= 2600 ? 20 : 12} coins` : " · 20 hits earns coins"}`
                      : view.time < 2.4
                        ? `Ready · ${Math.ceil((2.4 - view.time) / BEAT_INTERVAL)}`
                        : view.feedback || "Hit the pads on beat"}
                  </p>
                )}
                <button
                  className="lab-primary"
                  onClick={() =>
                    start(view.phase === "playing" ? "ready" : "playing")
                  }
                >
                  {view.phase === "playing"
                    ? "Freestyle"
                    : view.phase === "done"
                      ? "Again"
                      : "Play round"}
                </button>
              </div>
              <div className="beat-buttons">
                {BEAT_PAD_KEYS.map((key, lane) => (
                  <button
                    key={key}
                    style={{ "--pad-color": colors[lane] } as CSSProperties}
                    data-lit={lit[lane] || undefined}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      play(lane);
                    }}
                    onClick={(e) => {
                      if (e.detail === 0) play(lane);
                    }}
                    aria-label={`Pad ${lane + 1}, ${key}`}
                    aria-keyshortcuts={`${key} ${lane + 1}`}
                  >
                    <kbd>{key}</kbd>
                    <span>{lane + 1}</span>
                  </button>
                ))}
              </div>
              {view.phase === "playing" && (
                <div className="beat-track" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.min(100, (view.time / 21.6) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <header>
              <strong>Beat Lab</strong>
              <span>100 BPM</span>
            </header>
            {near ? (
              <>
                <p>F G H J or 1–4</p>
                <footer className="beat-launch">
                  <button
                    className="lab-primary"
                    data-beat-launcher="playing"
                    ref={focusLauncher}
                    onClick={() => start("playing")}
                  >
                    Play
                  </button>
                  <button
                    data-beat-launcher="ready"
                    ref={focusLauncher}
                    onClick={() => start("ready")}
                  >
                    Freestyle
                  </button>
                </footer>
              </>
            ) : (
              <p>Walk up to the ring.</p>
            )}
          </>
        )}
      </LabControls>
    </>
  );
}

function MathDressing() {
  const room = roomFor("math");
  const back = -room.depth / 2 + 0.8;
  const sculpture = useRef<Group>(null);
  useFrame((_, dt) => {
    if (sculpture.current && gameIsActive())
      sculpture.current.rotation.y += Math.min(dt, 0.05) * 0.25;
  });
  return (
    <>
      <Box p={[0, 0.19, -2]} s={[9, 0.28, 9]} c="#3b4654" />
      <Box p={[0, 0.37, -2]} s={[8.6, 0.12, 8.6]} c="#222b37" />
      {[-room.width / 2 + 3, room.width / 2 - 3].map((x) => (
        <group key={x} position={[x, 0, back + 3]}>
          <Box p={[0, 0.25, 0]} s={[3.5, 0.5, 3.2]} c="#716b56" />
          <Box p={[0, 1.35, 0]} s={[2.7, 2.1, 2.4]} c="#426c5b" />
          <Box p={[0, 2.45, 0]} s={[3.2, 0.3, 2.9]} c="#b39151" />
          <Cylinder p={[0, 3, 0]} s={[0.85, 0.85, 0.85]} c="#777865" />
          <Ball p={[0, 3.5, 0]} s={[0.65, 0.65, 0.65]} c="#dfb24c" />
          {[-0.8, 0, 0.8].map((sx) => (
            <Box
              key={sx}
              p={[sx, 1.4, 1.24]}
              s={[0.1, 1.6, 0.12]}
              c="#b39151"
            />
          ))}
        </group>
      ))}
      <Box p={[0, 2.5, back]} s={[7.3, 3.5, 0.5]} c="#805d36" />
      <Box p={[0, 2.5, back + 0.31]} s={[6.8, 3, 0.15]} c="#264c40" />
      <Sign
        text="0 ↔ 1"
        p={[0, 2.7, back + 0.44]}
        size={[4.2, 1]}
        color="#264c40"
        ink="#e2c587"
      />
      <group position={[room.width / 2 - 2.7, 0, 0.2]}>
        <Cylinder p={[0, 0.2, 0]} s={[1.6, 0.35, 1.6]} c="#80745b" />
        <Cylinder p={[0, 1.2, 0]} s={[0.3, 2.2, 0.3]} c="#af8748" />
        <group ref={sculpture} position={[0, 3, 0]}>
          <Ring radius={1.4} tube={0.1} c="#cfaa5c" r={[0.7, 0, 0.3]} />
          <Ring radius={1.1} tube={0.09} c="#7b9b8c" r={[0.1, 0, 1.1]} />
          <Ball s={[0.58, 0.58, 0.58]} c="#c79544" />
        </group>
      </group>
      <group position={[-room.width / 2 + 2.7, 0, 1]}>
        <Table size={[2.5, 3.6]} />
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            p={[0, 1.4 + i * 0.23, 0]}
            s={[1.5 - i * 0.15, 0.22, 1.8]}
            c={["#973e30", "#3c6557", "#b39248"][i]}
          />
        ))}
        <Stool p={[0, 0, 2.7]} color="#406a57" />
      </group>
      <Plant p={[-room.width / 2 + 2, 0, 8]} />
      <Plant p={[room.width / 2 - 2, 0, 8]} />
    </>
  );
}

const MATH_KEYS: Record<string, "undo" | "hint" | "reset"> = {
  backspace: "undo",
  z: "undo",
  h: "hint",
  r: "reset",
};
const FLIP_MS = 220;

function LightsBoard({
  board,
  hint,
  flips,
  onPress,
}: {
  board: number;
  hint: number | null;
  flips: RefObject<number[]>;
  onPress: (tile: number) => void;
}) {
  const tiles = useRef<(Group | null)[]>([]);
  useFrame(() => {
    const now = performance.now();
    tiles.current.forEach((tile, i) => {
      if (!tile) return;
      const t = (now - (flips.current[i] ?? -Infinity)) / FLIP_MS;
      tile.position.y = t >= 0 && t < 1 ? Math.sin(t * Math.PI) * 0.22 : 0;
    });
  });
  return Array.from({ length: 9 }, (_, tile) => {
    const lit = !!(board & (1 << tile));
    return (
      <group
        key={tile}
        position={[
          ((tile % 3) - 1) * 2.5,
          0.42,
          (Math.floor(tile / 3) - 1) * 2.5 - 2,
        ]}
        onPointerDown={(e) => {
          if (
            !gameIsActive() ||
            useGameMode.getState().active?.id !== "math" ||
            board === LIGHTS_TARGET
          )
            return;
          e.stopPropagation();
          onPress(tile);
        }}
      >
        <Box p={[0, 0.06, 0]} s={[2.2, 0.15, 2.2]} c="#1a212b" />
        <group ref={(node) => void (tiles.current[tile] = node)}>
          <Box
            p={[0, 0.2, 0]}
            s={[1.95, 0.2, 1.95]}
            c={lit ? "#dfe6ee" : "#3e4a5a"}
          />
          <Cylinder
            p={[0, 0.37, 0]}
            s={[0.45, 0.1, 0.45]}
            c={lit ? "#ffffff" : "#2a3442"}
          />
          <Ring
            p={[0, 0.44, 0]}
            radius={hint === tile ? 0.84 : 0.62}
            tube={hint === tile ? 0.08 : 0.03}
            c={hint === tile ? "#f8fafc" : lit ? "#9aa8b8" : "#6b7889"}
          />
        </group>
      </group>
    );
  });
}

export function MathLabInterior() {
  const active = useGameMode((s) => s.active?.id === "math");
  const size = useThree((s) => s.size);
  const zoom = labZoom("math", size.width, size.height);
  const [round, setRound] = useState(0),
    [seed, setSeed] = useState(0),
    [board, setBoard] = useState(() => newLightsBoard(0));
  const [history, setHistory] = useState<number[]>([]),
    [hint, setHint] = useState<number | null>(null),
    [preview, setPreview] = useState<number | null>(null);
  const [near, setNear] = useState(false);
  const rewarded = useRef(false),
    boardRef = useRef(board),
    roundRef = useRef(0),
    seedRef = useRef(0),
    historyRef = useRef<number[]>([]),
    flips = useRef<number[]>([]),
    tileButtons = useRef<(HTMLButtonElement | null)[]>([]),
    focusedTile = useRef(4);
  const solved = board === LIGHTS_TARGET;
  const moves = history.length;
  const par = lightsPar(round);
  const coins = moves <= par ? 15 : 10;
  const playing = () =>
    gameIsActive() && useGameMode.getState().active?.id === "math";
  const load = useCallback((nextRound: number, nextSeed: number) => {
    roundRef.current = nextRound;
    seedRef.current = nextSeed;
    boardRef.current = newLightsBoard(nextRound, nextSeed);
    historyRef.current = [];
    rewarded.current = false;
    flips.current = [];
    setRound(nextRound);
    setSeed(nextSeed);
    setBoard(boardRef.current);
    setHistory([]);
    setHint(null);
  }, []);
  const cancelRound = useCallback(() => load(0, 0), [load]);
  const close = useLabClose("math", cancelRound);
  const toggle = useCallback((tile: number) => {
    if (!playing() || boardRef.current === LIGHTS_TARGET) return;
    const next = flipLights(boardRef.current, tile);
    const reach = lightsReach(tile),
      now = performance.now();
    for (let i = 0; i < 9; i++) if (reach & (1 << i)) flips.current[i] = now;
    historyRef.current = [...historyRef.current, boardRef.current];
    boardRef.current = next;
    setBoard(next);
    setHistory(historyRef.current);
    setHint(null);
    labTone(tile % 4);
    if (next === LIGHTS_TARGET && !rewarded.current) {
      rewarded.current = true;
      const moves = historyRef.current.length;
      // Settle ripple from the centre once the last flip lands.
      for (let i = 0; i < 9; i++)
        flips.current[i] =
          now + FLIP_MS + (Math.abs((i % 3) - 1) + Math.abs(Math.floor(i / 3) - 1)) * 90;
      useGame
        .getState()
        .award(
          `math-${newRunId()}`,
          moves <= lightsPar(roundRef.current) ? 15 : 10,
          10,
        );
    }
  }, []);
  const undo = useCallback(() => {
    if (!playing() || boardRef.current === LIGHTS_TARGET) return;
    const previous = historyRef.current.at(-1);
    if (previous === undefined) return;
    historyRef.current = historyRef.current.slice(0, -1);
    const reach = lightsReach(
      Array.from({ length: 9 }, (_, t) => t).find(
        (t) => (previous ^ boardRef.current) === lightsReach(t),
      ) ?? -1,
    );
    const now = performance.now();
    for (let i = 0; i < 9; i++) if (reach & (1 << i)) flips.current[i] = now;
    boardRef.current = previous;
    setBoard(previous);
    setHistory(historyRef.current);
    setHint(null);
    labTone(0, true);
  }, []);
  const showHint = useCallback(() => {
    if (playing()) setHint(lightsHint(boardRef.current));
  }, []);
  const reset = useCallback(() => {
    if (playing()) load(roundRef.current, seedRef.current);
  }, [load]);
  const next = useCallback(() => {
    if (playing()) load(roundRef.current + 1, seedRef.current);
  }, [load]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.altKey ||
        e.metaKey ||
        e.isComposing ||
        useGameMode.getState().active?.id !== "math"
      )
        return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input,textarea,select"))
      )
        return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k !== "z") return;
      if (/^[1-9]$/.test(k)) {
        toggle(Number(k) - 1);
        return;
      }
      const action = MATH_KEYS[k];
      if (!action) {
        if (k === "n" && boardRef.current === LIGHTS_TARGET) next();
        return;
      }
      e.preventDefault();
      if (action === "undo") undo();
      else if (action === "hint") showHint();
      else reset();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle, undo, showHint, reset, next]);
  useFrame(() => {
    if (!gameIsActive() || active) return;
    const nearby = Math.hypot(runtime.x, runtime.z + 2) <= 8;
    if (nearby !== near) setNear(nearby);
  });
  const start = () => {
    if (!near || !gameIsActive() || !startGameMode("math")) return;
    load(0, (Math.random() * 2 ** 31) | 0);
  };
  const focusNext = useCallback((node: HTMLButtonElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  const reach = preview === null || solved ? 0 : lightsReach(preview);
  return (
    <>
      {active && <LabCamera id="math" />}
      <WalkFloor />
      <MathDressing />
      <LightsBoard
        key={`${round}-${seed}`}
        board={board}
        hint={hint}
        flips={flips}
        onPress={toggle}
      />
      <LabControls name="Math Lab controls" active={active} tone="math">
        {active ? (
          <>
            <header className="lab-game-topbar">
              <div>
                <strong>Math Lab</strong>
                <span>
                  Puzzle {round + 1} · {moves} {moves === 1 ? "move" : "moves"}{" "}
                  · par {par}
                </span>
              </div>
              <LabGameActions onClose={close} />
            </header>
            <div
              className="lights-buttons"
              role="grid"
              aria-label="Light switches"
              style={{ width: zoom * 7.5, height: zoom * 7.5 }}
              onKeyDown={(e) => {
                const step = {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -3,
                  ArrowDown: 3,
                }[e.key];
                if (step === undefined) return;
                e.preventDefault();
                e.stopPropagation();
                const from = focusedTile.current;
                const to =
                  Math.abs(step) === 1
                    ? Math.floor(from / 3) * 3 + (((from % 3) + step + 3) % 3)
                    : (from + step + 9) % 9;
                tileButtons.current[to]?.focus({ preventScroll: true });
              }}
            >
              {Array.from({ length: 9 }, (_, tile) => (
                <button
                  key={tile}
                  ref={(node) => void (tileButtons.current[tile] = node)}
                  role="gridcell"
                  tabIndex={tile === focusedTile.current ? 0 : -1}
                  aria-label={`Tile ${tile + 1}`}
                  aria-pressed={!!(board & (1 << tile))}
                  aria-keyshortcuts={String(tile + 1)}
                  data-hint={hint === tile || undefined}
                  data-reach={!!(reach & (1 << tile)) || undefined}
                  disabled={solved}
                  style={{ margin: zoom * 0.15 }}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setPreview(tile);
                  }}
                  onPointerLeave={() => setPreview(null)}
                  onFocus={(e) => {
                    focusedTile.current = tile;
                    if (e.currentTarget.matches(":focus-visible"))
                      setPreview(tile);
                  }}
                  onBlur={() => setPreview(null)}
                  onClick={() => toggle(tile)}
                >
                  <kbd>{tile + 1}</kbd>
                </button>
              ))}
            </div>
            <footer className="lab-game-bottom lab-math-bottom">
              <p role="status">
                {solved
                  ? moves <= par
                    ? `Solved at par · +${coins}`
                    : `Solved in ${moves} · +${coins}`
                  : "Light all nine"}
              </p>
              {solved ? (
                <button
                  className="lab-primary"
                  ref={focusNext}
                  aria-keyshortcuts="N Enter"
                  onClick={next}
                >
                  Next puzzle
                </button>
              ) : (
                <div className="lab-game-actions">
                  <button
                    onClick={undo}
                    disabled={!moves}
                    aria-keyshortcuts="Z Backspace"
                  >
                    Undo <kbd>Z</kbd>
                  </button>
                  <button onClick={showHint} aria-keyshortcuts="H">
                    Hint <kbd>H</kbd>
                  </button>
                  <button
                    onClick={reset}
                    disabled={!moves}
                    aria-keyshortcuts="R"
                  >
                    Reset <kbd>R</kbd>
                  </button>
                </div>
              )}
            </footer>
          </>
        ) : (
          <>
            <header>
              <strong>Math Lab</strong>
            </header>
            {near ? (
              <>
                <p>Light all nine. Each tile flips its neighbours too.</p>
                <button className="lab-primary" onClick={start}>
                  Play
                </button>
              </>
            ) : (
              <p>Walk up to the nine tiles.</p>
            )}
          </>
        )}
      </LabControls>
    </>
  );
}
