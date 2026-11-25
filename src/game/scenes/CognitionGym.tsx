import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html, OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { create } from "zustand";
import * as THREE from "three";
import { Box, Cylinder, Ball, Bench, Flowers, Ring } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { COGNITION_OFFICE_WALL } from "../core/houseRooms";
import { sound } from "../core/sound";
import {
  GYM_GOAL,
  GYM_PERFECT_RADIUS,
  GYM_REP_MS,
  GYM_TARGET_RADIUS,
  gymMarker,
  gymTarget,
  judgeGymLift,
  readGymBest,
  saveGymBest,
} from "./gymGame";
import {
  CognitionDeskBadge,
  CognitionPlaque,
  CognitionScreen,
} from "./CognitionWordmark";
import { gameIsActive } from "./InteriorProps";
import "./gym-room.css";

type LiftPhase = "ready" | "pressing" | "lowering";

export function gymRepMotion(
  liftedAt: number,
  now = performance.now(),
  judgment = "Perfect",
) {
  const progress = Math.max(0, Math.min(1, (now - liftedAt) / GYM_REP_MS));
  const phase: LiftPhase =
    progress === 1 ? "ready" : progress < 0.5 ? "pressing" : "lowering";
  return {
    progress,
    phase,
    height:
      1.65 +
      (progress < 1 ? Math.sin(progress * Math.PI) * 0.9 : 0) *
        (judgment === "Miss" ? 0.28 : judgment === "Clean" ? 0.78 : 1),
  };
}

export const useGym = create<{
  reps: number;
  liftedAt: number;
  readyAt: number;
  pausedAt: number | null;
  strike: number;
  score: number;
  streak: number;
  judgment: "Perfect" | "Clean" | "Miss" | "";
  points: number;
  best: number;
  newBest: boolean;
  syncClock: () => void;
  startSession: () => boolean;
  cancelSession: () => void;
  lift: () => void;
}>((set, get) => ({
  reps: 0,
  liftedAt: -Infinity,
  readyAt: 0,
  pausedAt: null,
  strike: 0,
  score: 0,
  streak: 0,
  judgment: "",
  points: 0,
  best: readGymBest(),
  newBest: false,
  syncClock() {
    if (useGameMode.getState().active?.id !== "gym") return;
    const now = performance.now();
    const running =
      gameIsActive() &&
      runtime.active &&
      (typeof document === "undefined" ||
        (!document.hidden && document.hasFocus()));
    const { pausedAt, readyAt, liftedAt } = get();
    if (!running) {
      if (pausedAt === null) set({ pausedAt: now });
    } else if (pausedAt !== null) {
      const duration = now - pausedAt;
      set({
        pausedAt: null,
        readyAt: readyAt + duration,
        liftedAt: liftedAt + duration,
      });
    }
  },
  startSession() {
    if (
      !gameIsActive() ||
      Math.hypot(runtime.x, runtime.z + 2) > 6 ||
      !startGameMode("gym")
    )
      return false;
    set({
      reps: 0,
      liftedAt: -Infinity,
      readyAt: performance.now(),
      pausedAt: null,
      strike: 0,
      score: 0,
      streak: 0,
      judgment: "",
      points: 0,
      newBest: false,
    });
    return true;
  },
  cancelSession() {
    set({
      reps: 0,
      liftedAt: -Infinity,
      readyAt: 0,
      pausedAt: null,
      strike: 0,
      score: 0,
      streak: 0,
      judgment: "",
      points: 0,
      newBest: false,
    });
    if (useGameMode.getState().active?.id === "gym") endGameMode();
  },
  lift() {
    get().syncClock();
    if (
      useGameMode.getState().active?.id !== "gym" ||
      useGame.getState().scene !== "gym" ||
      !gameIsActive() ||
      !runtime.active ||
      get().pausedAt !== null ||
      get().reps >= 8
    )
      return;
    const now = performance.now();
    if (now - get().liftedAt < GYM_REP_MS) return;
    const state = get();
    const strike = gymMarker(state.readyAt, now, state.reps);
    const result = judgeGymLift(strike, gymTarget(state.reps), state.streak);
    const reps = state.reps + 1;
    const score = state.score + result.points;
    set({
      reps,
      liftedAt: now,
      readyAt: now + GYM_REP_MS,
      strike,
      score,
      streak: result.streak,
      judgment: result.judgment,
      points: result.points,
    });
    sound(result.judgment === "Miss" ? "bounce" : "score");
    if (reps === 8) {
      const record = saveGymBest(score, state.best);
      set(record);
    }
  },
}));

function currentGymMotion() {
  const { liftedAt, pausedAt, judgment } = useGym.getState();
  return gymRepMotion(liftedAt, pausedAt ?? performance.now(), judgment);
}

function GymCamera() {
  const size = useThree((s) => s.size);
  const landscape = size.height <= 520 && size.width > 700;
  return (
    <OrthographicCamera
      makeDefault
      position={[8, 8, 11]}
      zoom={Math.max(
        6,
        Math.min(
          82,
          (size.width - (landscape ? 320 : 32)) / 8,
          (size.height - (landscape ? 64 : 320)) / 7,
        ),
      )}
      near={0.1}
      far={100}
      onUpdate={(camera) => {
        camera.lookAt(0, 1.4, -2.5);
        camera.setViewOffset(
          size.width,
          size.height,
          landscape ? size.width * 0.16 : 0,
          landscape ? 0 : 40,
          size.width,
          size.height,
        );
        camera.updateProjectionMatrix();
      }}
    />
  );
}

function GymControls() {
  const active = useGameMode((s) => s.active?.id === "gym");
  const reps = useGym((s) => s.reps);
  const score = useGym((s) => s.score),
    best = useGym((s) => s.best),
    streak = useGym((s) => s.streak),
    judgment = useGym((s) => s.judgment),
    points = useGym((s) => s.points),
    newBest = useGym((s) => s.newBest);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const [near, setNear] = useState(false),
    [phase, setPhase] = useState<LiftPhase>("ready"),
    [touch, setTouch] = useState(
      () => window.matchMedia("(pointer: coarse)").matches,
    );
  const recovery = useRef<HTMLSpanElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const ready = phase === "ready";
  const complete = reps === 8 && ready;
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const focusGame = useCallback(
    (node: HTMLElement | null) => {
      if (active) node?.focus({ preventScroll: true });
    },
    [active],
  );
  useEffect(() => {
    const close = () => useGym.getState().cancelSession();
    // Observe the launch key too, without treating that event as a lift.
    const keyboard = () => setTouch(false);
    const sync = () => useGym.getState().syncClock();
    const unsubscribe = useGame.subscribe(sync);
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("interior-game-close", close);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("blur", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      unsubscribe();
      window.removeEventListener("interior-game-close", close);
      close();
    };
  }, []);
  useEffect(() => {
    // Keep the first frame of an accepted rep in sync with the button too.
    return useGym.subscribe((state, previous) => {
      if (state.reps !== previous.reps || state.liftedAt === -Infinity)
        setPhase(Number.isFinite(state.liftedAt) ? "pressing" : "ready");
    });
  }, []);
  useEffect(() => {
    // The room's E shortcut opens Play; that same event must not lift too.
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        useGameMode.getState().active?.id !== "gym" ||
        (e.target as HTMLElement).closest("input,textarea,select,a") ||
        (e.key === " " && (e.target as HTMLElement).closest("button"))
      )
        return;
      if (e.key === " " || e.key.toLowerCase() === "e") {
        e.preventDefault();
        useGym.getState().lift();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active]);
  useFrame(() => {
    useGym.getState().syncClock();
    if (!gameIsActive() || useGym.getState().pausedAt !== null) return;
    if (!active) {
      const nearby = Math.hypot(runtime.x, runtime.z + 2) <= 6;
      if (nearby !== near) setNear(nearby);
    }
    const motion = currentGymMotion();
    if (motion.phase !== phase) setPhase(motion.phase);
    if (recovery.current)
      recovery.current.style.transform = `scaleX(${motion.progress})`;
    if (marker.current) {
      const state = useGym.getState();
      const position =
        motion.phase === "ready" && reps < 8
          ? gymMarker(state.readyAt, performance.now(), reps)
          : state.strike;
      marker.current.style.left = `${position * 100}%`;
    }
  });
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
        className={active ? "gym-game" : "gym-room-card"}
        aria-label="Gym controls"
        tabIndex={-1}
        ref={focusGame}
        onPointerDown={(e) => {
          e.stopPropagation();
          setTouch(e.pointerType === "touch" || e.pointerType === "pen");
        }}
        onKeyDown={(e) => {
          if (e.key === " " && (e.target as HTMLElement).closest("button"))
            e.stopPropagation();
        }}
      >
        {active ? (
          <>
            <header className="gym-game-topbar">
              <div>
                <strong>Bench press</strong>
                <span>8 timed lifts</span>
              </div>
              <button
                className="gym-close"
                onClick={() => useGym.getState().cancelSession()}
              >
                Close
              </button>
            </header>
            <div className="gym-game-bottom">
              <div className="gym-scoreline">
                <span>
                  Score <strong>{score.toLocaleString()}</strong>
                </span>
                <span>
                  {best ? "Best" : "Goal"}{" "}
                  <strong>{(best || GYM_GOAL).toLocaleString()}</strong>
                </span>
                <span className="gym-streak">
                  {streak > 1 ? `${streak} streak` : `${reps}/8`}
                </span>
              </div>
              {!complete && (
                <div
                  className="gym-timing"
                  aria-label="Lift when the white marker reaches the target"
                  role="img"
                >
                  <span
                    className="gym-target"
                    style={{
                      left: `${(gymTarget(ready ? reps : reps - 1) - GYM_TARGET_RADIUS) * 100}%`,
                      width: `${GYM_TARGET_RADIUS * 200}%`,
                    }}
                  >
                    <span className="gym-target-label">Target</span>
                    <i
                      style={{
                        width: `${(GYM_PERFECT_RADIUS / GYM_TARGET_RADIUS) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="gym-timing-marker" ref={marker} />
                </div>
              )}
              <div
                className="gym-reps"
                role="progressbar"
                aria-label="Completed lifts"
                aria-valuemin={0}
                aria-valuemax={8}
                aria-valuenow={reps}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <i key={i} data-done={i < reps} />
                ))}
              </div>
              <p role="status">
                {complete
                  ? newBest ? "New best" : "Set complete"
                  : ready
                    ? "Lift in the target"
                    : `${judgment}${points ? ` +${points}` : ""} · ${phase === "pressing" ? "Pressing…" : "Lowering…"}`}
              </p>
              <button
                className="gym-primary"
                aria-disabled={!ready}
                data-ready={ready}
                onKeyDown={(e) => {
                  // Focus stays here during recovery; native Enter must not repeat.
                  if (e.repeat && (e.key === "Enter" || e.key === " "))
                    e.preventDefault();
                }}
                onClick={() => {
                  if (!ready) return;
                  if (complete) useGym.getState().startSession();
                  else useGym.getState().lift();
                }}
              >
                <span
                  className="gym-recovery"
                  ref={recovery}
                  aria-hidden="true"
                />
                <span className="gym-action-label">
                  {complete ? "Again" : touch ? "Tap to lift" : "Lift"}
                  {!complete && !touch && <kbd>Space / E</kbd>}
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            <strong>Bench press</strong>
            <p>{near ? "8 timed lifts" : "Walk up to the bench."}</p>
            {near && (
              <button
                className="gym-primary"
                onClick={() => useGym.getState().startSession()}
              >
                Play
              </button>
            )}
          </>
        )}
      </section>
    </Html>
  );
}

export function CognitionFurnishings() {
  const wall = COGNITION_OFFICE_WALL;
  return (
    <group>
      <Box
        p={[wall.x, 2, wall.z]}
        s={[wall.width, 3.9, wall.depth]}
        c="#536675"
      />
      <Box
        p={[wall.x, 3.92, wall.z]}
        s={[wall.width + 0.03, 0.16, wall.depth + 0.03]}
        c="#435668"
      />
      <Box
        p={[wall.x, 0.24, wall.z]}
        s={[wall.width + 0.03, 0.36, wall.depth + 0.08]}
        c="#354453"
      />
      {[-1, 1].map((side) => (
        <Box
          key={side}
          p={[wall.x + side * (wall.width / 2 - 0.12), 1.99, wall.z]}
          s={[0.24, 3.87, wall.depth + 0.06]}
          c="#435668"
        />
      ))}
      <CognitionPlaque
        p={[wall.x, 3.05, wall.z + wall.depth / 2 + 0.06]}
        size={[6.35, 1.35]}
      />
      <Box p={[0, 0.08, -1.8]} s={[7.4, 0.08, 5.2]} c="#3c5f56" />
      {[-2.05, 2.05].map((x) => (
        <group key={x} position={[wall.x + x, 0, wall.z + 1.55]}>
          <Box p={[0, 1.25, 0]} s={[3.55, 0.2, 1.65]} c="#b59b6b" />
          {[-1.15, 1.15].map((leg) => (
            <Box key={leg} p={[leg, 0.6, 0]} s={[0.15, 1.2, 1.1]} c="#3c4e48" />
          ))}
          <Box p={[0, 1.39, -0.31]} s={[1.13, 0.1, 0.54]} c="#435668" />
          <Box p={[0, 1.62, -0.36]} s={[0.2, 0.42, 0.16]} c="#435668" />
          <Box p={[0, 2.38, -0.36]} s={[2.65, 1.24, 0.17]} c="#182630" />
          <CognitionScreen p={[0, 2.38, -0.268]} size={[2.39, 0.99]} />
          <Box p={[0, 1.38, 0.38]} s={[1.18, 0.06, 0.36]} c="#435668" />
          <CognitionDeskBadge p={[1.15, 1.35, 0.51]} size={[0.72, 0.2]} />
          <Bench p={[0, 0, 1.1]} />
        </group>
      ))}
      <Box p={[-4.9, 1.6, -0.1]} s={[0.4, 3.2, 4.1]} c="#456a53" />
      {[0.7, 1.5, 2.3].map((y) => (
        <Box key={y} p={[-4.58, y, -0.1]} s={[0.6, 0.1, 3.7]} c="#b79c6c" />
      ))}
      <Flowers p={[-4.4, 2.4, -0.5]} />
      <Flowers p={[4.4, 0, -4.5]} />
      <Ring p={[0, 0.16, -1.8]} radius={1.1} c="#c8b575" />
      <Cylinder p={[3.8, 0.7, 0.9]} s={[0.55, 1.4, 0.55]} c="#aa8e61" />
      <Cylinder p={[3.8, 1.5, 0.9]} s={[0.6, 0.2, 0.6]} c="#c6c8ae" />
    </group>
  );
}

const ARM_UP = new THREE.Vector3(0, 1, 0);

function GymArm({ side }: { side: -1 | 1 }) {
  const upper = useRef<THREE.Group>(null);
  const forearm = useRef<THREE.Group>(null);
  const hand = useRef<THREE.Group>(null);
  const pose = useMemo(
    () => ({
      shoulder: new THREE.Vector3(side * 0.43, 1.12, -2.92),
      grip: new THREE.Vector3(side * 1.05, 1.65, -3),
      elbow: new THREE.Vector3(),
      outward: new THREE.Vector3(),
      direction: new THREE.Vector3(),
    }),
    [side],
  );
  useFrame(() => {
    if (!upper.current || !forearm.current || !hand.current) return;
    const { shoulder, grip, elbow, outward, direction } = pose;
    grip.y = currentGymMotion().height;
    direction.copy(grip).sub(shoulder);
    // Equal-length upper/forearms: elbows bend out, hands stay on the bar.
    const bend = Math.sqrt(Math.max(0, 0.8 ** 2 - direction.lengthSq() / 4));
    outward.set(side * direction.y, -Math.abs(direction.x), 0).normalize();
    elbow.copy(shoulder).lerp(grip, 0.5).addScaledVector(outward, bend);
    const place = (
      part: THREE.Group,
      from: THREE.Vector3,
      to: THREE.Vector3,
    ) => {
      direction.copy(to).sub(from);
      part.position.copy(from).lerp(to, 0.5);
      part.scale.y = direction.length();
      part.quaternion.setFromUnitVectors(ARM_UP, direction.normalize());
    };
    place(upper.current, shoulder, elbow);
    place(forearm.current, elbow, grip);
    hand.current.position.copy(grip);
  });
  return (
    <group>
      <group ref={upper}>
        <Box s={[0.29, 1, 0.29]} c="#c78f69" />
      </group>
      <group ref={forearm}>
        <Box s={[0.25, 1, 0.25]} c="#c78f69" />
      </group>
      <group ref={hand}>
        <Box s={[0.29, 0.24, 0.3]} c="#d7a17a" />
        <Box p={[0, -0.17, 0]} s={[0.27, 0.1, 0.26]} c="#344453" />
      </group>
    </group>
  );
}

function GymLifter() {
  return (
    <group>
      <Box p={[0, 1.03, -2.3]} s={[0.86, 0.38, 1.4]} c="#70869a" />
      <Box p={[0, 1.14, -3.4]} s={[0.62, 0.56, 0.63]} c="#d7a17a" />
      <Box p={[0, 1.22, -3.67]} s={[0.65, 0.54, 0.2]} c="#293731" />
      {[-1, 1].map((side) => (
        <Box
          key={side}
          p={[side * 0.14, 1.43, -3.39]}
          s={[0.06, 0.03, 0.08]}
          c="#293731"
        />
      ))}
      <Box p={[0, 1.43, -3.19]} s={[0.13, 0.025, 0.04]} c="#915b48" />
      <Box p={[0, 1, -1.3]} s={[0.86, 0.36, 0.65]} c="#293e4d" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            p={[side * 0.4, 0.94, -0.72]}
            s={[0.34, 0.34, 0.9]}
            r={[0, side * 0.25, 0]}
            c="#293e4d"
          />
          <Box
            p={[side * 0.58, 0.61, -0.16]}
            s={[0.27, 0.64, 0.27]}
            r={[0.15, 0, side * 0.12]}
            c="#c78f69"
          />
          <Box
            p={[side * 0.62, 0.29, 0.11]}
            s={[0.43, 0.24, 0.65]}
            c="#e4e8eb"
          />
        </group>
      ))}
      <GymArm side={-1} />
      <GymArm side={1} />
    </group>
  );
}

export function GymFurnishings() {
  const active = useGameMode((s) => s.active?.id === "gym");
  const bar = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!bar.current) return;
    bar.current.position.y = currentGymMotion().height;
  });
  return (
    <group>
      {active && <GymCamera />}
      {active && <GymLifter />}
      <GymControls />
      <Box p={[0, 0.1, -2]} s={[5.8, 0.14, 5.3]} c="#354c46" />
      <Box p={[0, 0.7, -2]} s={[1.1, 0.28, 3.6]} c="#a9563e" />
      <Box p={[0, 0.35, -2]} s={[0.7, 0.7, 2.8]} c="#52665c" />
      {[-1.9, 1.9].map((x) => (
        <group key={x}>
          <Box p={[x, 1.15, -3]} s={[0.16, 2.3, 0.18]} c="#91a497" />
          <Box p={[x, 0.2, -3]} s={[0.7, 0.18, 1.5]} c="#91a497" />
        </group>
      ))}
      <group ref={bar} position={[0, 1.65, -3]}>
        <Cylinder s={[0.07, 4.8, 0.07]} r={[0, 0, Math.PI / 2]} c="#c0c7b0" />
        {[-1.9, 1.9].map((x) => (
          <group key={x}>
            <Cylinder
              p={[x, 0, 0]}
              s={[0.6, 0.3, 0.6]}
              r={[0, 0, Math.PI / 2]}
              c="#344438"
            />
            <Cylinder
              p={[x + Math.sign(x) * 0.28, 0, 0]}
              s={[0.45, 0.18, 0.45]}
              r={[0, 0, Math.PI / 2]}
              c="#d9b956"
            />
          </group>
        ))}
      </group>
      <Box p={[0, 2.9, -5.65]} s={[6.6, 2, 0.1]} c="#a6c4b5" />
      <Box p={[0, 2.9, -5.55]} s={[0.08, 2, 0.1]} c="#d7d6b5" />
      {[-4.1, 4.1].map((x) => (
        <group key={x}>
          <Box p={[x, 0.7, -2.6]} s={[1.1, 0.15, 3.2]} c="#80927c" />
          {[-3.6, -2.6, -1.6].map((z) => (
            <group key={z}>
              <Cylinder
                p={[x, 0.95, z]}
                s={[0.07, 0.8, 0.07]}
                r={[0, 0, Math.PI / 2]}
                c="#b3bca3"
              />
              {[-0.4, 0.4].map((side) => (
                <Ball
                  key={side}
                  p={[x + side, 0.95, z]}
                  s={[0.24, 0.26, 0.26]}
                  c="#3d5544"
                />
              ))}
            </group>
          ))}
        </group>
      ))}
      <Ring p={[0, 0.2, -0.3]} radius={1.1} c="#d1b463" />
    </group>
  );
}
