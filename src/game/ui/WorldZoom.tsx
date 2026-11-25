import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { runtime, useGame } from "../core/store";
import { useGameMode } from "../core/gameMode";
import {
  MAX_WORLD_ZOOM,
  MIN_WORLD_ZOOM,
  useWorldView,
  zoomWorld,
  fitIsland,
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
      zoomWorld(Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.003));
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
      if (previousDistance > 0) zoomWorld(distance / previousDistance);
      previousDistance = distance;
    };
    const up = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      previousDistance = 0;
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [canvas]);
  return null;
}

export function WorldZoomControls() {
  const zoom = useWorldView((state) => state.zoom);
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
    <div className="world-zoom" role="group" aria-label="World zoom">
      <button
        aria-label="Whole island"
        title="Whole island"
        onClick={(event) => {
          fitIsland();
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
        disabled={zoom <= MIN_WORLD_ZOOM}
        onClick={(event) => {
          zoomWorld(1 / 1.25);
          event.currentTarget.blur();
        }}
      >
        −
      </button>
      <button
        aria-label="Zoom in"
        title="Zoom in (scroll or pinch)"
        disabled={zoom >= MAX_WORLD_ZOOM}
        onClick={(event) => {
          zoomWorld(1.25);
          event.currentTarget.blur();
        }}
      >
        +
      </button>
    </div>
  );
}
