/**
 * Regatta Grand Prix (PLAN_GAMES §2.2): the race scene. The rules live in
 * `core/rowing.ts` (60 Hz, pure); this steps them from the game clock, feeds
 * steering, draws the course ribbons, buoys, bridge, chevrons and the four
 * eights, runs the chase camera, and turns race events into sound and juice.
 * The HUD (place, laps, boost, mini-map, touch) is `RowingHud.tsx`.
 */
import { StaticBatch } from "../world/StaticBatch";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { create } from "zustand";
import * as THREE from "three";
import { Ball, Box, Cylinder, Sign, Tree } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { keys } from "../core/input";
import { CREWS, TICK, dailySeed, freshRowInput, newRace, stepRace, type Cup, type Race, type RaceMode, type RowEvent } from "../core/rowing";
import { HALF_WIDTH, headingAt, toPlan } from "../core/rowCourse";
import { botInput, rivalInput, rowBotMemory, ROW_BOTS, type RowBot } from "../core/rowRival";
import { ghostAt, ghostRecorder, loadGhost, saveGhost, type Ghost } from "../core/rowGhost";
import { registerGameQa } from "../core/gameQa";
import { reportRun } from "../core/daily";
import { medalFor, nextMedal, tierName } from "../core/medals";
import { sound } from "../core/sound";
import { juice, useJuice } from "./juice/Juice";
import { RowingShell, shellView } from "./RowingShell";
import { RowingWater } from "./RowingWater";
import { RowingBanks } from "./RowingBanks";
import "./rowing.css";

export const CUP_NAMES: Readonly<Record<Cup, string>> = { novice: "Novice Cup", varsity: "Varsity Cup", head: "Head Cup" };
export const MODE_NAMES: Readonly<Record<RaceMode, string>> = { gp: "Grand Prix", sprint: "Sprint", tt: "Time Trial", daily: "Daily river" };
export const useRowOptions = create<{ mode: RaceMode; cup: Cup }>(() => ({ mode: "gp", cup: "novice" }));

export const useRaceHud = create<{
  mode: RaceMode;
  cup: Cup;
  count: number;
  place: number;
  boats: number;
  lap: number;
  laps: number;
  meter: number;
  boosting: boolean;
  armed: boolean;
  wake: boolean;
  split: string;
  splitGood: boolean;
  gap: string;
  coach: string;
  wrong: boolean;
  finished: boolean;
  ghost: boolean;
  announce: string;
}>(() => ({
  mode: "gp",
  cup: "novice",
  count: 3,
  place: 4,
  boats: 4,
  lap: 1,
  laps: 3,
  meter: 100,
  boosting: false,
  armed: false,
  wake: false,
  split: "",
  splitGood: true,
  gap: "",
  coach: "",
  wrong: false,
  finished: false,
  ghost: false,
  announce: "",
}));

/** m:ss.s for race times. */
export function raceClock(seconds: number) {
  const m = Math.floor(seconds / 60),
    sec = seconds - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

/* --------------------------------------------------------- race state */

export let race: Race = newRace();
const inputs = [freshRowInput(), freshRowInput(), freshRowInput(), freshRowInput()];
const control = { bot: null as RowBot | null, mem: rowBotMemory(), speed: 1, steer: 0, boost: false, hold: false, done: false };
const recorder = ghostRecorder();
let ghost: Ghost | null = null;
const ghostPos = { s: 0, d: 0, th: 0 };
/** Touch / button input (RowingHud writes these). */
export const rowTouch = { steer: 0, boost: false, hold: false };
/** Mini-map dots, written each frame (no React state). */
export const miniMap = { dots: [] as (SVGCircleElement | null)[], scale: 1, cx: 0, cy: 0 };

function startRace() {
  const { mode, cup } = useRowOptions.getState();
  const seed = mode === "daily" ? dailySeed() : (Date.now() & 0xffff) + 1;
  race = newRace({ mode, cup, seed, mirror: mode === "daily" && seed % 2 === 1 });
  control.done = false;
  recorder.reset();
  ghost = mode === "tt" ? loadGhost(race.course.id) : null;
  juice.clock.reset();
  const coached = useGame.getState().save.memories?.includes("coach:rowing");
  useRaceHud.setState({
    mode,
    cup,
    count: 3,
    place: race.boats.length,
    boats: race.boats.length,
    lap: 1,
    laps: race.laps,
    meter: 100,
    finished: false,
    ghost: !!ghost,
    split: "",
    gap: "",
    wrong: false,
    coach: coached ? "" : "You are the cox. Steer.",
    announce: `${MODE_NAMES[mode]}${mode === "gp" ? `, ${CUP_NAMES[cup]}` : ""}. ${race.laps > 1 ? `${race.laps} laps` : race.course.name}. Ready.`,
  });
}

function qaState() {
  const p = race.boats[0];
  return {
    mode: race.mode,
    cup: race.cup,
    t: +race.t.toFixed(2),
    s: +p.s.toFixed(2),
    d: +p.d.toFixed(3),
    v: +p.v.toFixed(2),
    place: p.place,
    lap: Math.min(race.laps, p.lapTimes.length + 1),
    lapTimes: p.lapTimes.map((x) => +x.toFixed(2)),
    meter: Math.round(p.meter),
    finished: p.finished,
    over: race.over,
    ghost: !!ghost,
    done: control.done,
  };
}
function qaAct(name: string, value?: unknown) {
  if (name === "speed") control.speed = Math.max(1, Math.min(16, Number(value) || 1));
  else if (name === "auto") control.bot = ROW_BOTS.includes(value as RowBot) ? (value as RowBot) : null;
  else if (name === "steer") control.steer = Math.max(-1, Math.min(1, Number(value) || 0));
  else if (name === "boost") control.boost = !!value;
  else if (name === "hold") control.hold = !!value;
  else if (name === "start") {
    const v = (value ?? {}) as { mode?: RaceMode; cup?: Cup };
    useRowOptions.setState({ mode: v.mode ?? useRowOptions.getState().mode, cup: v.cup ?? useRowOptions.getState().cup });
    startRace();
  }
}

function finish(r: Race) {
  if (control.done) return;
  control.done = true;
  const p = r.boats[0];
  const game = useGame.getState();
  const time = Math.round(p.finishTime * 100) / 100;
  const laps = p.lapTimes.map((x) => raceClock(x)).join(" · ");
  let best = false;
  let title: string;
  let detail: string;
  if (r.mode === "tt") {
    const total = game.recordBest(`rowing.tt.total`, time, "min");
    const lap = Math.min(...p.lapTimes);
    game.recordBest("rowing.tt.lap", Math.round(lap * 100) / 100, "min");
    best = total.improved;
    if (best) saveGhost(r.course.id, recorder.ghost);
    const medal = time <= 94 ? "Gold ghost" : time <= 98 ? "Silver ghost" : time <= 104 ? "Bronze ghost" : "";
    title = best ? "New best time" : "Time trial";
    detail = `${raceClock(time)}${medal ? ` · ${medal}` : ""} · laps ${laps}${best ? " · your ghost races you next time" : ` · best ${raceClock(total.bests["rowing.tt.total"] ?? time)}`}`;
  } else {
    const place = p.place;
    const key = r.mode === "daily" ? "rowing.daily.place" : r.mode === "sprint" ? "rowing.sprint.place" : `rowing.gp.place.${r.cup}`;
    const out = game.recordBest(key, place, "min");
    if (r.mode === "daily") game.recordBest("rowing.daily.time", time, "min");
    if (place === 1 && r.mode === "gp") game.recordBest("rowing.gp.wins", (game.save.bests?.["rowing.gp.wins"] ?? 0) + 1);
    best = out.improved;
    const after = useGame.getState().save.bests;
    const tier = medalFor("rowing", after);
    const next = nextMedal("rowing", after);
    title = place === 1 ? "Head of the race" : `${["", "1st", "2nd", "3rd", "4th"][place]} place`;
    detail = [`${raceClock(time)}`, laps ? `laps ${laps}` : "", tier ? `Medal: ${tierName("rowing", tier)}` : "", next ? `Next: ${next.name}, ${next.need.toLowerCase()}` : ""].filter(Boolean).join(" · ");
  }
  reportRun("rowing", { mode: r.mode, score: time, place: p.place, won: p.place === 1, daily: r.mode === "daily", stats: { cup: r.cup } });
  game.remember("coach:rowing");
  useRaceHud.setState({ finished: true, announce: `${title}. ${detail}` });
  useGame.setState({
    result: { game: "rowing", title, detail, score: r.mode === "tt" ? Math.round(time) : p.place, unit: r.mode === "tt" ? "s" : p.place === 1 ? "st" : p.place === 2 ? "nd" : p.place === 3 ? "rd" : "th", best, record: time },
  });
  sound(p.place === 1 || best ? "win" : "score");
  if (p.place === 1 || best) {
    juice.confetti(28);
    juice.haptic("win");
  }
}

/* ----------------------------------------------------------- scenery */

function Course({ r }: { r: Race }) {
  const c = r.course;
  const items = useMemo(() => {
    const p = { x: 0, y: 0 };
    const at = (s: number, d: number): [number, number, number] => {
      toPlan(c, s, d, p);
      return [p.x, 0, -p.y];
    };
    const yaw = (s: number) => headingAt(c, s) - Math.PI / 2;
    const posts = [] as { p: [number, number, number]; red: boolean }[];
    for (let s = 0; s < c.length; s += 9) for (const side of [-1, 1]) posts.push({ p: at(s, side * (HALF_WIDTH + 0.1)), red: (s / 9) % 2 === 0 });
    const trees = [] as { p: [number, number, number]; v: number }[];
    for (let s = 0, i = 0; s < c.length; s += 14, i++) for (const side of [-1, 1]) trees.push({ p: at(s + (side > 0 ? 7 : 0), side * (HALF_WIDTH + 7 + (i % 3) * 2)), v: i });
    return {
      buoys: c.bends.map((b) => at(b.apexS, b.apexD)),
      posts,
      trees,
      chevrons: c.chevrons.map((ch) => ({ p: at(ch.s, ch.d), yaw: yaw(ch.s) })),
      bridge: { p: at(c.bridge, 0), yaw: yaw(c.bridge) },
      gates: r.cps.map((s, i) => ({ p: at(s, 0), yaw: yaw(s), start: i === 0 })),
      finish: c.closed ? null : { p: at(c.length, 0), yaw: yaw(c.length) },
    };
  }, [c, r.cps]);
  return (
    <group>
      <RowingWater course={c} time={() => race.t} />
      <RowingBanks course={c} />
      {items.buoys.map((p, i) => (
        <group key={i} position={p}>
          <Cylinder p={[0, 0.25, 0]} s={[0.6, 0.6, 0.6]} c="#f08a3c" />
          <Ball p={[0, 0.62, 0]} s={[0.34, 0.3, 0.34]} c="#fff1d8" />
          <Cylinder p={[0, 1.2, 0]} s={[0.05, 1.1, 0.05]} c="#5a4b3a" />
          <Box p={[0.22, 1.6, 0]} s={[0.42, 0.26, 0.03]} c="#ffd97a" />
        </group>
      ))}
      {items.posts.map((o, i) => (
        <group key={i} position={o.p}>
          <Cylinder p={[0, 0.12, 0]} s={[0.19, 0.34, 0.19]} c={o.red ? "#dc7554" : "#f2e8c8"} />
          <Ball p={[0, 0.29, 0]} s={[0.2, 0.17, 0.2]} c={o.red ? "#dc7554" : "#f2e8c8"} />
        </group>
      ))}
      {items.trees.map((t, i) => (
        <Tree key={i} p={t.p} size={0.8 + (t.v % 3) * 0.15} variant={t.v} />
      ))}
      {items.chevrons.map((ch, i) => (
        <group key={i} position={ch.p} rotation={[0, ch.yaw, 0]}>
          {[0, 1.3, 2.6].map((z) => (
            <group key={z} position={[0, -0.03, -z]}>
              <Box p={[-0.55, 0, 0]} s={[1.3, 0.02, 0.28]} c="#d8fff0" r={[0, -0.6, 0]} />
              <Box p={[0.55, 0, 0]} s={[1.3, 0.02, 0.28]} c="#d8fff0" r={[0, 0.6, 0]} />
            </group>
          ))}
        </group>
      ))}
      <group position={items.bridge.p} rotation={[0, items.bridge.yaw, 0]}>
        {[-3.2, 3.2].map((x) => (
          <Cylinder key={x} p={[x, 1.4, 0]} s={[1.8, 2.8, 1.8]} c="#b9ab8e" />
        ))}
        <Box p={[0, 3.1, 0]} s={[26, 0.6, 3.2]} c="#c9b998" />
        <Box p={[0, 3.6, 1.5]} s={[26, 0.5, 0.15]} c="#8f7f63" />
        <Box p={[0, 3.6, -1.5]} s={[26, 0.5, 0.15]} c="#8f7f63" />
      </group>
      {items.gates.map((g, i) => (
        <group key={i} position={g.p} rotation={[0, g.yaw, 0]}>
          <Box p={[0, -0.035, 0]} s={[2 * HALF_WIDTH, 0.02, g.start ? 0.8 : 0.18]} c="#f7e6b9" />
          {[-HALF_WIDTH - 1.2, HALF_WIDTH + 1.2].map((x) => (
            <Cylinder key={x} p={[x, 2.5, 0]} s={[0.11, 5, 0.11]} c="#a38d66" />
          ))}
          {g.start && (
            <>
              <Box p={[0, 5, 0]} s={[2 * HALF_WIDTH + 2.4, 0.15, 0.15]} c="#b3a17c" />
              <Sign text={c.closed ? "START · FINISH" : "START"} p={[0, 4.4, 0.15]} size={[6, 1]} />
            </>
          )}
        </group>
      ))}
      {items.finish && (
        <group position={items.finish.p} rotation={[0, items.finish.yaw, 0]}>
          <Box p={[0, -0.035, 0]} s={[2 * HALF_WIDTH, 0.02, 0.8]} c="#f7e6b9" />
          <Box p={[0, 5, 0]} s={[2 * HALF_WIDTH + 2.4, 0.15, 0.15]} c="#b3a17c" />
          <Sign text="FINISH" p={[0, 4.4, 0.15]} size={[5, 1]} />
        </group>
      )}
    </group>
  );
}

/** Two pedal boats on their crossing paths (moving; outside the static batch). */
function PedalBoats() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const p = useMemo(() => ({ x: 0, y: 0 }), []);
  useFrame(() => {
    race.pedals.forEach((pd, i) => {
      const g = refs.current[i];
      if (!g) return;
      toPlan(race.course, pd.s, pd.d, p);
      g.position.set(p.x, 0, -p.y);
      g.rotation.y = headingAt(race.course, pd.s);
    });
  });
  return (
    <>
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} visible={race.pedals.length > i}>
          <Box p={[0, 0.25, 0]} s={[1.6, 0.5, 2.2]} c={i ? "#f2d06b" : "#e88a8a"} />
          <Ball p={[0, 0.85, 0]} s={[1.1, 0.5, 1.4]} c="#fff1d8" />
        </group>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- scene */

export function Rowing() {
  const [round, setRound] = useState(0);
  const fx = useJuice();
  const views = useMemo(() => [shellView(), shellView(), shellView(), shellView()], []);
  const st = useRef({ acc: 0, hud: 0, fov: 58, yaw: 0, look: new THREE.Vector3(), cam: new THREE.Vector3(), first: true, lastPlace: 4, wakeSound: 0 });
  const p2 = useMemo(() => ({ x: 0, y: 0 }), []);
  useEffect(() => {
    startRace();
    setRound((n) => n + 1);
    const unQa = registerGameQa("rowing", { state: qaState, act: qaAct });
    return () => {
      unQa();
      control.bot = null;
      control.speed = 1;
      control.steer = 0;
      juice.clock.reset();
    };
  }, [setRound]);
  const onEvent = (e: RowEvent, r: Race) => {
    const mine = e.boat === 0;
    const p = r.boats[0];
    const hud = useRaceHud.getState();
    switch (e.k) {
      case "go":
        sound("whistle");
        useRaceHud.setState({ count: 0, announce: "Go." });
        break;
      case "rocket":
        if (mine) {
          juice.banner("Rocket start", "great");
          sound("perfect", { gain: 0.6 });
        }
        break;
      case "jump":
        if (mine) useRaceHud.setState({ coach: "Too early: wait for Go" });
        break;
      case "boost":
        if (mine) {
          sound("whistle", { gain: 0.35 });
          juice.banner("Power ten!", "great");
          juice.haptic("score");
        }
        break;
      case "wake":
        if (mine && !hud.coach && !useGame.getState().save.memories?.includes("coach:rowing")) useRaceHud.setState({ coach: "Slipstream: stay in his wake, then pull out" });
        break;
      case "sling":
        if (mine) {
          sound("swish");
          const [x, y] = fx.at(shellPoint(views[0]));
          fx.pop("Slingshot", x, y, "great");
        }
        break;
      case "perfect":
        if (mine) {
          sound("perfect", { gain: 0.6 });
          fx.haptic("tap");
          const [x, y] = fx.at(shellPoint(views[0]));
          fx.pop("Perfect line", x, y, "great");
        }
        break;
      case "clean":
        if (mine) {
          const [x, y] = fx.at(shellPoint(views[0]));
          fx.pop("Clean", x, y, "good");
        }
        break;
      case "buoy":
        if (mine) {
          sound("miss", { gain: 0.5 });
          useRaceHud.setState({ split: "Buoy" });
        }
        break;
      case "scrape":
      case "pier":
        if (mine) {
          sound("miss");
          fx.shake(0.6);
          const [x, y] = fx.at(shellPoint(views[0]));
          fx.pop(e.k === "pier" ? "Pier!" : "Scrape", x, y, "miss");
        }
        break;
      case "bump":
        if (mine || e.v === 0) {
          sound("land", { gain: 0.7 });
          fx.shake(0.3);
        }
        break;
      case "chevron":
        if (mine) sound("whoosh", { gain: 0.5 });
        break;
      case "split":
        if (mine && p.splits.length > 1) {
          const n = p.splits.length - 1;
          const sector = p.splits[n] - p.splits[n - 1];
          useRaceHud.setState({ split: `Sector ${raceClock(sector)}`, splitGood: true });
        }
        break;
      case "lap":
        if (mine && !p.finished) {
          const lap = p.lapTimes.length + 1;
          sound(lap === r.laps ? "chime" : "score", { gain: 0.6 });
          useRaceHud.setState({ lap, announce: lap === r.laps ? `Final lap. You are ${ordinal(p.place)}.` : `Lap ${lap} of ${r.laps}. You are ${ordinal(p.place)}.` });
          if (lap === r.laps) juice.banner("Final lap", "good");
        }
        break;
      case "pass":
        if (mine && r.t > 1) {
          sound("score", { gain: 0.5 });
          if (e.v === 1) juice.banner("Through them!", "great");
          useRaceHud.setState({ announce: `Up to ${ordinal(e.v ?? 4)}.` });
        }
        break;
      case "wrong":
        if (mine) useRaceHud.setState({ wrong: true });
        break;
      case "reset":
        if (mine) useRaceHud.setState({ wrong: false });
        break;
      case "finish":
        if (mine) {
          const close = r.boats.some((b) => b.id !== 0 && b.finished && Math.abs(b.finishTime - p.finishTime) < 0.5);
          if (close) {
            juice.slowMo(0.4, 1200);
            juice.flash("great");
          }
          sound("whistle");
        }
        break;
    }
  };
  useFrame(({ camera, size }, delta) => {
    const g0 = useGame.getState();
    if (g0.paused || g0.result || g0.panel !== "none" || !runtime.active) return;
    const s = st.current;
    const r = race;
    const frameDt = Math.min(delta, 0.1);
    s.acc += juice.clock.scaled(frameDt) * control.speed;
    let steps = 0;
    while (s.acc >= TICK && steps < 16 * 8) {
      s.acc -= TICK;
      steps++;
      if (r.over) break;
      const me = inputs[0];
      if (control.bot) botInput(r, control.bot, control.mem, me);
      else {
        const k = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
        me.steer = Math.max(-1, Math.min(1, -(k || rowTouch.steer || control.steer)));
        me.boost = keys.has(" ") || rowTouch.boost || control.boost;
        me.hold = keys.has("s") || keys.has("arrowdown") || keys.has("shift") || rowTouch.hold || control.hold;
      }
      for (let i = 1; i < r.boats.length; i++) rivalInput(r, r.boats[i], inputs[i]);
      stepRace(r, inputs);
      const p = r.boats[0];
      if (!p.finished) recorder.sample(r.t, p.s, p.d, p.th);
      for (let i = 0; i < r.events.length; i++) onEvent(r.events[i], r);
      if (p.finished && !control.done && (r.over || r.t - p.finishTime > 2.5)) finish(r);
    }
    // ------------------------------------------------------------ draw
    for (let i = 0; i < 4; i++) {
      const v = views[i];
      let bs: number, bd: number, bth: number, speed: number, stroke: number;
      if (i < r.boats.length) {
        const b = r.boats[i];
        bs = b.s;
        bd = b.d;
        bth = b.th;
        speed = b.v;
        stroke = b.stroke;
        v.visible = true;
      } else if (i === 1 && ghost) {
        ghostAt(ghost, r.t, ghostPos);
        bs = ghostPos.s;
        bd = ghostPos.d;
        bth = ghostPos.th;
        speed = 11;
        stroke = (r.t * 0.55) % 1;
        v.visible = r.t > 0;
      } else {
        v.visible = false;
        continue;
      }
      toPlan(r.course, bs, bd, p2);
      v.x = p2.x;
      v.z = -p2.y;
      v.yaw = headingAt(r.course, bs) + bth - Math.PI / 2;
      v.roll = -bth * Math.min(speed / 12, 1) * 0.11;
      v.speed = speed;
      v.stroke = stroke;
      v.moving = r.t >= 0;
      v.travel = bs;
    }
    // Chase camera: 7.5 behind and 3.4 above the stern, looking 9 ahead.
    const pv = views[0],
      p = r.boats[0];
    const yaw = pv.yaw + Math.PI; // forward direction angle in world (x = sin, z = cos of yaw+π)
    if (s.first) {
      s.yaw = yaw;
      s.first = false;
    }
    s.yaw += Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw)) * (1 - Math.exp(-frameDt * 5));
    const fx0 = Math.sin(s.yaw),
      fz0 = Math.cos(s.yaw);
    const portrait = size.width < size.height;
    const back = portrait ? 9.5 : 7.5 + 4.8;
    s.cam.set(pv.x - fx0 * back, portrait ? 4.6 : 3.4, pv.z - fz0 * back);
    camera.position.copy(s.cam);
    s.look.set(pv.x + fx0 * (9 + 4.8), 0.6, pv.z + fz0 * (9 + 4.8));
    camera.lookAt(s.look);
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) camera.rotateZ(Math.max(-0.035, Math.min(0.035, -p.steer * 0.035)));
    if (camera instanceof THREE.PerspectiveCamera) {
      const base = portrait ? 68 : 58;
      const target = reduced ? base : base + (p.boostT > 0 ? 8 : 0) + (p.slingT > 0 ? 4 : 0);
      s.fov += (target - s.fov) * (1 - Math.exp(-frameDt * 10));
      if (Math.abs(camera.fov - s.fov) > 0.01) {
        camera.fov = s.fov;
        camera.updateProjectionMatrix();
      }
    }
    // Mini-map dots (DOM transforms).
    for (let i = 0; i < miniMap.dots.length; i++) {
      const dot = miniMap.dots[i];
      if (!dot) continue;
      const v = views[i];
      dot.style.display = v.visible ? "" : "none";
      dot.style.transform = `translate(${((v.x - miniMap.cx) * miniMap.scale).toFixed(1)}px, ${((v.z - miniMap.cy) * miniMap.scale).toFixed(1)}px)`;
    }
    // HUD at 10 Hz.
    const now = performance.now();
    if (now - s.hud > 100) {
      s.hud = now;
      const h = useRaceHud.getState();
      const count = r.t < 0 ? Math.ceil(-r.t) : 0;
      // Gap to the boat ahead, in seconds at your speed.
      let gap = "";
      const idx = r.order.indexOf(0);
      if (idx > 0) {
        const ahead = r.boats[r.order[idx - 1]];
        gap = ahead.finished ? "" : `+${((ahead.s - p.s) / Math.max(4, p.v)).toFixed(1)} s`;
      } else if (r.boats.length > 1 && r.t > 0) {
        const behind = r.boats[r.order[1]];
        gap = `−${((p.s - behind.s) / Math.max(4, behind.v)).toFixed(1)} s`;
      }
      const next = {
        count,
        place: p.place,
        meter: Math.round(p.meter),
        boosting: p.boostT > 0,
        armed: p.armed,
        wake: p.inWake,
        gap,
      };
      if (count !== h.count && count > 0) {
        sound("tap");
        useRaceHud.setState({ announce: `${count}` });
      }
      if (h.coach && r.t > 8 && h.coach === "You are the cox. Steer.") useRaceHud.setState({ coach: "Hold water (S) to turn tighter in the chicane" });
      if (h.coach && r.t > 20 && h.coach.startsWith("Hold water")) useRaceHud.setState({ coach: "" });
      if (h.coach && h.coach.startsWith("Slipstream") && p.armed) useRaceHud.setState({ coach: "Slingshot ready: pull out now" });
      if (h.coach && h.coach.startsWith("Slingshot") && !p.armed) useRaceHud.setState({ coach: "" });
      if (h.coach && h.coach.startsWith("Too early") && r.t > 3) useRaceHud.setState({ coach: "" });
      if (h.wrong && Math.abs(p.th) < 1.5) useRaceHud.setState({ wrong: false });
      if (Object.entries(next).some(([k, v]) => (h as Record<string, unknown>)[k] !== v)) useRaceHud.setState(next);
    }
    // A soft whoosh while in a wake.
    if (p.inWake && now - s.wakeSound > 900) {
      s.wakeSound = now;
      sound("whoosh", { gain: 0.2 });
    }
  });
  return (
    <>
      <StaticBatch id="Rowing" key={round}>
        <Course r={race} />
      </StaticBatch>
      <PedalBoats />
      {[0, 1, 2, 3].map((i) => (
        <RowingShell key={i} state={() => views[i]} color={CREWS[i].blade} player={i === 0} />
      ))}
    </>
  );
}

function shellPoint(v: { x: number; z: number }): [number, number, number] {
  return [v.x, 1.6, v.z];
}
const ordinal = (n: number) => ["", "1st", "2nd", "3rd", "4th"][n] ?? `${n}th`;

