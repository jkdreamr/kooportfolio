import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Html } from "@react-three/drei";
import { screenOverlayNoOcclude } from "../world/screenOverlay";
import * as THREE from "three";
import { aimCamera } from "../engine/camera";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import { Ball, Box, Cylinder, Ring, Sign } from "../world/Models";
import { Plant, Stool, Table, gameIsActive } from "./InteriorProps";
import { runtime, useGame } from "../core/store";
import { useLauncher, useLauncherHosted } from "../core/launchers";
import { juice } from "./juice/Juice";
import { sound } from "../core/sound";
import { roomFor } from "../core/room";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import {
  advanceRhyme,
  BEATS_PER_BAR,
  createLightsHintTracker,
  flipLights,
  LIGHTS_TARGET,
  newLightsBoard,
  newRhymeGame,
  RHYME_BARS,
  RHYME_BEATS,
  rhymeBarIndex,
  rhymeBarInterval,
  rhymeBeatInterval,
  rhymeCountIn,
  rhymeRoundEnd,
  swapRhymeWord,
  type RhymeGame,
} from "../core/labGames";
import { labTone, scheduleLabBeat } from "./labAudio";
import { beatSwing, variantForBar } from "../core/labBeats";
import {
  RHYME_SCHEMES,
  flowAdlib,
  flowCloseBars,
  flowSheet,
  flowTap,
  hypeLevel,
  newFlow,
  type Flow,
  type FlowGrid,
  type FlowSheet,
  type RhymeScheme,
} from "../core/labFlow";
import { audioContext } from "../core/audio/live";
import { registerGameQa } from "../core/gameQa";
import { reportRun } from "../core/daily";
import { MedalRow } from "../ui/MedalRow";
import { QueuedStamps } from "../ui/Passport";
import "./lab-rooms.css";

const colors = ["#7699bb", "#75a59a", "#bf8791", "#aa9cc0"];
const LANE_SPACING = 2.2;
const laneX = Array.from(
  { length: BEATS_PER_BAR },
  (_, beat) => (beat - 1.5) * LANE_SPACING,
);

function labZoom(id: "music" | "math", width: number, height: number) {
  return id === "math"
    ? Math.max(6, Math.min(82, (width - 36) / 8.8, (height - 180) / 8.8))
    : Math.max(6, Math.min(65, (width - 36) / 11.8, (height - 220) / 12.8));
}

const labUp = new THREE.Vector3(0, 0, -1);
function LabCamera({ id }: { id: "music" | "math" }) {
  // Drives the persistent rig camera (no own camera → no projection cut).
  const target = useMemo(
    () => new THREE.Vector3(0, 0, id === "math" ? -2 : -4.8),
    [id],
  );
  const offset = useMemo(
    () =>
      id === "math"
        ? new THREE.Vector3(0, 24, 0)
        : new THREE.Vector3(0, 18, 13.8),
    [id],
  );
  useFrame(({ camera, size }) => {
    if (id === "math") camera.up.copy(labUp);
    aimCamera(
      camera,
      target,
      offset,
      labZoom(id, size.width, size.height),
      size.height,
    );
    camera.up.set(0, 1, 0);
  });
  return null;
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
  tone?: "beat";
  children: ReactNode;
}) {
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const focusGame = useCallback(
    (node: HTMLElement | null) => {
      if (active) node?.focus({ preventScroll: true });
    },
    [active],
  );
  if (hidden) return null;
  return (
    <Html onOcclude={screenOverlayNoOcclude}
      fullscreen
      portal={portal}
      zIndexRange={active ? [70, 70] : [25, 25]}
      style={{ pointerEvents: "none" }}
      calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
    >
      <section
        key={active ? "game" : "room"}
        className={`lab-controls${active ? " lab-game" : ""}${tone ? ` lab-${tone}` : ""}`}
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
        text="FREESTYLE"
        p={[0, 1.8, -10.8]}
        size={[7, 0.8]}
        color="#2b3543"
        ink="#f8fafc"
      />
    </>
  );
}

function BeatVisuals({ game, hype }: { game: RefObject<RhymeGame>; hype: RefObject<Flow> }) {
  const pads = useRef<Group>(null),
    pulse = useRef<Group>(null),
    ball = useRef<Group>(null);
  useFrame(() => {
    const g = game.current;
    const playing = g.phase === "playing";
    const beatInterval = rhymeBeatInterval(g);
    const barInterval = rhymeBarInterval(g);
    const inBar =
      playing && g.time >= rhymeCountIn(g)
        ? (g.time - rhymeCountIn(g)) % barInterval
        : 0;
    const beat = Math.min(BEATS_PER_BAR - 1, Math.floor(inBar / beatInterval));
    const bounce = playing
      ? Math.abs(Math.sin((inBar / beatInterval) * Math.PI))
      : 0;
    pads.current?.children.forEach((pad, i) => {
      const lit = playing && i === beat;
      const cap = pad.children[1];
      if (cap) cap.scale.setScalar(lit ? 1.22 : 1);
      const glow = pad.children[3];
      if (glow) glow.visible = lit;
    });
    if (ball.current) {
      ball.current.visible = playing;
      ball.current.position.set(laneX[beat], 1.35 + bounce * 1.4, -2);
    }
    if (pulse.current) {
      // The ring pulses on the beat, harder as the room warms up.
      const lift = playing ? [0.13, 0.22, 0.32, 0.42][hypeLevel(hype.current.hype)] : 0.13;
      const scale =
        1 +
        Math.max(0, 1 - ((g.time % beatInterval) / beatInterval) * 4) * lift;
      pulse.current.scale.set(scale, 1, scale);
    }
  });
  const bar = rhymeBarIndex(game.current);
  return (
    <>
      {laneX.map((x) => (
        <Box key={x} p={[x, 0.4, -6]} s={[0.055, 0.04, 9.8]} c="#8894a1" />
      ))}
      <group ref={pads}>
        {laneX.map((x, beatIndex) => (
          <group key={x} position={[x, 0.4, -2]}>
            <Cylinder p={[0, 0.14, 0]} s={[0.95, 0.28, 0.95]} c="#25303d" />
            <Cylinder
              p={[0, 0.33, 0]}
              s={[0.79, 0.2, 0.79]}
              c={colors[beatIndex]}
            />
            <Ring p={[0, 0.46, 0]} radius={0.61} tube={0.025} c="#d7e0e9" />
            <mesh
              position={[0, 0.445, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              visible={false}
            >
              <circleGeometry args={[0.59, 24]} />
              <meshBasicMaterial color={colors[beatIndex]} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={pulse} position={[0, 0.43, 1.3]}>
        <Ring radius={0.8} tube={0.045} c="#b1bdca" />
      </group>
      <group ref={ball} visible={false}>
        <Ball s={[0.34, 0.34, 0.34]} c="#eef2f6" />
      </group>
      {bar >= 0 && (
        <Sign
          text={game.current.bars[bar].word.toUpperCase()}
          p={[0, 2.3, -6.2]}
          size={[5.2, 0.9]}
          color="#1c2530"
          ink="#eef2f6"
        />
      )}
    </>
  );
}

type BeatLaunch = "ready" | "playing";
const ADLIB_KEYS = ["d", "f", "j", "k"] as const;
const LEVEL_NAMES = ["", "Warm room", "Loud room", "Roof's off"] as const;

/** The take's timing for the flow rules. */
const flowGrid = (g: RhymeGame): FlowGrid => ({
  beatS: rhymeBeatInterval(g),
  swing: beatSwing(RHYME_BEATS[g.beat].pattern),
  countIn: rhymeCountIn(g),
  bars: g.bars.length,
});
/** Seconds the speakers are behind the clock (Bluetooth and the like). */
function outputLatency() {
  const ctx = audioContext() as (AudioContext & { outputLatency?: number }) | null;
  const l = ctx?.outputLatency;
  return typeof l === "number" && Number.isFinite(l) && l > 0 && l < 0.5 ? l : 0;
}

export function BeatLabInterior() {
  const active = useGameMode((s) => s.active?.id === "music");
  const game = useRef(newRhymeGame()),
    flow = useRef<Flow>(newFlow()),
    rewarded = useRef(false),
    lastTick = useRef<number | null>(null);
  const beatTrack = useRef<(() => void) | null>(null);
  const [view, setView] = useState(game.current),
    [near, setNear] = useState(false);
  const [hype, setHype] = useState(flow.current.hype);
  const [sheet, setSheet] = useState<FlowSheet | null>(null);
  const [landedBar, setLandedBar] = useState(-1);
  const pad = useRef<HTMLButtonElement>(null);
  const level = useRef(0),
    confettiNext = useRef(false),
    swappedBar = useRef(-1);
  const launcher = useRef<BeatLaunch | null>(null);
  const returnFocus = useRef<BeatLaunch | null>(null);
  const focusLauncher = useCallback((button: HTMLButtonElement | null) => {
    if (button && button.dataset.beatLauncher === returnFocus.current) {
      returnFocus.current = null;
      button.focus({ preventScroll: true });
    }
  }, []);
  const refresh = useRef(0);
  const stopBeatTrack = useCallback(() => {
    beatTrack.current?.();
    beatTrack.current = null;
  }, []);
  const syncBeatTrack = useCallback(() => {
    if (
      game.current.phase !== "playing" ||
      !runtime.active ||
      !gameIsActive() ||
      useGame.getState().muted ||
      useGameMode.getState().active?.id !== "music"
    ) {
      stopBeatTrack();
    } else if (!beatTrack.current) {
      beatTrack.current = scheduleLabBeat(
        () => {
          const tick = lastTick.current;
          return game.current.time + (tick === null ? 0 : (performance.now() - tick) / 1000);
        },
        rhymeRoundEnd(game.current),
        rhymeBeatInterval(game.current),
        RHYME_BEATS[game.current.beat].pattern,
        BEATS_PER_BAR,
      );
    }
  }, [stopBeatTrack]);
  const resetTake = useCallback((beat: number, scheme: RhymeScheme) => {
    game.current = newRhymeGame(Date.now(), beat, scheme);
    flow.current = newFlow(game.current.bars.length);
    rewarded.current = false;
    lastTick.current = null;
    level.current = 0;
    confettiNext.current = false;
    swappedBar.current = -1;
    setHype(flow.current.hype);
    setLandedBar(-1);
    setView(game.current);
  }, []);
  const cancelRound = useCallback(() => {
    stopBeatTrack();
    resetTake(game.current.beat, game.current.scheme);
  }, [stopBeatTrack, resetTake]);
  const close = useLabClose(
    "music",
    useCallback(() => {
      if (useGameMode.getState().active?.id === "music") returnFocus.current = launcher.current;
      setSheet(null);
      cancelRound();
    }, [cancelRound]),
  );
  const syncBeat = useCallback(() => {
    if (game.current.phase !== "playing") return game.current;
    const now = performance.now();
    const previous = lastTick.current;
    lastTick.current = now;
    if (previous !== null) game.current = advanceRhyme(game.current, (now - previous) / 1000);
    return game.current;
  }, []);
  /** The take time of an input happening now, corrected for output latency. */
  const takeNow = () => syncBeat().time - outputLatency();
  const finish = (g: RhymeGame) => {
    stopBeatTrack();
    rewarded.current = true;
    const f = flow.current;
    flowCloseBars(f, rhymeRoundEnd(g) + 1, flowGrid(g));
    const result = flowSheet(f);
    setSheet(result);
    sound("chime");
    juice.haptic("score");
    const store = useGame.getState();
    store.countBest("music.rounds");
    store.recordBest(`music.take.${RHYME_BEATS[g.beat].pattern}`, 1);
    const beats = RHYME_BEATS.filter((b) => (useGame.getState().save.bests?.[`music.take.${b.pattern}`] ?? 0) > 0).length;
    store.recordBest("music.beats", beats);
    store.recordBest("music.landed", result.landed);
    reportRun("music", { mode: "freestyle", score: result.landed, stats: { beat: g.beat, taps: result.taps } });
  };
  const tap = (at?: number) => {
    const g = game.current;
    if (g.phase !== "playing") return;
    const t = at ?? takeNow();
    const res = flowTap(flow.current, t, flowGrid(g));
    const el = pad.current;
    if (el) {
      el.classList.remove("is-pocket", "is-close", "is-loose");
      void el.offsetWidth;
      if (res) el.classList.add(`is-${res.grade}`);
    }
    if (res?.landed) {
      sound("perfect", { gain: 0.4 });
      setLandedBar(res.bar);
      if (confettiNext.current) {
        confettiNext.current = false;
        juice.confetti(40);
      }
    }
    setHype(flow.current.hype);
  };
  const adlib = (lane: number) => {
    const g = game.current;
    if (g.phase !== "playing") return;
    labTone(lane);
    flowAdlib(flow.current, takeNow(), flowGrid(g));
    setHype(flow.current.hype);
  };
  const swap = () => {
    const g = game.current;
    const bar = rhymeBarIndex(g);
    if (g.phase !== "playing" || bar < 0 || swappedBar.current === bar) return;
    swappedBar.current = bar;
    game.current = swapRhymeWord(g, bar);
    setView(game.current);
  };
  useEffect(() => {
    const unsubscribeGame = useGame.subscribe(() => {
      if (!gameIsActive() || !runtime.active) {
        if (lastTick.current !== null) syncBeat();
        lastTick.current = null;
      } else if (game.current.phase === "playing" && lastTick.current === null) {
        lastTick.current = performance.now();
      }
      syncBeatTrack();
    });
    const unsubscribeMode = useGameMode.subscribe(syncBeatTrack);
    return () => {
      unsubscribeGame();
      unsubscribeMode();
      stopBeatTrack();
    };
  }, [stopBeatTrack, syncBeat, syncBeatTrack]);
  const inputs = useRef({ tap, adlib, swap });
  inputs.current = { tap, adlib, swap };
  // Keyboard: Space is the flow pad, D F J K the ad-libs, W swaps the word.
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || !gameIsActive()) return;
      const target = e.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]")) return;
      const key = e.key.toLowerCase();
      if (game.current.phase !== "playing") return;
      if (key === " " && !target.closest("button:not(.flow-pad)")) {
        e.preventDefault();
        inputs.current.tap();
      } else if ((ADLIB_KEYS as readonly string[]).includes(key)) {
        e.preventDefault();
        inputs.current.adlib(ADLIB_KEYS.indexOf(key as (typeof ADLIB_KEYS)[number]));
      } else if (key === "w") {
        e.preventDefault();
        inputs.current.swap();
      }
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [active]);
  useFrame((_, dt) => {
    if (!gameIsActive() || !runtime.active) {
      lastTick.current = null;
      stopBeatTrack();
      return;
    }
    if (useGameMode.getState().active?.id !== "music") {
      const nearby = Math.hypot(runtime.x, runtime.z + 2) <= 8;
      if (nearby !== near) setNear(nearby);
      return;
    }
    const g = syncBeat();
    if (g.phase === "playing") {
      const f = flow.current;
      const closed = f.closed;
      flowCloseBars(f, g.time, flowGrid(g));
      if (f.closed !== closed) setHype(f.hype);
      const lv = hypeLevel(f.hype);
      if (lv > level.current) {
        if (lv >= 2) sound("cheer", { gain: 0.15 });
        if (lv === 3) {
          juice.banner("Roof's off", "great");
          confettiNext.current = true;
        }
      }
      level.current = lv;
    }
    if (g.phase === "done" && !rewarded.current) finish(g);
    refresh.current += dt;
    if (refresh.current > 0.04) {
      refresh.current = 0;
      setView(g);
    }
  }, -1);
  const start = (phase: BeatLaunch) => {
    if (!gameIsActive()) return;
    if (!active) {
      if (!near || !startGameMode("music")) return;
      launcher.current = phase;
    }
    setSheet(null);
    cancelRound();
    if (phase === "playing") {
      game.current = { ...game.current, phase };
      lastTick.current = performance.now();
      setView(game.current);
      syncBeatTrack();
    }
  };
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(
    () =>
      registerGameQa("music", {
        state: () => {
          const g = game.current,
            f = flow.current;
          return { phase: g.phase, beat: g.beat, scheme: g.scheme, topic: g.topic, time: g.time, bar: rhymeBarIndex(g), hype: f.hype, taps: f.taps, landed: f.landed.filter(Boolean).length, offset: f.offset, end: rhymeRoundEnd(g), grid: flowGrid(g) };
        },
        act: (name, value) => {
          if (name === "start") startRef.current("playing");
          else if (name === "tap") inputs.current.tap(typeof value === "number" ? value : undefined);
          else if (name === "seek" && typeof value === "number") {
            // QA: jump the take clock (the beat track is rescheduled).
            stopBeatTrack();
            game.current = advanceRhyme(game.current, Math.max(0, value - game.current.time));
            lastTick.current = performance.now();
            syncBeatTrack();
          }
        },
      }),
    [stopBeatTrack, syncBeatTrack],
  );
  // Walk-up room: the header offers Play while you stand in the ring.
  const hosted = useLauncherHosted("music");
  useLauncher("music", "music", "Play", () => start("playing"), { enabled: !active && near, hint: "Enter" });
  const setBeat = (beat: number) => {
    if (game.current.phase === "playing") return;
    setSheet(null);
    resetTake(beat, game.current.scheme);
  };
  const setScheme = (scheme: RhymeScheme) => {
    if (game.current.phase === "playing") return;
    resetTake(game.current.beat, scheme);
  };
  const beatInterval = rhymeBeatInterval(view);
  const countInLeft =
    view.phase === "playing" && view.time < rhymeCountIn(view)
      ? Math.ceil((rhymeCountIn(view) - view.time) / beatInterval)
      : 0;
  const bar = rhymeBarIndex(view);
  const word = bar >= 0 ? view.bars[bar].word : null;
  const next = view.bars[bar + 1]?.word;
  const variant = bar >= 0 ? variantForBar(bar) : "A";
  const lv = hypeLevel(hype);
  return (
    <>
      {active && <LabCamera id="music" />}
      <WalkFloor />
      <StudioDressing />
      <BeatVisuals game={game} hype={flow} />
      <LabControls name="Beat Lab controls" active={active} tone="beat">
        {active ? (
          <>
            <header className="lab-game-topbar">
              <div>
                <strong>Beat Lab · Open Mic</strong>
                <span>
                  {view.phase === "playing"
                    ? `Bar ${Math.min(RHYME_BARS, Math.max(1, bar + 1))}/${RHYME_BARS}${variant === "drop" ? " · drop" : ""}`
                    : `${RHYME_BEATS[view.beat].name} · ${RHYME_BEATS[view.beat].bpm} BPM`}
                </span>
              </div>
              <LabGameActions onClose={close} />
            </header>
            {view.phase === "playing" && (
              <div className={`rhyme-stage${variant === "drop" ? " is-drop" : ""}`}>
                <p className="rhyme-topic">Topic: {view.topic}</p>
                <p className="rhyme-next">{next ?? ""}</p>
                <p className={`rhyme-word${landedBar === bar && bar >= 0 ? " is-landed" : ""}`} role="status">
                  {countInLeft ? `Ready · ${countInLeft}` : word}
                  {landedBar === bar && bar >= 0 && <span className="rhyme-tick" aria-label="landed"> ✓</span>}
                </p>
              </div>
            )}
            <div className="lab-game-bottom">
              {view.phase === "playing" && (
                <div className="flow-row">
                  <div className={`hype-meter level-${lv}`} aria-label={LEVEL_NAMES[lv] || "Calm room"} role="img">
                    <i style={{ transform: `scaleX(${(hype / 100).toFixed(3)})` }} />
                    <span>{LEVEL_NAMES[lv] || "Hype"}</span>
                  </div>
                  <div className="adlib-pads" role="group" aria-label="Ad-libs">
                    {ADLIB_KEYS.map((key, lane) => (
                      <button key={key} onPointerDown={(e) => { e.preventDefault(); adlib(lane); }} onClick={(e) => { if (e.detail === 0) adlib(lane); }} style={{ borderColor: colors[lane] }}>
                        <kbd>{key.toUpperCase()}</kbd>
                      </button>
                    ))}
                  </div>
                  <button
                    ref={pad}
                    className="flow-pad"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      tap();
                    }}
                    onClick={(e) => {
                      if (e.detail === 0) tap();
                    }}
                  >
                    Flow <kbd>Space</kbd>
                  </button>
                </div>
              )}
              {sheet && view.phase !== "playing" && (
                <section className="flow-sheet" aria-label="Flow sheet">
                  <h3>{sheet.verdict}</h3>
                  <p className="flow-style">{sheet.style}</p>
                  <dl>
                    <div><dt>In the pocket</dt><dd>{sheet.pocketPct}%</dd></div>
                    <div><dt>Longest pocket run</dt><dd>{sheet.bestRun}</dd></div>
                    <div><dt>Rhymes landed</dt><dd>{sheet.landed}/{sheet.bars}</dd></div>
                    <div><dt>Taps per bar</dt><dd>{sheet.tapsPerBar}</dd></div>
                  </dl>
                  <MedalRow game="music" />
                  <QueuedStamps />
                </section>
              )}
              <div className="rhyme-toolbar">
                <p className="lab-feedback" role="status">
                  {view.phase === "done"
                    ? "Take done. Nothing was recorded."
                    : view.phase === "playing"
                      ? "Rap out loud. Tap the pad on your stresses; land the word on beat 4."
                      : `Topic: ${view.topic}`}
                </p>
                {view.phase !== "playing" && (
                  <>
                    <div className="rhyme-beats" role="group" aria-label="Beat">
                      {RHYME_BEATS.map((beat, i) => (
                        <button key={beat.name} aria-pressed={view.beat === i} onClick={() => setBeat(i)}>
                          {beat.name}
                        </button>
                      ))}
                    </div>
                    <div className="rhyme-beats rhyme-schemes" role="group" aria-label="Rhyme scheme">
                      {RHYME_SCHEMES.map((scheme) => (
                        <button key={scheme} aria-pressed={view.scheme === scheme} onClick={() => setScheme(scheme)}>
                          {scheme}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button className="lab-primary" onClick={() => start(view.phase === "playing" ? "ready" : "playing")}>
                  {view.phase === "playing" ? "Stop" : view.phase === "done" ? "Again" : "Play"}
                </button>
              </div>
              <div className="beat-track" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (view.time / rhymeRoundEnd(view)) * 100)}%` }} />
              </div>
            </div>
          </>
        ) : (
          <>
            <header>
              <strong>Beat Lab</strong>
              <span>{RHYME_BEATS[view.beat].bpm} BPM</span>
            </header>
            {near ? (
              <>
                <p>Freestyle over a beat. Rap out loud; tap your flow.</p>
                {!hosted && (
                  <footer className="beat-launch">
                    <button className="lab-primary" data-beat-launcher="playing" ref={focusLauncher} onClick={() => start("playing")}>
                      Play
                    </button>
                  </footer>
                )}
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
      <Box p={[0, 0.19, -2]} s={[9, 0.28, 9]} c="#455b4e" />
      <Box p={[0, 0.37, -2]} s={[8.6, 0.12, 8.6]} c="#233e38" />
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

const mathHints = createLightsHintTracker();

export function MathLabInterior() {
  const active = useGameMode((s) => s.active?.id === "math");
  const size = useThree((s) => s.size);
  const zoom = labZoom("math", size.width, size.height);
  const [round, setRound] = useState(0),
    [board, setBoard] = useState(() => newLightsBoard(0));
  const [moves, setMoves] = useState(0),
    [hint, setHint] = useState<number | null>(null);
  const [near, setNear] = useState(false);
  const startingBoard = useRef(board),
    boardRef = useRef(board);
  const solved = board === LIGHTS_TARGET;
  const roundRef = useRef(round);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);
  const [mathBest, setMathBest] = useState<null | { improved: boolean; bests: Record<string, number> }>(null);
  const resetPuzzle = useCallback((nextRound: number) => {
    startingBoard.current = boardRef.current = newLightsBoard(nextRound);
    setBoard(boardRef.current);
    setRound(nextRound);
    setMoves(0);
    setHint(null);
  }, []);
  const cancelRound = useCallback(() => resetPuzzle(0), [resetPuzzle]);
  const close = useLabClose("math", cancelRound);
  const toggle = useCallback((tile: number) => {
    if (
      !gameIsActive() ||
      useGameMode.getState().active?.id !== "math" ||
      boardRef.current === LIGHTS_TARGET
    )
      return;
    const next = flipLights(boardRef.current, tile);
    boardRef.current = next;
    setBoard(next);
    setMoves((v) => v + 1);
    setHint(null);
    labTone(tile % 4);
    if (next === LIGHTS_TARGET) {
      // Solved: the room lights up; the highest puzzle reached is kept.
      sound("perfect");
      juice.confetti(20);
      juice.haptic("win");
      setMathBest(useGame.getState().recordBest("math.puzzle", roundRef.current + 1));
    }
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        (e.target as HTMLElement).closest("input,textarea,select")
      )
        return;
      if (/^[1-9]$/.test(e.key)) toggle(Number(e.key) - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle]);
  useFrame(() => {
    if (!gameIsActive() || active) return;
    const nearby = Math.hypot(runtime.x, runtime.z + 2) <= 8;
    if (nearby !== near) setNear(nearby);
  });
  const reset = (nextRound = round) => {
    if (!gameIsActive() || useGameMode.getState().active?.id !== "math") return;
    resetPuzzle(nextRound);
  };
  const start = () => {
    if (!near || !gameIsActive() || !startGameMode("math")) return;
    cancelRound();
  };
  const hosted = useLauncherHosted("math");
  useLauncher("math", "math", "Play", start, { enabled: !active && near, hint: "Enter" });
  return (
    <>
      {active && <LabCamera id="math" />}
      <WalkFloor />
      <MathDressing />
      {Array.from({ length: 9 }, (_, tile) => {
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
                solved
              )
                return;
              e.stopPropagation();
              toggle(tile);
            }}
          >
            <Box p={[0, 0.06, 0]} s={[2.2, 0.15, 2.2]} c="#152e29" />
            <Box
              p={[0, 0.2, 0]}
              s={[1.95, 0.2, 1.95]}
              c={lit ? "#b98c3d" : "#466458"}
            />
            <Cylinder
              p={[0, 0.37, 0]}
              s={[0.45, 0.1, 0.45]}
              c={lit ? "#f6d875" : "#283e35"}
            />
            <Ring
              p={[0, 0.44, 0]}
              radius={hint === tile ? 0.84 : 0.62}
              tube={hint === tile ? 0.09 : 0.035}
              c={hint === tile ? "#ffffff" : "#c2a265"}
            />
          </group>
        );
      })}
      <LabControls name="Math Lab controls" active={active}>
        {active ? (
          <>
            <header className="lab-game-topbar">
              <div>
                <strong>Math Lab</strong>
                <span>{moves} moves</span>
              </div>
              <LabGameActions onClose={close} />
            </header>
            <div
              className="lights-buttons"
              aria-label="Light switches"
              style={{ width: zoom * 7.5, height: zoom * 7.5 }}
            >
              {Array.from({ length: 9 }, (_, tile) => (
                <button
                  key={tile}
                  aria-label={`Toggle tile ${tile + 1}`}
                  aria-pressed={!!(board & (1 << tile))}
                  data-hint={hint === tile}
                  disabled={solved}
                  style={{ margin: zoom * 0.15 }}
                  onClick={() => toggle(tile)}
                >
                  {tile + 1}
                </button>
              ))}
            </div>
            <footer className="lab-game-bottom lab-math-bottom">
              <p role="status">
                {solved
                  ? mathBest?.improved
                    ? `All lit · new best: puzzle ${mathBest.bests["math.puzzle"]}`
                    : "All lit"
                  : "Light all nine · 1–9"}
              </p>
              {solved ? (
                <button
                  className="lab-primary"
                  onClick={() => reset(round + 1)}
                >
                  Next puzzle
                </button>
              ) : (
                <div className="lab-game-actions">
                  <button
                    onClick={() => {
                      if (!gameIsActive()) return;
                      setHint(
                        mathHints.reveal(
                          startingBoard.current,
                          boardRef.current,
                        ),
                      );
                    }}
                  >
                    Hint
                  </button>
                  <button onClick={() => reset()}>Reset</button>
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
                <p>Light all nine. A tile flips its neighbours too.</p>
                {!hosted && (
                  <button className="lab-primary" onClick={start}>
                    Play
                  </button>
                )}
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
