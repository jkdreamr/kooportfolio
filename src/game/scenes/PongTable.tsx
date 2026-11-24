import { useReducer, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { newPong, PONG_CUPS, pongDepth, pongReducer } from "../core/pong";
import { Ball, Cylinder, Ring } from "../world/Models";
import { CraftedBox } from "./CraftedDetails";
import { GameControls, gameIsActive } from "./InteriorProps";

export function PongTable({
  active,
  onSelect,
  navigation,
}: {
  active: boolean;
  onSelect: () => void;
  navigation: ReactNode;
}) {
  const [game, dispatch] = useReducer(pongReducer, undefined, newPong);
  const ball = useRef<THREE.Group>(null),
    target = useRef<THREE.Group>(null),
    meter = useRef<HTMLElement>(null);
  const power = useRef(0.5),
    clock = useRef(0),
    flight = useRef(0);
  useFrame((_, dt) => {
    if (!gameIsActive() || !active) return;
    if (game.phase === "ready") {
      clock.current += dt;
      power.current = (Math.sin(clock.current * 1.55) + 1) / 2;
      if (meter.current) meter.current.style.left = `${power.current * 100}%`;
      if (target.current)
        target.current.position.set(game.aim, 1.42, pongDepth(power.current));
      if (ball.current) ball.current.position.set(0, 1.8, 2.25);
    }
    if (game.phase === "flying") {
      flight.current = Math.min(1, flight.current + dt / 0.9);
      const t = flight.current;
      if (ball.current)
        ball.current.position.set(
          game.landing.x * t,
          1.8 - 0.15 * t + Math.sin(t * Math.PI) * 2.6,
          2.25 + (game.landing.z - 2.25) * t,
        );
      if (t === 1) dispatch({ type: "settle" });
    }
  });
  return (
    <>
      <group
        position={[6, 0, 6]}
        onClick={(event) => {
          event.stopPropagation();
          if (gameIsActive()) onSelect();
        }}
      >
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <CraftedBox
              key={`${x}/${z}`}
              p={[x * 1.12, 0.65, z * 2.22]}
              s={[0.34, 1.3, 0.34]}
              c="#4d3428"
            />
          )),
        )}
        <CraftedBox p={[0, 1.17, 0]} s={[3.15, 0.4, 5.9]} c="#6f422c" />
        <CraftedBox p={[0, 1.4, 0]} s={[2.8, 0.08, 5.55]} c="#446c56" />
        <CraftedBox p={[0, 1.45, 0]} s={[0.025, 0.02, 5.4]} c="#dfc27d" />
        <CraftedBox p={[0, 1.45, 0]} s={[2.7, 0.02, 0.035]} c="#dfc27d" />
        {PONG_CUPS.map(
          (cup, i) =>
            game.cups.includes(i) && (
              <group key={i} position={[cup.x, 1.63, cup.z]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.205, 0.135, 0.38, 12, 1, true]} />
                  <meshStandardMaterial
                    color="#a94334"
                    roughness={0.45}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                <Cylinder
                  p={[0, -0.17, 0]}
                  s={[0.135, 0.035, 0.135]}
                  c="#a94334"
                />
                <Ring
                  p={[0, 0.19, 0]}
                  radius={0.205}
                  tube={0.026}
                  c="#eee1b9"
                />
                <Cylinder
                  p={[0, 0.08, 0]}
                  s={[0.175, 0.01, 0.175]}
                  c="#ad853f"
                />
              </group>
            ),
        )}
        {[-0.45, 0, 0.45].map((x) => (
          <group key={x} position={[x, 1.63, 1.8]}>
            <Cylinder s={[0.18, 0.38, 0.18]} c="#ddd4ad" />
            <Ring p={[0, 0.19, 0]} radius={0.18} tube={0.025} c="#f5e5b6" />
          </group>
        ))}
        <group ref={target} visible={active && game.phase === "ready"}>
          <Ring radius={0.24} tube={0.035} c="#f5c557" />
        </group>
        <group ref={ball} visible={active && game.phase !== "over"}>
          <Ball s={[0.13, 0.13, 0.13]} c="#f6e8bd" />
        </group>
      </group>
      {active && (
        <GameControls
          name="Cup pong game"
          position={[7.5, 0.6, 5]}
          mobileSheet
          dock="left"
        >
          {navigation}
          <div className="pong-score">
            <b>{6 - game.cups.length}/6 cups</b>
            <span>{game.shots}/10 throws</span>
          </div>
          {game.phase !== "over" ? (
            <>
              <input
                className="pong-aim"
                type="range"
                aria-label="Aim"
                min={-1.2}
                max={1.2}
                step={0.04}
                value={game.aim}
                disabled={game.phase !== "ready"}
                onChange={(event) =>
                  dispatch({ type: "aim", x: Number(event.target.value) })
                }
              />
              <div className="pong-power" aria-label="Throw depth">
                <i ref={meter} />
              </div>
              <button
                disabled={game.phase !== "ready"}
                onClick={() => {
                  flight.current = 0;
                  dispatch({ type: "throw", power: power.current });
                }}
              >
                Throw
              </button>
            </>
          ) : (
            <button onClick={() => dispatch({ type: "reset" })}>
              New rack
            </button>
          )}
          <p role="status">{game.message || "Aim the ring at a cup."}</p>
        </GameControls>
      )}
    </>
  );
}
