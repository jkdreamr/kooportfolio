import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Ball, Box, Cylinder } from "../world/Models";
import { Walker } from "../world/Hub";
import { runtime, useGame } from "../core/store";
import {
  FIELD_GOAL,
  goalClearanceTime,
  judgeKick,
  kickPosition,
  type Kick,
  type KickResult,
} from "../core/fieldGoal";
import {
  loadStadiumBest,
  saveStadiumBest,
  scoreStadiumKick,
  stadiumAimWindow,
  stadiumKick,
  stadiumPowerTarget,
  stadiumTiming,
  stadiumTimingStart,
  STADIUM_KICKS,
} from "../core/stadiumChallenge";
import { GameControls, gameIsActive } from "./InteriorProps";
import { StadiumArchitecture } from "./StadiumArchitecture";
import { StadiumView } from "./StadiumView";
import { StadiumGameHud, type StadiumPhase } from "./StadiumGameHud";
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
}: {
  p: [number, number, number];
  kicking?: boolean;
}) {
  return (
    <group position={p} rotation={[0, Math.PI, 0]}>
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
      <Box p={[0, 0.88, 0]} s={[0.8, 0.65, 0.46]} c="#ac2537" />
      <Box p={[0, 0.78, 0.25]} s={[0.13, 0.35, 0.025]} c="#f4e5c4" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Ball p={[side * 0.4, 1.04, 0]} s={[0.23, 0.23, 0.26]} c="#b72c3b" />
          <Box
            p={[side * 0.46, 0.75, 0.05]}
            s={[0.19, 0.45, 0.22]}
            c="#d59d78"
          />
        </group>
      ))}
      <Ball p={[0, 1.52, 0]} s={[0.35, 0.36, 0.34]} c="#c8a76b" />
      <Box p={[0, 1.67, 0]} s={[0.065, 0.12, 0.62]} c="#b82b38" />
      <Box p={[0, 1.45, 0.3]} s={[0.43, 0.22, 0.1]} c="#d8a17b" />
      <Box p={[0, 1.39, 0.39]} s={[0.49, 0.045, 0.08]} c="#e0cda6" />
      {[-0.21, 0.21].map((x) => (
        <Box key={x} p={[x, 1.46, 0.36]} s={[0.04, 0.2, 0.06]} c="#e0cda6" />
      ))}
    </group>
  );
}

type Flight = { kick: Kick; time: number };
const EMPTY_SCORE = { points: 0, streak: 0 };
const WALKING_SPOT = { x: 0, z: FIELD_GOAL.startZ, wind: 0 };
const TRAIL_DOTS = 7;

/** Complete room-sized outdoor stadium. Mount instead of the generic room shell. */
export function StadiumInterior() {
  const nearExit = useGame((state) => state.near === "exit");
  const playing = useGameMode((state) => state.active?.id === "stadium");
  const [attempt, setAttempt] = useState(0);
  const [score, setScore] = useState(EMPTY_SCORE);
  const [best, setBest] = useState(loadStadiumBest);
  const [phase, setPhase] = useState<StadiumPhase>("power");
  const [results, setResults] = useState<KickResult[]>([]);
  const [lockedPower, setLockedPower] = useState(0);
  const ball = useRef<THREE.Group>(null);
  const controls = useRef<THREE.Group>(null);
  const aimMarker = useRef<THREE.Group>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const trailDot = useMemo(() => new THREE.Object3D(), []);
  const cursor = useRef<HTMLSpanElement>(null);
  const returnFocus = useRef(false);
  const flight = useRef<Flight | null>(null);
  const clock = useRef(0);
  const sweepStart = useRef(0);
  const timing = useRef(0);
  const bindCursor = useCallback((element: HTMLSpanElement | null) => {
    cursor.current = element;
    if (element) element.style.left = `${timing.current * 100}%`;
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

  function reset() {
    setAttempt(0);
    setScore(EMPTY_SCORE);
    setResults([]);
    showTiming(
      stadiumTimingStart(0, [stadiumPowerTarget(STADIUM_KICKS[0]), 1]),
    );
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
      };
      timing.current = sample;
      if (cursor.current) cursor.current.style.left = `${sample * 100}%`;
      moveTo("flight");
    } else if (phase === "result") {
      if (finished) reset();
      else {
        setAttempt(attempt + 1);
        showTiming(0);
        moveTo("power");
      }
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, input, select, textarea, a, [contenteditable]")
      )
        return;
      if (
        playing &&
        event.code === "Space" &&
        !event.repeat &&
        gameIsActive() &&
        runtime.active
      ) {
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

  useFrame((_, delta) => {
    if (aimMarker.current)
      aimMarker.current.visible = playing && phase === "aim";
    if (trail.current) trail.current.visible = playing && flying;
    if (!playing && ball.current) {
      ball.current.position.set(0, 0.48, FIELD_GOAL.startZ);
      ball.current.rotation.set(0, 0, 0);
    }
    if (
      !playing ||
      !gameIsActive() ||
      !runtime.active ||
      phaseRef.current !== phase
    )
      return;
    const dt = Math.min(delta, 0.08);
    const current = flight.current;
    if (current) {
      const flightDelta = Math.min(delta, 0.16);
      current.time += flightDelta;
      const [x, y, z] = kickPosition(current.kick, current.time);
      if (ball.current) {
        ball.current.position.set(x, Math.max(0.32, y), z);
        ball.current.rotation.x -= flightDelta * 13;
      }
      if (trail.current) {
        const count = Math.min(TRAIL_DOTS, Math.floor(current.time / 0.03));
        trail.current.count = count;
        for (let i = 0; i < count; i++) {
          trailDot.position.set(
            ...kickPosition(current.kick, current.time - (i + 1) * 0.03),
          );
          trailDot.scale.setScalar(0.13 - i * 0.013);
          trailDot.updateMatrix();
          trail.current.setMatrixAt(i, trailDot.matrix);
        }
        trail.current.instanceMatrix.needsUpdate = true;
      }
      if (y < 0.28 || z < FIELD_GOAL.goalZ - 1.5) {
        const outcome =
          current.time < goalClearanceTime(current.kick)
            ? "Short"
            : judgeKick(current.kick);
        const next = scoreStadiumKick(score, outcome);
        setScore(next);
        if (next.points > best) {
          setBest(next.points);
          saveStadiumBest(next.points);
        }
        setResults((previous) => [...previous, outcome]);
        moveTo("result");
        flight.current = null;
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
        score={score.points}
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
      <FootballPlayer p={[spot.x - 0.6, 0.17, spot.z + 0.7]} kicking={flying} />
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
          score={score}
          best={best}
          attempt={attempt}
          wind={spot.wind}
          phase={phase}
          finished={finished}
          results={results}
          lockedPower={lockedPower}
          powerTarget={powerTarget}
          aimWindow={aimWindow}
          cursor={bindCursor}
          readTiming={() => timing.current}
          onAction={act}
          onClose={close}
        />
      )}
    </group>
  );
}
