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
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input,textarea,select"));

/** Native input is scoped to the canvas; menus keep ordinary scrolling. */
export function WorldZoomInput() {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const touches = new Map<number, { x: number; y: number }>();
    let previousDistance = 0;
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
      if (event.pointerType !== "touch" || !canZoom()) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      previousDistance = 0;
      if (touches.size > 1) {
        event.stopPropagation();
        runtime.target = null;
        runtime.path = [];
      }
    };
    const move = (event: PointerEvent) => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size !== 2 || !canZoom()) return;
      const [a, b] = [...touches.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (previousDistance > 0) zoomView(distance / previousDistance);
      previousDistance = distance;
    };
    const up = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      previousDistance = 0;
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
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("keydown", key);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
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
