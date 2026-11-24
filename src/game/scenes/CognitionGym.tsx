import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html, OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { create } from "zustand";
import * as THREE from "three";
import { Box, Cylinder, Ball, Bench, Flowers, Ring, Sign } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { roomFor } from "../core/room";
import { gameIsActive } from "./InteriorProps";
import "./gym-room.css";

export const useGym = create<{
  reps: number;
  liftedAt: number;
  earned: number;
  startSession: () => boolean;
  cancelSession: () => void;
  lift: () => void;
}>((set, get) => ({
  reps: 0,
  liftedAt: -Infinity,
  earned: 0,
  startSession() {
    if (
      !gameIsActive() ||
      Math.hypot(runtime.x, runtime.z + 2) > 6 ||
      !startGameMode("gym")
    )
      return false;
    set({ reps: 0, liftedAt: -Infinity, earned: 0 });
    return true;
  },
  cancelSession() {
    set({ reps: 0, liftedAt: -Infinity, earned: 0 });
    if (useGameMode.getState().active?.id === "gym") endGameMode();
  },
  lift() {
    if (
      useGameMode.getState().active?.id !== "gym" ||
      useGame.getState().scene !== "gym" ||
      !gameIsActive() ||
      !runtime.active ||
      get().reps >= 8
    )
      return;
    const now = performance.now();
    if (now - get().liftedAt < 900) return;
    const reps = get().reps + 1;
    set({ reps, liftedAt: now });
    if (reps === 8) {
      const id = `gym-${new Date().toISOString().slice(0, 10)}`;
      const earned = useGame.getState().save.rewards.includes(id) ? 0 : 15;
      set({ earned });
      useGame.getState().award(id, 15, 10);
    }
  },
}));

function GymCamera() {
  const size = useThree((s) => s.size);
  return (
    <OrthographicCamera
      makeDefault
      position={[8, 8, 11]}
      zoom={Math.max(
        6,
        Math.min(82, (size.width - 32) / 9, (size.height - 200) / 7),
      )}
      near={0.1}
      far={100}
      onUpdate={(camera) => {
        camera.lookAt(0, 1.4, -2.5);
        camera.updateProjectionMatrix();
      }}
    />
  );
}

function GymControls() {
  const active = useGameMode((s) => s.active?.id === "gym");
  const reps = useGym((s) => s.reps),
    earned = useGym((s) => s.earned);
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.build);
  const [near, setNear] = useState(false),
    [ready, setReady] = useState(true);
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const focusGame = useCallback(
    (node: HTMLElement | null) => {
      if (active) node?.focus({ preventScroll: true });
    },
    [active],
  );
  useEffect(() => {
    const close = () => useGym.getState().cancelSession();
    window.addEventListener("interior-game-close", close);
    return () => {
      window.removeEventListener("interior-game-close", close);
      close();
    };
  }, []);
  useEffect(() => {
    // The room's E shortcut opens Play; that same event must not lift too.
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        useGameMode.getState().active?.id !== "gym" ||
        (e.target as HTMLElement).closest("input,textarea,select,a") ||
        (e.key === " " && (e.target as HTMLElement).closest("button"))
      )
        return;
      if (e.key === " " || e.key.toLowerCase() === "e") {
        e.preventDefault();
        useGym.getState().lift();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active]);
  useFrame(() => {
    if (!gameIsActive()) return;
    if (!active) {
      const nearby = Math.hypot(runtime.x, runtime.z + 2) <= 6;
      if (nearby !== near) setNear(nearby);
    }
    const recovered = performance.now() - useGym.getState().liftedAt >= 900;
    if (recovered !== ready) setReady(recovered);
  });
  if (hidden) return null;
  return (
    <Html
      fullscreen
      portal={portal}
      zIndexRange={active ? [70, 70] : [25, 25]}
      style={{ pointerEvents: "none" }}
      calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
    >
      <section
        key={active ? "game" : "room"}
        className={active ? "gym-game" : "gym-room-card"}
        aria-label="Gym controls"
        tabIndex={-1}
        ref={focusGame}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === " " && (e.target as HTMLElement).closest("button"))
            e.stopPropagation();
        }}
      >
        {active ? (
          <>
            <header className="gym-game-topbar">
              <div>
                <strong>Bench press</strong>
                <span>8 reps</span>
              </div>
              <button
                className="gym-close"
                onClick={() => useGym.getState().cancelSession()}
              >
                Close
              </button>
            </header>
            <div className="gym-game-bottom">
              <div
                className="gym-reps"
                role="progressbar"
                aria-label="Completed reps"
                aria-valuemin={0}
                aria-valuemax={8}
                aria-valuenow={reps}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <i key={i} data-done={i < reps} />
                ))}
              </div>
              <p role="status">
                {reps === 8
                  ? `Set complete${earned ? ` · +${earned} coins` : " · Daily reward claimed"}`
                  : `${reps}/8 · ${ready ? "Space or E to lift" : "Lowering…"}`}
              </p>
              <button
                className="gym-primary"
                disabled={reps < 8 && !ready}
                onClick={() =>
                  reps === 8
                    ? useGym.getState().startSession()
                    : useGym.getState().lift()
                }
              >
                {reps === 8 ? "Again" : "Lift"}
              </button>
            </div>
          </>
        ) : (
          <>
            <strong>Bench press</strong>
            <p>{near ? "8 reps" : "Walk up to the bench."}</p>
            {near && (
              <button
                className="gym-primary"
                onClick={() => useGym.getState().startSession()}
              >
                Play
              </button>
            )}
          </>
        )}
      </section>
    </Html>
  );
}

const cognitionSlate = "#314553";

function CognitionBadge({
  p,
  r,
  size,
}: {
  p: [number, number, number];
  r?: [number, number, number];
  size: [number, number];
}) {
  return (
    <group position={p} rotation={r}>
      <Sign
        text="cognition"
        p={[0, 0, 0]}
        size={size}
        frameColor="#52616c"
        color={cognitionSlate}
        ink="#f3f6f8"
      />
    </group>
  );
}

export function CognitionFurnishings() {
  const room = roomFor("cognition");
  return (
    <group>
      <CognitionBadge
        p={[0, 0.08, room.spawnZ - 2.6]}
        r={[-Math.PI / 2, 0, 0]}
        size={[2.2, 0.54]}
      />
      <CognitionBadge
        p={[-room.width / 2 + 0.46, 2.85, -5.4]}
        r={[0, Math.PI / 2, 0]}
        size={[2.8, 0.68]}
      />
      <Box p={[0, 0.08, -1.8]} s={[7.4, 0.08, 5.2]} c="#3c5f56" />
      {[-2.4, 2.4].map((x) => (
        <group key={x} position={[x, 0, -3.4]}>
          <Box p={[0, 1.25, 0]} s={[3.2, 0.2, 1.4]} c="#b59b6b" />
          {[-1.15, 1.15].map((leg) => (
            <Box key={leg} p={[leg, 0.6, 0]} s={[0.15, 1.2, 1.1]} c="#3c4e48" />
          ))}
          <Box p={[0, 1.87, -0.25]} s={[1.6, 1, 0.14]} c="#263c39" />
          <Box p={[0, 1.88, -0.16]} s={[1.35, 0.77, 0.03]} c="#8dc0b4" />
          {Array.from({ length: 4 }, (_, i) => (
            <Box
              key={i}
              p={[-0.4 + (i % 2) * 0.2, 2.08 - i * 0.14, -0.13]}
              s={[0.3 + (i % 3) * 0.2, 0.035, 0.015]}
              c={i % 2 ? "#d9b56a" : "#3e7869"}
            />
          ))}
          <Box p={[0, 1.39, 0.35]} s={[1.1, 0.06, 0.35]} c="#46554c" />
          <CognitionBadge p={[1.03, 1.49, 0.48]} size={[0.84, 0.23]} />
          <group position={[-1.02, 1.36, 0.14]}>
            {[-1, 1].map((side) => (
              <Box
                key={side}
                p={[side * 0.11, 0.01, -0.08]}
                s={[0.04, 0.025, 0.37]}
                r={[0, side * -0.64, 0]}
                c={cognitionSlate}
              />
            ))}
            <CognitionBadge
              p={[0, 0, 0.22]}
              r={[-Math.PI / 2, 0, 0]}
              size={[0.42, 0.2]}
            />
          </group>
          <Bench p={[0, 0, 1.1]} />
        </group>
      ))}
      <Box p={[-4.9, 1.6, -0.1]} s={[0.4, 3.2, 4.1]} c="#456a53" />
      {[0.7, 1.5, 2.3].map((y) => (
        <Box key={y} p={[-4.58, y, -0.1]} s={[0.6, 0.1, 3.7]} c="#b79c6c" />
      ))}
      <Flowers p={[-4.4, 2.4, -0.5]} />
      <Flowers p={[4.4, 0, -4.5]} />
      <Ring p={[0, 0.16, -1.8]} radius={1.1} c="#c8b575" />
      <Cylinder p={[3.8, 0.7, 0.9]} s={[0.55, 1.4, 0.55]} c="#aa8e61" />
      <Cylinder p={[3.8, 1.5, 0.9]} s={[0.6, 0.2, 0.6]} c="#c6c8ae" />
    </group>
  );
}

export function GymFurnishings() {
  const active = useGameMode((s) => s.active?.id === "gym");
  const bar = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!bar.current) return;
    const t = (performance.now() - useGym.getState().liftedAt) / 900;
    const lift = t >= 0 && t <= 1 ? Math.sin(t * Math.PI) * 0.9 : 0;
    bar.current.position.y = 1.65 + lift;
  });
  return (
    <group>
      {active && <GymCamera />}
      <GymControls />
      <Box p={[0, 0.1, -2]} s={[5.8, 0.14, 5.3]} c="#354c46" />
      <Box p={[0, 0.7, -2]} s={[1.1, 0.28, 3.6]} c="#a9563e" />
      <Box p={[0, 0.35, -2]} s={[0.7, 0.7, 2.8]} c="#52665c" />
      {[-1.9, 1.9].map((x) => (
        <group key={x}>
          <Box p={[x, 1.15, -3]} s={[0.16, 2.3, 0.18]} c="#91a497" />
          <Box p={[x, 0.2, -3]} s={[0.7, 0.18, 1.5]} c="#91a497" />
        </group>
      ))}
      <group ref={bar} position={[0, 1.65, -3]}>
        <Cylinder s={[0.07, 4.8, 0.07]} r={[0, 0, Math.PI / 2]} c="#c0c7b0" />
        {[-1.9, 1.9].map((x) => (
          <group key={x}>
            <Cylinder
              p={[x, 0, 0]}
              s={[0.6, 0.3, 0.6]}
              r={[0, 0, Math.PI / 2]}
              c="#344438"
            />
            <Cylinder
              p={[x + Math.sign(x) * 0.28, 0, 0]}
              s={[0.45, 0.18, 0.45]}
              r={[0, 0, Math.PI / 2]}
              c="#d9b956"
            />
          </group>
        ))}
      </group>
      <Box p={[0, 2.9, -5.65]} s={[6.6, 2, 0.1]} c="#a6c4b5" />
      <Box p={[0, 2.9, -5.55]} s={[0.08, 2, 0.1]} c="#d7d6b5" />
      {[-4.1, 4.1].map((x) => (
        <group key={x}>
          <Box p={[x, 0.7, -2.6]} s={[1.1, 0.15, 3.2]} c="#80927c" />
          {[-3.6, -2.6, -1.6].map((z) => (
            <group key={z}>
              <Cylinder
                p={[x, 0.95, z]}
                s={[0.07, 0.8, 0.07]}
                r={[0, 0, Math.PI / 2]}
                c="#b3bca3"
              />
              {[-0.4, 0.4].map((side) => (
                <Ball
                  key={side}
                  p={[x + side, 0.95, z]}
                  s={[0.24, 0.26, 0.26]}
                  c="#3d5544"
                />
              ))}
            </group>
          ))}
        </group>
      ))}
      <Ring p={[0, 0.2, -0.3]} radius={1.1} c="#d1b463" />
    </group>
  );
}
