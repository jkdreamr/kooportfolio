import { StaticBatch } from "../world/StaticBatch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Ball, Box, Cylinder } from "../world/Models";
import { Walker } from "../world/Hub";
import { runtime, useGame } from "../core/store";
import { useLauncher, useLauncherHosted } from "../core/launchers";
import { useJuice } from "./juice/Juice";
import { useSoundLoop } from "./useSoundLoop";
import { FIELD_GOAL, FLIGHT_STEP, fieldZ } from "../core/fieldGoal";
import {
  aimAngle,
  aimAt,
  aimForAngle,
  currentAttempt,
  idealAngle,
  neededPower,
  newDrive,
  perfectTimes,
  powerAt,
  powerZone,
  recordKick,
  resolveAttempt,
  snapClock,
  swingWindow,
  type Attempt,
  type Drive,
  type DriveMode,
} from "../core/stadiumChallenge";
import { registerGameQa } from "../core/gameQa";
import { dayNumber, reportRun } from "../core/daily";
import { sound } from "../core/sound";
import { GameControls, gameIsActive } from "./InteriorProps";
import { StadiumArchitecture } from "./StadiumArchitecture";
import { StadiumView } from "./StadiumView";
import { StadiumGameHud, type StadiumOutcome, type StadiumPhase } from "./StadiumGameHud";
import { startGameMode, endGameMode, useGameMode } from "../core/gameMode";
import "./stadium.css";

export { StadiumBuilding } from "./StadiumArchitecture";

function Football({
  ballRef,
}: {
  ballRef: React.RefObject<THREE.Group | null>;
}) {
  return (
    <group ref={ballRef} position={[0, 0.48, FIELD_GOAL.startZ]}>
      <group rotation={[0, 0, -0.35]}>
        <Ball s={[0.13, 0.24, 0.13]} c="#713b25" />
        <Box p={[0, 0, 0.124]} s={[0.025, 0.22, 0.02]} c="#f3dfb9" />
        {[-0.065, 0, 0.065].map((y) => (
          <Box
            key={y}
            p={[0, y, 0.13]}
            s={[0.11, 0.02, 0.018]}
            c="#f3dfb9"
            sharp
          />
        ))}
      </group>
    </group>
  );
}

function FootballPlayer({
  p,
  kicking = false,
  jersey = "#ac2537",
  playerRef,
}: {
  p: [number, number, number];
  kicking?: boolean;
  jersey?: string;
  playerRef?: React.RefObject<THREE.Group | null>;
}) {
  return (
    <group ref={playerRef} position={p} rotation={[0, Math.PI, 0]}>
      {[-1, 1].map((side) => (
        <group key={side} rotation={[kicking && side === 1 ? -0.6 : 0, 0, 0]}>
          <Box p={[side * 0.15, 0.36, 0]} s={[0.25, 0.57, 0.3]} c="#d5bd83" />
          <Box
            p={[side * 0.15, 0.07, 0.08]}
            s={[0.27, 0.18, 0.45]}
            c="#f3ead2"
          />
        </group>
      ))}
      <Box p={[0, 0.88, 0]} s={[0.8, 0.65, 0.46]} c={jersey} />
      <Box p={[0, 0.78, 0.25]} s={[0.13, 0.35, 0.025]} c="#f4e5c4" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Ball p={[side * 0.4, 1.04, 0]} s={[0.23, 0.23, 0.26]} c={jersey} />
          <Box
            p={[side * 0.46, 0.75, 0.05]}
            s={[0.19, 0.45, 0.22]}
            c="#d59d78"
          />
        </group>
      ))}
      <Ball p={[0, 1.52, 0]} s={[0.35, 0.36, 0.34]} c="#c8a76b" />
      <Box p={[0, 1.67, 0]} s={[0.065, 0.12, 0.62]} c={jersey} />
      <Box p={[0, 1.45, 0.3]} s={[0.43, 0.22, 0.1]} c="#d8a17b" />
      <Box p={[0, 1.39, 0.39]} s={[0.49, 0.045, 0.08]} c="#e0cda6" />
      {[-0.21, 0.21].map((x) => (
        <Box key={x} p={[x, 1.46, 0.36]} s={[0.04, 0.2, 0.06]} c="#e0cda6" />
      ))}
    </group>
  );
}

const FIREWORK_PARTS = 90;
const FIREWORK_LIFE = 1.5;

function Fireworks({
  meshRef,
}: {
  meshRef: React.RefObject<THREE.InstancedMesh | null>;
}) {
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, FIREWORK_PARTS]}
      count={FIREWORK_PARTS}
      visible={false}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.09, 6, 4]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

const WALKING_SPOT = { x: 0, z: FIELD_GOAL.startZ };
const TRAIL_DOTS = 7;

type Flight = {
  path: Float32Array;
  crossT: number;
  time: number;
  result: StadiumOutcome;
  hit: "post" | "crossbar" | null;
  blocked: boolean;
  slowed: boolean;
};

/** Complete room-sized outdoor stadium. Mount instead of the generic room shell. */
export function StadiumInterior() {
  const nearExit = useGame((state) => state.near === "exit");
  const playing = useGameMode((state) => state.active?.id === "stadium");
  const hosted = useLauncherHosted("stadium");
  useLauncher("stadium", "stadium", "Drive", () => play("drive"), { enabled: !playing, hint: "Enter" });
  useLauncher("stadium", "stadium-daily", "Daily", () => play("daily"), { enabled: !playing });
  const drive = useRef<Drive>(newDrive("drive", 1));
  const [attempt, setAttempt] = useState<Attempt>(() => currentAttempt(drive.current));
  const [phase, setPhase] = useState<StadiumPhase>("power");
  const [last, setLast] = useState<{ result: StadiumOutcome; hit: "post" | "crossbar" | null; points: number; overswing: boolean } | null>(null);
  const [summary, setSummary] = useState<null | { score: number; longest: number; made: number; newBest: boolean; mode: DriveMode }>(null);
  const [lockedPower, setLockedPower] = useState(0);
  const fx = useJuice();
  // The crowd murmurs through the session and roars on a made kick.
  const crowd = useSoundLoop(playing ? "crowd" : null);
  const roarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (roarTimer.current) clearTimeout(roarTimer.current);
    },
    [],
  );
  const ball = useRef<THREE.Group>(null);
  const controls = useRef<THREE.Group>(null);
  const aimMarker = useRef<THREE.Group>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const fxMesh = useRef<THREE.InstancedMesh>(null);
  const defender = useRef<THREE.Group>(null);
  const flag = useRef<THREE.Group>(null);
  const trailDot = useMemo(() => new THREE.Object3D(), []);
  const fireworkColor = useMemo(() => new THREE.Color(), []);
  const fxVelocity = useMemo(() => {
    const v = new Float32Array(FIREWORK_PARTS * 3);
    for (let i = 0; i < FIREWORK_PARTS; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 2.2 + Math.random() * 4.6;
      const out = 0.6 + Math.random() * 3.4;
      v[i * 3] = Math.cos(a) * out;
      v[i * 3 + 1] = up;
      v[i * 3 + 2] = Math.sin(a) * out;
    }
    return v;
  }, []);
  const fxTime = useRef(-1);
  const cursor = useRef<HTMLSpanElement>(null);
  const clockBar = useRef<HTMLSpanElement>(null);
  const returnFocus = useRef(false);
  const flight = useRef<Flight | null>(null);
  const flagT = useRef(0);
  /** Seconds since the current bar started (snap, or power lock). */
  const clock = useRef(0);
  const powerT = useRef<number | null>(null);
  const bindCursor = useCallback((element: HTMLSpanElement | null) => {
    cursor.current = element;
  }, []);
  const bindClock = useCallback((element: HTMLSpanElement | null) => {
    clockBar.current = element;
  }, []);
  const phaseRef = useRef<StadiumPhase>("power");
  const flying = phase === "flight";
  const spotZ = playing ? fieldZ(attempt.spot.d) : WALKING_SPOT.z;
  const spotX = playing ? attempt.spot.x : WALKING_SPOT.x;
  const spot = useMemo(() => ({ x: spotX, z: spotZ }), [spotX, spotZ]);
  const pStar = useMemo(() => neededPower(attempt.spot), [attempt]);
  const zone = powerZone(attempt.yards);
  const powerWindow = useMemo(() => [Math.min(1, pStar), Math.min(1, pStar + zone)] as const, [pStar, zone]);
  const aimWindow = useMemo(() => {
    // Aim values whose kick (at the locked power, no over-swing) goes through.
    const p = Math.min(lockedPower, pStar + zone);
    const lo = aimForAngle(idealAngle({ ...attempt.spot, x: attempt.spot.x + 2.4 }, p));
    const hi = aimForAngle(idealAngle({ ...attempt.spot, x: attempt.spot.x - 2.4 }, p));
    return [Math.min(lo, hi), Math.max(lo, hi)] as const;
  }, [attempt, lockedPower, pStar, zone]);
  const barValue = () => (phaseRef.current === "power" ? powerAt(clock.current) : aimAt(clock.current, attempt.rung, attempt.aimStart));

  function moveTo(next: StadiumPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function celebrate(big = false) {
    fxTime.current = 0;
    if (!fxMesh.current) return;
    fxMesh.current.visible = true;
    fxMesh.current.count = big ? FIREWORK_PARTS : FIREWORK_PARTS / 2;
    for (let i = 0; i < FIREWORK_PARTS; i++)
      fxMesh.current.setColorAt(i, fireworkColor.set(i % 3 === 0 ? "#f8d45c" : i % 3 === 1 ? "#e8f0f2" : "#d0453f"));
    if (fxMesh.current.instanceColor) fxMesh.current.instanceColor.needsUpdate = true;
  }

  function snap(next: Attempt) {
    setAttempt(next);
    setLast(null);
    clock.current = 0;
    powerT.current = null;
    sound("whistle", { gain: 0.4 });
    if (next.gameWinner) sound("crowd-hush");
    if (defender.current) defender.current.rotation.x = 0;
    moveTo("power");
  }

  function begin(mode: DriveMode) {
    drive.current = newDrive(mode, mode === "daily" ? dayNumber() : Math.floor(Math.random() * 1e9));
    setSummary(null);
    snap(currentAttempt(drive.current));
  }

  /** A lock on the current bar, `elapsed` s into it (input time, not frame time). */
  function act(elapsed = clock.current) {
    if (!playing || !gameIsActive() || !runtime.active) return;
    const p = phaseRef.current;
    if (p === "power") {
      if (elapsed > snapClock(attempt.rung)) return;
      powerT.current = elapsed;
      const power = powerAt(elapsed);
      setLockedPower(power);
      const inZone = power >= pStar && power <= pStar + zone;
      sound(inZone ? "ui-confirm" : "ui-error");
      if (power > pStar + zone) fx.banner("Over-swing", "miss");
      clock.current = 0;
      moveTo("aim");
    } else if (p === "aim") {
      if (elapsed > swingWindow(attempt.rung)) return;
      kick(resolveAttempt(attempt, powerT.current, elapsed));
    } else if (p === "result") {
      if (drive.current.over) begin(drive.current.mode);
      else snap(currentAttempt(drive.current));
    }
  }

  function kick(res: ReturnType<typeof resolveAttempt>) {
    if (!res.flight) {
      // Blocked at the line: the ball squibs backward off the rusher's hands.
      flight.current = { path: new Float32Array(0), crossT: 0.6, time: 0, result: "Blocked", hit: null, blocked: true, slowed: false };
      if (defender.current) {
        defender.current.position.set(spot.x, 0.17, spot.z - 0.2);
        defender.current.rotation.x = -0.9;
      }
      sound("whistle");
      moveTo("flight");
      return;
    }
    flight.current = { path: res.flight.path, crossT: res.flight.crossT, time: 0, result: res.result as StadiumOutcome, hit: res.flight.hit, blocked: false, slowed: false };
    sound("kick");
    fx.hitStop(80);
    fx.shake(0.3);
    fx.haptic("tap");
    sound("swish", { delay: 0.05 });
    setLast({ result: res.result as StadiumOutcome, hit: res.flight.hit, points: 0, overswing: res.overswing > 0 });
    moveTo("flight");
  }

  function play(mode: DriveMode = "drive") {
    if (startGameMode("stadium")) begin(mode);
  }

  function cancelFlight() {
    if (!playing) return;
    flight.current = null;
    returnFocus.current = true;
  }

  function close() {
    cancelFlight();
    endGameMode();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!playing || !gameIsActive() || !runtime.active) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button, input, select, textarea, a, [contenteditable]")) return;
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        act();
      }
    }
    window.addEventListener("interior-game-close", cancelFlight);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("interior-game-close", cancelFlight);
      window.removeEventListener("keydown", onKey);
    };
  });

  const actRef = useRef(act);
  actRef.current = act;
  const playRef = useRef(play);
  playRef.current = play;
  useEffect(
    () =>
      registerGameQa("stadium", {
        state: () => ({
          phase: phaseRef.current,
          mode: drive.current.mode,
          yards: currentAttempt(drive.current).yards,
          rung: drive.current.rung,
          misses: drive.current.misses,
          score: drive.current.score,
          longest: drive.current.longest,
          over: drive.current.over,
          clock: clock.current,
          history: drive.current.history,
        }),
        act: (name, value) => {
          if (name === "start") playRef.current((value as DriveMode) ?? "drive");
          // "lock" at a time into the current bar (s); default = now.
          else if (name === "lock") actRef.current(typeof value === "number" ? value : undefined);
          else if (name === "perfect") {
            const t = perfectTimes(currentAttempt(drive.current));
            actRef.current(phaseRef.current === "power" ? t.powerT : t.aimT);
          } else if (name === "next") actRef.current();
          else if (name === "land" && flight.current) flight.current.time = 99;
        },
      }),
    [],
  );

  function finishKick(f: Flight) {
    const result = f.result;
    const d = drive.current;
    const points = recordKick(d, attempt, result);
    if (result === "Good") {
      sound(attempt.gameWinner ? "win" : "cheer");
      fx.banner(f.hit ? "Doink… it's good!" : attempt.gameWinner ? "Game-winner!" : "It's good!", "great");
      celebrate(attempt.gameWinner);
      fx.confetti(attempt.gameWinner ? 40 : 18);
      fx.haptic("score");
      if (attempt.gameWinner) fx.slowMo(0.35, 1500);
      crowd.current?.set(1);
      if (roarTimer.current) clearTimeout(roarTimer.current);
      roarTimer.current = setTimeout(() => crowd.current?.set(0), 1500);
    } else {
      if (f.hit) {
        sound("rim");
        fx.shake(0.6);
      }
      sound("miss", { delay: f.hit ? 0.25 : 0 });
      sound("groan", { delay: 0.15 });
      fx.banner(result === "Doink" ? "Doink! No good" : result, "miss");
    }
    setLast({ result, hit: f.hit, points, overswing: !!last?.overswing });
    if (d.over) {
      const g = useGame.getState();
      const yards = d.longest > 0 ? g.recordBest("stadium.yards", d.longest) : null;
      const score = d.mode === "drive" ? g.recordBest("stadium.score", d.score) : g.recordBest("stadium.daily", d.score);
      g.recordBest("stadium.streak", d.bestStreak);
      reportRun("stadium", { mode: d.mode, score: d.score, daily: d.mode === "daily", stats: { longest: d.longest, made: d.made } });
      const newBest = (!!score.improved && d.score > 0) || !!yards?.improved;
      setSummary({ score: d.score, longest: d.longest, made: d.made, newBest, mode: d.mode });
      if (newBest) sound("win", { delay: 0.6 });
    }
    moveTo("result");
    flight.current = null;
  }

  useFrame((_, delta) => {
    if (aimMarker.current) aimMarker.current.visible = playing && phase === "aim";
    if (trail.current) trail.current.visible = playing && flying;
    if (!playing && ball.current) {
      ball.current.position.set(0, 0.48, FIELD_GOAL.startZ);
      ball.current.rotation.set(0, 0, 0);
    }
    // The wind flag waves even while walking around the stadium.
    const wind = playing ? attempt.spot.wind : 0;
    flagT.current += Math.min(delta, 0.08);
    if (flag.current) flag.current.rotation.y = (wind || 0.15) * 0.5 + Math.sin(flagT.current * 3.2) * (0.25 + Math.min(0.5, Math.abs(wind) * 0.3));
    // Fireworks decay on their own clock.
    if (fxTime.current >= 0 && fxMesh.current) {
      fxTime.current += delta;
      const t = fxTime.current;
      if (t > FIREWORK_LIFE) {
        fxTime.current = -1;
        fxMesh.current.visible = false;
      } else {
        const fade = 1 - t / FIREWORK_LIFE;
        for (let i = 0; i < fxMesh.current.count; i++) {
          trailDot.position.set(fxVelocity[i * 3] * t, 5.4 + fxVelocity[i * 3 + 1] * t - 4.4 * t * t, FIELD_GOAL.goalZ - 1 + fxVelocity[i * 3 + 2] * t);
          trailDot.scale.setScalar(Math.max(0.05, fade));
          trailDot.updateMatrix();
          fxMesh.current.setMatrixAt(i, trailDot.matrix);
        }
        fxMesh.current.instanceMatrix.needsUpdate = true;
      }
    }
    if (!playing || !gameIsActive() || !runtime.active) return;
    const dt = fx.clock.scaled(Math.min(delta, 0.08));
    const p = phaseRef.current;
    if (p === "power" || p === "aim") {
      clock.current += dt;
      const limit = p === "power" ? snapClock(attempt.rung) : swingWindow(attempt.rung);
      const left = Number.isFinite(limit) ? Math.max(0, 1 - clock.current / limit) : 1;
      if (clockBar.current) clockBar.current.style.transform = `scaleX(${left.toFixed(3)})`;
      // The rusher closes in as the clock runs (rungs 3+ only).
      if (defender.current) {
        defender.current.visible = Number.isFinite(limit);
        const gap = 1.2 + 7.8 * (p === "power" ? left * 0.5 + 0.5 : left * 0.5);
        defender.current.position.set(spot.x + Math.sin(clock.current * 6) * 0.15, 0.17 + Math.abs(Math.sin(clock.current * 9)) * 0.09, spot.z - gap);
      }
      if (clock.current > limit) {
        kick({ result: "Blocked", flight: null, power: 0, aim: 0, overswing: 0 });
        return;
      }
      const value = barValue();
      if (cursor.current) cursor.current.style.left = `${(value * 100).toFixed(2)}%`;
      if (aimMarker.current && p === "aim") aimMarker.current.rotation.y = -aimAngle(value);
      if (ball.current) {
        ball.current.position.set(spot.x, 0.48, spot.z);
        ball.current.rotation.set(0, 0, 0);
      }
      return;
    }
    const current = flight.current;
    if (!current || p !== "flight") return;
    current.time += Math.min(dt, 0.16);
    let x: number, y: number, z: number;
    if (current.blocked) {
      const t = current.time;
      x = spot.x;
      y = 0.48 + 4.4 * t - 5.2 * t * t;
      z = spot.z + 3.4 * t;
      if (ball.current) ball.current.rotation.x += dt * 9;
      if (y < 0.3 || t > 1.2) {
        finishKick(current);
        return;
      }
    } else {
      const samples = current.path.length / 3;
      const f = current.time / FLIGHT_STEP;
      const i = Math.min(samples - 1, Math.floor(f));
      const j = Math.min(samples - 1, i + 1),
        k = Math.min(1, f - i);
      x = current.path[i * 3] + (current.path[j * 3] - current.path[i * 3]) * k;
      y = current.path[i * 3 + 1] + (current.path[j * 3 + 1] - current.path[i * 3 + 1]) * k;
      const d = current.path[i * 3 + 2] + (current.path[j * 3 + 2] - current.path[i * 3 + 2]) * k;
      z = fieldZ(d);
      if (ball.current) ball.current.rotation.x -= dt * 13;
      // Near the posts the moment slows down until the ball has crossed.
      if (!current.slowed && d < 6 && d > 0) {
        current.slowed = true;
        fx.slowMo(0.5, Math.min(900, ((current.crossT - current.time) / 0.5) * 1000 + 120));
      }
      if (trail.current) {
        const count = Math.min(TRAIL_DOTS, i);
        trail.current.count = count;
        for (let n = 0; n < count; n++) {
          const s = Math.max(0, i - (n + 1) * 2);
          trailDot.position.set(current.path[s * 3], current.path[s * 3 + 1], fieldZ(current.path[s * 3 + 2]));
          trailDot.scale.setScalar(0.13 - n * 0.013);
          trailDot.updateMatrix();
          trail.current.setMatrixAt(n, trailDot.matrix);
        }
        trail.current.instanceMatrix.needsUpdate = true;
      }
      if (i >= samples - 1 || current.time > current.crossT + 0.9) {
        finishKick(current);
        return;
      }
    }
    if (ball.current) ball.current.position.set(x, Math.max(0.32, y), z);
  });

  const made = phase === "result" && last?.result === "Good";
  const board = playing ? `${attempt.yards}-YARD ATTEMPT` : "";
  return (
    <StaticBatch id="StadiumInterior">
      <group>
        <StadiumArchitecture board={board} made={made} />
        <group ref={aimMarker} position={[spot.x, 0.2, spot.z]} visible={false}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Cylinder key={i} p={[0, 0, -0.8 - i * 0.58]} s={[0.065, 0.025, 0.065]} c="#e5c56d" />
          ))}
        </group>
        <Football ballRef={ball} />
        <instancedMesh ref={trail} args={[undefined, undefined, TRAIL_DOTS]} count={0} visible={false} frustumCulled={false}>
          <sphereGeometry args={[1, 6, 4]} />
          <meshBasicMaterial color="#ffdfa0" />
        </instancedMesh>
        <Fireworks meshRef={fxMesh} />
        <FootballPlayer p={[spot.x - 0.6, 0.17, spot.z + 0.7]} kicking={flying} />
        <FootballPlayer p={[spot.x, 0.17, spot.z - 9]} jersey="#2b3f63" playerRef={defender} />
        {/* Sideline flag telegraphs the wind for the next kick. */}
        <group position={[9.8, 0, -4]}>
          <Cylinder p={[0, 1.5, 0]} s={[0.05, 3, 0.05]} c="#8f9aa0" />
          <group ref={flag} position={[0.02, 2.75, 0]}>
            <Box p={[0.45, 0, 0]} s={[0.85, 0.5, 0.04]} c="#c13b48" />
          </group>
        </group>
        <Box p={[spot.x, 0.22, spot.z]} s={[0.25, 0.1, 0.25]} c="#d29433" />
        {[-1, 1].map((side) => (
          <group key={side}>
            <Box p={[side * 10.35, 0.5, 2.3]} s={[0.45, 0.2, 5]} c="#b4a17c" />
            <FootballPlayer p={[side * 7.5, 0.17, -8]} />
          </group>
        ))}
        <Walker interior locked={playing} followCamera={false} />
        <StadiumView ballRef={ball} playing={playing} controlsRef={controls} spot={spot} />
        <group ref={controls}>
          {!nearExit && !playing && !hosted && (
            <GameControls name="49ers field goals" position={[0, 0, 0]}>
              <button
                ref={(button) => {
                  if (button && returnFocus.current) {
                    button.focus({ preventScroll: true });
                    returnFocus.current = false;
                  }
                }}
                className="stadium-play"
                type="button"
                onClick={() => play("drive")}
              >
                Play
              </button>
            </GameControls>
          )}
        </group>
        {playing && (
          <StadiumGameHud
            attempt={attempt}
            drive={drive.current}
            phase={phase}
            last={last}
            summary={summary}
            lockedPower={lockedPower}
            powerWindow={powerWindow}
            aimWindow={aimWindow}
            cursor={bindCursor}
            clockBar={bindClock}
            readElapsed={() => clock.current}
            onAction={act}
            onClose={close}
          />
        )}
      </group>
    </StaticBatch>
  );
}
