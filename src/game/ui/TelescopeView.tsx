import { useEffect, useId, useRef, useState } from "react";
import {
  clampPan,
  clampZoom,
  makeStarField,
  MAX_ZOOM,
  MIN_ZOOM,
  SKY_PATTERNS,
  starsVisible,
} from "../core/stargazing";
import { useTimeOfDay } from "../core/timeOfDay";
import "./telescope.css";

const fields = SKY_PATTERNS.map((_, index) => makeStarField(2026 + index));
const initialAim = { x: 0, y: 0, zoom: 1 };

/** DOM eyepiece: mount only while panel === 'telescope'; onClose restores the world. */
export function TelescopeView({ onClose }: { onClose: () => void }) {
  const night = useTimeOfDay((state) => starsVisible(state.hour));
  const [patternIndex, setPatternIndex] = useState(0);
  const [guides, setGuides] = useState(false);
  const [aim, setAim] = useState(initialAim);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const id = useId();
  const pattern = SKY_PATTERNS[patternIndex];
  const width = 600 / aim.zoom;
  const viewBox = `${aim.x - width / 2} ${aim.y - width / 2} ${width} ${width}`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function zoomBy(factor: number) {
    setAim((current) => ({
      ...current,
      zoom: clampZoom(current.zoom * factor),
    }));
  }
  function changePattern(index: number) {
    setPatternIndex(index);
    setAim(initialAim);
  }
  function pan(dx: number, dy: number) {
    setAim((current) => ({
      ...current,
      x: clampPan(current.x + dx / current.zoom),
      y: clampPan(current.y + dy / current.zoom),
    }));
  }

  return (
    <div
      className={`telescope-view${night ? "" : " telescope-day"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Keep gameplay's global movement/pause shortcuts out of this dialog.
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key === "Tab") {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),select",
            ),
          ];
          const first = controls[0],
            last = controls.at(-1)!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <header className="telescope-header">
        <h2 id={`${id}-title`}>Telescope</h2>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          className="telescope-close"
        >
          Back to hill <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="telescope-aperture">
        <svg
          className="telescope-sky"
          viewBox={viewBox}
          role="img"
          aria-label={
            night
              ? `${pattern.name} through the telescope`
              : "Daylight through the telescope"
          }
          onPointerDown={(event) => {
            if (!night) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
          }}
          onPointerMove={(event) => {
            const previous = drag.current;
            if (!previous || previous.pointer !== event.pointerId) return;
            const rect = event.currentTarget.getBoundingClientRect();
            pan(
              ((previous.x - event.clientX) * 600) / rect.width,
              ((previous.y - event.clientY) * 600) / rect.height,
            );
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onWheel={(event) => {
            event.stopPropagation();
            if (night) zoomBy(event.deltaY > 0 ? 1 / 1.12 : 1.12);
          }}
        >
          <defs>
            <radialGradient id={`${id}-nebula`}>
              <stop stopColor="#cdb4c5" stopOpacity="0.4" />
              <stop offset="0.35" stopColor="#b598b5" stopOpacity="0.12" />
              <stop offset="1" stopColor="#6b708d" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${id}-glow`}>
              <stop stopColor="#e5edff" stopOpacity="0.42" />
              <stop offset="1" stopColor="#ccdfff" stopOpacity="0" />
            </radialGradient>
          </defs>
          {night && (
            <>
              {fields[patternIndex].map((star, index) => (
                <circle
                  key={index}
                  cx={star.x}
                  cy={star.y}
                  r={star.radius}
                  fill={star.color}
                  opacity={0.38 + star.radius * 0.22}
                />
              ))}
              {pattern.nebula && (
                <ellipse
                  cx={pattern.nebula[0]}
                  cy={pattern.nebula[1]}
                  rx="42"
                  ry="30"
                  fill={`url(#${id}-nebula)`}
                />
              )}
              {guides &&
                pattern.lines.map(([a, b], index) => (
                  <line
                    key={index}
                    x1={pattern.stars[a].x}
                    y1={pattern.stars[a].y}
                    x2={pattern.stars[b].x}
                    y2={pattern.stars[b].y}
                    stroke="#a7bccb"
                    strokeOpacity="0.36"
                    strokeWidth="0.7"
                  />
                ))}
              {pattern.stars.map((star, index) => (
                <g key={index}>
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={star.radius * 6}
                    fill={`url(#${id}-glow)`}
                  />
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={star.radius}
                    fill={star.color}
                  />
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={star.radius * 0.35}
                    fill="#fffdf4"
                  />
                  {guides && star.name && (
                    <text
                      x={star.x + 9}
                      y={star.y - 10}
                      fill="#c5cbd1"
                      fontSize="10"
                      fontFamily="inherit"
                    >
                      {star.name}
                    </text>
                  )}
                </g>
              ))}
            </>
          )}
        </svg>
        <div className="telescope-reticle" aria-hidden="true" />
        {!night && (
          <p className="telescope-day-message" role="status">
            Stars appear after dusk.
          </p>
        )}
      </div>

      <footer className="telescope-controls">
        <div className="telescope-target-row">
          <label>
            <span className="telescope-sr-only">Point telescope at</span>
            <select
              value={patternIndex}
              disabled={!night}
              onChange={(event) => changePattern(Number(event.target.value))}
            >
              {SKY_PATTERNS.map((target, index) => (
                <option key={target.name} value={index}>
                  {target.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!night}
            aria-pressed={guides}
            onClick={() => setGuides(!guides)}
          >
            Star guide
          </button>
          <div className="telescope-zoom">
            <button
              type="button"
              disabled={!night || aim.zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              onClick={() => zoomBy(1 / 1.25)}
            >
              −
            </button>
            <output aria-label="Magnification">
              {Math.round(aim.zoom * 30)}×
            </output>
            <button
              type="button"
              disabled={!night || aim.zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              onClick={() => zoomBy(1.25)}
            >
              +
            </button>
          </div>
        </div>
        <div className="telescope-aim-row">
          <span>Drag to aim</span>
          <div
            className="telescope-pan"
            role="group"
            aria-label="Aim telescope"
          >
            <button
              type="button"
              disabled={!night}
              aria-label="Aim left"
              onClick={() => pan(-40, 0)}
            >
              ←
            </button>
            <button
              type="button"
              disabled={!night}
              aria-label="Aim up"
              onClick={() => pan(0, -40)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={!night}
              aria-label="Aim down"
              onClick={() => pan(0, 40)}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={!night}
              aria-label="Aim right"
              onClick={() => pan(40, 0)}
            >
              →
            </button>
          </div>
          <button
            type="button"
            disabled={!night}
            onClick={() => setAim(initialAim)}
          >
            Recenter
          </button>
        </div>
      </footer>
    </div>
  );
}
