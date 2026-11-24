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
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import { Ball, Box, Cylinder, Ring, Sign } from "../world/Models";
import { Plant, Stool, Table, gameIsActive } from "./InteriorProps";
import { runtime, useGame } from "../core/store";
import { ROOM } from "../core/room";
import {
  advanceBeat,
  BEAT_INTERVAL,
  flipLights,
  hitBeat,
  LIGHTS_TARGET,
  lightsHint,
  newBeatGame,
  newLightsBoard,
  type BeatGame,
} from "../core/labGames";
import { newRunId } from "../../shared/run-id";
import { labTone } from "./labAudio";
import "./lab-rooms.css";

const colors = ["#ed9c43", "#5cb9a6", "#d26754", "#9c9ed1"];
const laneX = [-3.3, -1.1, 1.1, 3.3];

function LabControls({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.build);
  if (hidden) return null;
  return (
    <Html
      fullscreen
      portal={portal}
      zIndexRange={[25, 25]}
      style={{ pointerEvents: "none" }}
      calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
    >
      <section
        className="lab-controls"
        aria-label={name}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </section>
    </Html>
  );
}

function WalkFloor() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.13, 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!gameIsActive()) return;
        runtime.path = [];
        runtime.target = [
          Math.max(-ROOM.walkX, Math.min(ROOM.walkX, e.point.x)),
          Math.max(ROOM.minZ, Math.min(ROOM.maxZ, e.point.z)),
        ];
      }}
    >
      <planeGeometry args={[ROOM.width, ROOM.depth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function Speaker({ x, z = -8 }: { x: number; z?: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.18, 0]} s={[2.7, 0.36, 2]} c="#4a352c" />
      <Box p={[0, 2.2, 0]} s={[2.1, 4.1, 1.65]} c="#393e3c" />
      <Box p={[0, 2.2, 0.85]} s={[1.85, 3.8, 0.14]} c="#252e2c" />
      {[1.4, 3.1].map((y, i) => (
        <group key={y} position={[0, y, 1]}>
          <Cylinder
            s={[i ? 0.42 : 0.72, 0.18, i ? 0.42 : 0.72]}
            r={[Math.PI / 2, 0, 0]}
            c="#b38949"
          />
          <Cylinder
            p={[0, 0, 0.12]}
            s={[i ? 0.31 : 0.59, 0.12, i ? 0.31 : 0.59]}
            r={[Math.PI / 2, 0, 0]}
            c="#27302e"
          />
          <Ball p={[0, 0, 0.2]} s={[0.2, 0.2, 0.1]} c="#5f716c" />
        </group>
      ))}
      {[-0.85, 0.85].flatMap((sx) =>
        [0.5, 3.9].map((y) => (
          <Ball
            key={`${sx}${y}`}
            p={[sx, y, 0.96]}
            s={[0.07, 0.07, 0.05]}
            c="#d4ae64"
          />
        )),
      )}
    </group>
  );
}

function StudioDressing() {
  return (
    <>
      <Box p={[0, 0.18, -4.6]} s={[11.2, 0.2, 14]} c="#493b35" />
      <Box p={[0, 0.3, -4.6]} s={[10.7, 0.1, 13.7]} c="#3d514e" />
      {[-5.4, 5.4].map((x) => (
        <Box key={x} p={[x, 0.32, -4.6]} s={[0.15, 0.15, 14]} c="#b58a43" />
      ))}
      <Speaker x={-7.7} />
      <Speaker x={7.7} />
      {[-7.8, -2.6, 2.6, 7.8].map((x) => (
        <group key={x} position={[x, 2.7, -12.1]}>
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
      <group position={[-7.8, 0, -0.4]} rotation={[0, Math.PI / 2, 0]}>
        <Table size={[4.4, 1.7]} />
        <Box p={[0, 1.38, 0]} s={[4.2, 0.32, 1.55]} c="#35433e" />
        {Array.from({ length: 12 }, (_, i) => (
          <group key={i}>
            <Box
              p={[-1.8 + i * 0.32, 1.58, 0.4]}
              s={[0.26, 0.1, 0.65]}
              c="#decfaa"
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
      <group position={[7.6, 0, 0.8]}>
        <Cylinder p={[0, 0.15, 0]} s={[0.9, 0.25, 0.9]} c="#4e5448" />
        <Cylinder p={[0, 1.8, 0]} s={[0.08, 3.5, 0.08]} c="#a69773" />
        <Cylinder p={[0, 3.7, 0]} s={[0.22, 0.65, 0.22]} c="#343c37" />
        <Ring
          p={[0, 3.6, 0.4]}
          radius={0.5}
          tube={0.04}
          c="#a69773"
          r={[0, 0, 0]}
        />
      </group>
      <Plant p={[-8, 0, 5.3]} />
      <Plant p={[8, 0, 5.3]} />
      <Sign
        text="1     2     3     4"
        p={[0, 1.8, -10.8]}
        size={[7, 0.8]}
        color="#293e38"
        ink="#eed294"
      />
    </>
  );
}

function BeatVisuals({
  game,
  onHit,
}: {
  game: RefObject<BeatGame>;
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
          <Box p={[x, 0.4, -6]} s={[0.08, 0.06, 9.8]} c={colors[lane]} />
          <group
            position={[x, 0.4, -2]}
            onPointerDown={(e) => {
              e.stopPropagation();
              onHit(lane);
            }}
          >
            <Cylinder p={[0, 0.14, 0]} s={[0.95, 0.28, 0.95]} c="#242e2c" />
            <Cylinder p={[0, 0.33, 0]} s={[0.79, 0.2, 0.79]} c={colors[lane]} />
            <Ring p={[0, 0.46, 0]} radius={0.61} tube={0.045} c="#f0d9a4" />
          </group>
        </group>
      ))}
      <group ref={pulse} position={[0, 0.43, 1.3]}>
        <Ring radius={0.8} tube={0.08} c="#e4ba64" />
      </group>
      <group ref={notes}>
        {game.current.notes.map((note, i) => (
          <group
            key={i}
            position={[laneX[note.lane], 0.72, -11]}
            visible={false}
          >
            <Box s={[1.4, 0.27, 0.55]} c={colors[note.lane]} />
            <Box p={[0, 0.18, 0]} s={[0.9, 0.06, 0.25]} c="#f3db9e" />
          </group>
        ))}
      </group>
    </>
  );
}

export function BeatLabInterior() {
  const game = useRef(newBeatGame()),
    rewarded = useRef(false),
    lastPulse = useRef(-1);
  const [view, setView] = useState(game.current),
    [near, setNear] = useState(false);
  const refresh = useRef(0);
  const play = useCallback((lane: number) => {
    if (!gameIsActive() || Math.hypot(runtime.x, runtime.z + 2) > 8) return;
    game.current = hitBeat(game.current, lane);
    labTone(lane);
    setView(game.current);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        (e.target as HTMLElement).closest("input,textarea,select")
      )
        return;
      if (/^[1-4]$/.test(e.key)) play(Number(e.key) - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [play]);
  useFrame((_, dt) => {
    if (!gameIsActive() || !runtime.active) return;
    const close = Math.hypot(runtime.x, runtime.z + 2) <= 8;
    if (close !== near) setNear(close);
    // Walking away suspends the phrase instead of silently losing notes.
    if (close) game.current = advanceBeat(game.current, Math.min(dt, 0.05));
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
  const start = () => {
    if (!gameIsActive() || !near) return;
    rewarded.current = false;
    lastPulse.current = -1;
    game.current = { ...newBeatGame(), phase: "playing" };
    labTone(0, true);
    setView(game.current);
  };
  return (
    <>
      <WalkFloor />
      <StudioDressing />
      <BeatVisuals game={game} onHit={play} />
      <LabControls name="Beat Lab controls">
        <header>
          <strong>Beat Lab</strong>
          <span>
            {view.phase === "playing"
              ? `${view.points} · ${view.combo}×`
              : "100 BPM"}
          </span>
        </header>
        {!near ? (
          <p>Walk up to the brass ring.</p>
        ) : view.phase === "ready" ? (
          <>
            <p>Hit 1–4 as notes reach the pads.</p>
            <button className="lab-primary" onClick={start}>
              Play
            </button>
          </>
        ) : view.phase === "done" ? (
          <>
            <p role="status">
              {view.notes.filter((n) => n.hit).length}/32 hits · best{" "}
              {view.best}×
            </p>
            <p>
              {view.notes.filter((n) => n.hit).length >= 20
                ? `+${view.points >= 2600 ? 20 : 12} coins`
                : "20 hits earns coins."}
            </p>
            <button className="lab-primary" onClick={start}>
              Again
            </button>
          </>
        ) : (
          <>
            <div className="beat-track" aria-hidden="true">
              <i
                style={{ width: `${Math.min(100, (view.time / 21.6) * 100)}%` }}
              />
            </div>
            <p className="lab-feedback" role="status">
              {view.time < 2.4
                ? `Ready · ${Math.ceil((2.4 - view.time) / BEAT_INTERVAL)}`
                : view.feedback || "1–4 · follow the notes"}
            </p>
            <div className="beat-buttons">
              {colors.map((c, lane) => (
                <button
                  key={lane}
                  style={{ borderColor: c }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    play(lane);
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) play(lane);
                  }}
                  aria-label={`Play pad ${lane + 1}`}
                >
                  {lane + 1}
                </button>
              ))}
            </div>
          </>
        )}
      </LabControls>
    </>
  );
}

function MathDressing() {
  const sculpture = useRef<Group>(null);
  useFrame((_, dt) => {
    if (sculpture.current && gameIsActive())
      sculpture.current.rotation.y += Math.min(dt, 0.05) * 0.25;
  });
  return (
    <>
      <Box p={[0, 0.19, -2]} s={[9, 0.28, 9]} c="#455b4e" />
      <Box p={[0, 0.37, -2]} s={[8.6, 0.12, 8.6]} c="#233e38" />
      {[-7.8, 7.8].map((x) => (
        <group key={x} position={[x, 0, -8.5]}>
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
      <Box p={[0, 2.5, -11.95]} s={[7.3, 3.5, 0.5]} c="#805d36" />
      <Box p={[0, 2.5, -11.64]} s={[6.8, 3, 0.15]} c="#264c40" />
      <Sign
        text="0 ↔ 1"
        p={[0, 2.7, -11.51]}
        size={[4.2, 1]}
        color="#264c40"
        ink="#e2c587"
      />
      <group position={[7.5, 0, 0.2]}>
        <Cylinder p={[0, 0.2, 0]} s={[1.6, 0.35, 1.6]} c="#80745b" />
        <Cylinder p={[0, 1.2, 0]} s={[0.3, 2.2, 0.3]} c="#af8748" />
        <group ref={sculpture} position={[0, 3, 0]}>
          <Ring radius={1.4} tube={0.1} c="#cfaa5c" r={[0.7, 0, 0.3]} />
          <Ring radius={1.1} tube={0.09} c="#7b9b8c" r={[0.1, 0, 1.1]} />
          <Ball s={[0.58, 0.58, 0.58]} c="#c79544" />
        </group>
      </group>
      <group position={[-7.5, 0, 1]}>
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
      <Plant p={[-8.5, 0, 5]} />
      <Plant p={[8.5, 0, 5]} />
    </>
  );
}

export function MathLabInterior() {
  const [round, setRound] = useState(0),
    [board, setBoard] = useState(() => newLightsBoard(0));
  const [moves, setMoves] = useState(0),
    [hint, setHint] = useState<number | null>(null);
  const [near, setNear] = useState(false),
    [started, setStarted] = useState(false);
  const rewarded = useRef(false),
    stepTile = useRef(-1),
    boardRef = useRef(board);
  const solved = board === LIGHTS_TARGET;
  const toggle = useCallback((tile: number) => {
    if (
      !gameIsActive() ||
      Math.hypot(runtime.x, runtime.z + 2) > 8 ||
      boardRef.current === LIGHTS_TARGET
    )
      return;
    const next = flipLights(boardRef.current, tile);
    boardRef.current = next;
    setBoard(next);
    setMoves((v) => v + 1);
    setHint(null);
    labTone(tile % 4);
    if (next === LIGHTS_TARGET && !rewarded.current) {
      rewarded.current = true;
      useGame.getState().award(`math-${newRunId()}`, 15, 10);
    }
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        !started ||
        (e.target as HTMLElement).closest("input,textarea,select")
      )
        return;
      if (/^[1-9]$/.test(e.key)) toggle(Number(e.key) - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle, started]);
  useFrame(() => {
    if (!gameIsActive()) return;
    const close = Math.hypot(runtime.x, runtime.z + 2) <= 8;
    if (close !== near) setNear(close);
    const col = Math.round(runtime.x / 2.5) + 1,
      row = Math.round((runtime.z + 2) / 2.5) + 1;
    const cx = (col - 1) * 2.5,
      cz = (row - 1) * 2.5 - 2;
    const tile =
      col >= 0 &&
      col < 3 &&
      row >= 0 &&
      row < 3 &&
      Math.hypot(runtime.x - cx, runtime.z - cz) < 0.78
        ? row * 3 + col
        : -1;
    if (tile !== stepTile.current) {
      stepTile.current = tile;
      if (tile >= 0 && started) toggle(tile);
    }
  });
  const reset = (nextRound = round) => {
    if (!gameIsActive()) return;
    setRound(nextRound);
    setMoves(0);
    setHint(null);
    boardRef.current = newLightsBoard(nextRound);
    setBoard(boardRef.current);
    rewarded.current = false;
  };
  return (
    <>
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
              e.stopPropagation();
              if (started) toggle(tile);
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
      <LabControls name="Math Lab controls">
        <header>
          <strong>Math Lab</strong>
          <span>{moves} moves</span>
        </header>
        {!near ? (
          <p>Walk up to the nine tiles.</p>
        ) : !started ? (
          <>
            <p>Light all nine. A tile flips its neighbours too.</p>
            <button
              className="lab-primary"
              onClick={() => {
                if (gameIsActive()) setStarted(true);
              }}
            >
              Play
            </button>
          </>
        ) : solved ? (
          <>
            <p role="status">All lit · +15 coins</p>
            <button className="lab-primary" onClick={() => reset(round + 1)}>
              Next puzzle
            </button>
          </>
        ) : (
          <>
            <p>Step on tiles, or use 1–9.</p>
            <div className="lights-buttons" aria-label="Light switches">
              {Array.from({ length: 9 }, (_, tile) => (
                <button
                  key={tile}
                  aria-label={`Toggle tile ${tile + 1}`}
                  aria-pressed={!!(board & (1 << tile))}
                  data-hint={hint === tile}
                  onClick={() => toggle(tile)}
                >
                  {tile + 1}
                </button>
              ))}
            </div>
            <footer>
              <button
                onClick={() => {
                  if (gameIsActive()) setHint(lightsHint(board));
                }}
              >
                Hint
              </button>
              <button onClick={() => reset()}>Reset</button>
            </footer>
          </>
        )}
      </LabControls>
    </>
  );
}
