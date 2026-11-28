import { useEffect, useReducer, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  newPong,
  onFire,
  PONG_AIM,
  PONG_CUPS,
  PONG_THROWS,
  pongDepth,
  pongReducer,
  pongSwipe,
} from "../core/pong";
import { sound } from "../core/sound";
import { useGame } from "../core/store";
import { useJuice } from "./juice/Juice";
import { Ball, Cylinder, Ring } from "../world/Models";
import { CraftedBox } from "./CraftedDetails";
import { GameControls, gameIsActive } from "./InteriorProps";
import { startGameMode, useGameMode } from "../core/gameMode";
import { usePauseOnEscape } from "./usePauseOnEscape";
import { GAME_STAGE_Y, InteriorGameStage } from "./InteriorGameStage";

const HAND = new THREE.Vector3(0, 1.95, 2.6);
const RIM_Y = 1.82;
const TABLE_Y = 1.5;
const FLIGHT = 0.8;
const AFTER = 0.85;
const GUIDE = 12;
const clamp = THREE.MathUtils.clamp;

function arc(x: number, z: number, t: number, out: THREE.Vector3) {
  const lift = 0.75 + Math.abs(z - HAND.z) * 0.15;
  return out.set(
    HAND.x + (x - HAND.x) * t,
    HAND.y + (RIM_Y - HAND.y) * t + 4 * lift * t * (1 - t),
    HAND.z + (z - HAND.z) * t,
  );
}

function Cup({ color = "#a94334" }: { color?: string }) {
  return (
    <>
      <mesh castShadow>
        <cylinderGeometry args={[0.205, 0.135, 0.38, 14, 1, true]} />
        <meshStandardMaterial
          color={color}
          roughness={0.45}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Cylinder p={[0, -0.17, 0]} s={[0.135, 0.035, 0.135]} c={color} />
      <Ring p={[0, 0.19, 0]} radius={0.205} tube={0.022} c="#eeeae2" />
      <Cylinder p={[0, 0.08, 0]} s={[0.175, 0.01, 0.175]} c="#b99a5c" />
    </>
  );
}

export function PongTable() {
  const active = useGameMode((s) => s.active?.id === "pong");
  const savedBest = useGame((s) => s.save.bests?.["pong.throws"] ?? 0);
  const otherMode = useGameMode((s) => !!s.active && s.active.id !== "pong");
  const [game, dispatch] = useReducer(pongReducer, undefined, newPong);
  usePauseOnEscape("pong", () => game.phase !== "over");
  const gl = useThree((s) => s.gl);
  const ball = useRef<THREE.Group>(null),
    sinking = useRef<THREE.Group>(null),
    splash = useRef<THREE.Group>(null),
    guide = useRef<(THREE.Mesh | null)[]>([]);
  const aim = useRef(0),
    power = useRef(0.25),
    drag = useRef<{ x: number; y: number; id: number } | null>(null),
    clock = useRef(0),
    focusPanel = useRef(true);
  useEffect(() => {
    if (!active) focusPanel.current = true;
  }, [active]);
  // Opening focuses Close; move focus to the panel once so Space throws.
  const panelRef = (panel: HTMLDivElement | null) => {
    if (panel && focusPanel.current) {
      panel.focus({ preventScroll: true });
      focusPanel.current = false;
    }
  };
  const fire = onFire(game);

  const toss = () => {
    if (!gameIsActive() || game.phase !== "ready") return;
    clock.current = 0;
    sound("swish");
    dispatch({ type: "throw", aim: aim.current, power: power.current });
  };
  const restart = () => {
    setRecord(null);
    aim.current = 0;
    power.current = 0.25;
    dispatch({ type: "reset" });
  };

  const fx = useJuice();
  const [record, setRecord] = useState<null | { best: number; newBest: boolean }>(null);
  useEffect(() => {
    if (game.phase !== "landed" || !game.last) return;
    const cup = game.last.cup === null ? null : PONG_CUPS[game.last.cup];
    const at: [number, number, number] = cup ? [cup.x, GAME_STAGE_Y + 1.86, cup.z] : [game.landing.x, GAME_STAGE_Y + 1.6, game.landing.z];
    if (game.last.result === "cup") {
      sound("score");
      fx.score(at, onFire(game) ? "On fire" : "Cup", onFire(game) ? "great" : "good");
    } else if (game.last.result === "rim") {
      sound("rim", { gain: 0.6 });
      const [x, y] = fx.at(at);
      fx.pop("Rim", x, y, "miss");
    } else sound("bounce");
    if (game.cups.length === 0) {
      // Cleared: fewest throws is the best.
      const best = useGame.getState().recordBest("pong.throws", game.shots, "min");
      setRecord({ best: best.bests["pong.throws"] ?? game.shots, newBest: best.improved });
      sound("win", { delay: 0.3 });
      fx.confetti();
      fx.haptic("win");
    }
    // Only the landing itself should sound, once.
  }, [game.phase, game.last, game.cups.length, game.shots]);

  // Swipe up from anywhere on the stage: height sets depth, sideways sets aim.
  useEffect(() => {
    const surface = gl.domElement.parentElement;
    if (!active || !surface) return;
    const scale = () =>
      clamp(Math.min(innerHeight * 0.42, innerWidth * 0.6), 180, 360);
    const ignore = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(".interior-game-content, .house-game-close");
    const down = (e: PointerEvent) => {
      if (ignore(e.target) || !gameIsActive() || drag.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const aimAt = (start: { x: number; y: number }, e: PointerEvent) => {
      const shot = pongSwipe(e.clientX - start.x, e.clientY - start.y, scale());
      aim.current = shot.aim;
      power.current = shot.power;
    };
    const move = (e: PointerEvent) => {
      const start = drag.current;
      if (start && start.id === e.pointerId) aimAt(start, e);
    };
    const up = (e: PointerEvent) => {
      const start = drag.current;
      if (!start || start.id !== e.pointerId) return;
      drag.current = null;
      if (start.y - e.clientY <= 24) return;
      aimAt(start, e);
      toss();
    };
    const cancel = () => (drag.current = null);
    surface.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      surface.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      drag.current = null;
    };
  });

  // Arrows aim and set depth; Space or Enter throws.
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (!gameIsActive() || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.key === " " || e.key === "Enter") && e.repeat) {
        // A held key throws once, including the press that opened the game.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const control =
        e.target instanceof Element && !!e.target.closest("button, input");
      const step = e.shiftKey ? 0.02 : 0.06;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        aim.current = clamp(
          aim.current + (e.key === "ArrowLeft" ? -step : step),
          -PONG_AIM,
          PONG_AIM,
        );
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        power.current = clamp(
          power.current + (e.key === "ArrowUp" ? step : -step) * 0.5,
          0,
          1,
        );
      } else if ((e.key === " " || e.key === "Enter") && !control) {
        if (game.phase === "over") restart();
        else toss();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  useFrame((_, dt) => {
    if (!active) return;
    const ready = game.phase === "ready" && gameIsActive();
    guide.current.forEach((dot, i) => {
      if (!dot) return;
      dot.visible = ready;
      if (!ready) return;
      const t = 0.06 + (i / GUIDE) * 0.56;
      arc(aim.current, pongDepth(power.current), t, dot.position);
      dot.scale.setScalar(0.045 * (1 - (i / GUIDE) * 0.6));
    });
    if (!ball.current) return;
    const b = ball.current.position;
    if (game.phase === "ready") {
      clock.current += dt;
      b.copy(HAND);
      b.y += Math.sin(clock.current * 3) * 0.02;
      return;
    }
    if (!gameIsActive()) return;
    clock.current += dt;
    const { x, z } = game.landing;
    if (game.phase === "flying") {
      const t = Math.min(1, clock.current / FLIGHT);
      arc(x, z, t, b);
      if (t === 1) {
        clock.current = 0;
        dispatch({ type: "settle" });
      }
      return;
    }
    if (game.phase !== "landed" || !game.last) return;
    const a = clock.current;
    const cup = game.last.cup === null ? null : PONG_CUPS[game.last.cup];
    if (game.last.result === "cup" && cup) {
      b.set(cup.x, RIM_Y - Math.min(1, a / 0.16) * 0.3, cup.z);
      ball.current.visible = a < 0.16;
      if (sinking.current) {
        const k = Math.max(0, 1 - a / 0.55);
        sinking.current.scale.setScalar(Math.max(0.001, k));
        sinking.current.position.set(cup.x, 1.63 - (1 - k) * 0.25, cup.z);
      }
      if (splash.current) {
        splash.current.position.set(cup.x, 1.86, cup.z);
        splash.current.scale.setScalar(1 + a * 2.2);
        splash.current.visible = a < 0.35;
      }
    } else if (game.last.result === "rim" && cup) {
      const dx = x - cup.x,
        dz = z - cup.z,
        len = Math.hypot(dx, dz) || 1;
      b.set(
        x + (dx / len) * a * 1.5,
        RIM_Y + 2.2 * a - 7 * a * a,
        z + (dz / len) * a * 1.5,
      );
    } else {
      const off = Math.abs(b.x) > 1.4 || b.z < -2.78;
      b.set(
        x + (x / 3) * a,
        off
          ? b.y - dt * 4
          : TABLE_Y +
              (RIM_Y - TABLE_Y) * Math.abs(Math.cos(a * 7)) * Math.exp(-a * 3),
        z - a * 1.4,
      );
    }
    if (a >= AFTER) {
      clock.current = 0;
      ball.current.visible = true;
      dispatch({ type: "next" });
    }
  });

  const sunk =
    game.phase === "landed" && game.last?.result === "cup"
      ? game.last.cup
      : null;
  const rimmed =
    game.phase === "landed" && game.last?.result === "rim"
      ? game.last.cup
      : null;
  return (
    <>
      {active && <InteriorGameStage kind="pong" />}
      <group
        visible={!otherMode}
        position={active ? [0, GAME_STAGE_Y, 0] : [6, 0, 6]}
        onClick={(event) => {
          event.stopPropagation();
          if (!active && gameIsActive()) startGameMode("pong");
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
        <CraftedBox p={[0, 1.45, 0]} s={[0.025, 0.02, 5.4]} c="#e6e2d6" />
        <CraftedBox p={[0, 1.45, 0]} s={[2.7, 0.02, 0.035]} c="#e6e2d6" />
        {PONG_CUPS.map(
          (cup, i) =>
            game.cups.includes(i) && (
              <group
                key={i}
                position={[cup.x, 1.63, cup.z]}
                rotation={rimmed === i ? [0, 0, 0.06] : [0, 0, 0]}
              >
                <Cup />
              </group>
            ),
        )}
        {sunk !== null && (
          <group
            ref={sinking}
            position={[PONG_CUPS[sunk].x, 1.63, PONG_CUPS[sunk].z]}
          >
            <Cup />
          </group>
        )}
        <group ref={splash} visible={false}>
          <Ring radius={0.16} tube={0.012} c="#eeeae2" />
        </group>
        {active &&
          Array.from({ length: GUIDE }, (_, i) => (
            <mesh
              key={i}
              ref={(mesh) => {
                guide.current[i] = mesh;
              }}
              visible={false}
            >
              <sphereGeometry args={[1, 8, 6]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
            </mesh>
          ))}
        <group ref={ball} visible={active && game.phase !== "over"}>
          <Ball s={[0.085, 0.085, 0.085]} c={fire ? "#e8894a" : "#f4f1ea"} />
        </group>
      </group>
      <GameControls
        name="Cup pong game"
        position={[7.5, 0.6, 5]}
        mobileSheet
        dock="left"
        gameOpen
        collapsible="Pong"
        mode="pong"
        launcherIndex={1}
        onClose={() => (drag.current = null)}
      >
        <div className="pong-panel" tabIndex={-1} ref={panelRef}>
          <div className="house-game-header">
            <h2>Cup pong</h2>
            <div className="pong-score">
              <b>{6 - game.cups.length}/6 cups</b>
              <span>
                {PONG_THROWS - game.shots} throws left
              </span>
            </div>
          </div>
          {game.phase === "over" && record && (
            <p className="house-game-best">
              {record.newBest ? <span className="house-new-best">New best</span> : null} Cleared in {game.shots}
              {!record.newBest && ` · best ${record.best}`}
            </p>
          )}
          {game.phase === "over" && (
            <button className="pong-rack" onClick={restart}>
              New rack
            </button>
          )}
          {game.shots === 0 && game.phase !== "over" && (
            <p className="house-game-goal">
              Sink all 6 cups in {PONG_THROWS} throws
              {savedBest > 0 && <span> · best {savedBest}</span>}
            </p>
          )}
          <p role="status">
            {game.message ||
              (game.shots === 0 ? (
                <>
                  Swipe up to throw<span className="kbd-hint"> · <kbd>←</kbd><kbd>→</kbd> aim, <kbd>Space</kbd> throws</span>
                </>
              ) : (
                ""
              ))}
          </p>
        </div>
      </GameControls>
    </>
  );
}
