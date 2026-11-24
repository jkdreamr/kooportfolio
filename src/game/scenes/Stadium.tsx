import { useCallback, useEffect, useRef, useState } from "react";
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
  kickPower,
  type Kick,
} from "../core/fieldGoal";
import { GameControls, gameIsActive } from "./InteriorProps";
import { StadiumArchitecture } from "./StadiumArchitecture";
import { StadiumView } from "./StadiumView";
import { StadiumGameHud } from "./StadiumGameHud";
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

type Flight = { kick: Kick; time: number; judged: boolean };

/** Complete room-sized outdoor stadium. Mount instead of the generic room shell. */
export function StadiumInterior() {
  const nearExit = useGame((state) => state.near === "exit");
  const playing = useGameMode((state) => state.active?.id === "stadium");
  const [aim, setAim] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [score, setScore] = useState(0);
  const [flying, setFlying] = useState(false);
  const [message, setMessage] = useState("Five kicks. Split the uprights.");
  const ball = useRef<THREE.Group>(null);
  const controls = useRef<THREE.Group>(null);
  const aimMarker = useRef<THREE.Group>(null);
  const meter = useRef<HTMLMeterElement>(null);
  const flight = useRef<Flight | null>(null);
  const clock = useRef(0);
  const power = useRef(kickPower(0));
  const finished = attempt === FIELD_GOAL.attempts && !flying;

  function kick() {
    if (
      !playing ||
      !gameIsActive() ||
      !runtime.active ||
      flight.current ||
      attempt >= FIELD_GOAL.attempts
    )
      return;
    flight.current = {
      kick: { angle: (aim * Math.PI) / 180, power: power.current },
      time: 0,
      judged: false,
    };
    setAttempt((n) => n + 1);
    setFlying(true);
    setMessage("…");
  }

  function reset() {
    if (!gameIsActive() || flight.current) return;
    setAttempt(0);
    setScore(0);
    setAim(0);
    setMessage("Five kicks. Split the uprights.");
    clock.current = 0;
  }

  function play() {
    if (startGameMode("stadium")) reset();
  }

  const cancelFlight = useCallback(() => {
    flight.current = null;
    setFlying(false);
    if (ball.current) {
      ball.current.position.set(0, 0.48, FIELD_GOAL.startZ);
      ball.current.rotation.set(0, 0, 0);
    }
  }, []);

  function close() {
    cancelFlight();
    endGameMode();
  }

  useEffect(() => {
    window.addEventListener("interior-game-close", cancelFlight);
    return () => window.removeEventListener("interior-game-close", cancelFlight);
  }, [cancelFlight]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!playing || useGame.getState().near === "exit") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, input, select, textarea, a, [contenteditable]")
      )
        return;
      if (
        event.code === "Space" &&
        !event.repeat &&
        gameIsActive() &&
        runtime.active
      ) {
        event.preventDefault();
        if (finished) reset();
        else kick();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useFrame((_, delta) => {
    if (aimMarker.current)
      aimMarker.current.visible =
        playing && !flight.current && attempt < FIELD_GOAL.attempts;
    if (!playing || !gameIsActive() || !runtime.active) return;
    const dt = Math.min(delta, 0.04);
    const current = flight.current;
    if (current) {
      current.time += dt;
      const [x, y, z] = kickPosition(current.kick, current.time);
      if (ball.current) {
        ball.current.position.set(x, Math.max(0.32, y), z);
        ball.current.rotation.x -= dt * 13;
      }
      if (!current.judged && current.time >= goalClearanceTime(current.kick)) {
        current.judged = true;
        const result = judgeKick(current.kick);
        if (result === "Good") setScore((n) => n + 1);
        setMessage(result);
      }
      if (y < 0.28 || z < FIELD_GOAL.goalZ - 1.5) {
        // A low kick can land before reaching the goal plane.
        if (!current.judged) setMessage("Short");
        flight.current = null;
        setFlying(false);
      }
    } else {
      if (attempt < FIELD_GOAL.attempts) clock.current += dt;
      power.current = kickPower(clock.current);
      if (meter.current) meter.current.value = power.current;
      if (ball.current) {
        ball.current.position.set(0, 0.48, FIELD_GOAL.startZ);
        ball.current.rotation.set(0, 0, 0);
      }
    }
  });

  return (
    <group>
      <StadiumArchitecture score={score} attempt={attempt} />
      <group
        ref={aimMarker}
        position={[0, 0.2, FIELD_GOAL.startZ]}
        rotation={[0, (-aim * Math.PI) / 180, 0]}
      >
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
      <FootballPlayer
        p={[-0.6, 0.17, FIELD_GOAL.startZ + 0.7]}
        kicking={flying}
      />
      <Box p={[0, 0.22, FIELD_GOAL.startZ]} s={[0.25, 0.1, 0.25]} c="#d29433" />
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
            <button className="stadium-play" type="button" onClick={play}>
              Play
            </button>
          </GameControls>
        )}
      </group>
      {playing && (
        <StadiumGameHud
          aim={aim}
          onAim={setAim}
          score={score}
          attempt={attempt}
          flying={flying}
          finished={finished}
          message={message}
          meter={meter}
          onKick={finished ? reset : kick}
          onClose={close}
        />
      )}
    </group>
  );
}
