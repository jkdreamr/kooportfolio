/**
 * Blacktop (PLAN_GAMES §2.1): arcade half-court basketball. The rules live
 * in `core/hoops.ts` (pure, 60 Hz); this file steps them from the shared
 * game clock, feeds input, draws the court and players, and turns events
 * into sound and juice. The HUD is `BasketballHud.tsx`.
 */
import { StaticBatch } from "../world/StaticBatch";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { screenOverlayNoOcclude } from "../world/screenOverlay";
import { PlayHud } from "./BasketballHud";
import { create } from "zustand";
import * as THREE from "three";
import { Cylinder, Flowers, Ring, Sign, Tree } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { useLauncher } from "../core/launchers";
import { keys, movement } from "../core/input";
import { claimEscape, endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { BACKBOARD } from "../core/basketball";
import {
  HOOP_X,
  HOOP_Z,
  METER,
  RIM_Y,
  ZONE,
  charge,
  dist,
  freshInput,
  greenHalfWidth,
  inAir,
  jumpHeight,
  newHoops,
  stepHoops,
  type Hoops,
  type HoopsEvent,
  type HoopsMode,
} from "../core/hoops";
import { RIVALS, RIVAL_ORDER, type RivalId } from "../core/hoopsRival";
import { botInput, botMemory, BOTS, type BotName } from "../core/hoopsBots";
import { registerGameQa } from "../core/gameQa";
import { reportRun } from "../core/daily";
import { medalFor, nextMedal, tierName } from "../core/medals";
import { footstep, sound } from "../core/sound";
import { BasketballPlayers, courtPose } from "./BasketballPlayer";
import { useJuice, juice } from "./juice/Juice";
import { CourtBall, CourtBlock as Box, CourtDeck, CourtSidelines, HoopHardware, courtBallMaterial } from "./CourtDetails";
import "./basketball.css";

export const MODES: Readonly<Record<HoopsMode, { label: string; blurb: string }>> = {
  "1v1": { label: "1v1 Blacktop", blurb: "First to 15 against a rival. Twos and threes, 12 s shot clock." },
  hot: { label: "Hot Shot", blurb: "60 seconds. Shoot from anywhere; the last 10 s count double." },
  shoot: { label: "Shootaround", blurb: "No clock, no defender. Find your shot." },
};

export const useBasketOptions = create<{ mode: HoopsMode; rival: RivalId; round: number }>(() => ({
  mode: "1v1",
  rival: "classmate",
  round: 0,
}));

export type CourtResult = {
  won: boolean;
  title: string;
  score: number;
  unit: string;
  detail: string;
  best: boolean;
  medal: string;
};
export const useBasketHud = create<{
  score: [number, number];
  points: number;
  timeLeft: number;
  shotClock: number;
  offense: 0 | 1;
  holding: boolean;
  takeBack: boolean;
  fire: boolean;
  heat: number;
  streak: number;
  coach: string;
  feedback: string;
  /** For the live region: the last score line. */
  announce: string;
  result: CourtResult | null;
}>(() => ({
  score: [0, 0],
  points: 0,
  timeLeft: 0,
  shotClock: 12,
  offense: 0,
  holding: true,
  takeBack: false,
  fire: false,
  heat: 0,
  streak: 0,
  coach: "",
  feedback: "",
  announce: "",
  result: null,
}));

/* ------------------------------------------------------- module state */

/** The running court. One object, stepped in place. */
export let court: Hoops = newHoops("1v1", "classmate", 1);
const input = freshInput();
const control = {
  bot: null as BotName | null,
  mem: botMemory(),
  speed: 1,
  charge: undefined as number | undefined,
  /** Touch / keyboard second button, consumed by the next step. */
  move: false,
  tapRelease: false,
  shift: false,
  done: false,
};
/** The ladder in one sitting (MVP): beaten rivals, and whether you lost. */
const sitting = { beaten: new Set<RivalId>(), lost: false };

/** Meter DOM, written each frame by the court loop (no React state). */
const meter = { root: null as HTMLElement | null, fill: null as HTMLElement | null, green: null as HTMLElement | null, clock: null as HTMLElement | null };
export function bindMeter(root: HTMLElement | null, fill: HTMLElement | null, green: HTMLElement | null) {
  meter.root = root;
  meter.fill = fill;
  meter.green = green;
}
export function bindShotClock(el: HTMLElement | null) {
  meter.clock = el;
}
/** The second button (juke / drive / steal), for touch. */
export function pressMove() {
  control.move = true;
}

export function beginRound(mode = useBasketOptions.getState().mode, rival = useBasketOptions.getState().rival) {
  if (useGameMode.getState().active?.id !== "basketball" && !startGameMode("basketball")) return false;
  keys.clear();
  runtime.shoot = runtime.shooting = runtime.moving = false;
  court = newHoops(mode, rival, (Date.now() & 0xffff) + 1);
  control.done = false;
  control.charge = undefined;
  control.move = control.tapRelease = false;
  juice.clock.reset();
  const save = useGame.getState().save;
  const coached = save.memories?.includes("coach:basketball");
  useBasketHud.setState({
    score: [0, 0],
    points: 0,
    timeLeft: court.timeLeft,
    shotClock: 12,
    offense: 0,
    holding: true,
    takeBack: false,
    fire: false,
    heat: 0,
    streak: 0,
    feedback: "",
    announce: mode === "1v1" ? `First to 15 against ${RIVALS[rival].name}. Your ball.` : `${MODES[mode].label}. Go.`,
    coach: coached ? "" : "Run at the hoop and press Shoot.",
    result: null,
  });
  useBasketOptions.setState((s) => ({ mode, rival, round: s.round + 1 }));
  return true;
}

function closeCourt() {
  if (useGameMode.getState().active?.id !== "basketball") return;
  endGameMode();
  control.bot = null;
  control.speed = 1;
  juice.clock.reset();
  useBasketHud.setState({ result: null });
  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".basketball-play")?.focus());
}
export { closeCourt };

/* ---------------------------------------------------------------- QA */

function qaState() {
  const g = court;
  return {
    mode: g.mode,
    rival: g.rival,
    t: +g.t.toFixed(3),
    score: [...g.score],
    points: g.points,
    shots: g.shots,
    makes: g.makes,
    holding: g.ball.phase === "held" && g.ball.holder === 0,
    phase: g.ball.phase,
    offense: g.offense,
    resolvedAt: +g.resolvedAt.toFixed(3),
    shotClock: +g.shotClock.toFixed(2),
    timeLeft: +g.timeLeft.toFixed(2),
    over: g.over,
    winner: g.winner,
    fire: g.fire,
    takeBack: g.takeBack,
    p: [+g.p.x.toFixed(2), +g.p.z.toFixed(2)],
    r: [+g.r.x.toFixed(2), +g.r.z.toFixed(2)],
    result: useBasketHud.getState().result,
    playing: useGameMode.getState().active?.id === "basketball",
  };
}
function qaAct(name: string, value?: unknown) {
  if (name === "start") {
    const v = (value ?? {}) as { mode?: HoopsMode; rival?: RivalId };
    return beginRound(v.mode, v.rival);
  }
  if (name === "speed") control.speed = Math.max(1, Math.min(64, Number(value) || 1)); // QA: up to 64× (SwiftShader renders ~1 fps)
  else if (name === "auto") control.bot = BOTS.includes(value as BotName) ? (value as BotName) : null;
  else if (name === "shoot") control.charge = Math.max(0, Math.min(1, Number((value as { charge?: number })?.charge ?? value ?? 0.62)));
  else if (name === "move") control.move = true;
  else if (name === "close") closeCourt();
}

/* ------------------------------------------------------------ lobby UI */

export function CourtControls({ hidePlay = false }: { hidePlay?: boolean } = {}) {
  const playing = useGameMode((s) => s.active?.id === "basketball");
  const { mode, rival } = useBasketOptions();
  const bests = useGame((s) => s.save.bests);
  if (playing) return null;
  return (
    <div
      className="basketball-controls bt-lobby"
      onKeyDown={(event) => {
        if (event.key === " ") event.stopPropagation();
      }}
      onKeyUp={(event) => {
        if (event.key === " ") event.stopPropagation();
      }}
    >
      <nav aria-label="Court mode">
        {(Object.keys(MODES) as HoopsMode[]).map((m) => (
          <button key={m} aria-pressed={m === mode} onClick={() => useBasketOptions.setState({ mode: m })}>
            {MODES[m].label}
          </button>
        ))}
      </nav>
      {mode === "1v1" ? (
        <div className="bt-ladder" role="radiogroup" aria-label="Rival">
          {RIVAL_ORDER.map((id, i) => {
            const beaten = (bests?.[`basketball.wins.${id}`] ?? 0) > 0;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={id === rival}
                className="bt-rival"
                style={{ ["--shirt" as string]: RIVALS[id].shirt }}
                onClick={() => useBasketOptions.setState({ rival: id })}
              >
                <span className="bt-rival-rung">{i + 1}</span>
                <b>{RIVALS[id].name}</b>
                <small>{RIVALS[id].blurb}</small>
                {beaten && <em>Beaten</em>}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="bt-mode-blurb">{MODES[mode].blurb}</p>
      )}
      <div className="basketball-lobby-actions">
        {!hidePlay && (
          <button className="basketball-play" onClick={() => beginRound()}>
            Play
          </button>
        )}
        <button onClick={() => useGame.getState().go("hub")}>← Village</button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- scene */

export function Basketball() {
  const playing = useGameMode((s) => s.active?.id === "basketball");
  useLauncher("basketball", "basketball", "Play", () => beginRound(), { enabled: !playing, hint: "Enter" });
  useEffect(() => {
    window.addEventListener("interior-game-close", closeCourt);
    const unQa = registerGameQa("basketball", { state: qaState, act: qaAct });
    // Escape pauses the game instead of ending it.
    const unEsc = claimEscape("basketball", () => {
      if (useBasketHud.getState().result) return false;
      useGame.setState({ paused: true });
    });
    return () => {
      window.removeEventListener("interior-game-close", closeCourt);
      unQa();
      unEsc();
      sitting.beaten.clear();
      sitting.lost = false;
      if (useGameMode.getState().active?.id === "basketball") endGameMode();
    };
  }, []);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const gl = useThree((s) => s.gl);
  const portal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);
  return (
    <StaticBatch id="Basketball">
      <>
        <BasketballCourt playing={playing} />
        {playing && !hidden && (
          // The game HUD sits over the canvas (the room HUD hides in game modes).
          <Html onOcclude={screenOverlayNoOcclude} fullscreen portal={portal} zIndexRange={[70, 70]} style={{ pointerEvents: "none" }} calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}>
            <PlayHud />
          </Html>
        )}
      </>
    </StaticBatch>
  );
}

const EV_TEXT: Partial<Record<HoopsEvent["k"], string>> = {
  steal: "Picked his pocket",
  stealMiss: "Reach",
  bite: "Ankle breaker",
  turnover: "Shot clock",
  takeBack: "Take it back",
  fake: "Pump fake",
};

function finish(g: Hoops) {
  if (control.done) return;
  control.done = true;
  const game = useGame.getState();
  const bests = game.save.bests ?? {};
  let result: CourtResult;
  const won = g.winner === 0;
  if (g.mode === "1v1") {
    const key = `basketball.wins.${g.rival}`;
    if (won) {
      game.recordBest(key, (bests[key] ?? 0) + 1);
      sitting.beaten.add(g.rival);
    } else sitting.lost = true;
    if (won && !sitting.lost && sitting.beaten.size === 3) game.recordBest("basketball.ladder", 1);
    const after = useGame.getState().save.bests;
    const tier = medalFor("basketball", after);
    const next = nextMedal("basketball", after);
    const nextRival = RIVAL_ORDER[RIVAL_ORDER.indexOf(g.rival) + 1];
    result = {
      won,
      title: won ? `You beat ${RIVALS[g.rival].name}` : `${RIVALS[g.rival].name} wins`,
      score: g.score[0],
      unit: `to ${g.score[1]}`,
      detail: [
        tier ? `Medal: ${tierName("basketball", tier)}` : "",
        next ? `Next: ${next.name}, ${next.need.toLowerCase()}` : "Every medal won",
        won && nextRival ? `Up next: ${RIVALS[nextRival].name}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      best: won && (bests[key] ?? 0) === 0,
      medal: tier ? tierName("basketball", tier) : "",
    };
    reportRun("basketball", { mode: "1v1", score: g.score[0], won, stats: { opponent: g.rival, against: g.score[1] } });
  } else {
    const key = g.mode === "hot" ? "basketball.points.hot" : "basketball.streak";
    const value = g.mode === "hot" ? g.points : g.bestStreak;
    const out = game.recordBest(key, value);
    result = {
      won: true,
      title: g.mode === "hot" ? "Hot Shot" : "Shootaround",
      score: value,
      unit: g.mode === "hot" ? "points" : "in a row",
      detail: `${g.makes} of ${g.shots} · best ${out.bests[key] ?? value}`,
      best: out.improved && value > 0,
      medal: "",
    };
    reportRun("basketball", { mode: g.mode, score: value });
  }
  useGame.getState().remember("coach:basketball");
  useBasketHud.setState({ result, coach: "", announce: `${result.title}. ${result.score} ${result.unit}.` });
  sound(won ? "win" : "lose", { delay: 0.3 });
  if (won) {
    juice.confetti(28);
    juice.haptic("win");
  }
}

const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

function BasketballCourt({ playing }: { playing: boolean }) {
  const ballMesh = useRef<THREE.Group>(null),
    ballShadow = useRef<THREE.Mesh>(null),
    net = useRef<THREE.Group>(null),
    board = useRef<THREE.Group>(null),
    arcGlow = useRef<THREE.Group>(null),
    ring = useRef<THREE.Group>(null);
  const poses = useMemo(() => [courtPose(), courtPose()], []);
  const save = useGame((s) => s.save);
  const rival = useBasketOptions((s) => s.rival);
  const colors = useMemo(
    () => [
      { shirt: save.color, hat: save.hat },
      { shirt: RIVALS[rival].shirt, hat: false, pants: "#2c2c38" },
    ],
    [save.color, save.hat, rival],
  );
  const fx = useJuice();
  const st = useRef({
    acc: 0,
    dribble: 0,
    lastDribbleY: 1,
    lastBallVy: 0,
    hud: 0,
    scoredAt: -10,
    rockAt: -10,
    pushAt: -10,
    camYaw: 0,
    releaseAt: [-9, -9],
    yaw: [Math.PI, 0],
    lastRegion: "",
  });
  const camPos = useMemo(() => new THREE.Vector3(0, 6.2, 11), []),
    camLook = useMemo(() => new THREE.Vector3(0, 2, -3.2), []),
    target = useMemo(() => new THREE.Vector3(), []);

  const onEvent = useCallback(
    (e: HoopsEvent, g: Hoops) => {
      const mine = e.who === 0;
      const hud = useBasketHud.getState();
      const setFeedback = (text: string) => useBasketHud.setState({ feedback: text });
      switch (e.k) {
        case "release":
        case "dunk": {
          st.current.releaseAt[e.who] = g.t;
          if (mine && hud.coach) useBasketHud.setState({ coach: "" });
          if (g.ball.pure) {
            sound("perfect", { gain: 0.8 });
            juice.hitStop(60);
            setFeedback("Pure");
          } else if (mine && e.label === "Late") setFeedback("Late");
          else sound("swish", { gain: 0.45 });
          // The shot that wins it flies in slow motion.
          const s = g.score[e.who] + g.ball.value;
          if (g.mode === "1v1" && g.ball.made && s >= 15) juice.slowMo(0.4, Math.min(2000, g.ball.T * 1000 * 2.5));
          if (g.ball.buzzer || (g.mode === "hot" && g.timeLeft < 1)) juice.slowMo(0.35, 1500);
          if (e.k === "dunk") st.current.pushAt = performance.now();
          break;
        }
        case "make": {
          st.current.scoredAt = performance.now();
          const kind = g.ball.kind;
          if (kind === "dunk") {
            sound("rim");
            sound("score");
            fx.shake(0.5);
            st.current.rockAt = performance.now();
            if (g.ball.slam) juice.hitStop(90);
          } else sound("score");
          fx.score([HOOP_X, RIM_Y + 0.4, HOOP_Z], `+${e.v}`, mine ? (e.label === "Pure" || kind === "dunk" ? "great" : "good") : "miss");
          if (mine && e.label && ["Slam", "Pure", "From the logo", "At the buzzer", "Fadeaway"].includes(e.label)) juice.banner(e.label, "great");
          setFeedback(mine ? e.label ?? "Bucket" : `${RIVALS[g.rival].name.replace("The ", "")} scores`);
          if (!mine) sound("groan", { gain: 0.3 });
          break;
        }
        case "miss":
          if (mine) setFeedback(e.label === "Late" ? "Late" : "Off the rim");
          break;
        case "rim":
          sound("rim", { gain: 0.6 });
          break;
        case "block":
          sound("miss");
          sound(mine ? "cheer" : "groan", { gain: 0.5 });
          {
            const [x, y] = fx.at([g.ball.x, 2.6, g.ball.z]);
            fx.pop("Blocked!", x, y, mine ? "great" : "miss");
          }
          setFeedback(mine ? "Get that out of here" : "Blocked");
          break;
        case "bite": {
          sound("whoosh");
          fx.haptic("tap");
          const a = e.who === 0 ? g.r : g.p;
          const [x, y] = fx.at([a.x, 2.1, a.z]);
          fx.pop("Ankle breaker", x, y, "great");
          break;
        }
        case "juke":
        case "drive":
          sound("whoosh", { gain: 0.35 });
          break;
        case "steal":
          sound("whoosh");
          setFeedback(mine ? EV_TEXT.steal! : "Stripped");
          break;
        case "heat":
          if (mine) {
            const [x, y] = fx.at([g.p.x, 2.4, g.p.z]);
            fx.pop("Heating up", x, y, "great");
          }
          break;
        case "fire":
          sound("perfect");
          juice.banner("Heat check", "great");
          break;
        case "cool":
          setFeedback("Cooled off");
          break;
        case "turnover":
          sound("whistle", { gain: 0.6 });
          setFeedback(mine ? "Shot clock" : "Shot clock: your ball");
          break;
        case "check":
          useBasketHud.setState({ announce: `${g.score[0]} to ${g.score[1]}. ${e.who === 0 ? "Your ball" : "His ball"}.` });
          break;
        case "rebound":
          if (mine && e.v) setFeedback("Board. Take it back");
          break;
        case "over":
          sound("whistle");
          break;
        default: {
          const text = EV_TEXT[e.k];
          if (text && mine) setFeedback(text);
        }
      }
    },
    [fx],
  );

  useFrame(({ camera, size }, delta) => {
    const g0 = useGame.getState();
    if (g0.paused || g0.result || g0.panel !== "none" || !runtime.active) return;
    const s = st.current;
    const sessionActive = useGameMode.getState().active?.id === "basketball";
    const now = performance.now();
    const portrait = size.width < size.height;
    const p0 = poses[0],
      p1 = poses[1];
    if (!playing || !sessionActive) {
      // Lobby: walk the court; the rival shoots around by the key.
      const dt = Math.min(delta, 0.04);
      let [x, z] = movement();
      if (x || z) runtime.target = null;
      else if (runtime.target) {
        const dx = runtime.target[0] - runtime.x,
          dz = runtime.target[1] - runtime.z,
          d = Math.hypot(dx, dz);
        if (d < 0.15) runtime.target = null;
        else {
          x = dx / d;
          z = dz / d;
        }
      }
      const px = runtime.x,
        pz = runtime.z;
      runtime.x = THREE.MathUtils.clamp(runtime.x + x * dt * 4.8, -6, 6);
      runtime.z = THREE.MathUtils.clamp(runtime.z + z * dt * 4.8, -3.8, 7.7);
      runtime.moving = Math.hypot(x, z) > 0.1;
      if (runtime.moving) {
        if (Math.hypot(runtime.x - px, runtime.z - pz) > 0.0001) footstep();
        runtime.heading = Math.atan2(x, z);
      }
      runtime.shoot = runtime.shooting = false;
      Object.assign(p0, { visible: true, x: runtime.x, z: runtime.z, yaw: runtime.heading, vx: x * 4.8, vz: z * 4.8, jump: 0, gather: 0, release: 9, contest: 0, stumble: 0 });
      Object.assign(p1, { visible: true, x: 2.6, z: -1.6, yaw: Math.atan2(HOOP_X - 2.6, HOOP_Z + 1.6), vx: 0, vz: 0, jump: 0, gather: 0, release: 9, contest: 0, stumble: 0 });
      s.dribble += dt * 2.4;
      ballMesh.current?.position.set(2.6 + 0.35, 0.35 + Math.abs(Math.sin(s.dribble * Math.PI)) * 0.65, -1.6 + 0.3);
      if (ballShadow.current) ballShadow.current.visible = false;
      if (arcGlow.current) arcGlow.current.visible = false;
      if (ring.current) ring.current.position.set(runtime.x, 0.155, runtime.z);
      target.set(7, 12.5, 18);
      camera.position.lerp(target, 1 - Math.exp(-dt * 5));
      camera.lookAt(0, 1.2, -0.8);
      if (camera instanceof THREE.PerspectiveCamera) {
        const fov = window.innerWidth < 700 ? 70 : 55;
        if (camera.fov !== fov) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
      return;
    }
    const g = court;
    const frameDt = Math.min(delta, 0.1);
    s.acc += juice.clock.scaled(frameDt) * control.speed;
    let steps = 0;
    while (s.acc >= 1 / 60 && steps < 400) {
      s.acc -= 1 / 60;
      steps++;
      if (g.over) break;
      // Input: a bot, or the keys / touch.
      if (control.bot) botInput(g, control.bot, control.mem, input);
      else {
        const [mx, mz] = movement();
        input.mx = mx;
        input.mz = mz;
        let held = runtime.shooting;
        if (control.tapRelease) {
          control.tapRelease = false;
          held = false;
        } else if (runtime.shoot) {
          runtime.shoot = false;
          if (!g.prevShoot) {
            held = true; // a tap shorter than a frame: press now, release next step
            control.tapRelease = true;
          }
        }
        input.shoot = held;
        const shift = keys.has("shift");
        input.move = control.move || (shift && !control.shift);
        control.shift = shift;
        control.move = false;
        input.charge = control.charge;
        control.charge = undefined;
      }
      stepHoops(g, input);
      for (let i = 0; i < g.events.length; i++) onEvent(g.events[i], g);
      if (g.over) finish(g);
    }
    if (steps === 0 && control.charge === undefined) {
      // Hit-stop: nothing steps, but keep the edges honest.
    }
    // ---------------------------------------------------- draw the court
    const b = g.ball;
    const actors = [g.p, g.r];
    for (let i = 0; i < 2; i++) {
      const a = actors[i],
        pose = poses[i];
      const sp = Math.hypot(a.vx, a.vz);
      const desired = sp > 0.4 ? Math.atan2(a.vx, a.vz) : Math.atan2(HOOP_X - a.x, HOOP_Z - a.z);
      const facing = a.gatherAt >= 0 || (b.phase === "flight" && b.shooter === i && b.t < 0.4) ? Math.atan2(HOOP_X - a.x, HOOP_Z - a.z) : desired;
      // Defenders face the ball.
      const def = b.phase === "held" && b.holder !== i;
      const other = actors[1 - i];
      const yaw = def ? Math.atan2(other.x - a.x, other.z - a.z) : facing;
      s.yaw[i] = lerpAngle(s.yaw[i], yaw, 1 - Math.exp(-frameDt * 14));
      pose.visible = i === 0 || g.mode === "1v1";
      pose.x = a.x;
      pose.z = a.z;
      pose.vx = a.vx;
      pose.vz = a.vz;
      pose.yaw = s.yaw[i];
      pose.jump = jumpHeight(g, a) + (a.gatherAt >= 0 ? Math.max(0, charge(g, a) - 0.45) * 0.5 : 0);
      pose.gather = a.gatherAt >= 0 ? 0.4 + charge(g, a) * 0.6 : 0;
      pose.release = g.t - s.releaseAt[i];
      pose.contest = def && inAir(g, a) ? 1 : def && dist(other.x, other.z) < ZONE.three && Math.hypot(other.x - a.x, other.z - a.z) < 1.6 ? 0.35 : 0;
      pose.stumble = g.t < a.rootedUntil ? Math.sin((a.rootedUntil - g.t) * 9) * 0.5 + 0.5 : 0;
    }
    // The ball: a live dribble in hand, the shot arc, or loose.
    if (ballMesh.current) {
      const m = ballMesh.current;
      if (b.phase === "held") {
        const h = actors[b.holder];
        const sp = Math.hypot(h.vx, h.vz);
        if (h.gatherAt >= 0) {
          m.position.set(h.x + Math.sin(s.yaw[b.holder]) * 0.25, 1.15 + charge(g, h) * 0.95 + jumpHeight(g, h), h.z + Math.cos(s.yaw[b.holder]) * 0.25);
        } else {
          const period = 0.42 * (4.8 / Math.max(sp, 2));
          s.dribble += frameDt / period;
          const y = 0.35 + Math.abs(Math.sin(s.dribble * Math.PI)) * 0.62;
          const side = Math.sin(s.yaw[b.holder] + 1.2),
            sideZ = Math.cos(s.yaw[b.holder] + 1.2);
          m.position.set(h.x + side * 0.42, y, h.z + sideZ * 0.42);
          if (y < 0.4 && s.lastDribbleY >= 0.4) sound("bounce", { gain: b.holder === 0 ? 0.35 : 0.18 });
          s.lastDribbleY = y;
          m.scale.set(1, y < 0.42 ? 0.94 : 1, 1);
        }
      } else {
        m.position.set(b.x, b.y, b.z);
        m.scale.set(1, 1, 1);
        if (b.phase !== "flight" && b.vy > 0.5 && s.lastBallVy < 0 && b.y < 0.6) sound("bounce", { gain: 0.4 });
        s.lastBallVy = b.vy;
        m.rotation.x += frameDt * 6;
      }
      if (ballShadow.current) {
        ballShadow.current.visible = true;
        ballShadow.current.position.set(m.position.x, 0.16, m.position.z);
        ballShadow.current.scale.setScalar(0.7 + Math.min(7, m.position.y) * 0.08);
      }
    }
    // On Fire: the same ball material glows.
    const glow = g.fire ? 0.8 : g.heat >= 2 ? 0.25 : 0;
    if (courtBallMaterial.emissiveIntensity !== glow) {
      courtBallMaterial.emissive.set("#ff8a2a");
      courtBallMaterial.emissiveIntensity = glow;
    }
    if (net.current) {
      const pulse = Math.max(0, 1 - (now - s.scoredAt) / 700);
      net.current.scale.set(1 + Math.sin(pulse * Math.PI * 3) * pulse * 0.13, 1 + pulse * 0.2, 1);
    }
    if (board.current) {
      const r = Math.max(0, 1 - (now - s.rockAt) / 400);
      board.current.rotation.x = Math.sin(r * Math.PI * 4) * r * 0.052;
    }
    if (arcGlow.current) arcGlow.current.visible = g.takeBack && b.phase === "held" && b.holder === 0;
    if (ring.current) ring.current.position.set(g.p.x, 0.155, g.p.z);
    // Meter (DOM, written here).
    if (meter.root) {
      const p = g.p;
      const c = p.gatherAt >= 0 ? charge(g, p) : -1;
      meter.root.dataset.on = c >= 0 ? "true" : "false";
      if (c >= 0 && meter.fill && meter.green) {
        const type = p.gatherType,
          d = dist(p.x, p.z);
        const w = greenHalfWidth(type, d, { moving: Math.hypot(p.vx, p.vz) > 1, fire: g.fire });
        meter.fill.style.transform = `scaleX(${c.toFixed(3)})`;
        const centre = METER[type].centre;
        meter.green.style.transform = `translateX(${((centre - w) * 100).toFixed(2)}%) scaleX(${(w * 2).toFixed(3)})`;
        meter.root.dataset.type = type;
      }
    }
    if (meter.clock) meter.clock.textContent = g.mode === "1v1" ? Math.ceil(g.shotClock).toString() : g.mode === "hot" ? Math.ceil(g.timeLeft).toString() : "∞";
    // HUD at 10 Hz.
    if (now - s.hud > 100 || g.over) {
      s.hud = now;
      const h = useBasketHud.getState();
      const holding = b.phase === "held" && b.holder === 0;
      if (h.score[0] !== g.score[0] || h.score[1] !== g.score[1] || h.points !== g.points || h.holding !== holding || h.takeBack !== g.takeBack || h.fire !== g.fire || h.offense !== g.offense || h.streak !== g.streak || Math.ceil(h.timeLeft) !== Math.ceil(g.timeLeft))
        useBasketHud.setState({
          score: [g.score[0], g.score[1]],
          points: g.points,
          holding,
          takeBack: g.takeBack,
          fire: g.fire,
          heat: g.heat,
          offense: g.offense,
          streak: g.streak,
          timeLeft: g.timeLeft,
        });
    }
    // Camera: fixed axis, the hoop always in frame (§2.1).
    const px = g.p.x,
      pz = g.p.z;
    const push = Math.max(0, 1 - (now - s.pushAt) / 300) * 0.08;
    const back = portrait ? 1.35 : 1;
    target.set(0.5 * px, 6.2 * (portrait ? 1.25 : 1), (0.35 * pz + 9.5) * back);
    target.lerp(camLook.set(0.35 * px, 2, -3.2), push);
    camPos.lerp(target, 1 - Math.exp(-frameDt * 5));
    camera.position.copy(camPos);
    target.set(0.35 * px, portrait ? 1.6 : 2.0, -3.2);
    camLook.lerp(target, 1 - Math.exp(-frameDt * 5));
    camera.lookAt(camLook);
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = portrait ? 58 : 48;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });

  const threeArc = useMemo(
    () =>
      Array.from({ length: 65 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 64) * Math.PI;
        return [Math.sin(a) * 6.5, 0.15, -5 + Math.cos(a) * 6.5] as [number, number, number];
      }),
    [],
  );
  const glowArc = useMemo(() => threeArc.map(([x, , z]) => [x, 0.16, z] as [number, number, number]), [threeArc]);
  return (
    <group>
      {!playing && (
        <mesh
          position={[0, 0.2, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
            runtime.target = [THREE.MathUtils.clamp(event.point.x, -6, 6), THREE.MathUtils.clamp(event.point.z, -3.8, 7.7)];
          }}
        >
          <planeGeometry args={[12, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
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
      <group ref={arcGlow} visible={false}>
        <Line points={glowArc} color="#ffd97a" lineWidth={5} />
      </group>
      <Ring p={[0, 0.15, 0]} radius={2.5} tube={0.025} c="#f7e9c9" />
      <group>
        <HoopHardware />
        <Box p={[0, 0.4, -6.6]} s={[1.6, 0.65, 1.5]} c="#3d6666" />
        <Cylinder p={[0, 2.3, -6.35]} s={[0.16, 4.6, 0.16]} c="#526f6b" />
        <Box p={[0, 4.25, -6.1]} s={[0.2, 0.2, 0.8]} c="#526f6b" />
        <group ref={board} position={[0, 3.05, -5.8]}>
          <group position={[0, -3.05, 5.8]}>
            <Box p={[0, BACKBOARD.y, BACKBOARD.z]} s={[BACKBOARD.width, BACKBOARD.height, BACKBOARD.depth]} c="#f5e8c9" />
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
                          [Math.sin(a + side * 0.35) * 0.34, -0.69, Math.cos(a + side * 0.35) * 0.34],
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
        </group>
      </group>
      {[-7.3, 7.3].map((x) => (
        <group key={x}>
          <Box p={[x, 0.45, 0]} s={[0.22, 0.6, 18]} c="#678b7c" />
          {Array.from({ length: 10 }, (_, i) => (
            <Cylinder key={i} p={[x, 1.1, i * 2 - 9]} s={[0.06, 2, 0.06]} c="#476c62" />
          ))}
          <Box p={[x, 2.1, 0]} s={[0.1, 0.1, 18]} c="#476c62" />
        </group>
      ))}
      <Box p={[0, 0.7, -8.7]} s={[14, 1.3, 0.16]} c="#78917b" />
      <BasketballPlayers poses={poses} colors={colors} />
      <group ref={ring}>
        <Ring radius={0.55} tube={0.025} c="#fae6ae" />
      </group>
      <group ref={ballMesh}>
        <CourtBall />
        <Ring radius={0.231} tube={0.012} c="#65422c" r={[0, 0, 0]} />
        <Ring radius={0.231} tube={0.012} c="#65422c" r={[0, Math.PI / 2, 0]} />
        <Ring radius={0.231} tube={0.012} c="#65422c" />
      </group>
      <mesh ref={ballShadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.25, 20]} />
        <meshBasicMaterial color="#503b28" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <Sign text="COURT 01" p={[0, 5.9, -8.45]} size={[3.5, 0.65]} />
      <Tree p={[-10, 0, -7]} variant={1} />
      <Tree p={[10, 0, -7]} />
      <Flowers p={[-8, 0, 7]} />
      <Flowers p={[8, 0, 7]} />
    </group>
  );
}
