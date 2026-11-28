import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { screenOverlayNoOcclude } from "../world/screenOverlay";
import { claimEscape, endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { useGame } from "../core/store";
import { useLauncher, useLauncherHosted } from "../core/launchers";
import { registerGameQa } from "../core/gameQa";
import { dailyThree, dayNumber, reportRun } from "../core/daily";
import { sound } from "../core/sound";
import { ResultCard } from "../ui/ResultCard";
import { juice } from "./juice/Juice";
import { useSoundLoop } from "./useSoundLoop";
import { GAME_STAGE_Y } from "./InteriorGameStage";
import { gameIsActive } from "./InteriorProps";
import { PapaKitchenScene } from "./PapaKitchenScene";
import { readKitchenTutorialDone, saveKitchenTutorialDone } from "./kitchenProgress";
import {
  EARLY,
  GOOD,
  grillOrder,
  kitchenReducer,
  METER,
  newKitchen,
  nextStep,
  PERFECT,
  plateOrder,
  starsFor,
  toppingName,
  type KitchenAction,
  type KitchenGame,
  type Order,
  type Topping,
} from "./kitchenRush";
import "./kitchen-rush.css";

const pct = (heat: number) => `${(Math.min(heat, METER) / METER) * 100}%`;
/** The meter's bands, as CSS positions (static). */
const METER_STYLE = {
  "--good-a": pct(GOOD[0]),
  "--good-b": pct(GOOD[1]),
  "--gold-a": pct(PERFECT[0]),
  "--gold-b": pct(PERFECT[1]),
} as CSSProperties;

function Food({ t }: { t: Topping | "patty" }) {
  return <i className={`kr-ico kr-ico--${t}`} aria-hidden="true" />;
}

function Ticket({ order, game, next }: { order: Order; game: KitchenGame; next: ReturnType<typeof nextStep> }) {
  const onGrill = grillOrder(game) === order,
    onPlate = plateOrder(game) === order;
  const left = Math.max(0, 1 - order.waited / order.patience);
  const steps = [
    `patty${order.flip ? ", flipped" : ""}`,
    ...order.toppings.map(toppingName),
  ].join(", then ");
  return (
    <article className={`kr-ticket${onPlate || (onGrill && !plateOrder(game)) ? " is-active" : ""}`} aria-label={`${order.name}: ${steps}`}>
      <header>
        <b>{order.name}</b>
        <span className={`kr-patience${left < 0.3 ? " is-low" : ""}`} style={{ "--left": left } as CSSProperties} aria-hidden="true" />
      </header>
      <ol className="kr-steps" aria-hidden="true">
        <li className={order.cook === "done" ? "is-done" : onGrill && next === "grill" ? "is-next" : ""}>
          <Food t="patty" />
          {order.flip && <small>×2</small>}
        </li>
        {order.toppings.map((t, i) => (
          <li key={i} className={i < order.stacked ? "is-done" : onPlate && i === order.stacked && next === t ? "is-next" : ""}>
            <Food t={t} />
          </li>
        ))}
      </ol>
    </article>
  );
}

function grillLabel(game: KitchenGame): [string, string] {
  const o = grillOrder(game);
  if (!o) return ["Grill", "free"];
  if (o.cook === "raw") return ["Start patty", game.orders.some((x) => x.cook === "grill") ? "busy" : "tap"];
  const verb = o.flip && o.side === 1 ? "Flip" : "Plate";
  if (o.heat < EARLY) return [verb, "sizzling…"];
  if (o.heat < PERFECT[0]) return [verb, "almost…"];
  if (o.heat <= PERFECT[1]) return [verb, "now!"];
  return [verb, "hurry!"];
}

/** The coach line: always on during the first order, then short tips. */
function coachLine(game: KitchenGame, next: ReturnType<typeof nextStep>): string | null {
  if (game.phase !== "tutorial") return null;
  const o = grillOrder(game);
  if (next === "grill" && o?.cook === "raw") return "Tap the grill to start the patty";
  if (o?.cook === "grill") return o.heat < PERFECT[0] ? "Sizzling… tap when the needle hits gold" : "Now! Tap to plate it";
  if (next === "top") return "Top bun serves it";
  if (next && next !== "grill") return `Add the ${toppingName(next).toLowerCase()} from the ticket`;
  return null;
}

type RunRecord = { best: boolean; stars: number; daily?: string };

function KitchenControls({
  game,
  act,
  paused,
  setPaused,
  close,
  restart,
  skip,
  record,
  cursor,
  tip,
  grillRef,
  boardRef,
  focusElement,
}: {
  game: KitchenGame;
  act: (a: KitchenAction) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
  close: () => void;
  restart: () => void;
  skip: () => void;
  record: RunRecord | null;
  cursor: number;
  tip: string | null;
  grillRef: React.RefObject<HTMLButtonElement | null>;
  boardRef: React.RefObject<HTMLDivElement | null>;
  focusElement: (node: HTMLButtonElement | null) => void;
}) {
  const next = nextStep(game);
  const o = grillOrder(game);
  const [label, state] = grillLabel(game);
  const coach = coachLine(game, next) ?? tip;
  const playing = game.phase === "tutorial" || game.phase === "service";
  const hot = o?.cook === "grill" && o.heat >= PERFECT[0] && o.heat <= PERFECT[1];
  return (
    <section
      className={`kr-game${paused ? " is-paused" : ""}`}
      aria-label="Kitchen: Lunch Rush"
      data-interior-game-open="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="kr-top">
        <div className="kr-score" aria-live="off">
          <b>{game.score}</b>
          <span>points</span>
          {game.combo >= 2 && <em className="kr-combo">Combo ×{game.combo}</em>}
        </div>
        <time className={`kr-clock${game.phase === "service" && game.clock < 20 ? " is-low" : ""}`}>
          {game.phase === "tutorial"
            ? "Practice"
            : clockText(game.clock)}
        </time>
        {playing && (
          <button className="kr-icon-button" aria-label="Pause (Esc)" onClick={() => setPaused(true)}>
            <span className="kr-pause-glyph" aria-hidden="true" />
          </button>
        )}
        <button className="kr-icon-button" ref={focusElement} aria-label="Close Kitchen" onClick={close}>
          ×
        </button>
      </header>
      {playing && (
        <>
          <div className="kr-rail" aria-label="Orders">
            {game.orders.map((order) => (
              <Ticket key={order.id} order={order} game={game} next={next} />
            ))}
            {!game.orders.length && <p className="kr-waiting">Next customer…</p>}
          </div>
          {coach && (
            <p className={`kr-coach${game.phase === "tutorial" ? " is-tutorial" : ""}`} role="status">
              {coach}
            </p>
          )}
          {game.phase === "tutorial" && (
            <button className="kr-skip" onClick={skip}>
              Skip practice
            </button>
          )}
          <div className="kr-dock">
            <button
              ref={grillRef}
              className={`kr-grill${next === "grill" ? " is-next" : ""}${hot ? " is-hot" : ""}${cursor === 0 ? " is-cursor" : ""}${o?.cook === "grill" ? " is-cooking" : ""}`}
              disabled={!o || state === "busy"}
              onClick={() => act({ type: "grill" })}
              aria-label={`${label}, ${state}`}
            >
              <kbd>1</kbd>
              <span className="kr-grill-text">
                <b>{label}</b>
                <small>{state}</small>
              </span>
              <span className="kr-meter" style={METER_STYLE} aria-hidden="true">
                <span className="kr-meter-good" />
                <span className="kr-meter-gold" />
                {o?.cook === "grill" && <i style={{ left: pct(o.heat) }} />}
              </span>
            </button>
            <div className="kr-tray" ref={boardRef} aria-label="Toppings">
              {game.unlocked.map((t, i) => (
                <button
                  key={t}
                  className={`kr-item${next === t ? " is-next" : ""}${cursor === i + 1 ? " is-cursor" : ""}`}
                  onClick={() => act({ type: "add", topping: t })}
                  aria-label={`Add ${toppingName(t)}`}
                >
                  <kbd>{i + 2}</kbd>
                  <Food t={t} />
                  <span>{toppingName(t)}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="kr-keys" aria-hidden="true">
            1–{game.unlocked.length + 1} or ←→ + E · Esc pauses
          </p>
        </>
      )}
      {paused && playing && (
        <div className="kr-pause" role="dialog" aria-label="Paused">
          <h2>Paused</h2>
          <button className="primary-button" autoFocus onClick={() => setPaused(false)}>
            Resume
          </button>
          <button className="quiet-button" onClick={restart}>
            Restart rush
          </button>
          <button className="quiet-button" onClick={close}>
            Leave the kitchen
          </button>
        </div>
      )}
      {game.phase === "results" && (
        <div className="kr-result" role="status">
          <h2>Lunch rush over</h2>
          <p className="kr-stars" aria-label={`${record?.stars ?? 0} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < (record?.stars ?? 0) ? "is-on" : ""} aria-hidden="true">
                ★
              </span>
            ))}
          </p>
          <ResultCard
            score={game.score}
            unit="points"
            detail={`${game.served} served · ${game.perfects} perfect · best combo ×${game.bestCombo}`}
            best={record?.best}
            game="kitchen"
            daily={record?.daily}
            onReplay={restart}
            onBack={close}
            backLabel="Back to the kitchen"
          />
        </div>
      )}
    </section>
  );
}

const TICK = 0.05;
const clockText = (seconds: number) => {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function PapaKitchenGame() {
  const active = useGameMode((s) => s.active?.id === "kitchen");
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.near === "exit");
  const [game, dispatch] = useReducer(kitchenReducer, undefined, () => newKitchen());
  const [paused, setPaused] = useState(false);
  const [cursorPick, setCursorPick] = useState<number | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [record, setRecord] = useState<RunRecord | null>(null);
  const timer = useRef(0),
    pendingFocus = useRef(false),
    latest = useRef(game),
    grillRef = useRef<HTMLButtonElement>(null),
    boardRef = useRef<HTMLDivElement>(null);
  latest.current = game;
  const gl = useThree((s) => s.gl),
    size = useThree((s) => s.size);
  const portal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);

  /** Applies the time owed since the last tick first, so a tap is judged at the moment it lands. */
  const act = (a: KitchenAction) => {
    if (timer.current > 0 && !paused) dispatch({ type: "tick", dt: timer.current });
    timer.current = 0;
    dispatch(a);
  };
  const begin = (tutorial = !readKitchenTutorialDone()) => {
    setPaused(false);
    setRecord(null);
    setTip(null);
    dispatch({ type: "start", tutorial });
  };
  const close = () => {
    pendingFocus.current = true;
    setPaused(false);
    dispatch({ type: "stop" });
    endGameMode();
  };
  const skip = () => {
    saveKitchenTutorialDone();
    begin(false);
  };

  useEffect(() => {
    if (!active) return;
    const stop = () => {
      pendingFocus.current = true;
      setPaused(false);
      dispatch({ type: "stop" });
      endGameMode();
    };
    window.addEventListener("interior-game-close", stop);
    return () => window.removeEventListener("interior-game-close", stop);
  }, [active]);
  useEffect(() => {
    if (active && game.phase === "idle") {
      pendingFocus.current = true;
      begin();
    }
  }, [active, game.phase]);
  // Escape pauses (and resumes) a running rush; on the result card it leaves.
  useEffect(
    () =>
      claimEscape("kitchen", () => {
        const phase = latest.current.phase;
        if (phase !== "tutorial" && phase !== "service") return false;
        setPaused((p) => !p);
      }),
    [],
  );
  useEffect(() => {
    if (!active) setPaused(false);
  }, [active]);

  const next = nextStep(game);
  const slots = useMemo(() => ["grill" as const, ...game.unlocked], [game.unlocked]);
  const cursor = cursorPick ?? (next ? slots.indexOf(next) : -1);
  // Keyboard: 1 = grill, 2… = toppings, ←/→ move the cursor, E/Space/Enter press it.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const g = latest.current;
      if ((g.phase !== "tutorial" && g.phase !== "service") || paused || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const onButton = event.target instanceof HTMLElement && event.target.closest(".kr-game button");
      const k = event.key;
      const press = (i: number) => {
        const slot = slots[i];
        if (!slot) return;
        act(slot === "grill" ? { type: "grill" } : { type: "add", topping: slot });
      };
      let handled = true;
      if (/^[1-9]$/.test(k)) press(Number(k) - 1);
      else if (k === "ArrowRight" || k === "ArrowDown") setCursorPick((cursor + 1 + slots.length) % slots.length);
      else if (k === "ArrowLeft" || k === "ArrowUp") setCursorPick((Math.max(0, cursor) - 1 + slots.length) % slots.length);
      else if (k === "e" || k === "E" || ((k === " " || k === "Enter") && !onButton)) press(Math.max(0, cursor));
      else if (k === "p" || k === "P") setPaused(true);
      else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useSoundLoop(active && !paused && game.orders.some((o) => o.cook === "grill") ? "sizzle" : null);

  // Feedback follows the reducer, so taps, keys and QA inputs all sound the same.
  useEffect(() => {
    if (!active) return;
    setCursorPick(null);
    const f = game.last;
    const at = (el: HTMLElement | null): [number, number] => {
      const r = el?.getBoundingClientRect();
      return r ? [r.left + r.width / 2, r.top] : [size.width / 2, size.height / 2];
    };
    let line: string | null = null;
    if (f.kind === "grill") sound("tap");
    else if (f.kind === "side") {
      const [x, y] = at(grillRef.current);
      const words = { perfect: "Perfect cook!", good: "Good", under: "Undercooked", over: "Overdone", burnt: "Burnt!" } as const;
      if (f.done === "perfect") sound("perfect", { gain: 0.6 });
      else sound(f.plated ? "chip" : "bounce");
      if (!f.plated) sound("bounce", { delay: 0.05 });
      juice.pop(words[f.done], x, y, f.done === "perfect" ? "great" : f.done === "good" ? "good" : "miss");
      if (!f.plated) line = "Flipped! Tap again at gold";
    } else if (f.kind === "early") line = "Not yet: wait for the gold zone";
    else if (f.kind === "add") sound("chip", { intensity: 0.6 });
    else if (f.kind === "wrong") {
      sound("ui-error");
      line = f.want ? `The ticket wants ${toppingName(f.want).toLowerCase()}` : "Cook a patty first";
      boardRef.current?.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], {
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
      });
    } else if (f.kind === "serve") {
      const [x, y] = at(boardRef.current);
      sound("score");
      juice.pop(`+${f.points}`, x, y, f.perfect ? "great" : "good");
      juice.haptic("score");
      if (f.perfect) {
        juice.banner(f.combo >= 2 ? `Perfect! Combo ×${f.combo}` : "Perfect!", "great");
        sound("chime", { delay: 0.12 });
      } else if (f.late) line = `${f.name} waited a while: no tip`;
      if (f.rush) {
        saveKitchenTutorialDone();
        line = "That's it! The lunch rush starts now";
      }
    } else if (f.kind === "new") {
      sound("toast");
      line = `New topping: ${toppingName(f.topping)}`;
    } else if (f.kind === "arrive") {
      sound("chime", { gain: 0.5 });
      const o = game.orders.find((x) => x.id === f.id);
      if (o?.flip && !game.orders.some((x) => x !== o && x.flip) && game.made === 3) line = "Flip orders: tap at gold, flip, tap at gold again";
      else if (game.orders.length === 2 && game.made === 5) line = "Two tickets now: start the next patty while you stack";
    }
    if (line) setTip(line);
  }, [game.seq, active]);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 2800);
    return () => clearTimeout(t);
  }, [tip]);

  // The run's end: bests, medals, Daily, the result card.
  useEffect(() => {
    if (!active || game.phase !== "results" || game.last.kind !== "end") return;
    const store = useGame.getState();
    const stars = starsFor(game.score);
    const best = store.recordBest("kitchen.score", game.score);
    store.recordBest("kitchen.stars", stars);
    store.recordBest("kitchen.combo", game.bestCombo);
    const result = { mode: "rush", score: game.score, won: stars >= 1, stats: { stars, served: game.served, perfect: game.perfects, combo: game.bestCombo } };
    reportRun("kitchen", result);
    const day = dayNumber();
    const daily = dailyThree(day).find((t) => t.done({ game: "kitchen", result, day, at: Date.now() }, day))?.label;
    const improved = best.improved && game.score > 0;
    setRecord({ best: improved, stars, daily });
    sound(stars >= 2 ? "win" : "score");
    if (stars === 3) juice.confetti();
  }, [game.phase, active]);

  useEffect(
    () =>
      registerGameQa("kitchen", {
        state: () => {
          const g = latest.current,
            o = grillOrder(g);
          return { phase: g.phase, clock: g.clock, score: g.score, served: g.served, perfects: g.perfects, combo: g.combo, next: nextStep(g), heat: o?.cook === "grill" ? o.heat : null, unlocked: g.unlocked, stars: starsFor(g.score) };
        },
        act: (name, value) => {
          if (name === "grill") dispatch({ type: "grill" });
          else if (name === "add") dispatch({ type: "add", topping: value as Topping });
          else if (name === "tick") dispatch({ type: "tick", dt: Number(value) });
        },
      }),
    [],
  );

  const startKitchen = () => {
    pendingFocus.current = true;
    if (startGameMode("kitchen")) begin();
    else pendingFocus.current = false;
  };
  const hosted = useLauncherHosted("kitchen");
  useLauncher("kitchen", "kitchen", "Play Kitchen", startKitchen, { enabled: !active, hint: "Enter" });
  const focusElement = (node: HTMLButtonElement | null) => {
    if (node && pendingFocus.current) {
      node.focus({ preventScroll: true });
      pendingFocus.current = false;
    }
  };
  useFrame((_, dt) => {
    if (!active || paused || hidden || !gameIsActive() || (game.phase !== "tutorial" && game.phase !== "service")) {
      timer.current = 0;
      return;
    }
    timer.current += Math.min(dt, 0.25);
    if (timer.current >= TICK) {
      dispatch({ type: "tick", dt: timer.current });
      timer.current = 0;
    }
  });
  return (
    <>
      {active && <PapaKitchenScene game={game} />}
      {!hidden && (active || !hosted) && (
        <Html
          onOcclude={screenOverlayNoOcclude}
          portal={portal}
          fullscreen={active}
          center={!active}
          position={active ? [0, GAME_STAGE_Y + 2, 0] : [0, 0.4, 6]}
          zIndexRange={[40, 20]}
          wrapperClass="kr-html"
          calculatePosition={() => (active ? [size.width / 2, size.height / 2] : [size.width - 104, size.height - 76])}
        >
          {active ? (
            <KitchenControls
              game={game}
              act={act}
              paused={paused}
              setPaused={setPaused}
              close={close}
              restart={() => begin(false)}
              skip={skip}
              record={record}
              cursor={cursor}
              tip={tip}
              grillRef={grillRef}
              boardRef={boardRef}
              focusElement={focusElement}
            />
          ) : (
            <button
              className="kr-play"
              ref={focusElement}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") event.stopPropagation();
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                startKitchen();
              }}
            >
              Play Kitchen
            </button>
          )}
        </Html>
      )}
    </>
  );
}
