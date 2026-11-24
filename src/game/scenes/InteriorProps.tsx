import { useMemo, useRef, useState, type ReactNode } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Box, Ball, Cylinder, Ring } from "../world/Models";
import { useGame } from "../core/store";
import "./interior-games.css";

export type InteriorGameProps = {
  onReward?: (game: "dice" | "cooking", coins: number) => void;
};
export function gameIsActive() {
  const state = useGame.getState();
  return (
    !state.paused &&
    !state.build &&
    state.panel === "none" &&
    state.near !== "exit"
  );
}
export function GameControls({
  children,
  name,
  position = [0, 0.6, 3.5],
  mobileSheet = false,
  dock = "right",
  collapsible,
  gameOpen = false,
}: {
  children: ReactNode;
  name: string;
  position?: [number, number, number];
  mobileSheet?: boolean;
  dock?: "left" | "right";
  collapsible?: string;
  gameOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const focusPending = useRef(false);
  const toggle = (next: boolean) => {
    focusPending.current = true;
    setExpanded(next);
  };
  // Html commits in its own React root. Focus the replacement button when it
  // actually mounts, not in a parent layout effect before that portal commits.
  const focusToggle = (button: HTMLButtonElement | null) => {
    if (button && focusPending.current) {
      button.focus({ preventScroll: true });
      focusPending.current = false;
    }
  };
  const open = !collapsible || expanded;
  const gl = useThree((s) => s.gl);
  // Drei otherwise changes targets when R3F connects its event source on the
  // first frame, tearing down its React root during another root's commit.
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const projected = useMemo(() => new THREE.Vector3(), []);
  const panel = useRef<HTMLElement>(null);
  const hidden = useGame(
    (s) => s.paused || s.panel !== "none" || s.build || s.near === "exit",
  );
  return hidden ? null : (
    <Html
      portal={portal}
      wrapperClass="interior-game-root"
      position={position}
      center
      zIndexRange={[20, 0]}
      calculatePosition={(object, camera, size) => {
        object.getWorldPosition(projected).project(camera);
        const halfWidth =
          (panel.current?.offsetWidth ?? Math.min(320, size.width - 36)) / 2;
        const x = ((projected.x + 1) * size.width) / 2;
        const halfHeight = (panel.current?.offsetHeight ?? 160) / 2;
        const joystick = gl.domElement
          .closest(".game-shell")
          ?.querySelector<HTMLElement>(".joystick")
          ?.getBoundingClientRect();
        const canvas = gl.domElement.getBoundingClientRect();
        if (!open)
          return [size.width - halfWidth - 16, size.height - halfHeight - 52];
        if (mobileSheet && size.width <= 700 && size.height >= 600) {
          const bottom = gameOpen
            ? size.height - 48
            : joystick?.height
              ? joystick.top - canvas.top - 12
              : size.height - 48;
          return [
            size.width / 2,
            Math.max(halfHeight + 76, bottom - halfHeight),
          ];
        }
        // The pong rack is on the right; use the opposite side even on a
        // landscape phone, without occupying its movement joystick.
        if (dock === "left" && size.width >= 700)
          return [
            halfWidth +
              (joystick?.height ? joystick.right - canvas.left + 16 : 24),
            THREE.MathUtils.clamp(
              size.height - halfHeight - (size.height < 600 ? 48 : 96),
              halfHeight + 124,
              size.height - halfHeight - 12,
            ),
          ];
        // Wide screens have room for a side card; keep the customers/table clear.
        if (size.width >= 900)
          return [
            size.width - halfWidth - 24,
            THREE.MathUtils.clamp(
              size.height - halfHeight - (size.height < 600 ? 24 : 96),
              halfHeight + 12,
              size.height - halfHeight - 12,
            ),
          ];
        // Keep a room-anchored panel on screen even with a narrow camera crop.
        return [
          THREE.MathUtils.clamp(x, halfWidth + 12, size.width - halfWidth - 12),
          THREE.MathUtils.clamp(
            ((1 - projected.y) * size.height) / 2,
            halfHeight + 12,
            size.height - halfHeight - 12,
          ),
        ];
      }}
    >
      <section
        ref={panel}
        className={`interior-game${mobileSheet ? " interior-game--sheet" : ""}${dock === "left" ? " interior-game--left" : ""}${collapsible ? " interior-game--house" : ""}${!open ? " interior-game--collapsed" : ""}`}
        aria-label={name}
        data-interior-game-open={open && gameOpen ? "true" : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && collapsible) toggle(false);
        }}
      >
        {open ? (
          <>
            {collapsible && (
              <button
                className="house-game-close"
                ref={focusToggle}
                aria-label={`Close ${collapsible}`}
                onClick={() => toggle(false)}
              >
                ×
              </button>
            )}
            {children}
          </>
        ) : (
          <button ref={focusToggle} onClick={() => toggle(true)}>
            Play {collapsible}
          </button>
        )}
      </section>
    </Html>
  );
}
export function Table({
  p = [0, 0, 0],
  size = [3.5, 1.7],
}: {
  p?: [number, number, number];
  size?: [number, number];
}) {
  return (
    <group position={p}>
      <Box p={[0, 1.12, 0]} s={[size[0], 0.22, size[1]]} c="#673f2b" />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Box
            key={`${x}${z}`}
            p={[x * (size[0] / 2 - 0.3), 0.55, z * (size[1] / 2 - 0.25)]}
            s={[0.23, 1.1, 0.23]}
            c="#51392a"
          />
        )),
      )}
    </group>
  );
}
export function Stool({
  p,
  color = "#a7543d",
}: {
  p: [number, number, number];
  color?: string;
}) {
  return (
    <group position={p}>
      <Cylinder p={[0, 0.68, 0]} s={[0.43, 0.2, 0.43]} c={color} />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Box
            key={`${x}${z}`}
            p={[x * 0.24, 0.3, z * 0.24]}
            s={[0.12, 0.6, 0.12]}
            c="#64432c"
          />
        )),
      )}
      <Ring p={[0, 0.25, 0]} radius={0.3} tube={0.045} c="#a77a3d" />
    </group>
  );
}
export function Bottle({
  p,
  color = "#477b58",
}: {
  p: [number, number, number];
  color?: string;
}) {
  return (
    <group position={p}>
      <Cylinder p={[0, 0.2, 0]} s={[0.12, 0.4, 0.12]} c={color} />
      <Cylinder p={[0, 0.46, 0]} s={[0.055, 0.16, 0.055]} c={color} />
      <Cylinder p={[0, 0.56, 0]} s={[0.06, 0.06, 0.06]} c="#dfbf70" />
      <Box p={[0, 0.23, 0.115]} s={[0.15, 0.15, 0.02]} c="#f1dfaf" />
    </group>
  );
}
export function Barrel({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Cylinder p={[0, 0.65, 0]} s={[0.57, 1.2, 0.57]} c="#9b6735" />
      {[0.19, 1.1].map((y) => (
        <Ring key={y} p={[0, y, 0]} radius={0.575} tube={0.065} c="#454940" />
      ))}
      <Cylinder p={[0, 1.27, 0]} s={[0.51, 0.09, 0.51]} c="#ba864a" />
      {[-0.3, 0, 0.3].map((x) => (
        <Box
          key={x}
          p={[x, 0.66, 0.56 - Math.abs(x) * 0.3]}
          s={[0.025, 0.86, 0.02]}
          c="#774c2b"
        />
      ))}
    </group>
  );
}
export function Shelf({
  p,
  width = 2.5,
}: {
  p: [number, number, number];
  width?: number;
}) {
  return (
    <group position={p}>
      <Box s={[width, 0.16, 0.65]} c="#8a562f" />
      {[-1, 1].map((side) => (
        <Box
          key={side}
          p={[side * (width / 2 - 0.25), -0.25, 0]}
          s={[0.16, 0.5, 0.35]}
          c="#65402d"
        />
      ))}
    </group>
  );
}
export function Fire({
  p,
  large = false,
}: {
  p: [number, number, number];
  large?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current && gameIsActive())
      ref.current.scale.y = 0.9 + Math.sin(clock.elapsedTime * 6) * 0.1;
  });
  return (
    <group position={p} scale={large ? 1 : 0.5}>
      <Box p={[0, 0.08, 0]} s={[0.8, 0.16, 0.2]} c="#4e3226" r={[0, 0.5, 0]} />
      <Box p={[0, 0.08, 0]} s={[0.8, 0.16, 0.2]} c="#4e3226" r={[0, -0.5, 0]} />
      <group ref={ref}>
        {[-0.23, 0, 0.22].map((x, i) => (
          <mesh key={x} position={[x, 0.33 + (i % 2) * 0.16, 0]}>
            <coneGeometry args={[0.19, 0.65, 5]} />
            <meshStandardMaterial
              color="#ffc14c"
              emissive="#eb6927"
              emissiveIntensity={0.65}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
export function Plant({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Cylinder p={[0, 0.25, 0]} s={[0.3, 0.5, 0.3]} c="#b85d3b" />
      <Cylinder p={[0, 0.51, 0]} s={[0.33, 0.12, 0.33]} c="#d68a58" />
      {[-1, 0, 1].map((i) => (
        <Ball
          key={i}
          p={[i * 0.18, 0.8 + (1 - Math.abs(i)) * 0.25, 0]}
          s={[0.25, 0.45, 0.2]}
          c={i === 0 ? "#537943" : "#719b51"}
        />
      ))}
    </group>
  );
}
const PIPS: [number, number][][] = [
  [],
  [[0, 0]],
  [
    [-1, -1],
    [1, 1],
  ],
  [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
];
export function Die({
  p,
  value,
  rolling,
  color = "#f7e9c8",
}: {
  p: [number, number, number];
  value: number;
  rolling: boolean;
  color?: string;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    if (!ref.current || !gameIsActive()) return;
    if (rolling) {
      ref.current.rotation.x += dt * 12;
      ref.current.rotation.z += dt * 9;
      ref.current.position.y =
        p[1] + 0.3 + Math.abs(Math.sin(clock.elapsedTime * 12)) * 0.35;
    } else {
      ref.current.rotation.x = 0;
      ref.current.rotation.z = 0;
      ref.current.position.y = p[1];
    }
  });
  return (
    <group position={p} ref={ref} rotation={[0, 0.2, 0]}>
      <Box s={[0.62, 0.62, 0.62]} c={color} />
      {PIPS[value].map(([x, z], i) => (
        <Cylinder
          key={i}
          p={[x * 0.15, 0.314, z * 0.15]}
          s={[0.045, 0.012, 0.045]}
          c="#453d34"
        />
      ))}
      {PIPS[3].map(([x, y], i) => (
        <Cylinder
          key={`f${i}`}
          p={[x * 0.15, y * 0.15, 0.314]}
          s={[0.045, 0.012, 0.045]}
          r={[Math.PI / 2, 0, 0]}
          c="#453d34"
        />
      ))}
      {PIPS[2].map(([z, y], i) => (
        <Cylinder
          key={`s${i}`}
          p={[0.314, y * 0.15, z * 0.15]}
          s={[0.045, 0.012, 0.045]}
          r={[0, 0, Math.PI / 2]}
          c="#453d34"
        />
      ))}
    </group>
  );
}
