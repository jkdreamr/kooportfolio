import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Ball, Box, Cylinder } from "../world/Models";
import { Walker } from "../world/Hub";
import { runtime, useGame } from "../core/store";
import { sound } from "../core/sound";
import {
  FIELD_GOAL,
  goalClearanceTime,
  judgeKick,
  kickPosition,
  type Kick,
} from "../core/fieldGoal";
import {
  stadiumAimWindow,
  stadiumKick,
  stadiumPowerTarget,
  stadiumRush,
  stadiumTiming,
  stadiumTimingStart,
  STADIUM_KICKS,
  STADIUM_STEER,
} from "../core/stadiumChallenge";
import { GameControls, gameIsActive } from "./InteriorProps";
import { StadiumArchitecture } from "./StadiumArchitecture";
import { StadiumView } from "./StadiumView";
import {
  StadiumGameHud,
  type StadiumOutcome,
  type StadiumPhase,
} from "./StadiumGameHud";
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

const WALKING_SPOT = { x: 0, z: FIELD_GOAL.startZ, wind: 0 };
const TRAIL_DOTS = 7;

type Flight = {
  kick: Kick;
  time: number;
  /** Accumulated lateral steer offset and its velocity. */
  sx: number;
  sv: number;
  postHit: "post" | "crossbar" | null;
  /** Outcome judged the moment the ball crossed the goal plane. */
  judged?: StadiumOutcome;
  blocked: boolean;
  /** [time, sx] samples so the trail can reuse the steered path. */
  samples: [number, number][];
  /** Previous rendered position, for plane-crossing tests between frames. */
  prevX: number;
  prevY: number;
  prevZ: number;
};

/** Complete room-sized outdoor stadium. Mount instead of the generic room shell. */
export function StadiumInterior() {
  const nearExit = useGame((state) => state.near === "exit");
  const playing = useGameMode((state) => state.active?.id === "stadium");
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<StadiumPhase>("power");
  const [results, setResults] = useState<StadiumOutcome[]>([]);
  const [postHit, setPostHit] = useState<"post" | "crossbar" | null>(null);
  const [lockedPower, setLockedPower] = useState(0);
  const ball = useRef<THREE.Group>(null);
  const controls = useRef<THREE.Group>(null);
  const aimMarker = useRef<THREE.Group>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const fxMesh = useRef<THREE.InstancedMesh>(null);
  const defender = useRef<THREE.Group>(null);
  const flag = useRef<THREE.Group>(null);
  const trailDot = useMemo(() => new THREE.Object3D(), []);
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
  const rushBar = useRef<HTMLSpanElement>(null);
  const returnFocus = useRef(false);
  const flight = useRef<Flight | null>(null);
  const rushT = useRef(0);
  const steerDir = useRef(0);
  const flagT = useRef(0);
  const clock = useRef(0);
  const sweepStart = useRef(0);
  const timing = useRef(0);
  const bindCursor = useCallback((element: HTMLSpanElement | null) => {
    cursor.current = element;
    if (element) element.style.left = `${timing.current * 100}%`;
  }, []);
  const bindRush = useCallback((element: HTMLSpanElement | null) => {
    rushBar.current = element;
  }, []);
  const phaseRef = useRef<StadiumPhase>("power");
  const flying = phase === "flight";
  const finished = phase === "result" && attempt === STADIUM_KICKS.length - 1;
  const spot = playing ? STADIUM_KICKS[attempt] : WALKING_SPOT;
  const result = results[attempt] ?? null;
  const powerTarget = useMemo(() => stadiumPowerTarget(spot), [spot]);
  const aimWindow = useMemo(
    () => stadiumAimWindow(spot, lockedPower),
    [spot, lockedPower],
  );

  function showTiming(start: number) {
    clock.current = 0;
    sweepStart.current = timing.current = start;
    if (cursor.current) cursor.current.style.left = `${start * 100}%`;
  }

  function moveTo(next: StadiumPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function celebrate(big = false) {
    fxTime.current = 0;
    if (!fxMesh.current) return;
    fxMesh.current.visible = true;
    fxMesh.current.count = big ? FIREWORK_PARTS : FIREWORK_PARTS / 2;
    const color = new THREE.Color();
    for (let i = 0; i < FIREWORK_PARTS; i++) {
      fxMesh.current.setColorAt(
        i,
        color.set(
          i % 3 === 0 ? "#f8d45c" : i % 3 === 1 ? "#e8f0f2" : "#d0453f",
        ),
      );
    }
    if (fxMesh.current.instanceColor)
      fxMesh.current.instanceColor.needsUpdate = true;
  }

  function reset() {
    setAttempt(0);
    setResults([]);
    setPostHit(null);
    steerDir.current = 0;
    rushT.current = 0;
    if (defender.current) defender.current.rotation.x = 0;
    showTiming(
      stadiumTimingStart(0, [stadiumPowerTarget(STADIUM_KICKS[0]), 1]),
    );
    moveTo("power");
  }

  function nextAttempt() {
    setAttempt(attempt + 1);
    setPostHit(null);
    rushT.current = 0;
    steerDir.current = 0;
    if (defender.current) defender.current.rotation.x = 0;
    showTiming(0);
    moveTo("power");
  }

  function act(sample = timing.current) {
    if (
      !playing ||
      !gameIsActive() ||
      !runtime.active ||
      phaseRef.current !== phase
    )
      return;
    if (phase === "power") {
      setLockedPower(sample);
      showTiming(stadiumTimingStart(attempt, stadiumAimWindow(spot, sample)));
      moveTo("aim");
    } else if (phase === "aim") {
      flight.current = {
        kick: stadiumKick(spot, lockedPower, sample),
        time: 0,
        sx: 0,
        sv: 0,
        postHit: null,
        blocked: false,
        samples: [],
        prevX: spot.x,
        prevY: 0.48,
        prevZ: spot.z,
      };
      sound("kick");
      timing.current = sample;
      if (cursor.current) cursor.current.style.left = `${sample * 100}%`;
      moveTo("flight");
    } else if (phase === "result") {
      if (finished) reset();
      else nextAttempt();
    }
  }

  function play() {
    if (startGameMode("stadium")) reset();
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

  const steer = useCallback((dir: number) => {
    steerDir.current = dir;
  }, []);

  useEffect(() => {
    function dirFor(code: string) {
      return code === "ArrowLeft" || code === "KeyA"
        ? -1
        : code === "ArrowRight" || code === "KeyD"
          ? 1
          : 0;
    }
    function onKey(event: KeyboardEvent) {
      if (!playing || !gameIsActive() || !runtime.active) return;
      // Steering keys work even while a steer button holds focus.
      const dir = dirFor(event.code);
      if (dir && phaseRef.current === "flight") {
        steerDir.current = dir;
        event.preventDefault();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, input, select, textarea, a, [contenteditable]")
      )
        return;
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        act();
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      const dir = dirFor(event.code);
      if (dir && steerDir.current === dir) steerDir.current = 0;
    }
    window.addEventListener("interior-game-close", cancelFlight);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("interior-game-close", cancelFlight);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  function finishKick(
    outcome: StadiumOutcome,
    hit: "post" | "crossbar" | null,
  ) {
    if (outcome === "Good") {
      sound("cheer");
      celebrate(finished && results.every((r) => r === "Good"));
    } else if (hit) sound("clang");
    else if (outcome === "Blocked") sound("whistle");
    else sound("bounce");
    setPostHit(hit);
    setResults((previous) => [...previous, outcome]);
    moveTo("result");
    flight.current = null;
    steerDir.current = 0;
  }

  useFrame((_, delta) => {
    if (aimMarker.current)
      aimMarker.current.visible = playing && phase === "aim";
    if (trail.current) trail.current.visible = playing && flying;
    if (!playing && ball.current) {
      ball.current.position.set(0, 0.48, FIELD_GOAL.startZ);
      ball.current.rotation.set(0, 0, 0);
    }
    // The wind flag waves even while walking around the stadium.
    flagT.current += Math.min(delta, 0.08);
    if (flag.current)
      flag.current.rotation.y =
        (spot.wind || 0.15) * 0.5 +
        Math.sin(flagT.current * 3.2) *
          (0.25 + Math.min(0.5, Math.abs(spot.wind) * 0.3));
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
          trailDot.position.set(
            fxVelocity[i * 3] * t,
            5.4 + fxVelocity[i * 3 + 1] * t - 4.4 * t * t,
            FIELD_GOAL.goalZ - 1 + fxVelocity[i * 3 + 2] * t,
          );
          trailDot.scale.setScalar(Math.max(0.05, fade));
          trailDot.updateMatrix();
          fxMesh.current.setMatrixAt(i, trailDot.matrix);
        }
        fxMesh.current.instanceMatrix.needsUpdate = true;
      }
    }
    if (
      !playing ||
      !gameIsActive() ||
      !runtime.active ||
      phaseRef.current !== phase
    )
      return;
    const dt = Math.min(delta, 0.08);
    // The rush keeps coming through both meter phases — a late kick is blocked.
    const rush = stadiumRush(attempt);
    if (phase === "power" || phase === "aim") {
      rushT.current += dt;
      const gap = Math.max(0, rush.distance - rushT.current * rush.speed);
      if (rushBar.current)
        rushBar.current.style.width = `${(gap / rush.distance) * 100}%`;
      if (defender.current) {
        defender.current.visible = true;
        defender.current.position.set(
          spot.x + Math.sin(rushT.current * 6) * 0.15,
          0.17 + Math.abs(Math.sin(rushT.current * 9)) * 0.09,
          spot.z - gap,
        );
        defender.current.rotation.z = Math.sin(rushT.current * 9) * 0.07;
      }
      if (gap <= 0) {
        // Sacked at the spot: the ball squibs backward.
        flight.current = {
          kick: { power: 0.1, angle: 0, spot },
          time: 0,
          sx: 0,
          sv: 0,
          postHit: null,
          blocked: true,
          samples: [],
          prevX: spot.x,
          prevY: 0.48,
          prevZ: spot.z,
        };
        if (ball.current) ball.current.position.set(spot.x, 0.48, spot.z);
        if (defender.current) {
          defender.current.position.set(spot.x, 0.17, spot.z - 0.2);
          defender.current.rotation.x = -0.9;
        }
        moveTo("flight");
        return;
      }
    } else if (defender.current) {
      // The beaten rusher whiffs past the kicker.
      const z = defender.current.position.z;
      if (z < spot.z + 1.4) defender.current.position.z = z + dt * 2.4;
      defender.current.rotation.z *= 0.9;
    }
    const current = flight.current;
    if (current) {
      const flightDelta = Math.min(delta, 0.16);
      current.time += flightDelta;
      let x: number, y: number, z: number;
      if (current.blocked) {
        // Blocked kick: a short backward pop-up off the defender's hands.
        const t = current.time;
        x = spot.x;
        y = 0.48 + 4.4 * t - 5.2 * t * t;
        z = spot.z + 3.4 * t;
        if (ball.current) ball.current.rotation.x += flightDelta * 9;
      } else {
        // Held steer input bends the flight, fighting (or riding) the wind.
        current.sv += steerDir.current * STADIUM_STEER.accel * flightDelta;
        current.sv *= Math.exp(-STADIUM_STEER.damp * flightDelta);
        current.sv = Math.max(
          -STADIUM_STEER.max,
          Math.min(STADIUM_STEER.max, current.sv),
        );
        current.sx += current.sv * flightDelta;
        current.samples.push([current.time, current.sx]);
        [x, y, z] = kickPosition(current.kick, current.time);
        x += current.sx;
        if (ball.current) ball.current.rotation.x -= flightDelta * 13;
        // Judge the kick at the goal plane so later steering can't change it.
        const prevZ = current.prevZ;
        current.prevZ = z;
        if (current.judged === undefined && z <= FIELD_GOAL.goalZ)
          current.judged = judgeKick({
            ...current.kick,
            spot: { ...spot, x: spot.x + current.sx },
          });
        // Grazing an upright or the crossbar clangs and deflects the steer;
        // test at the plane crossing so fast kicks can't skip between frames.
        if (
          !current.postHit &&
          prevZ > FIELD_GOAL.goalZ &&
          z <= FIELD_GOAL.goalZ
        ) {
          const f = (prevZ - FIELD_GOAL.goalZ) / (prevZ - z);
          const cx = current.prevX + (x - current.prevX) * f;
          const cy = current.prevY + (y - current.prevY) * f;
          const half = FIELD_GOAL.halfWidth;
          const clearance = FIELD_GOAL.ballRadius + FIELD_GOAL.postRadius;
          const nearPost =
            Math.min(Math.abs(cx - half), Math.abs(cx + half)) <
              clearance + 0.05 &&
            cy > FIELD_GOAL.crossbar - 0.2 &&
            cy < FIELD_GOAL.crossbar + 3.2;
          const nearBar =
            Math.abs(cy - FIELD_GOAL.crossbar) < clearance + 0.05 &&
            Math.abs(cx) < half + 0.2;
          if (nearPost || nearBar) {
            current.postHit = nearPost ? "post" : "crossbar";
            current.sv = -current.sv * 0.4;
            sound("clang");
          }
        }
        current.prevX = x;
        current.prevY = y;
      }
      if (ball.current) ball.current.position.set(x, Math.max(0.32, y), z);
      if (trail.current) {
        const count = Math.min(TRAIL_DOTS, Math.floor(current.time / 0.03));
        trail.current.count = count;
        for (let i = 0; i < count; i++) {
          const sampleTime = current.time - (i + 1) * 0.03;
          if (current.blocked) {
            trailDot.position.set(
              spot.x,
              0.48 + 4.4 * sampleTime - 5.2 * sampleTime * sampleTime,
              spot.z + 3.4 * sampleTime,
            );
          } else {
            const [px, py, pz] = kickPosition(current.kick, sampleTime);
            let sx = 0;
            for (let s = current.samples.length - 1; s >= 0; s--)
              if (current.samples[s][0] <= sampleTime) {
                sx = current.samples[s][1];
                break;
              }
            trailDot.position.set(px + sx, py, pz);
          }
          trailDot.scale.setScalar(0.13 - i * 0.013);
          trailDot.updateMatrix();
          trail.current.setMatrixAt(i, trailDot.matrix);
        }
        trail.current.instanceMatrix.needsUpdate = true;
      }
      if (current.blocked ? y < 0.3 : y < 0.28 || z < FIELD_GOAL.goalZ - 1.5) {
        if (current.blocked) finishKick("Blocked", null);
        else
          finishKick(
            current.judged ??
              (current.time < goalClearanceTime(current.kick)
                ? "Short"
                : judgeKick(current.kick)),
            current.postHit,
          );
      }
    } else if (phase === "power" || phase === "aim") {
      clock.current += dt;
      timing.current = stadiumTiming(
        clock.current,
        attempt,
        phase === "aim",
        sweepStart.current,
      );
      if (cursor.current)
        cursor.current.style.left = `${timing.current * 100}%`;
      if (aimMarker.current)
        aimMarker.current.rotation.y = -stadiumKick(
          spot,
          lockedPower,
          timing.current,
        ).angle;
      if (ball.current) {
        ball.current.position.set(spot.x, 0.48, spot.z);
        ball.current.rotation.set(0, 0, 0);
      }
    }
  });

  return (
    <group>
      <StadiumArchitecture
        attempt={playing ? attempt + 1 : 0}
        made={playing && phase === "result" && result === "Good"}
      />
      <group ref={aimMarker} position={[spot.x, 0.2, spot.z]} visible={false}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Cylinder
            key={i}
            p={[0, 0, -0.8 - i * 0.58]}
            s={[0.065, 0.025, 0.065]}
            c="#e5c56d"
          />
        ))}
      </group>
      <Football ballRef={ball} />
      <instancedMesh
        ref={trail}
        args={[undefined, undefined, TRAIL_DOTS]}
        count={0}
        visible={false}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial color="#ffdfa0" />
      </instancedMesh>
      <Fireworks meshRef={fxMesh} />
      <FootballPlayer p={[spot.x - 0.6, 0.17, spot.z + 0.7]} kicking={flying} />
      <FootballPlayer
        p={[spot.x, 0.17, spot.z - 9]}
        jersey="#2b3f63"
        playerRef={defender}
      />
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
      <StadiumView ballRef={ball} playing={playing} controlsRef={controls} />
      <group ref={controls}>
        {!nearExit && !playing && (
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
              onClick={play}
            >
              Play
            </button>
          </GameControls>
        )}
      </group>
      {playing && (
        <StadiumGameHud
          attempt={attempt}
          wind={spot.wind}
          phase={phase}
          finished={finished}
          results={results}
          postHit={postHit}
          lockedPower={lockedPower}
          powerTarget={powerTarget}
          aimWindow={aimWindow}
          cursor={bindCursor}
          rushBar={bindRush}
          readTiming={() => timing.current}
          onAction={act}
          onSteer={steer}
          onClose={close}
        />
      )}
    </group>
  );
}
