import { StaticBatch } from "../world/StaticBatch";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { setViewZoom, viewZoom, zoomedOffset } from "../engine/camera";

const skateOffset = new THREE.Vector3();
import { runtime, useGame } from "../core/store";
import { endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { keys, movement, movementSpeed, touch } from "../core/input";
import { footstep, sound } from "../core/sound";
import { Box, Ball, Character, Cylinder } from "../world/Models";
import { gameIsActive } from "./InteriorProps";
import { SkateParkTerrain } from "./SkateParkTerrain";
import {
  SKATE,
  SKATE_EXIT,
  idleSkateInput,
  newSkateGame,
  skateHeight,
  stepSkate,
  type SkateState,
  type SkateTrick,
} from "../core/skate";
import "./skate-park.css";

const S = SKATE.worldScale;
const ridingKeys = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  " ",
  "q",
  "e",
  "shift",
]);
type Hold = "left" | "right" | "push" | "brake" | "grind";
function snapshot(g: SkateState) {
  return {
    time: Math.max(0, Math.ceil(SKATE.duration - g.time)),
    phase: g.phase,
    speed: Math.round(g.speed * S * 3.6),
    feedback: g.messageTime > 0 ? g.message : "",
    grinding: g.rail >= 0,
  };
}

function Skateboard() {
  return (
    <group>
      <Box p={[0, 0.15, 0]} s={[0.48, 0.1, 1.36]} c="#a96440" />
      <Box p={[0, 0.21, 0]} s={[0.44, 0.025, 1.26]} c="#34423c" />
      {[-0.62, 0.62].map((z) => (
        <Box
          key={z}
          p={[0, 0.23, z]}
          s={[0.44, 0.09, 0.24]}
          r={[z > 0 ? -0.2 : 0.2, 0, 0]}
          c="#34423c"
        />
      ))}
      {[-0.43, 0.43].map((z) => (
        <group key={z}>
          <Box p={[0, 0.1, z]} s={[0.61, 0.06, 0.09]} c="#a3aaa1" />
          {[-0.28, 0.28].map((x) => (
            <Cylinder
              key={x}
              p={[x, 0.07, z]}
              s={[0.105, 0.12, 0.105]}
              r={[0, 0, Math.PI / 2]}
              c="#f0dfb9"
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function Skater({
  game,
  active,
}: {
  game: React.RefObject<SkateState>;
  active: boolean;
}) {
  const rig = useRef<THREE.Group>(null),
    body = useRef<THREE.Group>(null),
    board = useRef<THREE.Group>(null);
  const color = useGame((s) => s.save.color);
  useFrame(() => {
    if (!rig.current || !active) return;
    const g = game.current;
    rig.current.position.set(g.x * S, g.y, g.z * S);
    rig.current.rotation.y = g.heading;
    const slopeX =
      (skateHeight(g.x + 0.05, g.z) - skateHeight(g.x - 0.05, g.z)) / (0.1 * S);
    const slopeZ =
      (skateHeight(g.x, g.z + 0.05) - skateHeight(g.x, g.z - 0.05)) / (0.1 * S);
    const pitch = g.grounded
      ? Math.atan(-slopeX * Math.sin(g.heading) + slopeZ * Math.cos(g.heading))
      : 0;
    rig.current.rotation.x = pitch;
    const trickProgress = g.trick
      ? Math.min(1, g.trickTime / g.trickDuration)
      : 0;
    if (board.current) {
      board.current.rotation.z =
        g.trick === "kickflip" ? trickProgress * Math.PI * 2 : 0;
      board.current.rotation.y =
        g.trick === "shove-it" ? trickProgress * Math.PI * 2 : 0;
    }
    if (body.current) {
      body.current.position.y = g.bailTime ? 0.15 : g.grounded ? 0.55 : 0.8;
      body.current.rotation.z = g.bailTime ? 1.15 : g.rail >= 0 ? 0.12 : 0;
    }
  });
  return (
    <group ref={rig} visible={active}>
      <group ref={board}>
        <Skateboard />
      </group>
      <group ref={body} position={[0, 0.55, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Box p={[-0.28, -0.12, 0]} s={[0.2, 0.22, 0.25]} c="#f4e8d3" />
        <Box p={[0.28, -0.12, 0]} s={[0.2, 0.22, 0.25]} c="#f4e8d3" />
        {[-0.26, 0.26].map((x) => (
          <Box
            key={x}
            p={[x, 0.06, -0.05]}
            s={[0.2, 0.37, 0.24]}
            r={[0.2, 0, x * 0.8]}
            c="#384c4c"
          />
        ))}
        <Box p={[0, 0.51, -0.06]} s={[0.67, 0.65, 0.43]} c={color} />
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[side * 0.48, 0.65, 0]}
            rotation={[0.1, 0, side * -0.55]}
          >
            <Box p={[0, -0.08, 0]} s={[0.22, 0.45, 0.25]} c={color} />
            <Ball p={[0, -0.32, 0]} s={[0.12, 0.13, 0.12]} c="#efc5a0" />
          </group>
        ))}
        <Box p={[0, 1.15, 0]} s={[0.73, 0.65, 0.64]} c="#efc5a0" />
        <Box p={[0, 1.44, 0]} s={[0.8, 0.28, 0.72]} c="#c27346" />
        <Box p={[0, 1.38, 0.25]} s={[0.82, 0.14, 0.52]} c="#c27346" />
        {[-0.17, 0.17].map((x) => (
          <Ball
            key={x}
            p={[x, 1.16, 0.33]}
            s={[0.04, 0.055, 0.03]}
            c="#333b36"
          />
        ))}
      </group>
    </group>
  );
}

/** Hub model only. The full-size 32×24 parcel is positioned by the world layout. */
export function SkateParkBuilding({
  position = [-50, 0, 50],
  rotation = 0,
}: {
  position?: [number, number, number];
  rotation?: number;
}) {
  return (
    <StaticBatch id="SkateParkBuilding">
      <group
        position={position}
        rotation={[0, rotation, 0]}
        scale={[1.42, 1, 0.9]}
      >
        <SkateParkTerrain detailed={false} />
      </group>
    </StaticBatch>
  );
}

/** Standalone 44×52 open-air scene: no generic wooden shell or ROOM-clamped Walker. */
export function SkateParkInterior() {
  const game = useRef(newSkateGame());
  const input = useRef(idleSkateInput());
  const held = useRef(new Set<string>()),
    pointers = useRef(new Map<number, Hold>()),
    uiKeys = useRef(new Set<Hold>());
  const riding = useGameMode((s) => s.active?.id === "skate");
  const [overview, setOverview] = useState(true);
  const [view, setView] = useState(() => snapshot(game.current));
  const [mode, setMode] = useState<SkateState["mode"]>("free");
  const blocked = useGame((s) => s.paused || s.panel !== "none");
  const color = useGame((s) => s.save.color),
    hat = useGame((s) => s.save.hat);
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const clock = useRef(0);
  const walker = useRef<THREE.Group>(null);
  const follow = useRef(new THREE.Vector3(0, 0, 16));
  const cameraTarget = useRef(new THREE.Vector3());
  const cameraOffset = useMemo(() => new THREE.Vector3(22, 30, 34), []);
  const active = () => {
    const state = useGame.getState();
    // Other minigames pause at an exit prompt; walking must still leave it.
    return (
      runtime.active &&
      (riding
        ? gameIsActive() && useGameMode.getState().active?.id === "skate"
        : !state.paused && state.panel === "none")
    );
  };

  useEffect(() => {
    runtime.x = 0;
    runtime.z = 23;
    runtime.target = null;
    runtime.path = [];
    return () => {
      runtime.moving = false;
    };
  }, []);
  useEffect(() => {
    const close = () => {
      const state = useGame.getState();
      if (state.paused || state.panel !== "none") return;
      // Escape abandons the current line/run without evaluating rewards.
      game.current = newSkateGame();
      input.current = idleSkateInput();
      setOverview(true);
    };
    window.addEventListener("interior-game-close", close);
    return () => window.removeEventListener("interior-game-close", close);
  }, []);
  useEffect(() => {
    const clear = () => {
      held.current.clear();
      pointers.current.clear();
      uiKeys.current.clear();
      input.current = idleSkateInput();
      keys.clear();
      touch.x = touch.z = 0;
    };
    clear();
    if (!riding || blocked) return clear;
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement;
      if (
        !ridingKeys.has(key) ||
        !active() ||
        target.closest("input,textarea,select,[contenteditable=true]") ||
        (key === " " && target.closest("button,a"))
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      held.current.add(key);
      if (e.repeat) return;
      if (key === " ") input.current.jump = true;
      if (key === "q" || key === "e")
        input.current.trick = key === "q" ? "kickflip" : "shove-it";
    };
    const up = (e: KeyboardEvent) => {
      held.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
    };
  }, [riding, blocked]);

  useFrame(({ camera, size }, delta) => {
    const dt = Math.min(delta, 0.05),
      g = game.current;
    if (active()) {
      if (riding) {
        const h = held.current,
          buttons = [...pointers.current.values(), ...uiKeys.current];
        const has = (name: Hold) => buttons.includes(name);
        input.current.push =
          h.has("w") || h.has("arrowup") || has("push")
            ? 1
            : Math.max(0, -touch.z);
        input.current.steer =
          Number(h.has("d") || h.has("arrowright") || has("right")) -
          Number(h.has("a") || h.has("arrowleft") || has("left")) +
          touch.x;
        input.current.brake =
          h.has("s") || h.has("arrowdown") || has("brake") || touch.z > 0.3;
        input.current.grind = h.has("shift") || has("grind");
        const before = {
          grounded: g.grounded,
          trick: g.trick,
          score: g.score,
          phase: g.phase,
          bail: g.bailTime,
        };
        stepSkate(g, input.current, delta);
        if (g.phase !== before.phase && g.phase === "done")
          sound(g.score >= 800 ? "win" : "score");
        else if (g.bailTime > before.bail) sound("bounce");
        else if (g.score > before.score) sound("score");
        else if (!before.grounded && g.grounded) sound("land");
        else if (before.grounded && !g.grounded) sound("whoosh");
        else if (g.trick && g.trick !== before.trick) sound("whoosh");
        input.current.jump = false;
        input.current.trick = null;
        runtime.x = g.x * S;
        runtime.z = g.z * S;
        runtime.moving = false;
        useGame.getState().setNear("");
        clock.current += dt;
        if (clock.current > 0.075) {
          setView(snapshot(g));
          clock.current = 0;
        }
      } else {
        let [dx, dz] = movement();
        if (Math.hypot(dx, dz) > 0.1) {
          const x = dx;
          dx = x * 0.83 + dz * 0.55;
          dz = dz * 0.83 - x * 0.55;
          runtime.target = null;
        } else if (runtime.target) {
          const [x, z] = runtime.target,
            distance = Math.hypot(x - runtime.x, z - runtime.z);
          if (distance < 0.2) runtime.target = null;
          else {
            dx = (x - runtime.x) / distance;
            dz = (z - runtime.z) / distance;
          }
        }
        runtime.moving = Math.hypot(dx, dz) > 0.1;
        const walking = movementSpeed(5);
        const px = runtime.x,
          pz = runtime.z;
        runtime.x = THREE.MathUtils.clamp(
          runtime.x + dx * walking * dt,
          -20.5,
          20.5,
        );
        runtime.z = THREE.MathUtils.clamp(
          runtime.z + dz * walking * dt,
          -24.5,
          25,
        );
        if (Math.hypot(runtime.x - px, runtime.z - pz) > 0.0001) footstep();
        if (runtime.moving) runtime.heading = Math.atan2(dx, dz);
        if (walker.current) {
          walker.current.position.set(
            runtime.x,
            skateHeight(runtime.x / S, runtime.z / S),
            runtime.z,
          );
          walker.current.rotation.y = runtime.heading;
        }
        useGame
          .getState()
          .setNear(
            runtime.z > SKATE_EXIT[1] - 1 &&
              Math.abs(runtime.x - SKATE_EXIT[0]) < 3.5
              ? "exit"
              : "",
          );
      }
    }
    // Fixed isometric orientation makes steering readable; follow exposes the park's real size.
    cameraTarget.current.set(
      overview ? 0 : runtime.x * 0.92,
      0,
      overview ? 0 : runtime.z * 0.92,
    );
    follow.current.lerp(cameraTarget.current, 1 - Math.exp(-dt * 4));
    const fit = Math.max(
      5,
      Math.min((size.width - 36) / 65, (size.height - 210) / 56),
    );
    const zoom = THREE.MathUtils.damp(
      viewZoom(camera),
      overview ? fit : size.width < 700 ? 23 : 29,
      5,
      dt,
    );
    skateOffset.copy(cameraOffset);
    zoomedOffset(camera, skateOffset, zoom, size.height);
    cameraTarget.current.copy(follow.current).add(skateOffset);
    camera.position.lerp(cameraTarget.current, 1 - Math.exp(-dt * 5));
    camera.lookAt(follow.current.x, 0.7, follow.current.z);
    setViewZoom(camera, zoom, size.height);
  });

  const begin = (nextMode: SkateState["mode"]) => {
    if (!riding && !startGameMode("skate")) return;
    game.current = newSkateGame(nextMode);
    game.current.x = THREE.MathUtils.clamp(runtime.x / S, -7, 7);
    game.current.z = THREE.MathUtils.clamp(runtime.z / S, -9, 9);
    game.current.y = skateHeight(game.current.x, game.current.z);
    input.current = idleSkateInput();
    runtime.target = null;
    runtime.path = [];
    runtime.moving = false;
    runtime.x = game.current.x * S;
    runtime.z = game.current.z * S;
    useGame.getState().setNear("");
    setMode(nextMode);
    setView(snapshot(game.current));
    setOverview(false);
  };
  const leaveBoard = () => {
    endGameMode();
    setOverview(true);
    // Shared mode restores the walking position and heading from boarding.
    runtime.target = null;
    runtime.path = [];
    runtime.moving = false;
    useGame.getState().setNear("");
  };
  const hold = (control: Hold) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, control);
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(e.pointerId);
    },
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(e.pointerId);
    },
    onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(e.pointerId);
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if ([" ", "Enter"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        uiKeys.current.add(control);
      }
    },
    onKeyUp: (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if ([" ", "Enter"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        uiKeys.current.delete(control);
      }
    },
    onBlur: () => {
      uiKeys.current.delete(control);
    },
  });
  const tap = (kind: "ollie" | SkateTrick) => {
    const fire = () => {
      if (!active()) return;
      if (kind === "ollie") input.current.jump = true;
      else input.current.trick = kind;
    };
    return {
      // Secondary touch pointers don't synthesize a click. Act on contact so
      // one thumb can push/steer while the other performs a trick.
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        fire();
      },
      onClick: (e: MouseEvent<HTMLButtonElement>) => {
        // Keep native keyboard/assistive activation without double-firing a tap.
        if (e.detail === 0) fire();
      },
    };
  };
  return (
    <>
      <group
        scale={[S, 1, S]}
        onPointerDown={(e) => {
          if (riding || !active()) return;
          e.stopPropagation();
          runtime.target = [e.point.x, e.point.z];
          runtime.path = [];
        }}
      >
        <SkateParkTerrain />
      </group>
      {!riding && (
        <group ref={walker}>
          <Character player color={color} hat={hat} scale={0.8} />
        </group>
      )}
      <Skater game={game} active={riding} />
      {!blocked && (
        <Html
          portal={portal}
          fullscreen
          zIndexRange={[28, 0]}
          calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
          style={{ pointerEvents: "none" }}
        >
          <div
            className={`skate-ui${riding ? " is-riding" : ""}`}
            onKeyDown={(e) => {
              if (e.key === " " && (e.target as HTMLElement).closest("button"))
                e.stopPropagation();
            }}
            onKeyUp={(e) => {
              if (e.key === " " && (e.target as HTMLElement).closest("button"))
                e.stopPropagation();
            }}
            onClick={(e) => {
              if (e.detail > 0 && e.target instanceof HTMLButtonElement)
                e.target.blur();
            }}
          >
            <div className="skate-view-controls">
              <button
                className="skate-view"
                onClick={() => setOverview(!overview)}
              >
                {overview ? "Follow view" : "Park view"}
              </button>
              {riding && (
                <button onClick={() => useGame.setState({ paused: true })}>
                  Pause
                </button>
              )}
            </div>
            {!riding ? (
              <section className="skate-card" aria-label="Skate park">
                <span className="skate-eyebrow">Bowl + street</span>
                <h2>Skate park</h2>
                <p>Find a line. Link flips and grinds.</p>
                <div className="skate-modes">
                  <button onClick={() => begin("free")}>Free skate</button>
                  <button onClick={() => begin("run")}>60s run</button>
                </div>
              </section>
            ) : (
              <>
                <section className="skate-score" aria-label="Skate session">
                  <span>{mode === "run" ? `${view.time}s` : "Free skate"}</span>
                  <span>{view.speed} km/h</span>
                </section>
                <p className="skate-feedback" role="status">
                  {view.feedback}
                </p>
                {view.phase === "done" ? (
                  <section
                    className="skate-card skate-done"
                    aria-label="Skate run result"
                  >
                    <span className="skate-eyebrow">Run complete</span>
                    <h2>Nice line</h2>
                    <div className="skate-modes">
                      <button onClick={() => begin("run")}>Ride again</button>
                      <button onClick={leaveBoard}>Step off</button>
                    </div>
                  </section>
                ) : (
                  <>
                    <div className="skate-steer" aria-label="Skate movement">
                      <button {...hold("push")} className="skate-push">
                        Push <kbd>W ↑</kbd>
                      </button>
                      <button {...hold("left")} aria-label="Steer left">
                        ↶ <kbd>A</kbd>
                      </button>
                      <button {...hold("brake")}>
                        Brake <kbd>S</kbd>
                      </button>
                      <button {...hold("right")} aria-label="Steer right">
                        ↷ <kbd>D</kbd>
                      </button>
                    </div>
                    <div className="skate-tricks" aria-label="Skate tricks">
                      <button className="skate-ollie" {...tap("ollie")}>
                        Ollie <kbd>Space</kbd>
                      </button>
                      <button {...tap("kickflip")}>
                        Kickflip <kbd>Q</kbd>
                      </button>
                      <button {...tap("shove-it")}>
                        Shove-it <kbd>E</kbd>
                      </button>
                      <button
                        {...hold("grind")}
                        className={view.grinding ? "is-grinding" : ""}
                      >
                        Hold to grind <kbd>Shift</kbd>
                      </button>
                      <button className="skate-stepoff" onClick={leaveBoard}>
                        Step off
                      </button>
                    </div>
                    <p className="skate-hint">Flip to jump. Land to bank.</p>
                  </>
                )}
              </>
            )}
          </div>
        </Html>
      )}
    </>
  );
}
