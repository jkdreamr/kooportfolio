import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { runtime, useGame, walkTo, type Scene } from "../core/store";
import { keys, touch } from "../core/input";
import { sound } from "../core/sound";
import { usePresence, type PresenceState } from "./motion";
import { useGlassMode, useHudReveal } from "./hudStage";
import { FirstSteps, useHintLearning, useHints } from "./FirstSteps";
import { DoorTransition } from "./DoorTransition";
import { useStage } from "../../stage/contract";
import {
  catchBoosted,
  catchReady,
  CATCH_WINDOW_START,
  dailySeed,
} from "../core/rowing";
import { useRaceCatch, useRaceHud } from "../scenes/Rowing";
import { CourtControls, useBasketHud } from "../scenes/Basketball";
import { Icon } from "./Icon";
import { destinationsInWorld, doors, isInterior } from "../core/world";
import { WORLDS } from "../core/worlds";
import { profile } from "../../content/profile";
import { WorldLabels } from "../world/Labels";
import { roomFor } from "../core/room";
import { useGameMode } from "../core/gameMode";
import { SKATE_EXIT } from "../core/skate";
import { RoomStory } from "./RoomStory";
import { exitWalkStarted, requestExit, useExitIntent } from "../core/doorway";
import { usePresented } from "../engine/presented";
import { startIdlePrewarm } from "../engine/prewarm";
import type { PlaceId } from "../core/world";
import { npcName } from "../core/npcState";
import { TravelMap } from "./TravelMap";

/** Knob travel in px from the centre of the 100px pad. */
const STICK_TRAVEL = 30;
/** Fraction of travel ignored around the centre so a resting thumb is still. */
const STICK_DEAD_ZONE = 0.12;
export function Joystick() {
  const pad = useRef<HTMLDivElement>(null),
    knob = useRef<HTMLSpanElement>(null),
    [active, setActive] = useState(false);
  // Written straight to the DOM: a React render per pointermove made the
  // knob trail the thumb on slower phones.
  const place = (x: number, z: number, magnitude: number) => {
    knob.current?.style.setProperty(
      "transform",
      `translate(${x * STICK_TRAVEL}px,${z * STICK_TRAVEL}px)`,
    );
    pad.current?.style.setProperty("--stick-angle", `${Math.atan2(x, -z)}rad`);
    pad.current?.style.setProperty("--stick-push", magnitude.toFixed(3));
  };
  const reset = () => {
    touch.x = 0;
    touch.z = 0;
    place(0, 0, 0);
    setActive(false);
  };
  const steer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = pad.current!.getBoundingClientRect(),
      x = (e.clientX - r.left - r.width / 2) / (STICK_TRAVEL + 5),
      z = (e.clientY - r.top - r.height / 2) / (STICK_TRAVEL + 5),
      length = Math.hypot(x, z),
      m = Math.max(1, length),
      ux = x / m,
      uz = z / m,
      reach = Math.min(1, length),
      // Re-scale past the dead zone so output still spans 0..1 smoothly.
      push = reach < STICK_DEAD_ZONE ? 0 : (reach - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE),
      scale = reach > 0 ? push / reach : 0;
    touch.x = ux * scale;
    touch.z = uz * scale;
    place(ux, uz, push);
  };
  return (
    <div
      className={`joystick${active ? " is-active" : ""}`}
      ref={pad}
      aria-label="Touch movement joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        steer(e);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        steer(e);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <b aria-hidden="true" />
      <span ref={knob} />
    </div>
  );
}
function RaceCatch() {
  const race = useRaceCatch();
  const ready = catchReady(race);
  const boosted = catchBoosted(race);
  return (
    <div className="race-catch">
      <div className="race-catch-track" aria-hidden="true">
        <i style={{ left: `${CATCH_WINDOW_START * 100}%` }} />
        <b style={{ left: `${race.stroke * 100}%` }} />
      </div>
      <button
        type="button"
        data-ready={ready}
        data-boosted={boosted}
        disabled={race.time <= 0 || race.finished}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          runtime.raceCatch = true;
        }}
        onClick={(event) => {
          if (event.detail === 0) runtime.raceCatch = true;
        }}
      >
        {ready ? "Catch now" : boosted ? "Good catch" : "Catch"}
      </button>
    </div>
  );
}

export function RaceHud() {
  const { race } = useRaceHud();
  const pointers = useRef(new Map<number, "left" | "right" | "burst">());
  const [held, setHeld] = useState<string[]>([]);
  const updateTouch = () => {
    const values = [...pointers.current.values()];
    runtime.steer =
      Number(values.includes("right")) - Number(values.includes("left"));
    runtime.burst = values.includes("burst");
    setHeld(values);
  };
  const touchButton = (control: "left" | "right" | "burst") => ({
    "data-held": held.includes(control),
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, control);
      updateTouch();
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
    onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
  });
  useEffect(
    () => () => {
      runtime.steer = 0;
      runtime.burst = false;
      runtime.raceCatch = false;
    },
    [],
  );
  return (
    <>
      <div className="challenge-heading">
        <h1>Regatta</h1>
        <p className="keyboard-hint">
          A / D steer · 1 / 2 / 3 pace · R to catch · hold Space to burst
        </p>
        <p className="touch-hint">Tap Catch in green · hold Burst</p>
      </div>
      <div className="race-progress">
        <div
          style={{ width: `${(race.distance / runtime.raceLength) * 100}%` }}
        />
        <span>Start</span>
        <span>
          {Math.floor(race.distance)} / {runtime.raceLength} m
        </span>
        <span>Finish</span>
      </div>
      {race.time < 0 && (
        <div className="countdown">
          <span>{Math.ceil(-race.time)}</span>
          <small>Ready</small>
        </div>
      )}
      <div className="race-instruments">
        <div>
          <small>Speed</small>
          <strong>
            {race.speed.toFixed(1)}
            <em> m/s</em>
          </strong>
        </div>
      </div>
      <div className="race-control-panel">
        <div className="stamina-label">
          <span>Crew energy</span>
          <b>{Math.round(race.stamina)}%</b>
        </div>
        <div className="energy-track">
          <i style={{ width: `${race.stamina}%` }} />
        </div>
        <div className="cadence-switch">
          {[
            [24, "Settle"],
            [30, "Rhythm"],
            [36, "Push"],
          ].map(([n, label]) => (
            <button
              className={runtime.raceCadence === n ? "selected" : ""}
              key={n}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                runtime.raceCadence = Number(n);
              }}
            >
              <small>{n} SPM</small>
              {label}
            </button>
          ))}
        </div>
        <RaceCatch />
        <p>
          {race.bank
            ? "Stay inside the buoys."
            : race.stamina < 20
              ? "Low energy. Settle."
              : "Stay in the pale current."}
        </p>
      </div>
      <div className="race-touch">
        <button aria-label="Steer left" {...touchButton("left")}>
          ←
        </button>
        <button className="burst" {...touchButton("burst")}>
          Burst
        </button>
        <button aria-label="Steer right" {...touchButton("right")}>
          →
        </button>
      </div>
    </>
  );
}
export function BasketHud() {
  const hud = useBasketHud();
  return (
    <>
      <div className="challenge-heading">
        <h1>Court</h1>
        <p className="touch-hint">Drag to move · hold & release to shoot</p>
      </div>
      <p className="court-keyboard-hint keyboard-hint">
        WASD move · Hold Space to charge, release to shoot · Q / E aim
      </p>
      <div className="basket-score">
        <div>
          <small>Time</small>
          <strong>
            {Math.ceil(hud.time)}
            <em>s</em>
          </strong>
        </div>
      </div>
      <div className="shot-feedback" aria-live="polite">
        {hud.feedback}
      </div>
      <div className="shot-panel">
        <div className="stamina-label">
          <span>{hud.holding ? "Shot power" : "Rebound"}</span>
          <span>{hud.holding ? "Hold & release" : "Next ball soon"}</span>
        </div>
        <div className="power-track">
          <i style={{ width: `${hud.charge * 100}%` }} />
          <b />
        </div>
        <p className="shot-instruction">Release in gold. Closer is easier.</p>
        <label className="aim-label">
          Aim{" "}
          <input
            aria-label="Adjust shot aim"
            type="range"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={runtime.aim}
            onChange={(e) => {
              const a = Number(e.target.value);
              runtime.aim = a;
            }}
          />
          <button
            onClick={() => {
              runtime.aim = 0;
            }}
          >
            Recenter
          </button>
        </label>
        <button
          className="shoot-button"
          disabled={!hud.holding}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            runtime.shooting = true;
          }}
          onPointerUp={() => {
            runtime.shooting = false;
            runtime.shoot = true;
          }}
          onPointerCancel={() => {
            runtime.shooting = false;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.repeat) runtime.shooting = true;
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter") {
              runtime.shooting = false;
              runtime.shoot = true;
            }
          }}
        >
          Hold & release <Icon name="ball" size={18} />
        </button>
      </div>
      <Joystick />
    </>
  );
}
const PresencePhase = createContext<PresenceState>("enter");
/** Keeps a panel mounted for its exit, replaying its last content. */
function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const { mounted, phase } = usePresence(show);
  const latched = useRef<ReactNode>(null);
  if (show) latched.current = children;
  if (!mounted) return null;
  return (
    <PresencePhase.Provider value={phase}>
      {show ? children : latched.current}
    </PresencePhase.Provider>
  );
}
function Modal({
  title,
  eyebrow,
  children,
  close,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useContext(PresencePhase);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = ref.current?.querySelectorAll<HTMLElement>(
        "button,a,input,select",
      );
      if (!els?.length) return;
      const first = els[0],
        last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div className="modal-scrim" data-phase={phase} inert={phase === "exit"}>
      <div
        className="game-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onKeyDown={(event) => {
          if (event.key === " ") event.stopPropagation();
        }}
      >
        <button
          className="close-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <Icon name="close" />
        </button>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
/**
 * Visual quality is a preference for the next visit, not a live switch:
 * changing tier at runtime would recompile every shader mid-session (the one
 * hitch the engine is built to avoid). The engine reads "stage-tier" once,
 * when it picks the tier during warmup; "Auto" lets it detect.
 */
const QUALITY_KEY = "stage-tier";
const QUALITY_STEPS = ["auto", "high", "medium", "low"] as const;
type QualityChoice = (typeof QUALITY_STEPS)[number];
const QUALITY_NAMES: Record<QualityChoice, string> = {
  auto: "Automatic",
  high: "Full detail",
  medium: "Balanced",
  low: "Low power",
};
function readQuality(): QualityChoice {
  try {
    const stored = localStorage.getItem(QUALITY_KEY);
    return (QUALITY_STEPS as readonly string[]).includes(stored ?? "")
      ? (stored as QualityChoice)
      : "auto";
  } catch {
    return "auto";
  }
}
function QualitySetting() {
  const tier = useStage((s) => s.tier);
  const [loaded] = useState(readQuality);
  const [choice, setChoice] = useState(readQuality);
  const pending = choice !== loaded;
  return (
    <>
      <button
        className="setting-row"
        aria-describedby={pending ? "quality-pending" : undefined}
        onClick={() => {
          const next =
            QUALITY_STEPS[(QUALITY_STEPS.indexOf(choice) + 1) % QUALITY_STEPS.length];
          setChoice(next);
          try {
            if (next === "auto") localStorage.removeItem(QUALITY_KEY);
            else localStorage.setItem(QUALITY_KEY, next);
          } catch {
            /* Storage blocked: the choice lasts only for this panel. */
          }
        }}
      >
        <span>Visual quality</span>
        <b>
          {QUALITY_NAMES[choice]}
          {choice === "auto" && tier && !pending
            ? ` · ${QUALITY_NAMES[tier]}`
            : ""}
        </b>
      </button>
      {pending && (
        <p className="setting-pending" id="quality-pending" role="status">
          Applies the next time the village opens.{" "}
          <button type="button" onClick={() => location.reload()}>
            Reload now
          </button>
        </p>
      )}
    </>
  );
}
function Toast({ notice }: { notice: string }) {
  const phase = useContext(PresencePhase);
  return (
    <div className="game-toast" role="status" data-phase={phase}>
      {notice}
      <button
        aria-label="Dismiss notification"
        onClick={() => useGame.setState({ notice: "" })}
      >
        ×
      </button>
    </div>
  );
}
/** First focusable, visible control of the room's own UI (its "Play …"
 * launcher). Room panels render through drei <Html> into the canvas
 * container, which precedes the HUD in the DOM. */
function roomPrimary(shell: Element) {
  for (const button of shell.querySelectorAll<HTMLElement>(
    ".stage-canvas button:not([disabled])",
  ))
    if (
      button.getClientRects().length > 0 &&
      !button.closest('[hidden], [inert], [aria-hidden="true"]')
    )
      return button;
  return null;
}
/** The element the room Tab order last moved focus to (see useSceneFocus). */
let tabSpine: Element | null = null;
/**
 * Keyboard-only reliability across scene changes:
 * - `data-scene-ready="<scene>"` on `.game-shell` once the requested scene is
 *   on screen and the HUD is interactive (tests wait on it, not on timers);
 * - entering a room focuses its heading, returning outside focuses the shell,
 *   so Tab never restarts from the top of the page after the HUD remounts;
 * - inside a room, Tab runs Exit → the room's "Play …" → the story card.
 *   Room panels live in the canvas container before the HUD, so that order
 *   cannot come from the DOM alone.
 */
function useSceneFocus(hudShown: boolean) {
  const presented = usePresented((s) => s.scene);
  const scene = useGame((s) => s.scene);
  const ready = hudShown && presented === scene;
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".game-shell");
    if (!shell) return;
    if (ready) shell.dataset.sceneReady = presented;
    else delete shell.dataset.sceneReady;
  }, [ready, presented]);
  useEffect(
    () => () => {
      const shell = document.querySelector<HTMLElement>(".game-shell");
      if (shell) delete shell.dataset.sceneReady;
    },
    [],
  );
  const focused = useRef(presented);
  useEffect(() => {
    if (!ready || focused.current === presented) return;
    focused.current = presented;
    const frame = requestAnimationFrame(() => {
      const shell = document.querySelector<HTMLElement>(".game-shell");
      if (!shell) return;
      const active = document.activeElement;
      // Never steal focus a room's own UI or a text field took for itself.
      if (
        active &&
        active !== document.body &&
        active.isConnected &&
        (!shell.contains(active) ||
          active.closest(".stage-canvas, input, textarea, select, dialog, .modal-scrim"))
      )
        return;
      tabSpine = null;
      if (presented === "hub") {
        if (!shell.hasAttribute("tabindex")) shell.tabIndex = -1;
        shell.focus({ preventScroll: true });
      } else
        shell
          .querySelector<HTMLElement>(".interior-title")
          ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, presented]);
  useEffect(() => {
    const tab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      const g = useGame.getState();
      if (
        !isInterior(g.scene) ||
        usePresented.getState().scene !== g.scene ||
        g.overlayLocked ||
        g.paused ||
        g.panel !== "none"
      )
        return;
      const shell = document.querySelector<HTMLElement>(".game-shell");
      if (!shell) return;
      const exit = shell.querySelector<HTMLElement>(".back-link");
      const heading = shell.querySelector(".interior-title");
      const play = roomPrimary(shell);
      const story = shell.querySelector<HTMLElement>(
        ".room-story:not([hidden]) button",
      );
      const active = document.activeElement;
      let next: HTMLElement | null = null;
      if (!e.shiftKey) {
        if (!active || active === document.body || active === shell || active === heading)
          next = exit;
        else if (active === exit) next = play;
        else if (active === play && tabSpine === play) next = story;
      } else if (active === play && tabSpine === play) next = exit;
      else if (active === story && tabSpine === story) next = play;
      if (!next) return;
      e.preventDefault();
      tabSpine = next;
      next.focus();
    };
    window.addEventListener("keydown", tab, true);
    return () => window.removeEventListener("keydown", tab, true);
  }, []);
}
export function Hud({ interact }: { interact: () => void }) {
  const pendingExit = useRef<Scene | null>(null);
  const gameMode = useGameMode((s) => s.active?.id);
  const hudMotion = useHudReveal();
  const glass = useGlassMode();
  const hints = useHints();
  useHintLearning();
  // The shell carries the HUD's motion and glass state so siblings outside
  // .game-ui (zoom + time card, NPC dialog, scene panes) follow it too.
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".game-shell");
    if (!shell) return;
    shell.dataset.hudMotion = hudMotion;
    shell.dataset.glass = glass;
  }, [hudMotion, glass]);
  useEffect(
    () => () => {
      const shell = document.querySelector<HTMLElement>(".game-shell");
      if (!shell) return;
      delete shell.dataset.hudMotion;
      delete shell.dataset.glass;
    },
    [],
  );
  useEffect(() => {
    const shell = document.querySelector(".game-shell");
    if (!shell) return;
    const sync = () => {
      const overlayLocked = !!shell.querySelector(
        '[data-interior-game-open="true"], .go-card-open, .writing-modal, .theater-dialog',
      );
      if (overlayLocked === useGame.getState().overlayLocked) return;
      keys.clear();
      touch.x = touch.z = 0;
      runtime.path = [];
      runtime.target = null;
      runtime.moving = false;
      useGame.setState({ overlayLocked });
    };
    const observer = new MutationObserver(sync);
    observer.observe(shell, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-interior-game-open"],
    });
    sync();
    return () => {
      observer.disconnect();
      useGame.setState({ overlayLocked: false });
    };
  }, []);
  // Idle shader prewarm for rooms and game stages (by proxy, never mounted).
  useEffect(() => startIdlePrewarm(), []);
  const g = useGame();
  const leaving = useExitIntent(g.scene);
  useSceneFocus(hudMotion !== "hidden");
  useEffect(() => {
    if (pendingExit.current && pendingExit.current !== g.scene)
      pendingExit.current = null;
    if (!g.overlayLocked && pendingExit.current === g.scene) {
      const frame = requestAnimationFrame(() => {
        const exit =
          g.scene === "skate" ? SKATE_EXIT : [0, roomFor(g.scene).doorZ];
        walkTo(exit[0], exit[1]);
        exitWalkStarted();
        pendingExit.current = null;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [g.overlayLocked, g.scene]);
  const hub = g.scene === "hub",
    interior = isInterior(g.scene),
    game = g.scene === "rowing" || g.scene === "basketball";
  const closePanel = () => useGame.setState({ panel: "none" });
  // A quiet glass tick when a panel opens or closes (silent while muted).
  const lastPanel = useRef(g.panel);
  useEffect(() => {
    const from = lastPanel.current;
    lastPanel.current = g.panel;
    if (from === g.panel || g.panel === "npc" || from === "npc") return;
    if (from === "none") sound("open");
    else if (g.panel === "none") sound("close");
  }, [g.panel]);
  const nearDoor =
    hub && !!g.near && doors.some((door) => door.id === g.near);
  useEffect(() => {
    if (
      !g.notice ||
      g.notice.includes("Another tab") ||
      g.notice.includes("storage") ||
      g.notice.includes("saved file")
    )
      return;
    const t = setTimeout(() => useGame.setState({ notice: "" }), 6000);
    return () => clearTimeout(t);
  }, [g.notice]);
  return (
    <div
      className={`game-ui scene-${g.scene} world-${g.world}${g.traveling ? " is-traveling" : ""}${g.paused ? " is-paused" : ""}`}
      data-game-mode={gameMode}
      data-hud-motion={hudMotion}
      inert={hudMotion === "hidden"}
      aria-hidden={hudMotion === "hidden" || undefined}
    >
      <DoorTransition />
      <header className="game-header">
        <a className="game-brand" href="/">
          <div>
            <b>
              JOSHUA<span>.EXE</span>
            </b>
          </div>
        </a>
        <div className="resources">
          <button
            className="icon-button"
            aria-label={g.muted ? "Unmute sound" : "Mute sound"}
            onClick={() => useGame.setState({ muted: !g.muted })}
          >
            <Icon name={g.muted ? "muted" : "sound"} />
          </button>
          <button
            className="icon-button"
            aria-label="Pause game"
            onClick={() => useGame.setState({ paused: true })}
          >
            <Icon name="pause" />
          </button>
        </div>
      </header>
      {hub && <WorldLabels />}
      {hub && <span className="world-name">{WORLDS[g.world].name}</span>}
      {interior && (
        <div className="interior-intro">
          <div className="interior-heading">
            {/* The heading takes focus on entry (tabIndex -1); the Exit
                button still reads first visually (CSS order). */}
            <h1 tabIndex={-1} className="interior-title">
              {g.scene === "secret"
                ? "Hoover vault"
                : doors.find((door) => door.id === g.scene)?.name}
            </h1>
            <button
              className={`back-link${!hints.exited ? " is-coached" : ""}${leaving ? " is-leaving" : ""}`}
              onClick={() => {
                keys.clear();
                touch.x = touch.z = 0;
                pendingExit.current = g.scene;
                // One step: walk to the mat and leave on arrival (no E).
                requestExit(g.scene);
                window.dispatchEvent(new Event("interior-game-close"));
                if (!useGame.getState().overlayLocked) {
                  const exit =
                    g.scene === "skate"
                      ? SKATE_EXIT
                      : [0, roomFor(g.scene).doorZ];
                  walkTo(exit[0], exit[1]);
                  exitWalkStarted();
                  pendingExit.current = null;
                }
              }}
            >
              <span aria-live="polite">{leaving ? "Leaving…" : "← Exit"}</span>
            </button>
          </div>
          <RoomStory
            key={g.scene}
            scene={g.scene as PlaceId}
            hidden={g.paused || g.panel !== "none" || g.near === "exit"}
          />
        </div>
      )}
      {g.scene === "rowing" && <RaceHud />}
      {g.scene === "basketball" && (
        <>
          <BasketHud />
          <CourtControls />
          <RoomStory
            scene="basketball"
            hidden={g.paused || g.panel !== "none"}
          />
        </>
      )}
      {(hub || interior) &&
        g.panel !== "npc" &&
        !g.overlayLocked && (
          <>
            <div
              className={`context-action ${g.scene === "stadium" ? "context-action--stadium" : ""} ${g.near ? "visible" : ""}${nearDoor ? " is-door" : ""}${nearDoor && !hints.entered ? " is-coached" : ""}`}
              data-action={g.near ?? undefined}
              style={{ zIndex: 20 }}
            >
              <div>
                <strong>
                  {g.near === "hoover-key"
                    ? "Small key"
                    : g.near === "hoover-door"
                      ? "Hoover Tower"
                      : g.near === "stash"
                        ? "Stash"
                        : g.near === "photo"
                          ? "Photo booth"
                          : g.near === "stargazing"
                            ? "Telescope"
                            : g.near === "exit"
                              ? "Exit"
                              : g.near === "race"
                                ? "Coxswain Regatta"
                                : g.near === "read"
                                  ? "Meet Joshua"
                                  : g.near === "desk"
                                    ? "Desk"
                                    : g.near === "lift"
                                      ? "Bench press"
                                      : g.near === "npc"
                                        ? npcName()
                                        : doors.find((d) => d.id === g.near)
                                            ?.name}
                </strong>
              </div>
              <button
                key={g.near ?? "none"}
                onClick={interact}
                onPointerDown={(event) => {
                  if (g.near === "photo") event.stopPropagation();
                }}
                onKeyDown={(event) => {
                  if (
                    (g.near === "stargazing" || g.near === "photo") &&
                    event.key === " "
                  )
                    event.stopPropagation();
                }}
              >
                <kbd>E</kbd>
                {g.near === "hoover-key"
                  ? "Take"
                  : g.near === "hoover-door"
                    ? "Unlock"
                    : g.near === "stash"
                      ? "Collect"
                      : g.near === "photo"
                        ? "Photo"
                        : g.near === "stargazing"
                          ? "Look"
                          : g.near === "exit"
                            ? "Exit"
                            : g.near === "race"
                              ? "Race"
                              : g.near === "read"
                                ? "Read"
                                : g.near === "desk"
                                  ? "Open"
                                  : g.near === "lift"
                                    ? "Play"
                                    : g.near === "npc"
                                      ? "Talk"
                                      : "Enter"}{" "}
                <Icon name="arrow" size={17} />
              </button>
            </div>
            {g.panel === "none" && !g.overlayLocked && !g.traveling && (
              <Joystick />
            )}
            {hub && (
              <FirstSteps
                active={
                  hudMotion === "shown" &&
                  g.panel === "none" &&
                  !g.paused &&
                  !g.traveling &&
                  !g.notice &&
                  !g.near
                }
              />
            )}
          </>
        )}
      {interior && g.scene === "boathouse" && g.near === "race" && (
        <div className="race-select">
          <button
            onClick={() => {
              runtime.raceLength = 360;
              runtime.raceSeed = 1;
              runtime.raceMode = "sprint";
              g.go("rowing");
            }}
          >
            <b>Sprint</b>
            <span>360 m · about 40 sec →</span>
          </button>
          <button
            onClick={() => {
              runtime.raceLength = 750;
              runtime.raceSeed = 2;
              runtime.raceMode = "regatta";
              g.go("rowing");
            }}
          >
            <b>Regatta</b>
            <span>750 m · about 80 sec →</span>
          </button>
          <button
            onClick={() => {
              runtime.raceLength = 750;
              runtime.raceSeed = dailySeed();
              runtime.raceMode = "daily";
              g.go("rowing");
            }}
          >
            <b>Daily river</b>
            <span>Same UTC daily seed · unranked →</span>
          </button>
        </div>
      )}
      {hub && (
        <nav className="world-toolbar" aria-label="World tools">
          {[
            ["travel", "Travel", () => useGame.setState({ panel: "travel" })],
            ["home", "Places", () => useGame.setState({ panel: "places" })],
            ["avatar", "You", () => useGame.setState({ panel: "avatar" })],
            [
              "memories",
              "Memories",
              () => useGame.setState({ panel: "memories" }),
            ],
            [
              "settings",
              "Settings",
              () => useGame.setState({ panel: "settings" }),
            ],
          ].map(([icon, label, action]) => (
            <button
              key={String(label)}
              className={
                g.panel === icon || (icon === "home" && g.panel === "places")
                  ? "active"
                  : ""
              }
              onClick={action as () => void}
            >
              <Icon name={String(icon)} size={21} />
              <span>{String(label)}</span>
            </button>
          ))}
          <a href="/work">
            <Icon name="back" size={20} />
            <span>Portfolio</span>
          </a>
        </nav>
      )}
      <div className="game-footer">
        <span>
          <i /> Saved locally
        </span>
        <button onClick={() => useGame.setState({ panel: "help" })}>
          <Icon name="help" size={15} />
          <span className="keyboard-hint">
            {game ? "Controls" : "WASD / E"}
          </span>
          <span className="touch-hint">Controls</span>
        </button>
      </div>
      <Presence show={!!g.notice}>
        <Toast notice={g.notice} />
      </Presence>
      <Presence show={g.panel === "avatar"}>
        <Modal eyebrow="" title="Your character" close={closePanel}>
          <div className="color-swatches">
            {[
              "#6f8670",
              "#b6745b",
              "#698e9a",
              "#c7a45f",
              "#8b7a99",
              "#414b53",
            ].map((c) => (
              <button
                key={c}
                style={{ background: c }}
                aria-label={`Wear ${c}`}
                aria-pressed={g.save.color === c}
                onClick={() => g.customize(c, g.save.hat)}
              >
                {g.save.color === c && <Icon name="check" />}
              </button>
            ))}
          </div>
          <button
            className="setting-row"
            onClick={() => g.customize(g.save.color, !g.save.hat)}
          >
            <span>Cap</span>
            <b>{g.save.hat ? "On" : "Off"}</b>
          </button>
          <button className="primary-button" onClick={closePanel}>
            Done
          </button>
        </Modal>
      </Presence>
      <Presence show={g.panel === "memories"}>
        <Modal eyebrow="" title="Joshua" close={closePanel}>
          <div className="memory-card">
            <Icon name="oar" size={28} />
            <div>
              <b>Coxswain</b>
            </div>
          </div>
          <div className="memory-card">
            <Icon name="memories" size={28} />
            <div>
              <b>Stanford CS + math</b>
            </div>
          </div>
        </Modal>
      </Presence>
      <Presence show={g.panel === "settings"}>
        <Modal eyebrow="" title="Settings" close={closePanel}>
          <button
            className="setting-row"
            onClick={() => useGame.setState({ muted: !g.muted })}
          >
            <span>Sound</span>
            <b>{g.muted ? "Off" : "On"}</b>
          </button>
          <QualitySetting />
          <p className="local-note">
            Saved in this browser only. Back up your save to keep a copy.
          </p>
          <button
            className="setting-row"
            onClick={() => {
              const data = new Blob([JSON.stringify(g.save, null, 2)], {
                  type: "application/json",
                }),
                url = URL.createObjectURL(data),
                a = document.createElement("a");
              a.href = url;
              a.download = "joshua-exe-save.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <span>Back up your local save</span>
            <span>↓</span>
          </button>
          <a className="setting-row" href="/">
            Replay the portfolio intro <span>↗</span>
          </a>
        </Modal>
      </Presence>
      <Presence show={g.panel === "help"}>
        <Modal eyebrow="" title="Controls" close={closePanel}>
          <div className="help-grid">
            <b>Walk</b>
            <p>
              <span className="keyboard-hint">
                <span className="keycaps">
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd>
                </span>{" "}
                or arrows, or click the ground. Hold <kbd>Shift</kbd> to
                sprint.
              </span>
              <span className="touch-hint">
                Drag the round stick or tap the ground.
              </span>{" "}
              Choose a building label to walk there.
            </p>
            <b>Doors</b>
            <p>
              Walk up to a door and{" "}
              <span className="keyboard-hint">
                press <kbd>E</kbd> or{" "}
              </span>
              tap Enter. To leave, use Exit: you walk to the door and step
              outside. Or walk back onto the door mat and{" "}
              <span className="keyboard-hint">
                press <kbd>E</kbd> or{" "}
              </span>
              tap Exit.
            </p>
            <b>Menus</b>
            <p>
              <span className="keyboard-hint">
                <kbd>Esc</kbd> closes a panel or pauses.{" "}
              </span>
              The bar at the bottom holds travel, places and settings.
            </p>
            <b>Row</b>
            <p>
              <span className="keyboard-hint">
                <span className="nowrap">
                  <kbd>A</kbd>/<kbd>D</kbd> steer,
                </span>{" "}
                <kbd>1</kbd>
                <kbd>2</kbd>
                <kbd>3</kbd> pace, <kbd>R</kbd> catch, <kbd>Space</kbd>{" "}
                burst.{" "}
              </span>
              <span className="touch-hint">
                Hold arrows to steer and Burst to sprint. Tap a pace or
                Catch.{" "}
              </span>
              Catch in the green for a boost. Sprinting drains energy.
            </p>
            <b>Shoot</b>
            <p>
              <span className="keyboard-hint">
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> move, hold <kbd>Space</kbd> to charge,{" "}
                <span className="nowrap">
                  <kbd>Q</kbd>/<kbd>E</kbd> aim.
                </span>{" "}
              </span>
              <span className="touch-hint">
                Drag the stick. Hold Shoot; slide to aim.{" "}
              </span>
              Release in the gold. Chase rebounds or wait for a new ball.
            </p>
            <b>Explore</b>
            <p>
              Wander the worlds, try the games and find what is tucked away.
              Progress is saved in this browser.
            </p>
          </div>
        </Modal>
      </Presence>
      <Presence show={g.panel === "travel"}>
        <Modal title="Travel" close={closePanel}>
          <TravelMap
            world={g.world}
            onChoose={(destination) => {
              keys.clear();
              touch.x = touch.z = 0;
              runtime.path = [];
              runtime.target = null;
              useGame.setState({ panel: "none", travelRequest: destination });
            }}
          />
        </Modal>
      </Presence>
      <Presence show={g.panel === "places"}>
        <Modal title="Places" close={closePanel}>
          <nav className="places-list" aria-label="Walk to a place">
            {destinationsInWorld(g.world).map((door) => (
              <button
                key={door.id}
                onClick={() => {
                  closePanel();
                  if (g.scene !== "hub") g.go("hub");
                  walkTo(door.x, door.z);
                }}
              >
                <span>{door.name}</span>
                <Icon name="arrow" size={18} />
              </button>
            ))}
          </nav>
        </Modal>
      </Presence>
      <Presence show={g.panel === "desk"}>
        <Modal title="Desk" close={closePanel}>
          <div className="study-links">
            <a
              href="https://github.com/jkdreamr"
              target="_blank"
              rel="noreferrer"
            >
              GitHub <span>↗</span>
            </a>
            <a href="/work" target="_blank" rel="noreferrer">
              Work <span>↗</span>
            </a>
          </div>
        </Modal>
      </Presence>
      <Presence show={g.panel === "profile"}>
        <Modal eyebrow="" title="Joshua Koo" close={closePanel}>
          <p>{profile.bio}</p>
          <div className="study-links">
            {profile.socials.map(([name, url]) => (
              <a key={name} href={url} target="_blank" rel="noreferrer">
                {name}
                <span>↗</span>
              </a>
            ))}
            <a href={`mailto:${profile.email}`}>
              {profile.email}
              <span>↗</span>
            </a>
          </div>
        </Modal>
      </Presence>
      <Presence show={g.paused}>
        <Modal
          eyebrow=""
          title="Paused"
          close={() => useGame.setState({ paused: false })}
        >
          <button
            className="primary-button"
            onClick={() => useGame.setState({ paused: false })}
          >
            Keep playing <Icon name="arrow" size={17} />
          </button>
          {!hub && (
            <button className="quiet-button" onClick={() => g.go("hub")}>
              Return to village
            </button>
          )}
          <a className="quiet-button" href="/">
            Back to portfolio
          </a>
        </Modal>
      </Presence>
      <Presence show={!!g.result}>
        <Modal
          title={g.result?.title ?? ""}
          close={() => g.go(g.scene === "rowing" ? "boathouse" : "hub")}
        >
          <p className="result-detail">{g.result?.detail}</p>
          <button
            className="primary-button"
            onClick={() => {
              runtime.aim = 0;
              runtime.raceCadence = 30;
              g.go(g.scene as Scene);
            }}
          >
            Play again <Icon name="arrow" size={17} />
          </button>
          <button
            className="quiet-button"
            onClick={() => g.go(g.scene === "rowing" ? "boathouse" : "hub")}
          >
            {g.scene === "rowing"
              ? "Back to the boathouse"
              : "Back to the village"}
          </button>
        </Modal>
      </Presence>
    </div>
  );
}
