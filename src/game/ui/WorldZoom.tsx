import { useEffect, useState } from "react";
import { gameInputEnabled, useStage } from "../../stage/contract";
import { useThree } from "@react-three/fiber";
import { runtime, useGame } from "../core/store";
import { useGameMode } from "../core/gameMode";
import {
  MAX_EXPLORE_DISTANCE,
  MAX_WORLD_ZOOM,
  MIN_EXPLORE_DISTANCE,
  MIN_WORLD_ZOOM,
  dollyExplore,
  useWorldView,
  zoomWorld,
  fitIsland,
  orbitDrag,
  orbitGrab,
  orbitHome,
  orbitRelease,
  setView,
  toggleView,
} from "../core/worldView";
import "./world-zoom.css";

function canZoom() {
  const state = useGame.getState();
  return (
    state.scene === "hub" &&
    !state.paused &&
    !state.traveling &&
    !state.overlayLocked &&
    state.panel === "none" &&
    !useGameMode.getState().active
  );
}

/** Wheel, pinch and ± act on the current view: diorama zoom, or the
 * explore boom (each view keeps its own). */
function zoomView(factor: number) {
  if (useWorldView.getState().view === "explore") dollyExplore(factor);
  else zoomWorld(factor);
}

/** "Whole island": always the diorama overview at zoom 1. */
function wholeIsland() {
  setView("diorama");
  fitIsland();
  orbitHome(
    typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input,textarea,select"));

/** Village view (not walk view) with the world taking input: drags turn it. */
function canOrbit() {
  return (
    canZoom() &&
    useWorldView.getState().view === "diorama" &&
    gameInputEnabled(useStage.getState())
  );
}

/** CSS pixels a press may wander and still count as a tap. */
const TAP_SLOP = { mouse: 6, touch: 10 } as const;
const reducedMotion =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;
/** Presses re-sent to the scene after they turned out to be taps. */
const replayed = new WeakSet<Event>();

/** Native input is scoped to the canvas; menus keep ordinary scrolling.
 *
 * In the village view a press on the canvas is held back from the scene
 * (whose tap-to-walk and tap-to-use fire on pointerdown) until it is known:
 * released within TAP_SLOP it is replayed as the original press, so taps
 * behave as before; moved further it turns the view (yaw with inertia, a
 * little pitch) and the scene never sees it. */
export function WorldZoomInput() {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const touches = new Map<number, { x: number; y: number }>();
    let previousDistance = 0;
    // The held press (one at a time; a second finger turns it into a pinch).
    const press = {
      id: -1,
      dragging: false,
      x: 0,
      y: 0,
      lastX: 0,
      lastY: 0,
      lastT: 0,
      init: null as PointerEventInit | null,
    };
    let swallowClick = false;
    const drop = () => {
      press.id = -1;
      press.init = null;
      if (press.dragging) orbitRelease(true);
      press.dragging = false;
      canvas.style.cursor = "";
    };
    const wheel = (event: WheelEvent) => {
      if (!canZoom()) return;
      event.preventDefault();
      const pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? canvas.clientHeight
            : 1);
      zoomView(Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.003));
    };
    const down = (event: PointerEvent) => {
      if (replayed.has(event)) return;
      swallowClick = false;
      if (event.pointerType === "touch" && canZoom()) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        previousDistance = 0;
        if (touches.size > 1) {
          event.stopPropagation();
          runtime.target = null;
          runtime.path = [];
          // A pinch, not a tap or a turn.
          drop();
          return;
        }
      }
      if (
        press.id !== -1 ||
        !event.isPrimary ||
        event.button !== 0 ||
        !canOrbit()
      )
        return;
      // Hold the press back from the scene until it is a tap or a drag.
      event.stopPropagation();
      press.id = event.pointerId;
      press.dragging = false;
      press.x = press.lastX = event.clientX;
      press.y = press.lastY = event.clientY;
      press.lastT = event.timeStamp;
      press.init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: true,
        button: 0,
        buttons: 1,
        width: event.width,
        height: event.height,
        pressure: event.pressure,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      };
    };
    const move = (event: PointerEvent) => {
      if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2 && canZoom()) {
          const [a, b] = [...touches.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (previousDistance > 0) zoomView(distance / previousDistance);
          previousDistance = distance;
        }
      }
      if (event.pointerId !== press.id) return;
      if (!canOrbit()) {
        drop();
        return;
      }
      if (!press.dragging) {
        const slop = event.pointerType === "touch" ? TAP_SLOP.touch : TAP_SLOP.mouse;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= slop)
          return;
        press.dragging = true;
        canvas.style.cursor = "grabbing";
        orbitGrab();
      }
      orbitDrag(
        event.clientX - press.lastX,
        event.clientY - press.lastY,
        Math.max(0, (event.timeStamp - press.lastT) / 1000),
      );
      press.lastX = event.clientX;
      press.lastY = event.clientY;
      press.lastT = event.timeStamp;
    };
    /** On the canvas, before the scene's own pointerup and click: a tap is
     * replayed as its press so R3F sees down, up, click in order. */
    const canvasUp = (event: PointerEvent) => {
      if (event.pointerId !== press.id) return;
      const init = press.init;
      if (press.dragging) {
        orbitRelease(
          !!reducedMotion?.matches,
          event.timeStamp - press.lastT,
        );
        swallowClick = true;
        press.dragging = false;
        press.id = -1;
        press.init = null;
        canvas.style.cursor = "";
        return;
      }
      press.id = -1;
      press.init = null;
      if (init && canOrbit()) {
        const replay = new PointerEvent("pointerdown", init);
        replayed.add(replay);
        canvas.dispatchEvent(replay);
      }
    };
    const up = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      previousDistance = 0;
      // Released off the canvas (or cancelled): no tap.
      if (event.pointerId === press.id) {
        if (press.dragging) orbitRelease(!!reducedMotion?.matches, event.timeStamp - press.lastT);
        press.dragging = false;
        canvas.style.cursor = "";
        press.id = -1;
        press.init = null;
      }
    };
    const click = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
    };
    // V toggles walk / village view (hub only, same gate as zooming).
    const key = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.toLowerCase() !== "v" ||
        typing(event.target) ||
        !gameInputEnabled(useStage.getState()) ||
        !canZoom()
      )
        return;
      toggleView();
    };
    window.addEventListener("keydown", key);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", canvasUp);
    canvas.addEventListener("click", click);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("keydown", key);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", canvasUp);
      canvas.removeEventListener("click", click);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (press.dragging) orbitRelease(true);
    };
  }, [canvas]);
  return null;
}

/** One-time hint for a fresh direct /play visit (no view in the save). */
let coachDone = false;
function useViewCoach(view: string) {
  const fresh = useWorldView((state) => state.savedView === null);
  // The 9 s start when the HUD is actually revealed and the world is ready,
  // not when the (hidden) controls first mount.
  const live = useStage((state) => state.hudRevealed && state.ready);
  const [shown, setShown] = useState(!coachDone);
  const [first] = useState(view);
  useEffect(() => {
    if (view === first) return;
    coachDone = true;
    setShown(false);
  }, [view, first]);
  useEffect(() => {
    if (!fresh || !shown || !live) return;
    const timer = window.setTimeout(() => {
      coachDone = true;
      setShown(false);
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [fresh, shown, live]);
  return fresh && shown && live && view === "diorama";
}

export function WorldZoomControls() {
  const zoom = useWorldView((state) => state.zoom),
    view = useWorldView((state) => state.view),
    distance = useWorldView((state) => state.exploreDistance);
  const explore = view === "explore";
  const coach = useViewCoach(view);
  const visible = useGame(
    (state) =>
      state.scene === "hub" &&
      !state.paused &&
        !state.traveling &&
      !state.overlayLocked &&
      state.panel === "none",
  );
  if (!visible) return null;
  return (
    <>
      <button
        type="button"
        className="world-view-toggle"
        aria-pressed={explore}
        aria-keyshortcuts="V"
        title={explore ? "Back to the village view (V)" : "Walk behind your character (V)"}
        onClick={(event) => {
          toggleView();
          event.currentTarget.blur();
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {explore ? (
            <path d="M3 9.5 12 4l9 5.5-9 5.5zM3 14.5 12 20l9-5.5" />
          ) : (
            <>
              <circle cx="12" cy="5.5" r="2.2" />
              <path d="m9.5 21 2.5-6 2.5 6M8 12l4-3 4 3M12 9v6" />
            </>
          )}
        </svg>
        <span>{explore ? "Village view" : "Walk view"}</span>
        <kbd aria-hidden="true">V</kbd>
      </button>
      {coach && (
        <p className="world-view-coach" role="status">
          <kbd>V</kbd> walk view
        </p>
      )}
      <div className="world-zoom" role="group" aria-label="World zoom">
        <button
          aria-label="Whole island"
          title="Whole island"
          onClick={(event) => {
            wholeIsland();
            event.currentTarget.blur();
          }}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />
            <path d="m7 12 5-4 5 4-5 4z" />
          </svg>
        </button>
        <button
          aria-label="Zoom out"
          title="Zoom out (scroll or pinch)"
          disabled={explore ? distance >= MAX_EXPLORE_DISTANCE : zoom <= MIN_WORLD_ZOOM}
          onClick={(event) => {
            zoomView(1 / 1.25);
            event.currentTarget.blur();
          }}
        >
          −
        </button>
        <button
          aria-label="Zoom in"
          title="Zoom in (scroll or pinch)"
          disabled={explore ? distance <= MIN_EXPLORE_DISTANCE : zoom >= MAX_WORLD_ZOOM}
          onClick={(event) => {
            zoomView(1.25);
            event.currentTarget.blur();
          }}
        >
          +
        </button>
      </div>
    </>
  );
}
