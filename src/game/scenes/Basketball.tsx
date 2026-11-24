import { useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { create } from "zustand";
import * as THREE from "three";
import { Ball, Cylinder, Flowers, Ring, Sign, Tree } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { keys, movement } from "../core/input";
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
import { sound } from "../core/sound";
import { newRunId } from "../../shared/run-id";
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
}>(() => ({ mode: "warmup", style: "arc", assist: true }));
export const useBasketHud = create<{
  time: number;
  score: number;
  charge: number;
  feedback: string;
  shots: number;
  combo: number;
  holding: boolean;
  challenge: number;
  target: number;
  made: number;
}>(() => ({
  time: 30,
  score: 0,
  charge: 0,
  feedback: "",
  shots: 0,
  combo: 0,
  holding: true,
  challenge: 0,
  target: 0,
  made: 0,
}));

export function CourtControls() {
  const { mode, style, assist } = useBasketOptions();
  const { challenge, target } = useBasketHud();
  return (
    <div
      className="basketball-controls"
      data-mode={mode}
      onClick={(event) => {
        // Pointer-selected controls must give Space back to shooting. Keep
        // keyboard-activated controls focused for native Tab/Space navigation.
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
          useBasketOptions.setState({ mode: event.target.value as BasketMode });
          useGame.getState().go("basketball");
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
              useBasketOptions.setState({ mode: m });
              useGame.getState().go("basketball");
            }}
          >
            {MODES[m].label}
          </button>
        ))}
      </nav>
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
        {COURT_SPOTS[target].label} <b>+3</b>
      </p>
      {mode === "daily" && <small>UTC · local, unranked</small>}
    </div>
  );
}

export function Basketball() {
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
    score = useRef(0),
    shots = useRef(0),
    made = useRef(0),
    combo = useRef(0),
    done = useRef(false),
    holding = useRef(true),
    shotDistance = useRef(0),
    spotShot = useRef(false),
    challenge = useRef(0),
    seed = useRef(dailyCourtSeed()),
    id = useRef(newRunId()),
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
  useFrame(({ camera }, delta) => {
    const g = useGame.getState();
    if (g.paused || g.result || g.panel !== "none" || !runtime.active) return;
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
      (inputX * 0.914 + inputZ * 0.406) * speed,
      14,
      dt,
    );
    velocity.current.z = THREE.MathUtils.damp(
      velocity.current.z,
      (inputZ * 0.914 - inputX * 0.406) * speed,
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
      shots.current++;
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
          combo.current++;
          made.current++;
          const value = shotValue(ball.current, shotDistance.current),
            bonus = spotShot.current ? 3 : 0,
            streak = Math.min(3, Math.max(0, combo.current - 1));
          const points = value.points + bonus + streak;
          score.current += points;
          feedback.current = `${value.label} +${value.points}${bonus ? " · Spot +3" : ""}${streak ? ` · Streak +${streak}` : ""}`;
          if (bonus) challenge.current++;
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
          combo.current = 0;
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
    desiredCamera.set(runtime.x * 0.13 + 7, 12.5, 18 + runtime.z * 0.06);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 3));
    camera.lookAt(0, 1.2, -0.8);
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = window.innerWidth < 700 ? 65 : 51;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    if (elapsed.current >= nextHud.current) {
      useBasketHud.setState({
        time: duration ? Math.max(0, duration - elapsed.current) : 0,
        score: score.current,
        charge: charge.current,
        feedback: feedback.current,
        shots: shots.current,
        combo: combo.current,
        holding: holding.current && !buzzer,
        challenge: challenge.current,
        target: target(),
        made: made.current,
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
      const coins = Math.min(
        125,
        10 + score.current * 3 + challenge.current * 4,
      );
      g.award(id.current, coins, 25, {
        bestBasket: Math.max(g.save.bestBasket, score.current),
      });
      useGame.setState({
        result: {
          game: "basketball",
          title: "Time",
          score: `${score.current} PTS`,
          coins,
          detail: `${made.current}/${shots.current} made · ${challenge.current} spots · Local, unranked`,
        },
      });
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
