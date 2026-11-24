import { useMemo, useRef, type Dispatch, type RefObject } from "react";
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Ball, Box, Cylinder, Ring, Sign } from "../world/Models";
import { CraftedBox, Customer } from "./CraftedDetails";
import { Cabinet } from "./KitchenProps";
import { GAME_STAGE_Y } from "./InteriorGameStage";
import { gameIsActive } from "./InteriorProps";
import {
  cookTarget,
  selectedOrder,
  type PapaAction,
  type PapaGame,
  type Topping,
  type WorkOrder,
} from "./kitchenPapa";

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
  if (ingredient === "sauce")
    return (
      <group>
        {[-0.3, 0, 0.3].map((x) => (
          <Box
            key={x}
            p={[x, 0, 0]}
            s={[0.09, 0.045, 1.0]}
            c="#bd4933"
            r={[0, 0.2, 0]}
          />
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
function Patty({ done = 1 }: { done?: number }) {
  return (
    <group>
      <Cylinder
        s={[0.68, 0.19, 0.67]}
        c={done < 0.35 ? "#b8796c" : done > 1.65 ? "#342d29" : "#805034"}
      />
      {[-0.35, 0, 0.35].map((x) => (
        <Box
          key={x}
          p={[x, 0.105, 0]}
          s={[0.045, 0.018, 0.92]}
          c={done < 0.35 ? "#ad6d60" : "#49352b"}
          r={[0, 0.12, 0]}
        />
      ))}
    </group>
  );
}
function FallingLayer({
  ingredient,
  offset,
  index,
}: {
  ingredient: Topping;
  offset: number;
  index: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current && gameIsActive())
      ref.current.position.y = THREE.MathUtils.damp(
        ref.current.position.y,
        1.92 + index * 0.14,
        11,
        dt,
      );
  });
  return (
    <group ref={ref} position={[8 + offset, 3.1 + index * 0.14, 0.35]}>
      <BurgerIngredient ingredient={ingredient} />
    </group>
  );
}

function GrillingPatty({ order }: { order: WorkOrder }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current && gameIsActive())
      ref.current.rotation.x = THREE.MathUtils.damp(
        ref.current.rotation.x,
        order.flipped ? Math.PI : 0,
        13,
        dt,
      );
  });
  return (
    <group ref={ref}>
      <Patty done={order.sideTime / cookTarget(order.ticket)} />
    </group>
  );
}
export function PapaKitchenScene({
  game,
  dispatch,
  armed,
  aim,
  center,
  dropZone,
}: {
  game: PapaGame;
  dispatch: Dispatch<PapaAction>;
  armed: Topping | null;
  aim: RefObject<number>;
  center: RefObject<{ x: number; y: number }>;
  dropZone: RefObject<HTMLDivElement | null>;
}) {
  const portrait = useThree((s) => s.size.width / s.size.height < 0.85);
  const camera = useRef<THREE.PerspectiveCamera>(null),
    preview = useRef<THREE.Group>(null);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const cameraLook = useMemo(
    () => new THREE.Vector3(-8, GAME_STAGE_Y + 1.5, 0),
    [],
  );
  const target = useMemo(() => {
    const object = new THREE.Object3D();
    object.position.y = GAME_STAGE_Y + 1;
    return object;
  }, []);
  const current = selectedOrder(game);
  const stationX =
    game.phase === "grade" || game.phase === "results"
      ? -8
      : { orders: -8, grill: 0, build: 8 }[game.station];
  useFrame((state, dt) => {
    if (camera.current) {
      const c = camera.current,
        blend = 1 - Math.exp(-8 * Math.min(dt, 0.1));
      const { width, height } = state.size;
      if (height <= 500) {
        const rail = Math.min(320, Math.max(220, width * 0.34), width - 36),
          pan = (rail + 12) / 2;
        const view = c.view;
        if (
          !view?.enabled ||
          view.offsetX !== pan ||
          view.fullWidth !== width ||
          view.fullHeight !== height
        )
          c.setViewOffset(width, height, pan, 0, width, height);
      } else if (c.view?.enabled) c.clearViewOffset();
      c.position.x = THREE.MathUtils.lerp(
        c.position.x,
        stationX + (portrait ? 0 : 1.8),
        blend,
      );
      c.position.y = THREE.MathUtils.lerp(
        c.position.y,
        GAME_STAGE_Y + (portrait ? 7.3 : 6.2),
        blend,
      );
      c.position.z = THREE.MathUtils.lerp(
        c.position.z,
        portrait ? 10.4 : 8.8,
        blend,
      );
      cameraLook.x = THREE.MathUtils.lerp(cameraLook.x, stationX, blend);
      c.lookAt(cameraLook);
      projected
        .set(
          8,
          GAME_STAGE_Y + 1.85 + (current?.layers.length ?? 0) * 0.14,
          0.35,
        )
        .project(c);
      center.current = {
        x: (projected.x * 0.5 + 0.5) * state.size.width,
        y: (-projected.y * 0.5 + 0.5) * state.size.height,
      };
      if (dropZone.current) {
        dropZone.current.style.left = `${center.current.x}px`;
        dropZone.current.style.top = `${center.current.y}px`;
      }
    }
    if (preview.current) {
      preview.current.position.x = 8 + aim.current;
      preview.current.position.y =
        2.8 +
        (current?.layers.length ?? 0) * 0.14 +
        Math.sin(state.clock.elapsedTime * 3) * 0.04;
    }
  });
  const cooking = game.orders.filter((o) => o.onGrill);
  return (
    <>
      <PerspectiveCamera
        ref={camera}
        makeDefault
        position={[-8, GAME_STAGE_Y + 7.3, 10.4]}
        fov={42}
        near={0.1}
        far={75}
      />
      <primitive object={target} />
      <directionalLight
        position={[3, GAME_STAGE_Y + 13, 7]}
        target={target}
        color="#ffe7bc"
        intensity={1.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
      />
      <group position={[0, GAME_STAGE_Y, 0]}>
        <CraftedBox p={[0, -0.27, 0]} s={[23.8, 0.48, 7.8]} c="#4b6356" />
        {[-8, 0, 8].flatMap((x) =>
          Array.from({ length: 30 }, (_, i) => (
            <CraftedBox
              key={`${x}:${i}`}
              p={[
                x + ((i % 6) - 2.5) * 1.05,
                0,
                (Math.floor(i / 6) - 2) * 1.12,
              ]}
              s={[1.02, 0.045, 1.09]}
              c={(i + Math.floor(i / 6)) % 2 ? "#879a82" : "#b9bda0"}
            />
          )),
        )}
        <group position={[-8, 0, 0]}>
          <CraftedBox p={[0, 0.65, 0]} s={[6.3, 1.3, 1.9]} c="#315d50" />
          <CraftedBox p={[0, 1.36, 0]} s={[6.6, 0.2, 2.1]} c="#c39b60" />
          {[-2, 0, 2].map((x) => (
            <CraftedBox
              key={x}
              p={[x, 0.68, 0.98]}
              s={[1.85, 0.9, 0.09]}
              c="#48755d"
            />
          ))}
          {game.queue.map((ticket, i) => (
            <group key={ticket.id} position={[-1.8 + i * 1.8, 0, -2.2]}>
              <group rotation={[0, Math.PI, 0]}>
                <Customer
                  p={[0, 0, 0]}
                  color={["#985747", "#46758b", "#8c8245"][i]}
                  index={i}
                />
              </group>
              <Sign
                text={ticket.name}
                p={[0, 2.65, 0]}
                size={[0.9, 0.32]}
                color="#31564b"
                ink="#efe3b8"
              />
              <Box p={[0, 2.35, 0.2]} s={[0.92, 0.07, 0.08]} c="#4d4d3b" />
              <Box
                p={[(-ticket.waited / 62) * 0.46, 2.35, 0.25]}
                s={[
                  Math.max(0.01, 0.92 * (1 - ticket.waited / 62)),
                  0.045,
                  0.08,
                ]}
                c={ticket.waited > 42 ? "#bb6948" : "#acb96a"}
              />
            </group>
          ))}
          {game.phase === "grade" && game.grade && (
            <group position={[0, 0, -1.9]} rotation={[0, Math.PI, 0]}>
              <Customer p={[0, 0, 0]} color="#b38247" index={0} />
            </group>
          )}
        </group>
        <group>
          <CraftedBox p={[0, 0.67, 0]} s={[5.3, 1.35, 3]} c="#3a5152" />
          <CraftedBox p={[0, 1.4, 0]} s={[5.6, 0.18, 3.2]} c="#b0a889" />
          {Array.from({ length: 17 }, (_, i) => (
            <Box
              key={i}
              p={[(i - 8) * 0.27, 1.52, -0.05]}
              s={[0.055, 0.08, 2.5]}
              c="#34413d"
            />
          ))}
          {[-1.5, -0.5, 0.5, 1.5].map((x) => (
            <Cylinder
              key={x}
              p={[x, 0.85, 1.57]}
              s={[0.12, 0.12, 0.12]}
              c="#c59955"
              r={[Math.PI / 2, 0, 0]}
            />
          ))}
          <CraftedBox p={[0, 3.75, -1.4]} s={[5.7, 0.5, 1.5]} c="#59716b" />
          <CraftedBox p={[0, 3.47, -0.65]} s={[5.75, 0.12, 0.1]} c="#bd9a5b" />
          <CraftedBox p={[0, 4.55, -1.7]} s={[2, 1.2, 1.1]} c="#718078" />
          {cooking.map((order) => (
            <group
              key={order.ticket.id}
              position={[-1 + (order.slot ?? 0) * 2, 1.68, 0]}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "select", id: order.ticket.id });
              }}
            >
              <GrillingPatty order={order} />
              {order.ticket.id === game.selected && (
                <Ring
                  p={[0, -0.08, 0]}
                  radius={0.82}
                  tube={0.028}
                  c="#ddbc6a"
                />
              )}
              <Sign
                text={order.ticket.name}
                p={[0, 0.8, -0.6]}
                size={[1, 0.32]}
                color="#31564b"
                ink="#efe3b8"
              />
            </group>
          ))}
        </group>
        <Cabinet p={[8, 0, 0]} width={5.6} />
        <CraftedBox p={[8, 1.39, 0.35]} s={[2.65, 0.16, 2.3]} c="#a47c47" />
        <Cylinder p={[8, 1.49, 0.35]} s={[1.03, 0.06, 0.95]} c="#d5d1ad" />
        {current?.stage === "build" && (
          <>
            <Cylinder p={[8, 1.62, 0.35]} s={[0.73, 0.19, 0.7]} c="#d7a45b" />
            <group position={[8, 1.77, 0.35]}>
              <Patty />
            </group>
            {current.layers.map((layer, i) => (
              <FallingLayer
                key={`${current.ticket.id}:${i}`}
                ingredient={layer.ingredient}
                offset={layer.offset}
                index={i}
              />
            ))}
            {armed && (
              <group ref={preview} position={[8, 2.8, 0.35]}>
                <BurgerIngredient ingredient={armed} />
              </group>
            )}
          </>
        )}
        {(
          [
            "lettuce",
            "tomato",
            "cheese",
            "onion",
            "pickle",
            "sauce",
          ] as Topping[]
        ).map((ingredient, i) => (
          <group
            key={ingredient}
            position={[5.9 + i * 0.84, 1.49, -0.95]}
            scale={0.42}
          >
            <CraftedBox p={[0, -0.04, 0]} s={[1.65, 0.12, 1.6]} c="#7c8d80" />
            <BurgerIngredient ingredient={ingredient} />
          </group>
        ))}
        {[5.45, 10.55].map((x) => (
          <group key={x}>
            <Cylinder
              p={[x, 1.79, 0.3]}
              s={[0.15, 0.6, 0.15]}
              c={x < 8 ? "#bb4f38" : "#d8ad40"}
            />
            <Cylinder p={[x, 2.12, 0.3]} s={[0.08, 0.12, 0.08]} c="#ddd7b7" />
          </group>
        ))}
      </group>
    </>
  );
}
