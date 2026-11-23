import { useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { create } from "zustand";
import * as THREE from "three";
import {
  Ball,
  Bench,
  Box,
  Character,
  Cylinder,
  Flowers,
  Ring,
  Sign,
  Tree,
} from "../world/Models";
import { runtime, useGame } from "../core/store";
import { keys, movement } from "../core/input";
import { launchBall, stepBall, type BallState } from "../core/basketball";
import { sound } from "../core/sound";
import { newRunId } from "../../shared/run-id";
export const useBasketHud = create<{
  time: number;
  score: number;
  charge: number;
  feedback: string;
  shots: number;
  combo: number;
  holding: boolean;
}>(() => ({
  time: 45,
  score: 0,
  charge: 0,
  feedback: "Hold to shoot. Release at the mark.",
  shots: 0,
  combo: 0,
  holding: true,
}));
export function Basketball() {
  const player = useRef<THREE.Group>(null),
    ballMesh = useRef<THREE.Group>(null);
  const ball = useRef<BallState | null>(null),
    elapsed = useRef(0),
    accumulator = useRef(0),
    charge = useRef(0),
    score = useRef(0),
    shots = useRef(0),
    combo = useRef(0),
    done = useRef(false),
    holding = useRef(true),
    shotDistance = useRef(0),
    id = useRef(newRunId()),
    feedback = useRef("Hold to shoot. Release at the mark."),
    nextHud = useRef(0);
  const save = useGame((s) => s.save);
  const predicted = useMemo(
    () => Array.from({ length: 18 }, () => new THREE.Vector3()),
    [],
  );
  const line = useRef<THREE.Group>(null);
  useFrame(({ camera }, delta) => {
    const g = useGame.getState();
    if (g.paused || g.result || g.panel !== "none" || !runtime.active) return;
    const dt = Math.min(delta, 0.04);
    elapsed.current += dt;
    let [dx, dz] = movement();
    const xx = dx;
    dx = xx * 0.91 + dz * 0.41;
    dz = dz * 0.91 - xx * 0.41;
    runtime.moving = Math.hypot(dx, dz) > 0.1;
    runtime.x = THREE.MathUtils.clamp(runtime.x + dx * dt * 4.2, -6, 6);
    runtime.z = THREE.MathUtils.clamp(runtime.z + dz * dt * 4.2, -2.5, 7.8);
    if (keys.has("q")) runtime.aim = Math.max(-0.7, runtime.aim - dt * 0.6);
    if (keys.has("e")) runtime.aim = Math.min(0.7, runtime.aim + dt * 0.6);
    if (player.current) {
      player.current.position.set(runtime.x, 0, runtime.z);
      player.current.rotation.y = Math.atan2(-runtime.x, -5 - runtime.z);
    }
    if (runtime.shooting && holding.current)
      charge.current = Math.min(1, charge.current + dt * 0.75);
    if (runtime.shoot && holding.current) {
      runtime.shoot = false;
      holding.current = false;
      shotDistance.current = Math.hypot(runtime.x, runtime.z + 5);
      ball.current = launchBall(
        runtime.x,
        runtime.z,
        charge.current,
        runtime.aim,
      );
      charge.current = 0;
      shots.current++;
      feedback.current = "Follow your shot.";
      sound("shot");
    } else runtime.shoot = false;
    accumulator.current += dt;
    while (accumulator.current >= 1 / 120) {
      if (ball.current) {
        const result = stepBall(ball.current, 1 / 120);
        ball.current = result.ball;
        if (result.collision) sound("bounce");
        if (result.score) {
          combo.current++;
          const points = shotDistance.current > 8.4 ? 3 : 2;
          score.current += points;
          feedback.current = `${ball.current.bounced ? "Bank shot" : "Basket"} +${points}${combo.current > 1 ? ` · ${combo.current} in a row` : ""}`;
          sound("score");
        }
      }
      accumulator.current -= 1 / 120;
    }
    if (ball.current && ballMesh.current) {
      ballMesh.current.position.set(
        ball.current.p.x,
        ball.current.p.y,
        ball.current.p.z,
      );
      ballMesh.current.rotation.x += dt * 5;
      ballMesh.current.rotation.z += dt * 2;
      // A nearby rebound can be physically recovered; otherwise a fresh ball arrives after 4s.
      if (
        (ball.current.age > 1.4 &&
          ball.current.p.y < 0.8 &&
          Math.hypot(
            ball.current.p.x - runtime.x,
            ball.current.p.z - runtime.z,
          ) < 1.3) ||
        ball.current.age > 4
      ) {
        if (!ball.current.scored) {
          combo.current = 0;
          feedback.current = "Miss";
        }
        ball.current = null;
        holding.current = true;
      }
    } else if (ballMesh.current)
      ballMesh.current.position.set(
        runtime.x + 0.35,
        1.2 + Math.abs(Math.sin(elapsed.current * 7)) * 0.12,
        runtime.z - 0.25,
      );
    if (line.current) {
      line.current.visible = holding.current && runtime.shooting;
      let b = launchBall(runtime.x, runtime.z, charge.current, runtime.aim);
      for (let i = 0; i < predicted.length; i++) {
        predicted[i].set(b.p.x, b.p.y, b.p.z);
        for (let n = 0; n < 6; n++) b = stepBall(b, 1 / 120).ball;
        const dot = line.current.children[i];
        dot.position.copy(predicted[i]);
      }
    }
    const desired = new THREE.Vector3(
      runtime.x * 0.18 + 7,
      12,
      18 + runtime.z * 0.08,
    );
    camera.position.lerp(desired, 1 - Math.exp(-dt * 3));
    camera.lookAt(0, 1, -0.7);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = window.innerWidth < 700 ? 65 : 51;
      camera.updateProjectionMatrix();
    }
    if (elapsed.current >= nextHud.current) {
      useBasketHud.setState({
        time: Math.max(0, 45 - elapsed.current),
        score: score.current,
        charge: charge.current,
        feedback: feedback.current,
        shots: shots.current,
        combo: combo.current,
        holding: holding.current,
      });
      nextHud.current = elapsed.current + 0.05;
    }
    if (elapsed.current >= 45 && !done.current) {
      done.current = true;
      const coins = Math.min(125, 20 + score.current * 5);
      g.award(id.current, coins, 25, {
        bestBasket: Math.max(g.save.bestBasket, score.current),
      });
      useGame.setState({
        result: {
          game: "basketball",
          title: "Shootaround complete",
          score: `${score.current} PTS`,
          coins,
          detail: `${shots.current} shots · 45 second shootaround · Local, unranked`,
        },
      });
      sound("win");
    }
  });
  return (
    <group>
      <Box p={[0, -0.25, 0]} s={[16, 0.5, 20]} c="#baa484" />
      <Box p={[0, 0.02, 0]} s={[14, 0.08, 17]} c="#b77e5c" />
      <Box p={[0, 0.08, -3.5]} s={[5, 0.03, 7]} c="#718b7c" />
      <Line
        points={[
          [-6, 0.14, 8],
          [6, 0.14, 8],
          [6, 0.14, -7],
          [-6, 0.14, -7],
          [-6, 0.14, 8],
        ]}
        color="#f3dfbc"
        lineWidth={2}
      />
      <Line
        points={[
          [-2.5, 0.15, -7],
          [-2.5, 0.15, 0],
          [2.5, 0.15, 0],
          [2.5, 0.15, -7],
        ]}
        color="#f3dfbc"
        lineWidth={2}
      />
      <Ring p={[0, 0.15, 0]} radius={2.5} tube={0.025} c="#f3dfbc" />
      <Ring p={[0, 0.15, -5]} radius={6.5} tube={0.025} c="#f3dfbc" />
      <Cylinder p={[0, 2.2, -6]} s={[0.13, 4.4, 0.13]} c="#64776b" />
      <Box p={[0, 4.15, -5.8]} s={[2.65, 1.65, 0.17]} c="#f0e1c0" />
      <Box p={[0, 3.85, -5.68]} s={[1.05, 0.7, 0.04]} c="#b97352" />
      <Box p={[0, 3.85, -5.65]} s={[0.86, 0.53, 0.04]} c="#efdbb7" />
      <Box p={[0, 3.05, -5.55]} s={[0.12, 0.12, 1]} c="#ae694b" />
      <Ring p={[0, 3.05, -5]} radius={0.53} tube={0.045} c="#b76b47" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <Line
            key={i}
            points={[
              [Math.sin(a) * 0.5, 3.04, -5 + Math.cos(a) * 0.5],
              [Math.sin(a + 0.3) * 0.35, 2.35, -5 + Math.cos(a + 0.3) * 0.35],
            ]}
            color="#f4e6c8"
            lineWidth={1}
          />
        );
      })}
      <Ring p={[0, 2.4, -5]} radius={0.36} tube={0.018} c="#f0dfc0" />
      {[-7.3, 7.3].map((x) => (
        <group key={x}>
          <Box p={[x, 0.7, 0]} s={[0.14, 1.3, 18]} c="#869a80" />
          {Array.from({ length: 10 }, (_, i) => (
            <Cylinder
              key={i}
              p={[x, 1.4, i * 2 - 9]}
              s={[0.055, 2.8, 0.055]}
              c="#64745f"
            />
          ))}
        </group>
      ))}
      <Box p={[0, 0.7, -8.7]} s={[14, 1.3, 0.16]} c="#84987d" />
      <group ref={player}>
        <Character color={save.color} hat={save.hat} scale={0.85} />
        <Ring p={[0, 0.12, 0]} radius={0.55} tube={0.025} c="#eedba4" />
      </group>
      <group ref={ballMesh}>
        <Ball s={[0.23, 0.23, 0.23]} c="#d98c50" />
        <Ring radius={0.231} tube={0.012} c="#78563c" r={[0, 0, 0]} />
        <Ring radius={0.231} tube={0.012} c="#78563c" r={[0, Math.PI / 2, 0]} />
      </group>
      <group ref={line}>
        {predicted.map((_, i) => (
          <Ball key={i} s={[0.045, 0.045, 0.045]} c="#ead596" />
        ))}
      </group>
      <Sign text="TRICK SHOT PARK" p={[0, 5.8, -8.5]} size={[5, 0.8]} />
      <Bench p={[-9, 0, 1]} rotation={Math.PI / 2} />
      <Bench p={[9, 0, -2]} rotation={-Math.PI / 2} />
      <Tree p={[-10, 0, -7]} variant={1} />
      <Tree p={[10, 0, -7]} />
      <Flowers p={[-8, 0, 7]} />
      <Flowers p={[8, 0, 7]} />
    </group>
  );
}
