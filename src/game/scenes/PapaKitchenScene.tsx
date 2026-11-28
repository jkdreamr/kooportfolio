import { useMemo, useRef } from "react";
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Ball, Box, Cylinder, Ring, Sign } from "../world/Models";
import { CraftedBox, Customer } from "./CraftedDetails";
import { Cabinet } from "./KitchenProps";
import { GAME_STAGE_Y } from "./InteriorGameStage";
import { gameIsActive } from "./InteriorProps";
import { grillOrder, PERFECT, plateOrder, type KitchenGame, type Order, type Topping } from "./kitchenRush";

export function BurgerIngredient({ ingredient }: { ingredient: Topping }) {
  if (ingredient === "top")
    return (
      <group>
        <Ball p={[0, 0.12, 0]} s={[0.75, 0.32, 0.72]} c="#d99b43" />
        {Array.from({ length: 11 }, (_, i) => (
          <Ball
            key={i}
            p={[
              Math.sin(i * 2.4) * 0.5,
              0.32 + (i % 2) * 0.02,
              Math.cos(i * 2.4) * 0.45,
            ]}
            s={[0.045, 0.018, 0.075]}
            c="#f3d996"
          />
        ))}
      </group>
    );
  if (ingredient === "lettuce")
    return (
      <group>
        {[-1, 0, 1].map((i) => (
          <Ball
            key={i}
            p={[i * 0.3, Math.abs(i) * 0.035, i * 0.08]}
            s={[0.55, 0.07, 0.68]}
            c={i ? "#6b9b38" : "#85b849"}
          />
        ))}
      </group>
    );
  if (ingredient === "cheese")
    return (
      <group rotation={[0, 0.24, 0]}>
        <Box s={[1.36, 0.055, 1.25]} c="#e9b53f" />
        {[-1, 1].map((i) => (
          <Box
            key={i}
            p={[i * 0.6, -0.06, 0.46]}
            s={[0.18, 0.15, 0.22]}
            c="#e9b53f"
            r={[0, 0, i * 0.3]}
          />
        ))}
      </group>
    );
  if (ingredient === "onion")
    return (
      <group>
        {[-0.27, 0.24].map((x) => (
          <Ring
            key={x}
            p={[x, 0, x * 0.6]}
            radius={0.3}
            tube={0.065}
            c="#c6a0b7"
          />
        ))}
      </group>
    );
  if (ingredient === "pickle")
    return (
      <group>
        {[-0.3, 0.28].map((x) => (
          <group key={x}>
            <Cylinder p={[x, 0, x * 0.3]} s={[0.3, 0.07, 0.3]} c="#709447" />
            <Cylinder
              p={[x, 0.045, x * 0.3]}
              s={[0.21, 0.01, 0.21]}
              c="#a5b96b"
            />
          </group>
        ))}
      </group>
    );
  return (
    <group>
      <Cylinder s={[0.65, 0.11, 0.65]} c="#c94f36" />
      <Cylinder p={[0, 0.065, 0]} s={[0.5, 0.015, 0.5]} c="#e57a52" />
      {Array.from({ length: 6 }, (_, i) => (
        <Ball
          key={i}
          p={[Math.sin(i) * 0.34, 0.08, Math.cos(i) * 0.34]}
          s={[0.055, 0.018, 0.03]}
          c="#eac285"
        />
      ))}
    </group>
  );
}
const GRILL_X = -1.7,
  BOARD_X = 1.7,
  Z = 0.4;
/** Reduced motion, read once (no per-frame media queries). */
const REDUCED = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const still = () => REDUCED;

/** Patty colour by heat: pink, browned, then charcoal. */
function Patty({ heat = 1 }: { heat?: number }) {
  const raw = heat < 0.5,
    burnt = heat > 1.75;
  return (
    <group>
      <Cylinder s={[0.68, 0.19, 0.67]} c={raw ? "#b8796c" : burnt ? "#342d29" : heat < 0.8 ? "#9a6448" : "#805034"} />
      {[-0.35, 0, 0.35].map((x) => (
        <Box key={x} p={[x, 0.105, 0]} s={[0.045, 0.018, 0.92]} c={raw ? "#ad6d60" : "#49352b"} r={[0, 0.12, 0]} />
      ))}
    </group>
  );
}
/** A topping dropping onto the stack (placed at once with reduced motion). */
function FallingLayer({ ingredient, index }: { ingredient: Topping; index: number }) {
  const ref = useRef<THREE.Group>(null);
  const rest = 1.92 + index * 0.14;
  useFrame((_, dt) => {
    if (ref.current && gameIsActive()) ref.current.position.y = THREE.MathUtils.damp(ref.current.position.y, rest, 11, dt);
  });
  return (
    <group ref={ref} position={[BOARD_X, still() ? rest : rest + 1.2, Z]}>
      <BurgerIngredient ingredient={ingredient} />
    </group>
  );
}
function GrillingPatty({ order }: { order: Order }) {
  const ref = useRef<THREE.Group>(null);
  const flipped = order.side === 2;
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g || !gameIsActive()) return;
    g.rotation.x = still() ? (flipped ? Math.PI : 0) : THREE.MathUtils.damp(g.rotation.x, flipped ? Math.PI : 0, 13, dt);
    // A small sizzle shiver while it cooks.
    g.position.y = order.cook === "grill" && !still() ? Math.sin(state.clock.elapsedTime * 40) * 0.008 : 0;
  });
  return (
    <group ref={ref}>
      <Patty heat={order.cook === "raw" ? 0 : order.heat} />
    </group>
  );
}

/**
 * One fixed view of the line: the grill on the left, the board on the right,
 * customers waiting behind the pass. Everything is the room's own crafted
 * parts, so entering the game builds no new shader programs.
 */
export function PapaKitchenScene({ game }: { game: KitchenGame }) {
  const portrait = useThree((s) => s.size.width / s.size.height < 0.85);
  const grill = grillOrder(game),
    plate = plateOrder(game);
  const hot = grill?.cook === "grill" && grill.heat >= PERFECT[0] && grill.heat <= PERFECT[1];
  const look = portrait ? 1.0 : 1.2;
  const target = useMemo(() => {
    const object = new THREE.Object3D();
    object.position.y = GAME_STAGE_Y + 1;
    return object;
  }, []);
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={portrait ? [0, GAME_STAGE_Y + 9.4, 11.2] : [0, GAME_STAGE_Y + 5.6, 6.9]}
        fov={portrait ? 50 : 42}
        near={0.1}
        far={60}
        onUpdate={(camera) => camera.lookAt(0, GAME_STAGE_Y + look, -0.2)}
      />
      <primitive object={target} />
      <directionalLight
        position={[3, GAME_STAGE_Y + 13, 7]}
        target={target}
        color="#ffe7bc"
        intensity={1.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
      />
      <group position={[0, GAME_STAGE_Y, 0]}>
        <CraftedBox p={[0, -0.27, -0.6]} s={[11, 0.48, 9]} c="#4b6356" />
        {Array.from({ length: 48 }, (_, i) => (
          <CraftedBox
            key={i}
            p={[((i % 8) - 3.5) * 1.05, 0, (Math.floor(i / 8) - 3) * 1.12]}
            s={[1.02, 0.045, 1.09]}
            c={(i + Math.floor(i / 8)) % 2 ? "#879a82" : "#b9bda0"}
          />
        ))}
        {/* The pass, with the waiting customers behind it. */}
        <CraftedBox p={[0, 0.55, -2.1]} s={[6.8, 1.1, 0.8]} c="#315d50" />
        <CraftedBox p={[0, 1.15, -2.1]} s={[7, 0.12, 0.95]} c="#c39b60" />
        {game.orders.map((order, i) => {
          const left = Math.max(0, 1 - order.waited / order.patience);
          return (
            <group key={order.id} position={[(i - (game.orders.length - 1) / 2) * 2.4, 0, -3.1]}>
              <group rotation={[0, Math.PI, 0]}>
                <Customer p={[0, 0, 0]} color={["#985747", "#46758b", "#8c8245"][order.id % 3]} index={order.id % 3} />
              </group>
              <Sign text={order.name} p={[0, 2.75, 0]} size={[1, 0.34]} color="#31564b" ink="#efe3b8" />
              <Box p={[0, 2.45, 0.2]} s={[0.96, 0.07, 0.08]} c="#4d4d3b" />
              <Box p={[-(1 - left) * 0.48, 2.45, 0.25]} s={[Math.max(0.01, 0.96 * left), 0.05, 0.08]} c={left < 0.3 ? "#bb6948" : "#acb96a"} />
            </group>
          );
        })}
        {/* Grill */}
        <CraftedBox p={[GRILL_X, 0.67, Z]} s={[2.8, 1.35, 2.4]} c="#3a5152" />
        <CraftedBox p={[GRILL_X, 1.4, Z]} s={[3, 0.18, 2.6]} c="#b0a889" />
        {Array.from({ length: 9 }, (_, i) => (
          <Box key={i} p={[GRILL_X + (i - 4) * 0.27, 1.52, Z]} s={[0.055, 0.08, 2]} c="#34413d" />
        ))}
        {[-0.8, 0, 0.8].map((x) => (
          <Cylinder key={x} p={[GRILL_X + x, 0.85, Z + 1.22]} s={[0.12, 0.12, 0.12]} c={grill?.cook === "grill" ? "#e0a347" : "#c59955"} r={[Math.PI / 2, 0, 0]} />
        ))}
        {grill && (
          <group position={[GRILL_X, 1.68, Z]}>
            <GrillingPatty order={grill} />
            {hot && <Ring p={[0, -0.08, 0]} radius={0.82} tube={0.04} c="#ffd97a" />}
          </group>
        )}
        {/* Board */}
        <Cabinet p={[BOARD_X, 0, Z]} width={2.8} />
        <CraftedBox p={[BOARD_X, 1.39, Z]} s={[2.4, 0.16, 2.2]} c="#a47c47" />
        <Cylinder p={[BOARD_X, 1.49, Z]} s={[1.03, 0.06, 0.95]} c="#d5d1ad" />
        {plate && (
          <>
            <Cylinder p={[BOARD_X, 1.62, Z]} s={[0.73, 0.19, 0.7]} c="#d7a45b" />
            <group position={[BOARD_X, 1.77, Z]}>
              <Patty heat={plate.heat} />
            </group>
            {plate.toppings.slice(0, plate.stacked).map((t, i) => (
              <FallingLayer key={`${plate.id}:${i}`} ingredient={t} index={i} />
            ))}
          </>
        )}
        {(["cheese", "lettuce", "tomato", "onion", "pickle"] as Topping[]).map((t, i) => (
          <group key={t} position={[BOARD_X - 1.0 + i * 0.5, 1.5, Z - 0.85]} scale={0.3}>
            <CraftedBox p={[0, -0.04, 0]} s={[1.5, 0.12, 1.5]} c="#7c8d80" />
            {game.unlocked.includes(t) && <BurgerIngredient ingredient={t} />}
          </group>
        ))}
      </group>
    </>
  );
}
