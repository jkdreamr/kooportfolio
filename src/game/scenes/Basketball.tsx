import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { create } from "zustand";
import * as THREE from "three";
import { Ball, Cylinder, Flowers, Ring, Sign, Tree } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { keys, movement, touch } from "../core/input";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import {
  BACKBOARD,
  COURT_SPOTS,
  HOOP,
  dailyCourtSeed,
  launchBall,
  shotValue,
  stepBall,
  type BallState,
  type ShotStyle,
} from "../core/basketball";
import { footstep, sound } from "../core/sound";
import { BasketballPlayer } from "./BasketballPlayer";
import {
  CourtBall,
  CourtBlock as Box,
  CourtDeck,
  CourtSidelines,
  HoopHardware,
} from "./CourtDetails";
import "./basketball.css";

export type BasketMode = "warmup" | "practice" | "attack" | "daily";
const MODES = {
  warmup: { label: "Warm-up", duration: 30 },
  practice: { label: "Practice", duration: 0 },
  attack: { label: "90 seconds", duration: 90 },
  daily: { label: "Daily", duration: 60 },
};
export const useBasketOptions = create<{
  mode: BasketMode;
  style: ShotStyle;
  assist: boolean;
  round: number;
}>(() => ({ mode: "warmup", style: "arc", assist: true, round: 0 }));
export const useBasketHud = create<{
  time: number;
  charge: number;
  feedback: string;
  holding: boolean;
  challenge: number;
  target: number;
  finished: boolean;
}>(() => ({
  time: 30,
  charge: 0,
  feedback: "",
  holding: true,
  challenge: 0,
  target: 0,
  finished: false,
}));

function beginRound(mode = useBasketOptions.getState().mode) {
  if (!startGameMode("basketball")) return;
  keys.clear();
  touch.x = touch.z = 0;
  runtime.x = 0;
  runtime.z = 5;
  runtime.aim = 0;
  runtime.shoot = runtime.shooting = runtime.moving = false;
  useBasketHud.setState({
    time: MODES[mode].duration,
    charge: 0,
    feedback: "",
    holding: true,
    challenge: 0,
    target: 0,
    finished: false,
  });
  useBasketOptions.setState((s) => ({ mode, round: s.round + 1 }));
}

export function CourtControls({ focused = false }: { focused?: boolean } = {}) {
  const playing = useGameMode((s) => s.active?.id === "basketball");
  const { mode, style, assist } = useBasketOptions();
  const { challenge, target } = useBasketHud();
  if (playing !== focused) return null;
  return (
    <div
      className="basketball-controls"
      data-mode={mode}
      onClick={(event) => {
        if (event.detail > 0 && event.target instanceof HTMLButtonElement)
          event.target.blur();
      }}
      onKeyDown={(event) => {
        if (event.key === " ") event.stopPropagation();
      }}
      onKeyUp={(event) => {
        if (event.key === " ") event.stopPropagation();
      }}
    >
      <select
        className="basketball-mode-select"
        aria-label="Court mode"
        value={mode}
        onChange={(event) => {
          const next = event.target.value as BasketMode;
          if (playing) beginRound(next);
          else useBasketOptions.setState({ mode: next });
        }}
      >
        {(Object.keys(MODES) as BasketMode[]).map((m) => (
          <option key={m} value={m}>
            {MODES[m].label}
          </option>
        ))}
      </select>
      <nav aria-label="Court mode">
        {(Object.keys(MODES) as BasketMode[]).map((m) => (
          <button
            key={m}
            aria-pressed={m === mode}
            onClick={() => {
              if (playing) beginRound(m);
              else useBasketOptions.setState({ mode: m });
            }}
          >
            {MODES[m].label}
          </button>
        ))}
      </nav>
      {!playing ? (
        <div className="basketball-lobby-actions">
          <button className="basketball-play" onClick={() => beginRound()}>
            Play
          </button>
          <button onClick={() => useGame.getState().go("hub")}>
            ← Village
          </button>
        </div>
      ) : (
        <>
          <div className="basketball-switches">
            <button
              aria-pressed={style === "lob"}
              onClick={() =>
                useBasketOptions.setState({
                  style: style === "arc" ? "lob" : "arc",
                })
              }
            >
              {style === "arc" ? "Arc" : "Lob"} ↗
            </button>
            <button
              aria-pressed={assist}
              onClick={() => useBasketOptions.setState({ assist: !assist })}
            >
              Guide {assist ? "on" : "off"}
            </button>
          </div>
          <p>
            <span>{String(challenge + 1).padStart(2, "0")}</span>{" "}
            {COURT_SPOTS[target].label}
          </p>
          {mode === "daily" && <small>UTC · local, unranked</small>}
        </>
      )}
    </div>
  );
}

function CourtSessionHud({ close }: { close: () => void }) {
  const hud = useBasketHud();
  const mode = useBasketOptions((s) => s.mode);
  const [pad, setPad] = useState([0, 0]);
  const shotPointer = useRef<number | null>(null);
  const focusCourt = useCallback((node: HTMLElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  const resetPad = () => {
    touch.x = touch.z = 0;
    setPad([0, 0]);
  };
  const ready = () =>
    useGameMode.getState().active?.id === "basketball" &&
    !useGame.getState().paused &&
    !useBasketHud.getState().finished;
  const releaseShot = () => {
    if (ready() && runtime.shooting) runtime.shoot = true;
    runtime.shooting = false;
  };
  useEffect(
    () => () => {
      touch.x = touch.z = 0;
      runtime.shooting = runtime.shoot = false;
    },
    [],
  );
  return (
    <section
      className="court-session"
      aria-label="Basketball game"
      tabIndex={-1}
      ref={focusCourt}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (
          e.key.toLowerCase() === "c" &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !target.matches("select") &&
          ready()
        ) {
          e.preventDefault();
          e.stopPropagation();
          runtime.aim = 0;
        }
        // Keep native arrow-key aiming, but Space still belongs to the shot.
        if (e.key === " " && target.matches('input[type="range"]')) {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat && ready()) runtime.shooting = true;
        }
        if (e.key === " " && (e.target as HTMLElement).closest("button"))
          e.stopPropagation();
        if (e.key === "Tab") {
          const controls = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), select, input",
            ),
          ).filter((node) => node.getClientRects().length);
          const first = controls[0],
            last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
      onKeyUp={(e) => {
        if (
          e.key === " " &&
          (e.target as HTMLElement).matches('input[type="range"]')
        ) {
          e.preventDefault();
          e.stopPropagation();
          releaseShot();
        }
        if (e.key === " " && (e.target as HTMLElement).closest("button"))
          e.stopPropagation();
      }}
    >
      <header className="court-session-header">
        <div>
          <span>COURT 01</span>
          <strong>{MODES[mode].label}</strong>
        </div>
        {mode !== "practice" && (
          <div className="court-session-score" aria-label="Time left">
            <span>
              {Math.ceil(hud.time)}
              <small>SEC</small>
            </span>
          </div>
        )}
        <div className="court-session-actions">
          <button onClick={() => useGame.setState({ paused: true })}>
            Pause
          </button>
          <button onClick={close} aria-label="Close basketball game">
            Close
          </button>
        </div>
      </header>
      {!hud.finished && (
        <>
          <CourtControls focused />
          <div className="court-feedback" role="status">
            {hud.feedback}
          </div>
          <div className="court-shot">
            <div
              className="court-power"
              role="meter"
              aria-label="Shot power"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(hud.charge * 100)}
            >
              <i style={{ width: `${hud.charge * 100}%` }} />
              <b />
            </div>
            <div className="court-aim">
              <label htmlFor="court-shot-aim">Aim</label>
              <input
                id="court-shot-aim"
                type="range"
                aria-label="Shot aim"
                min={-0.7}
                max={0.7}
                step={0.01}
                value={runtime.aim}
                onChange={(e) => {
                  runtime.aim = Number(e.target.value);
                }}
                onPointerUp={(e) =>
                  focusCourt(
                    e.currentTarget.closest<HTMLElement>(".court-session"),
                  )
                }
              />
              <button
                aria-label="Reset shot aim"
                title="Reset aim (C)"
                onClick={(e) => {
                  runtime.aim = 0;
                  if (e.detail > 0)
                    focusCourt(
                      e.currentTarget.closest<HTMLElement>(".court-session"),
                    );
                }}
              >
                Reset
              </button>
            </div>
            <button
              className="court-shoot"
              disabled={!hud.holding}
              onPointerDown={(e) => {
                if (!ready()) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                shotPointer.current = e.pointerId;
                runtime.shooting = true;
              }}
              onPointerUp={(e) => {
                if (shotPointer.current !== e.pointerId) return;
                shotPointer.current = null;
                releaseShot();
              }}
              onPointerCancel={() => {
                shotPointer.current = null;
                runtime.shooting = runtime.shoot = false;
              }}
              onLostPointerCapture={(e) => {
                if (shotPointer.current === e.pointerId) {
                  shotPointer.current = null;
                  runtime.shooting = runtime.shoot = false;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!e.repeat && ready()) runtime.shooting = true;
                }
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  releaseShot();
                }
              }}
            >
              {hud.holding ? "Hold · Release" : "Chase the ball"}
            </button>
          </div>
          <div
            className="court-pad"
            aria-label="Move player"
            role="group"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const r = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - r.left - r.width / 2) / 35,
                z = (e.clientY - r.top - r.height / 2) / 35;
              const length = Math.max(1, Math.hypot(x, z));
              touch.x = x / length;
              touch.z = z / length;
              setPad([touch.x * 25, touch.z * 25]);
            }}
            onPointerUp={resetPad}
            onPointerCancel={resetPad}
            onLostPointerCapture={resetPad}
          >
            <span
              style={{ transform: `translate(${pad[0]}px, ${pad[1]}px)` }}
            />
          </div>
          <p className="court-keys">
            WASD move · Q / E aim · C reset aim · Hold Space, release in gold
          </p>
        </>
      )}
      {hud.finished && (
        <div className="court-finished" role="status">
          <span>TIME</span>
          <h2>Session done</h2>
          <button onClick={() => beginRound()}>Play again</button>
          <button onClick={close}>Close</button>
        </div>
      )}
    </section>
  );
}

export function Basketball() {
  const playing = useGameMode((s) => s.active?.id === "basketball");
  const round = useBasketOptions((s) => s.round);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const close = useCallback(() => {
    if (useGameMode.getState().active?.id !== "basketball") return;
    endGameMode();
    runtime.aim = 0;
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(".basketball-play")?.focus(),
    );
  }, []);
  useEffect(() => {
    window.addEventListener("interior-game-close", close);
    return () => {
      window.removeEventListener("interior-game-close", close);
      if (useGameMode.getState().active?.id === "basketball") endGameMode();
    };
  }, [close]);
  return (
    <>
      <BasketballCourt key={`${playing}-${round}`} playing={playing} />
      {playing && !hidden && (
        <Html
          fullscreen
          portal={portal}
          zIndexRange={[70, 70]}
          style={{ pointerEvents: "none" }}
          calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
        >
          <CourtSessionHud close={close} />
        </Html>
      )}
    </>
  );
}

function BasketballCourt({ playing }: { playing: boolean }) {
  const player = useRef<THREE.Group>(null),
    ballMesh = useRef<THREE.Group>(null),
    hoopMesh = useRef<THREE.Group>(null),
    net = useRef<THREE.Group>(null);
  const ball = useRef<BallState | null>(null),
    elapsed = useRef(0),
    physicsTime = useRef(0),
    accumulator = useRef(0),
    charge = useRef(0),
    chargeAge = useRef(0),
    release = useRef(1),
    done = useRef(false),
    holding = useRef(true),
    shotDistance = useRef(0),
    spotShot = useRef(false),
    challenge = useRef(0),
    seed = useRef(dailyCourtSeed()),
    feedback = useRef("Release in the gold."),
    nextHud = useRef(0),
    lastBounce = useRef(-1),
    scoredAt = useRef(-10),
    velocity = useRef({ x: 0, z: 0 });
  const save = useGame((s) => s.save);
  const { mode } = useBasketOptions();
  const startSpot = mode === "daily" ? seed.current % COURT_SPOTS.length : 0;
  const target = () => (startSpot + challenge.current) % COURT_SPOTS.length;
  const hoopAt = (time: number) => ({
    ...HOOP,
    x:
      mode === "daily" ? Math.sin(time * 0.8 + (seed.current % 100)) * 1.65 : 0,
  });
  const predicted = useMemo(
    () => Array.from({ length: 30 }, () => new THREE.Vector3()),
    [],
  );
  const line = useRef<THREE.Group>(null),
    marker = useRef<THREE.Group>(null),
    aimArrow = useRef<THREE.Group>(null),
    ballShadow = useRef<THREE.Mesh>(null);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const cameraForward = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }, delta) => {
    const g = useGame.getState();
    if (g.paused || g.result || g.panel !== "none" || !runtime.active) return;
    const sessionActive = useGameMode.getState().active?.id === "basketball";
    // Project screen axes onto the floor, including portrait and camera transitions.
    camera.getWorldDirection(cameraForward);
    const horizontal = Math.hypot(cameraForward.x, cameraForward.z) || 1;
    const rightX = -cameraForward.z / horizontal;
    const rightZ = cameraForward.x / horizontal;
    // Walking never advances a round or consumes a release queued by the shared input.
    if (!playing || !sessionActive) {
      if (playing) return;
      const dt = Math.min(delta, 0.04);
      let [x, z] = movement();
      if (x || z) runtime.target = null;
      else if (runtime.target) {
        const dx = runtime.target[0] - runtime.x,
          dz = runtime.target[1] - runtime.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.15) runtime.target = null;
        else {
          x = dx / d;
          z = dz / d;
        }
      }
      // Match the screen-relative court controls while keeping walking free of inertia.
      const vx = runtime.target ? x : x * rightX - z * rightZ;
      const vz = runtime.target ? z : x * rightZ + z * rightX;
      const px = runtime.x,
        pz = runtime.z;
      runtime.x = THREE.MathUtils.clamp(runtime.x + vx * dt * 4.8, -6, 6);
      runtime.z = THREE.MathUtils.clamp(runtime.z + vz * dt * 4.8, -3.8, 7.7);
      runtime.moving = Math.hypot(vx, vz) > 0.1;
      if (runtime.moving) {
        if (Math.hypot(runtime.x - px, runtime.z - pz) > 0.0001) footstep();
        runtime.heading = Math.atan2(vx, vz);
      }
      runtime.shoot = runtime.shooting = false;
      player.current?.position.set(runtime.x, 0, runtime.z);
      if (player.current) player.current.rotation.y = runtime.heading;
      if (ballMesh.current) ballMesh.current.position.set(-1.8, 0.35, 4);
      if (ballShadow.current) ballShadow.current.visible = false;
      if (line.current) line.current.visible = false;
      if (marker.current) marker.current.visible = false;
      if (aimArrow.current) aimArrow.current.visible = false;
      desiredCamera.set(7, 12.5, 18);
      camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 5));
      camera.lookAt(0, 1.2, -0.8);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = window.innerWidth < 700 ? 70 : 55;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (done.current) return;
    const dt = Math.min(delta, 0.04),
      options = useBasketOptions.getState();
    elapsed.current += dt;
    release.current += dt;
    const duration = MODES[mode].duration,
      buzzer = duration > 0 && elapsed.current >= duration;
    const [inputX, inputZ] = movement();
    const speed = runtime.shooting && holding.current ? 2.2 : 4.8;
    velocity.current.x = THREE.MathUtils.damp(
      velocity.current.x,
      (inputX * rightX - inputZ * rightZ) * speed,
      14,
      dt,
    );
    velocity.current.z = THREE.MathUtils.damp(
      velocity.current.z,
      (inputX * rightZ + inputZ * rightX) * speed,
      14,
      dt,
    );
    runtime.moving = Math.hypot(velocity.current.x, velocity.current.z) > 0.2;
    runtime.x = THREE.MathUtils.clamp(
      runtime.x + velocity.current.x * dt,
      -6,
      6,
    );
    runtime.z = THREE.MathUtils.clamp(
      runtime.z + velocity.current.z * dt,
      -3.8,
      7.7,
    );
    if (keys.has("q")) runtime.aim = Math.max(-0.7, runtime.aim - dt * 0.65);
    if (keys.has("e")) runtime.aim = Math.min(0.7, runtime.aim + dt * 0.65);
    const hoop = hoopAt(physicsTime.current),
      heading =
        Math.atan2(hoop.x - runtime.x, hoop.z - runtime.z) + runtime.aim;
    runtime.heading = heading;
    if (player.current) {
      player.current.position.set(runtime.x, 0, runtime.z);
      player.current.rotation.y = heading;
    }
    if (aimArrow.current) {
      aimArrow.current.position.set(runtime.x, 0.16, runtime.z);
      aimArrow.current.rotation.y = heading;
    }
    if (runtime.shooting && holding.current && !buzzer) {
      chargeAge.current += dt * 0.85;
      charge.current = 1 - Math.abs(1 - (chargeAge.current % 2));
    } else if (!runtime.shoot) {
      charge.current = 0;
      chargeAge.current = 0;
    }
    if (runtime.shoot && holding.current && !buzzer) {
      holding.current = false;
      // Points follow the painted line, even when the Daily hoop moves.
      shotDistance.current = Math.hypot(runtime.x - HOOP.x, runtime.z - HOOP.z);
      const spot = COURT_SPOTS[target()];
      spotShot.current =
        Math.hypot(runtime.x - spot.x, runtime.z - spot.z) < 1.05;
      ball.current = launchBall(
        runtime.x,
        runtime.z,
        charge.current,
        runtime.aim,
        hoop,
        options.style,
      );
      release.current = 0;
      feedback.current =
        Math.abs(charge.current - 0.62) < 0.045
          ? "Clean release"
          : charge.current < 0.62
            ? "Early"
            : "Late";
      charge.current = 0;
      chargeAge.current = 0;
      sound("shot");
    }
    runtime.shoot = false;
    accumulator.current += dt;
    while (accumulator.current >= 1 / 120) {
      physicsTime.current += 1 / 120;
      if (ball.current) {
        const result = stepBall(
          ball.current,
          1 / 120,
          hoopAt(physicsTime.current),
        );
        ball.current = result.ball;
        if (result.collision && elapsed.current - lastBounce.current > 0.1) {
          sound("bounce");
          lastBounce.current = elapsed.current;
        }
        if (result.score) {
          const value = shotValue(ball.current, shotDistance.current);
          feedback.current = value.label;
          if (spotShot.current) challenge.current++;
          scoredAt.current = elapsed.current;
          sound("score");
        }
      }
      accumulator.current -= 1 / 120;
    }
    if (hoopMesh.current)
      hoopMesh.current.position.x = hoopAt(physicsTime.current).x;
    if (net.current) {
      const pulse = Math.max(0, 1 - (elapsed.current - scoredAt.current) / 0.7);
      net.current.scale.set(
        1 + Math.sin(pulse * Math.PI * 3) * pulse * 0.13,
        1 + pulse * 0.2,
        1,
      );
    }
    if (ball.current) {
      const b = ball.current;
      ballMesh.current?.position.set(b.p.x, b.p.y, b.p.z);
      if (ballMesh.current) {
        ballMesh.current.rotation.x += b.v.z * dt * 2;
        ballMesh.current.rotation.z -= b.v.x * dt * 2;
      }
      if (
        (b.age > 0.6 &&
          b.p.y < 1.35 &&
          b.v.y < 0.8 &&
          Math.hypot(b.p.x - runtime.x, b.p.z - runtime.z) < 1.1) ||
        b.age > 5.5
      ) {
        if (!b.scored) {
          feedback.current = b.age > 5.5 ? "Next ball" : "Rebound";
        } else feedback.current = "";
        ball.current = null;
        holding.current = true;
      }
    } else if (ballMesh.current) {
      const gather = runtime.shooting ? charge.current : 0;
      const offset = runtime.shooting ? 0.3 : 0.48;
      ballMesh.current.position.set(
        runtime.x + Math.cos(heading) * offset,
        runtime.shooting
          ? 1.1 + gather * 0.7
          : 0.4 + Math.abs(Math.sin(elapsed.current * 8)) * 0.65,
        runtime.z - Math.sin(heading) * offset,
      );
    }
    if (ballShadow.current && ballMesh.current) {
      ballShadow.current.position.set(
        ballMesh.current.position.x,
        0.16,
        ballMesh.current.position.z,
      );
      ballShadow.current.scale.setScalar(
        0.7 + Math.min(7, ballMesh.current.position.y) * 0.08,
      );
    }
    if (line.current) {
      line.current.visible =
        options.assist && holding.current && runtime.shooting && !buzzer;
      if (line.current.visible) {
        let b = launchBall(
          runtime.x,
          runtime.z,
          charge.current,
          runtime.aim,
          hoop,
          options.style,
        );
        for (let i = 0; i < predicted.length; i++) {
          const dot = line.current.children[i];
          dot.position.set(b.p.x, b.p.y, b.p.z);
          for (let n = 0; n < 8; n++)
            b = stepBall(
              b,
              1 / 120,
              hoopAt(physicsTime.current + (i * 8 + n) / 120),
            ).ball;
        }
      }
    }
    if (marker.current) {
      const spot = COURT_SPOTS[target()];
      marker.current.position.set(spot.x, 0.17, spot.z);
      marker.current.scale.setScalar(1 + Math.sin(elapsed.current * 3) * 0.035);
    }
    const aspect =
      camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
    const portrait = aspect < 1.2;
    // Keep both ends of the shot in view, rather than aiming at a fixed
    // center while the player walks out of a narrow portrait frustum.
    const focusX = (runtime.x + hoop.x) / 2;
    const focusZ = (runtime.z + hoop.z) / 2;
    const distance = portrait ? Math.max(19, 11 / Math.max(0.25, aspect)) : 14;
    desiredCamera.set(
      focusX + (portrait ? 0 : 4.8),
      portrait ? distance * 0.6 : 7.8,
      focusZ + distance,
    );
    camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 7));
    // Leave headroom for the lob apex beneath the session header.
    camera.lookAt(focusX, portrait ? 1.5 : 4.2, focusZ);
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = portrait ? 72 : size.height < 640 ? 76 : 66;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    if (elapsed.current >= nextHud.current) {
      useBasketHud.setState({
        time: duration ? Math.max(0, duration - elapsed.current) : 0,
        charge: charge.current,
        feedback: feedback.current,
        holding: holding.current && !buzzer,
        challenge: challenge.current,
        target: target(),
      });
      nextHud.current = elapsed.current + 0.05;
    }
    // A shot released before the buzzer is allowed to finish.
    if (
      buzzer &&
      !done.current &&
      (!ball.current || elapsed.current > duration + 5.5)
    ) {
      done.current = true;
      useBasketHud.setState({ finished: true });
      sound("win");
    }
  });
  const threeArc = useMemo(
    () =>
      Array.from({ length: 65 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 64) * Math.PI;
        return [Math.sin(a) * 6.5, 0.15, -5 + Math.cos(a) * 6.5] as [
          number,
          number,
          number,
        ];
      }),
    [],
  );
  return (
    <group>
      {!playing && (
        <mesh
          position={[0, 0.2, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
            runtime.target = [
              THREE.MathUtils.clamp(event.point.x, -6, 6),
              THREE.MathUtils.clamp(event.point.z, -3.8, 7.7),
            ];
          }}
        >
          <planeGeometry args={[12, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      <CourtDeck />
      <CourtSidelines />
      <Box p={[0, 0.125, -3.5]} s={[5, 0.012, 7]} c="#2e655b" sharp />
      <Line
        points={[
          [-6, 0.15, 8],
          [6, 0.15, 8],
          [6, 0.15, -7],
          [-6, 0.15, -7],
          [-6, 0.15, 8],
        ]}
        color="#f7e9c9"
        lineWidth={2}
      />
      <Line
        points={[
          [-2.5, 0.15, -7],
          [-2.5, 0.15, 0],
          [2.5, 0.15, 0],
          [2.5, 0.15, -7],
        ]}
        color="#f7e9c9"
        lineWidth={2}
      />
      <Line points={threeArc} color="#f7e9c9" lineWidth={2} />
      <Ring p={[0, 0.15, 0]} radius={2.5} tube={0.025} c="#f7e9c9" />
      {COURT_SPOTS.map((spot, i) => (
        <Ring
          key={i}
          p={[spot.x, 0.155, spot.z]}
          radius={0.72}
          tube={0.015}
          c="#d7a67d"
        />
      ))}
      <group ref={marker}>
        <Ring radius={0.8} tube={0.055} c="#efca70" />
        <Ring radius={0.95} tube={0.018} c="#f8df9b" />
      </group>
      <group ref={hoopMesh}>
        <HoopHardware />
        <Box p={[0, 0.4, -6.6]} s={[1.6, 0.65, 1.5]} c="#3d6666" />
        <Cylinder p={[0, 2.3, -6.35]} s={[0.16, 4.6, 0.16]} c="#526f6b" />
        <Box p={[0, 4.25, -6.1]} s={[0.2, 0.2, 0.8]} c="#526f6b" />
        <Box
          p={[0, BACKBOARD.y, BACKBOARD.z]}
          s={[BACKBOARD.width, BACKBOARD.height, BACKBOARD.depth]}
          c="#f5e8c9"
        />
        <Box p={[0, 3.85, -5.695]} s={[1.05, 0.7, 0.025]} c="#b75e3e" />
        <Box p={[0, 3.85, -5.676]} s={[0.86, 0.53, 0.02]} c="#f5e8c9" />
        <Box p={[0, 3.05, -5.58]} s={[0.12, 0.12, 0.38]} c="#bd5b31" />
        <Ring p={[0, 3.05, -5]} radius={0.53} tube={0.045} c="#c75e30" />
        <group ref={net} position={[0, 3.04, -5]}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <group key={i}>
                {[-1, 1].map((side) => (
                  <Line
                    key={side}
                    points={[
                      [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5],
                      [
                        Math.sin(a + side * 0.35) * 0.34,
                        -0.69,
                        Math.cos(a + side * 0.35) * 0.34,
                      ],
                    ]}
                    color="#f9e8c5"
                    lineWidth={1}
                  />
                ))}
              </group>
            );
          })}
          <Ring p={[0, -0.36, 0]} radius={0.42} tube={0.012} c="#f9e8c5" />
          <Ring p={[0, -0.69, 0]} radius={0.34} tube={0.015} c="#f9e8c5" />
        </group>
      </group>
      {[-7.3, 7.3].map((x) => (
        <group key={x}>
          <Box p={[x, 0.45, 0]} s={[0.22, 0.6, 18]} c="#678b7c" />
          {Array.from({ length: 10 }, (_, i) => (
            <Cylinder
              key={i}
              p={[x, 1.1, i * 2 - 9]}
              s={[0.06, 2, 0.06]}
              c="#476c62"
            />
          ))}
          <Box p={[x, 2.1, 0]} s={[0.1, 0.1, 18]} c="#476c62" />
        </group>
      ))}
      <Box p={[0, 0.7, -8.7]} s={[14, 1.3, 0.16]} c="#78917b" />
      <group ref={player}>
        <BasketballPlayer color={save.color} hat={save.hat} release={release} />
        <Ring p={[0, 0.155, 0]} radius={0.55} tube={0.025} c="#fae6ae" />
      </group>
      <group ref={aimArrow}>
        <Line
          points={[
            [-0.18, 0, 0.8],
            [0, 0, 1.1],
            [0.18, 0, 0.8],
          ]}
          color="#fae6ae"
          lineWidth={2}
        />
      </group>
      <group ref={ballMesh}>
        <CourtBall />
        <Ring radius={0.231} tube={0.012} c="#65422c" r={[0, 0, 0]} />
        <Ring radius={0.231} tube={0.012} c="#65422c" r={[0, Math.PI / 2, 0]} />
        <Ring radius={0.231} tube={0.012} c="#65422c" />
      </group>
      <mesh ref={ballShadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.25, 20]} />
        <meshBasicMaterial
          color="#503b28"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
      <group ref={line}>
        {predicted.map((_, i) => (
          <Ball key={i} s={[0.04, 0.04, 0.04]} c="#f9dda0" />
        ))}
      </group>
      <Sign text="COURT 01" p={[0, 5.9, -8.45]} size={[3.5, 0.65]} />
      <Tree p={[-10, 0, -7]} variant={1} />
      <Tree p={[10, 0, -7]} />
      <Flowers p={[-8, 0, 7]} />
      <Flowers p={[8, 0, 7]} />
    </group>
  );
}
