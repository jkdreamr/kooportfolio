import { useEffect, useReducer, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Box, Ball, Cylinder, Ring } from "../world/Models";
import {
  cookingReducer,
  newCookingGame,
  SOUP_INGREDIENTS,
  type CookingGame,
  type Ingredient,
} from "../core/interiorGames";
import {
  Barrel,
  Bottle,
  Fire,
  GameControls,
  Plant,
  Shelf,
  Stool,
  Table,
  gameIsActive,
  type InteriorGameProps,
} from "./InteriorProps";

function Produce({
  kind,
  p,
}: {
  kind: Ingredient;
  p: [number, number, number];
}) {
  return (
    <group position={p}>
      {kind === "Tomato" ? (
        <>
          <Ball s={[0.17, 0.15, 0.17]} c="#cd5438" />
          <Box
            p={[0, 0.15, 0]}
            s={[0.13, 0.045, 0.06]}
            c="#477b3d"
            r={[0, 0.6, 0]}
          />
        </>
      ) : kind === "Carrot" ? (
        <>
          <mesh rotation={[0, 0, -0.9]}>
            <coneGeometry args={[0.12, 0.48, 6]} />
            <meshStandardMaterial color="#e69a37" roughness={0.9} />
          </mesh>
          <Box
            p={[0.16, 0.17, 0]}
            s={[0.06, 0.2, 0.06]}
            c="#527b38"
            r={[0, 0, -0.8]}
          />
        </>
      ) : (
        <>
          {[-1, 0, 1].map((i) => (
            <Ball
              key={i}
              p={[i * 0.1, Math.abs(i) * 0.08, 0]}
              s={[0.09, 0.2, 0.07]}
              c={i ? "#5c8c3d" : "#3b6d3d"}
            />
          ))}
        </>
      )}
    </group>
  );
}
function Crate({
  p,
  kind,
  taken,
  onTake,
}: {
  p: [number, number, number];
  kind: Ingredient;
  taken: boolean;
  onTake: () => void;
}) {
  return (
    <group
      position={p}
      onClick={(e) => {
        e.stopPropagation();
        if (gameIsActive()) onTake();
      }}
    >
      <Box p={[0, 0.08, 0]} s={[1.03, 0.15, 0.9]} c="#966632" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box p={[side * 0.52, 0.25, 0]} s={[0.1, 0.5, 0.95]} c="#bb8848" />
          <Box p={[0, 0.2, side * 0.45]} s={[1.08, 0.25, 0.1]} c="#c29452" />
        </group>
      ))}
      {Array.from({ length: taken ? 1 : 6 }, (_, i) => (
        <Produce
          key={i}
          kind={kind}
          p={[
            -0.28 + (i % 3) * 0.28,
            0.29 + Math.floor(i / 3) * 0.11,
            -0.16 + Math.floor(i / 3) * 0.29,
          ]}
        />
      ))}
    </group>
  );
}
function Cabinet({
  p,
  width = 1.5,
}: {
  p: [number, number, number];
  width?: number;
}) {
  return (
    <group position={p}>
      <Box p={[0, 0.58, 0]} s={[width, 1.16, 1.25]} c="#356b65" />
      <Box p={[0, 1.23, 0]} s={[width + 0.06, 0.18, 1.4]} c="#e1cb9d" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            p={[side * width * 0.24, 0.62, 0.64]}
            s={[width * 0.43, 0.9, 0.06]}
            c="#4c8378"
          />
          <Box
            p={[side * width * 0.24, 0.62, 0.68]}
            s={[width * 0.3, 0.64, 0.035]}
            c="#43766c"
          />
          <Cylinder
            p={[side * 0.12, 0.92, 0.71]}
            s={[0.035, 0.16, 0.035]}
            c="#d0aa59"
          />
        </group>
      ))}
    </group>
  );
}
function HangingPan({
  p,
  radius = 0.35,
}: {
  p: [number, number, number];
  radius?: number;
}) {
  return (
    <group position={p} rotation={[0, Math.PI / 2, 0]}>
      <Cylinder
        s={[radius, 0.09, radius]}
        r={[Math.PI / 2, 0, 0]}
        c="#464b42"
      />
      <Cylinder
        p={[0, 0, 0.06]}
        s={[radius * 0.8, 0.03, radius * 0.8]}
        r={[Math.PI / 2, 0, 0]}
        c="#676c5c"
      />
      <Box p={[0, radius + 0.22, 0]} s={[0.09, 0.5, 0.08]} c="#785132" />
      <Ring
        p={[0, radius + 0.49, 0]}
        radius={0.065}
        tube={0.025}
        c="#b49a57"
        r={[0, 0, 0]}
      />
    </group>
  );
}
function Stove({
  stage,
  onFinish,
}: {
  stage: CookingGame["stage"];
  onFinish: () => void;
}) {
  const steam = useRef<THREE.Group>(null);
  const cooking = stage === "cook" || stage === "serve";
  useFrame(({ clock }) => {
    if (!steam.current || !gameIsActive()) return;
    steam.current.children.forEach((child, i) => {
      const t = (clock.elapsedTime * 0.45 + i * 0.33) % 1;
      child.position.y = 2.2 + t * 1.05;
      child.position.x = Math.sin(t * 4 + i) * 0.22;
      child.scale.setScalar(0.07 + t * 0.12);
    });
  });
  return (
    <group position={[2.3, 0, -4.7]}>
      <Box p={[0, 0.65, 0]} s={[2.5, 1.3, 1.6]} c="#a77e51" />
      <Box p={[0, 0.66, 0.84]} s={[1.75, 0.95, 0.09]} c="#3e453d" />
      <Box p={[0, 0.53, 0.91]} s={[1.3, 0.48, 0.05]} c="#252f2c" />
      <Box p={[0, 0.99, 0.97]} s={[1.45, 0.08, 0.09]} c="#c29c51" />
      {[-0.74, 0.74].map((x) => (
        <Cylinder
          key={x}
          p={[x, 1.16, 0.94]}
          s={[0.08, 0.07, 0.08]}
          r={[Math.PI / 2, 0, 0]}
          c="#d1b36c"
        />
      ))}
      <Box p={[0, 1.35, 0]} s={[2.7, 0.16, 1.75]} c="#414b42" />
      {[-0.7, 0.7].map((x) => (
        <Ring key={x} p={[x, 1.45, 0]} radius={0.37} tube={0.06} c="#232d29" />
      ))}
      <group
        position={[-0.65, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (stage === "cook" && gameIsActive()) onFinish();
        }}
      >
        {cooking && <Fire p={[0, 1.45, 0]} />}
        <Cylinder p={[0, 1.82, 0]} s={[0.48, 0.6, 0.48]} c="#b2793a" />
        <Ring p={[0, 2.11, 0]} radius={0.49} tube={0.055} c="#d9b56a" />
        <Cylinder
          p={[0, 2.1, 0]}
          s={[0.43, 0.025, 0.43]}
          c={cooking ? "#d77a35" : "#4e4937"}
        />
        {[-1, 1].map((side) => (
          <Ring
            key={side}
            p={[side * 0.53, 1.95, 0]}
            radius={0.12}
            tube={0.045}
            c="#735030"
            r={[0, 0, 0]}
          />
        ))}
        {cooking && (
          <group ref={steam}>
            {[0, 1, 2].map((i) => (
              <mesh key={i}>
                <sphereGeometry args={[1, 7, 5]} />
                <meshStandardMaterial
                  color="#fff4d8"
                  transparent
                  opacity={0.45}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        )}
      </group>
      <Cylinder p={[0.7, 1.52, 0]} s={[0.35, 0.12, 0.35]} c="#353e37" />
      <Box p={[1.16, 1.52, 0]} s={[0.65, 0.1, 0.14]} c="#714e2d" />
      <Box p={[0, 3.6, -0.15]} s={[2.85, 0.3, 1.85]} c="#9b6240" />
      <mesh position={[0, 4.04, -0.3]}>
        <cylinderGeometry args={[0.55, 1.35, 0.65, 4]} />
        <meshStandardMaterial color="#b47b45" flatShading roughness={0.9} />
      </mesh>
      <Box p={[0, 4.6, -0.35]} s={[0.8, 0.7, 0.7]} c="#9b6240" />
    </group>
  );
}

/** Furnishings/game only. Mount inside the shared 11×13 room shell. */
export function KitchenInterior({ onReward }: InteriorGameProps) {
  const [game, dispatch] = useReducer(
    cookingReducer,
    undefined,
    newCookingGame,
  );
  const heat = useRef(0),
    marker = useRef<HTMLElement>(null),
    rewarded = useRef(false),
    knife = useRef<THREE.Group>(null);
  const finish = () => dispatch({ type: "finish", heat: heat.current });
  useFrame((_, dt) => {
    if (!gameIsActive()) return;
    if (game.stage === "cook") {
      heat.current = Math.min(1, heat.current + Math.min(dt, 0.05) / 7);
      if (marker.current) marker.current.style.left = `${heat.current * 100}%`;
      if (heat.current >= 1) dispatch({ type: "finish", heat: 1 });
    }
    if (knife.current)
      knife.current.rotation.z = THREE.MathUtils.damp(
        knife.current.rotation.z,
        -0.25 - (game.chops % 2) * 0.4,
        10,
        dt,
      );
  });
  useEffect(() => {
    if (game.stage === "done" && !rewarded.current) {
      rewarded.current = true;
      if (game.quality !== "burnt")
        onReward?.("cooking", game.quality === "perfect" ? 12 : 6);
    }
  }, [game.stage, game.quality, onReward]);
  const start = () => {
    heat.current = 0;
    rewarded.current = false;
    dispatch({ type: "start" });
  };
  const chop = () => dispatch({ type: "chop" });
  return (
    <group>
      {/* A ceramic backsplash, not another room shell. */}
      {Array.from({ length: 24 }, (_, i) => (
        <Box
          key={i}
          p={[-4.4 + (i % 12) * 0.79, 1.65 + Math.floor(i / 12) * 0.43, -5.66]}
          s={[0.75, 0.39, 0.035]}
          c={i % 3 === 0 ? "#7d9d8a" : "#e7d6aa"}
        />
      ))}
      <group position={[-2.7, 0, -4.6]}>
        <Cabinet p={[0, 0, 0]} width={4.1} />
        {SOUP_INGREDIENTS.map((kind, i) => (
          <Crate
            key={kind}
            p={[-1.3 + i * 1.3, 1.35, 0]}
            kind={kind}
            taken={game.ingredients.includes(kind)}
            onTake={() => dispatch({ type: "ingredient", ingredient: kind })}
          />
        ))}
        <Shelf p={[0, 3.2, -0.65]} width={4.2} />
        {[-1.5, -1.1, -0.7].map((x) => (
          <Bottle key={x} p={[x, 3.3, -0.65]} color="#8e984e" />
        ))}
        {[-0.1, 0.6, 1.3].map((x, i) => (
          <group key={x}>
            <Cylinder
              p={[x, 3.58, -0.65]}
              s={[0.24, 0.6, 0.24]}
              c={["#d6b877", "#b6804b", "#c4cb9b"][i]}
            />
            <Cylinder p={[x, 3.9, -0.65]} s={[0.26, 0.08, 0.26]} c="#83512e" />
            <Box p={[x, 3.55, -0.4]} s={[0.22, 0.2, 0.025]} c="#f3e3b5" />
          </group>
        ))}
      </group>
      <group position={[-4.4, 0, -1.35]} rotation={[0, Math.PI / 2, 0]}>
        <Cabinet p={[0, 0, 0]} width={3.4} />
        <Box p={[0, 1.35, 0]} s={[1.5, 0.11, 0.9]} c="#577f78" />
        <Box p={[0, 1.4, 0]} s={[1.22, 0.08, 0.68]} c="#a3b9a2" />
        <Ring
          p={[0, 1.65, -0.45]}
          radius={0.24}
          tube={0.045}
          r={[0, 0, 0]}
          c="#b99b53"
        />
        <Box p={[0, 1.62, -0.3]} s={[0.08, 0.12, 0.3]} c="#b99b53" />
        <Box p={[1.15, 1.4, 0]} s={[0.5, 0.08, 0.6]} c="#d3d5b6" />
        <Box p={[1.15, 1.45, 0]} s={[0.36, 0.02, 0.5]} c="#8aa695" />
      </group>
      <Box p={[-5.05, 3.15, -1.25]} s={[0.13, 0.12, 3.6]} c="#674a32" />
      {[-2.5, -1.35, -0.2].map((z, i) => (
        <HangingPan key={z} p={[-4.98, 2.35, z]} radius={0.3 + i * 0.055} />
      ))}
      <Stove stage={game.stage} onFinish={finish} />
      <group position={[0, 0, 0]}>
        <Table size={[3.8, 1.8]} />
        <Box p={[0, 1.27, 0]} s={[3.9, 0.15, 1.95]} c="#dfbb75" />
        {[-1.3, -0.65, 0, 0.65, 1.3].map((x) => (
          <Box key={x} p={[x, 1.355, 0]} s={[0.017, 0.012, 1.83]} c="#b88b47" />
        ))}
        <group
          onClick={(e) => {
            e.stopPropagation();
            if (gameIsActive()) chop();
          }}
        >
          <Box p={[-0.35, 1.4, 0]} s={[1.65, 0.09, 1.15]} c="#a7763e" />
          <Cylinder p={[0.58, 1.4, 0]} s={[0.2, 0.07, 0.2]} c="#a7763e" />
          {game.stage === "chop" &&
            game.ingredients.map((kind, i) => (
              <Produce key={kind} kind={kind} p={[-0.8 + i * 0.45, 1.58, 0]} />
            ))}
          {game.chops > 0 &&
            Array.from({ length: game.chops * 3 }, (_, i) => (
              <Box
                key={i}
                p={[
                  -0.85 + (i % 4) * 0.3,
                  1.52,
                  -0.28 + Math.floor(i / 4) * 0.25,
                ]}
                s={[0.15, 0.13, 0.12]}
                c={["#cd5438", "#e69a37", "#5c8c3d"][i % 3]}
                r={[0, i * 0.7, 0]}
              />
            ))}
          <group ref={knife} position={[-0.9, 1.64, -0.42]}>
            <Box p={[0.28, 0, 0]} s={[0.62, 0.26, 0.035]} c="#d7d8bf" />
            <Box p={[-0.18, 0.04, 0]} s={[0.3, 0.11, 0.1]} c="#513c28" />
          </group>
        </group>
        <Cylinder p={[1.25, 1.51, 0]} s={[0.28, 0.35, 0.28]} c="#d9c38b" />
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            p={[1.12 + i * 0.13, 1.9, 0]}
            s={[0.05, 0.65, 0.05]}
            c="#81603c"
            r={[0, 0, (i - 1) * 0.2]}
          />
        ))}
        <Shelf p={[0, 0.3, 0]} width={3.3} />
        {[-0.9, 0, 0.9].map((x) => (
          <Cylinder
            key={x}
            p={[x, 0.56, 0]}
            s={[0.33, 0.4, 0.33]}
            c="#bd8c4c"
          />
        ))}
      </group>
      <group position={[3.7, 0, 0.8]}>
        <Table size={[1.65, 2.4]} />
        <Box p={[0, 1.26, 0]} s={[1.7, 0.05, 2.45]} c="#c3d1b1" />
        {[-0.65, 0.15, 0.85].map((z, i) => (
          <group key={z}>
            <Cylinder p={[0, 1.32, z]} s={[0.42, 0.05, 0.42]} c="#eee0b9" />
            <Cylinder p={[0, 1.46, z]} s={[0.29, 0.22, 0.29]} c="#dfc98f" />
            <Cylinder
              p={[0, 1.58, z]}
              s={[0.24, 0.015, 0.24]}
              c={
                game.stage === "done" || (game.stage === "serve" && i === 0)
                  ? game.quality === "burnt"
                    ? "#5c4533"
                    : "#d77a35"
                  : "#c6b782"
              }
            />
          </group>
        ))}
        <Stool p={[0, 0, 2]} color="#598074" />
      </group>
      <Barrel p={[-4.25, 0, 2.45]} />
      <Plant p={[4.45, 0, -2.3]} />
      <GameControls name="Cooking game">
        {game.stage === "idle" ? (
          <button onClick={start}>Make soup</button>
        ) : (
          <>
            <h2>Garden soup</h2>
            {game.stage === "gather" && (
              <>
                <div className="interior-ingredients">
                  {SOUP_INGREDIENTS.map((ingredient) => (
                    <button
                      key={ingredient}
                      disabled={game.ingredients.includes(ingredient)}
                      onClick={() =>
                        dispatch({ type: "ingredient", ingredient })
                      }
                    >
                      {game.ingredients.includes(ingredient) ? "✓ " : ""}
                      {ingredient}
                    </button>
                  ))}
                </div>
                <p>Take one of each.</p>
              </>
            )}
            {game.stage === "chop" && (
              <>
                <button onClick={chop}>Chop · {game.chops}/3</button>
                <p>Prep the vegetables.</p>
              </>
            )}
            {game.stage === "cook" && (
              <>
                <div className="interior-heat" aria-label="Cooking timer">
                  <i ref={marker} style={{ left: 0 }} />
                </div>
                <button onClick={finish}>Take off heat</button>
                <p>Stop in the green.</p>
              </>
            )}
            {game.stage === "serve" && (
              <>
                <button onClick={() => dispatch({ type: "serve" })}>
                  {game.quality === "burnt" ? "Clear the pot" : "Serve soup"}
                </button>
                <p>
                  {game.quality === "perfect"
                    ? "Just right."
                    : game.quality === "burnt"
                      ? "Left it on too long."
                      : "Soup’s ready."}
                </p>
              </>
            )}
            {game.stage === "done" && (
              <>
                <button onClick={start}>Cook again</button>
                <p role="status">
                  {game.quality === "burnt"
                    ? "Try a shorter simmer."
                    : game.quality === "perfect"
                      ? "Three bowls. Perfect batch."
                      : "Three bowls served."}
                </p>
              </>
            )}
          </>
        )}
      </GameControls>
    </group>
  );
}
