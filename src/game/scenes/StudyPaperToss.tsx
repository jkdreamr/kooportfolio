import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, Group, PerspectiveCamera, Vector3 } from "three";
import {
  AIM_LIMIT,
  BIN_RIM,
  LANDING_TIME,
  RIM_AGE,
  THROW_Y,
  THROW_Z,
  TOSS_LEVELS,
  binPosition,
  canThrowPaper,
  chargePower,
  launchPaper,
  levelCleared,
  newTossRound,
  roundOver,
  shotPosition,
  stepToss,
  swipeToss,
  throwPaper,
} from "../core/paperToss";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { runtime, useGame } from "../core/store";
import { Box, Cylinder } from "../world/Models";
import "./paper-toss.css";

const DESK = "#414f5b";
const STEEL = "#748692";
const TRIM = "#9caab1";
const LIGHT = "#e1e7e9";
const ARC_DOTS = 8;

function DeskSet() {
  return (
    <>
      <Box p={[0, -0.16, -1]} s={[25, 0.3, 24]} c="#39454b" sharp />
      <Box p={[0, 3.4, -6.2]} s={[24, 7, 0.35]} c="#687780" sharp />
      <Box p={[0, 0.24, -5.94]} s={[24, 0.45, 0.22]} c={DESK} sharp />
      {[-5.6, 5.6].map((x) => (
        <group key={x} position={[x, 3.55, -5.9]}>
          <Box s={[3.25, 2.7, 0.2]} c={DESK} sharp />
          <Box p={[0, 0, 0.12]} s={[3.02, 2.47, 0.05]} c="#8faab7" sharp />
          <Box p={[0, 0, 0.15]} s={[0.08, 2.5, 0.06]} c={DESK} sharp />
          <Box p={[0, 0, 0.15]} s={[3.05, 0.08, 0.06]} c={DESK} sharp />
        </group>
      ))}
      <Box p={[0, 0.06, -3.42]} s={[6.1, 0.1, 1.9]} c="#526773" sharp />
      <Box p={[0, 0.12, -4.17]} s={[5.6, 0.045, 0.035]} c={TRIM} sharp />
      {Array.from({ length: 9 }, (_, i) => (
        <Box
          key={i}
          p={[(i - 4) * 0.6, 0.12, -4.1]}
          s={[0.02, 0.045, i === 4 ? 0.22 : 0.13]}
          c={TRIM}
          sharp
        />
      ))}
      <Box p={[0, 1.05, 2.22]} s={[6.9, 0.2, 2.18]} c={DESK} />
      <Box p={[0, 0.8, 3.19]} s={[6.55, 0.35, 0.14]} c="#303e49" />
      {[-2.98, 2.98].flatMap((x) =>
        [1.43, 3.03].map((z) => (
          <Box
            key={`${x}/${z}`}
            p={[x, 0.5, z]}
            s={[0.17, 1, 0.17]}
            c={STEEL}
          />
        )),
      )}
      <Box p={[0, 1.17, 2.25]} s={[2.75, 0.045, 1.56]} c="#2a343b" />
      <Box
        p={[2.5, 1.27, 2.29]}
        s={[0.97, 0.16, 0.71]}
        c={STEEL}
        r={[0, 0.19, 0]}
      />
      <Box
        p={[2.47, 1.36, 2.31]}
        s={[0.82, 0.05, 0.61]}
        c={LIGHT}
        r={[0, 0.19, 0]}
      />
      <Cylinder p={[-2.48, 1.22, 1.59]} s={[0.37, 0.09, 0.37]} c={STEEL} />
      <Cylinder p={[-2.48, 1.67, 1.59]} s={[0.055, 0.85, 0.055]} c={TRIM} />
      <Cylinder
        p={[-2.23, 2.07, 1.59]}
        s={[0.055, 0.55, 0.055]}
        c={TRIM}
        r={[0, 0, Math.PI / 2]}
      />
      <Cylinder p={[-1.98, 2.02, 1.59]} s={[0.28, 0.2, 0.28]} c={LIGHT} />
    </>
  );
}

export function StudyPaperToss({ playing }: { playing: boolean }) {
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.traveling);
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const round = useRef(newTossRound());
  const charge = useRef<{
    source: "key" | "pointer" | "button";
    start: number;
  } | null>(null);
  const swipe = useRef<{
    id: number;
    x: number;
    y: number;
    aim: number;
    power: number;
  } | null>(null);
  const power = useRef<HTMLProgressElement>(null);
  const bin = useRef<Group>(null);
  const paper = useRef<Group>(null);
  const arc = useRef<Group>(null);
  const hudRef = useRef<HTMLElement | null>(null);
  const aim = useRef(0);
  const desired = useMemo(() => new Vector3(), []);
  const look = useMemo(() => new Vector3(0, 0.9, -1.1), []);
  const restoreLauncher = useRef(false);
  const [hud, setHud] = useState(newTossRound);
  const [lane, setLane] = useState(0);
  const level = TOSS_LEVELS[hud.level];
  const finished = roundOver(hud);
  const cleared = levelCleared(hud);

  const focusLauncher = useCallback((node: HTMLButtonElement | null) => {
    if (node && restoreLauncher.current) {
      restoreLauncher.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);
  const focusHud = useCallback((node: HTMLElement | null) => {
    hudRef.current = node;
    node?.focus({ preventScroll: true });
  }, []);
  const focusReplay = useCallback(
    (node: HTMLButtonElement | null) => node?.focus({ preventScroll: true }),
    [],
  );
  const close = useCallback(() => {
    if (useGameMode.getState().active?.id !== "paper-toss") return;
    restoreLauncher.current = true;
    endGameMode();
  }, []);
  useEffect(() => {
    window.addEventListener("interior-game-close", close);
    const cancel = () => {
      charge.current = null;
      swipe.current = null;
    };
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("interior-game-close", close);
      window.removeEventListener("blur", cancel);
    };
  }, [close]);
  const setAim = (value: number) => {
    aim.current = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, value));
    setLane(aim.current);
  };
  const reset = (level = 0) => {
    round.current = newTossRound(level);
    charge.current = null;
    swipe.current = null;
    setAim(0);
    setHud(round.current);
  };
  const ready = () => playing && !hidden && canThrowPaper(round.current);
  const toss = (strength: number) => {
    if (!ready()) return;
    round.current = throwPaper(round.current, aim.current, strength);
    setHud(round.current);
  };
  const begin = (source: "key" | "pointer" | "button") => {
    if (ready() && !charge.current && !swipe.current) {
      charge.current = { source, start: performance.now() };
    }
  };
  const release = (source: "key" | "pointer" | "button") => {
    if (charge.current?.source !== source) return;
    const strength = chargePower(
      (performance.now() - charge.current.start) / 1000,
    );
    charge.current = null;
    toss(strength);
  };

  const moveSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = swipe.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const size = event.currentTarget.getBoundingClientRect();
    const { aim: lane, power } = swipeToss(
      gesture.aim,
      (event.clientX - gesture.x) / size.width,
      (gesture.y - event.clientY) / Math.min(156, size.height * 0.32),
    );
    gesture.power = power;
    setAim(lane);
  };

  useFrame(({ camera, size }, dt) => {
    if (!playing) return;
    if (hidden || !runtime.active) {
      charge.current = null;
      swipe.current = null;
      return;
    }
    const portrait = size.width / size.height < 0.9;
    const damping = 1 - Math.exp(-dt * 5);
    desired.set(0, portrait ? 6.7 : 6.15, 9.4);
    camera.position.lerp(desired, damping);
    look.set(0, portrait ? 0.65 : 0.9, portrait ? 0.15 : -1.1);
    camera.lookAt(look);
    if (camera instanceof PerspectiveCamera) {
      const fov = portrait ? 60 : 48;
      camera.fov += (fov - camera.fov) * damping;
      camera.updateProjectionMatrix();
    }
    const before = round.current;
    const step = Math.min(dt, 0.1);
    const next = stepToss(before, step);
    round.current = next;
    if (
      next.attempts !== before.attempts ||
      (before.landing && !next.landing)
    ) {
      setHud(next);
    }
    const binX = binPosition(next.railAngle);
    if (bin.current) {
      bin.current.position.x = binX;
    }
    const strength =
      swipe.current?.power ??
      (charge.current
        ? chargePower((performance.now() - charge.current.start) / 1000)
        : null);
    if (arc.current) {
      arc.current.visible = canThrowPaper(next);
      if (arc.current.visible) {
        const preview = launchPaper(aim.current, strength ?? 0.5, level);
        arc.current.children.forEach((dot, i) => {
          const { x, y, z } = shotPosition(
            preview,
            (RIM_AGE * (i + 1)) / ARC_DOTS,
          );
          dot.position.set(x, y, z);
        });
      }
    }
    if (paper.current) {
      if (next.shot) {
        const { x, y, z } = shotPosition(next.shot);
        paper.current.position.set(x, y, z);
        paper.current.rotation.set(next.shot.age * 5, next.shot.age * 4, 0.6);
      } else if (next.landing) {
        const { age, x, z } = next.landing;
        const t = age / LANDING_TIME;
        if (next.result === "hit") {
          paper.current.position.set(binX, BIN_RIM - 1.15 * t ** 2, level.binZ);
        } else {
          paper.current.position.set(
            x,
            0.22 + Math.sin(t * Math.PI) * 0.2,
            z - t * 0.46,
          );
        }
        paper.current.rotation.x += step * 7;
      } else {
        paper.current.position.set(0, THROW_Y, THROW_Z);
        paper.current.rotation.set(0.3, aim.current * 0.3, 0.6);
      }
      paper.current.visible = !!next.landing || next.attempts < level.attempts;
    }
    if (power.current) {
      power.current.value = strength ?? 0;
    }
  });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!playing) {
      if (event.key === " ") event.stopPropagation();
      return;
    }
    event.stopPropagation();
    if (
      event.key === " " &&
      !finished &&
      !(
        event.target instanceof HTMLButtonElement &&
        event.target.dataset.toss === undefined
      )
    ) {
      event.preventDefault();
      if (!event.repeat) begin("key");
    }
    const aimKey = {
      ArrowLeft: -0.12,
      a: -0.12,
      A: -0.12,
      ArrowRight: 0.12,
      d: 0.12,
      D: 0.12,
    }[event.key];
    const arrowOnSlider =
      event.target instanceof HTMLInputElement &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight");
    if (aimKey !== undefined && !arrowOnSlider) {
      event.preventDefault();
      setAim(aim.current + aimKey);
    }
  };
  return (
    <>
      {playing && (
        <>
          <DeskSet />
          <group ref={arc} visible={false} name="paper-toss-preview">
            {Array.from({ length: ARC_DOTS }, (_, i) => (
              <mesh key={i}>
                <sphereGeometry
                  args={[i === ARC_DOTS - 1 ? 0.085 : 0.051, 8, 6]}
                />
                <meshBasicMaterial
                  color={i === ARC_DOTS - 1 ? "#e5f1f7" : "#a0bbc9"}
                />
              </mesh>
            ))}
          </group>
          <group ref={bin} position={[0, 0, level.binZ]}>
            <mesh position={[0, BIN_RIM / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry
                args={[level.binRadius, 0.48, BIN_RIM, 24, 1, true]}
              />
              <meshStandardMaterial
                color={DESK}
                side={DoubleSide}
                roughness={0.76}
              />
            </mesh>
            <Cylinder p={[0, 0.045, 0]} s={[0.49, 0.09, 0.49]} c="#242e38" />
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, BIN_RIM, 0]}>
              <torusGeometry args={[level.binRadius, 0.055, 8, 32]} />
              <meshStandardMaterial
                color={hud.result === "hit" ? "#b5e4d6" : LIGHT}
              />
            </mesh>
            <Box p={[0, 0.8, 0.58]} s={[0.22, 0.24, 0.025]} c={TRIM} />
          </group>
          <group ref={paper} position={[0, THROW_Y, THROW_Z]}>
            <mesh castShadow>
              <icosahedronGeometry args={[0.28, 0]} />
              <meshStandardMaterial
                color="#f5f7fa"
                flatShading
                roughness={0.88}
              />
            </mesh>
            <mesh position={[0.13, 0.03, 0.09]} rotation={[0.3, 0.7, 0.2]}>
              <icosahedronGeometry args={[0.19, 0]} />
              <meshStandardMaterial
                color="#d7e3ec"
                flatShading
                roughness={0.88}
              />
            </mesh>
          </group>
        </>
      )}
      {!hidden && (
        <Html
          fullscreen
          portal={portal}
          zIndexRange={[80, 0]}
          calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
          style={{ pointerEvents: "none" }}
        >
          <section
            className={playing ? "toss-hud" : "toss-launch"}
            aria-label="Paper Toss"
            tabIndex={playing ? -1 : undefined}
            ref={playing ? focusHud : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onKeyDown}
            onKeyUp={(event) => {
              if (
                playing &&
                event.key === " " &&
                charge.current?.source === "key"
              ) {
                event.preventDefault();
                event.stopPropagation();
                release("key");
              }
            }}
          >
            {playing ? (
              <>
                {!finished && (
                  <div
                    className="toss-swipe"
                    aria-hidden="true"
                    onPointerDown={(event) => {
                      if (!event.isPrimary || !ready() || charge.current)
                        return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      swipe.current = {
                        id: event.pointerId,
                        x: event.clientX,
                        y: event.clientY,
                        aim: aim.current,
                        power: 0,
                      };
                      hudRef.current?.focus({ preventScroll: true });
                    }}
                    onPointerMove={moveSwipe}
                    onPointerUp={(event) => {
                      const gesture = swipe.current;
                      if (!gesture || gesture.id !== event.pointerId) return;
                      moveSwipe(event);
                      swipe.current = null;
                      if (gesture.power >= 0.12) toss(gesture.power);
                    }}
                    onLostPointerCapture={(event) => {
                      if (swipe.current?.id === event.pointerId)
                        swipe.current = null;
                    }}
                  />
                )}
                <header>
                  <div>
                    <h2>Paper Toss</h2>
<<<<<<< HEAD
                    <span aria-label={`Shots ${hud.attempts} of ${TOSS_LIMIT}`}>
                      Shot {hud.attempts} / {TOSS_LIMIT}
||||||| be3ed55
                    <span aria-label={`Score ${hud.score}; shots ${hud.attempts} of ${TOSS_LIMIT}`}>
                      <b key={hud.score} className={hud.score ? "toss-score-pop" : undefined}>{hud.score}</b> / {TOSS_LIMIT} scored
=======
                    <span
                      aria-label={`Level ${hud.level + 1}: ${level.name}; ${hud.made} of ${level.target} to clear`}
                    >
                      Level {hud.level + 1} · {level.name} ·{" "}
                      <b
                        key={hud.made}
                        className={hud.made ? "toss-score-pop" : undefined}
                      >
                        {hud.made}
                      </b>{" "}
                      of {level.target}
>>>>>>> origin/main
                    </span>
                    <p className="toss-status" role="status">
<<<<<<< HEAD
                      {finished ? "All shots taken"
                        : !hud.landing && `Shot ${hud.attempts + 1} of ${TOSS_LIMIT}`}
                      {!finished && hud.result && <strong key={hud.attempts} data-result={hud.result}>{hud.result === "hit" ? "In" : "Miss"}</strong>}
||||||| be3ed55
                      {finished ? `${hud.score} of ${TOSS_LIMIT} made`
                        : !hud.landing && `Shot ${hud.attempts + 1} of ${TOSS_LIMIT}`}
                      {!finished && hud.result && <strong key={hud.attempts} data-result={hud.result}>{hud.result === "hit" ? "+1" : "Miss"}</strong>}
=======
                      {finished
                        ? cleared
                          ? "Level cleared"
                          : `${hud.made} of ${level.target} made`
                        : !hud.landing &&
                          `Shot ${hud.attempts + 1} of ${level.attempts}`}
                      {!finished && hud.result && (
                        <strong key={hud.attempts} data-result={hud.result}>
                          {hud.result === "hit" ? "In" : "Miss"}
                        </strong>
                      )}
                      {!finished && level.wind !== 0 && (
                        <span>Wind {level.wind > 0 ? "→" : "←"}</span>
                      )}
>>>>>>> origin/main
                    </p>
                  </div>
                  <button onClick={close}>Close</button>
                </header>
                <div className="toss-controls">
                  {finished ? (
                    <button
                      ref={focusReplay}
                      onClick={() => {
                        hudRef.current?.focus({ preventScroll: true });
                        reset(
                          cleared
                            ? (hud.level + 1) % TOSS_LEVELS.length
                            : hud.level,
                        );
                      }}
                    >
                      {cleared
                        ? hud.level < TOSS_LEVELS.length - 1
                          ? "Next level"
                          : "Play again"
                        : "Try again"}
                    </button>
                  ) : (
                    <>
                      <p className="toss-hint">
                        <span className="toss-hint-keys">
                          ← → or drag to aim · Hold Space, or flick up to toss
                        </span>
                        <span className="toss-hint-touch">
                          Drag sideways to aim · Swipe up to toss
                        </span>
                      </p>
                      <label>
                        Aim{" "}
                        <input
                          type="range"
                          min={-AIM_LIMIT}
                          max={AIM_LIMIT}
                          step={0.04}
                          value={lane}
                          onChange={(e) => setAim(Number(e.target.value))}
                          aria-label="Aim left or right"
                        />
                      </label>
                      <div className="toss-power">
                        <progress
                          ref={power}
                          max={1}
                          value={0}
                          aria-label="Throw power"
                        />
                        <button
                          data-toss=""
                          aria-disabled={!canThrowPaper(hud)}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (e.button !== 0 || !ready()) return;
                            e.currentTarget.focus({ preventScroll: true });
                            e.currentTarget.setPointerCapture(e.pointerId);
                            begin("pointer");
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            release("pointer");
                          }}
                          onLostPointerCapture={() => {
                            if (charge.current?.source === "pointer")
                              charge.current = null;
                          }}
                          onClick={(e) => {
                            if (e.detail !== 0) return;
                            if (charge.current?.source === "button")
                              release("button");
                            else begin("button");
                          }}
                        >
                          Hold to toss
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <button
                ref={focusLauncher}
                onClick={() => {
                  if (startGameMode("paper-toss")) reset(0);
                }}
              >
                Play Paper Toss
              </button>
            )}
          </section>
        </Html>
      )}
    </>
  );
}
