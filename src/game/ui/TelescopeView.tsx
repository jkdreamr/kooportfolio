import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  clampZoom,
  INITIAL_AIM,
  observeSky,
  panSky,
  projectStar,
  SKY_LOCATIONS,
  solarAltitude,
  telescopeSkyTime,
  type SkyWorld,
} from "../core/stargazing";
import "./telescope.css";

/** Real UTC sky, independent of the village's artistic time-of-day presets. */
export function TelescopeView({
  onClose,
  worldId = "home",
}: {
  onClose: () => void;
  worldId?: SkyWorld;
}) {
  const location = SKY_LOCATIONS[worldId];
  const [now, setNow] = useState(() => Date.now());
  const [aim, setAim] = useState(INITIAL_AIM);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const id = useId();
  const { time, preview } = useMemo(
    () => telescopeSkyTime(new Date(now), location),
    [now, location],
  );
  const sky = useMemo(() => {
    const sunAltitude = solarAltitude(time, location);
    const magnitudeLimit = Math.min(6, Math.max(0, (-sunAltitude - 6) * 0.75));
    return observeSky(time, location).filter(
      (star) => star.magnitude <= magnitudeLimit,
    );
  }, [time, location]);
  const projected = sky.flatMap((star) => {
    const point = projectStar(star, aim);
    return point ? [{ ...star, ...point }] : [];
  });
  const localTime = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(time);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
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
  function pan(dx: number, dy: number) {
    setAim((current) => panSky(current, dx, dy));
  }

  return (
    <div
      className="telescope-view"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-controls`}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (
          event.target instanceof Element &&
          !event.target.closest("button,a[href]")
        )
          event.preventDefault();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key === "Tab") {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button,a[href]",
            ),
          ];
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "+" || event.key === "=" || event.key === "-") {
          event.preventDefault();
          zoomBy(event.key === "-" ? 1 / 1.25 : 1.25);
        }
        const direction: Record<string, [number, number]> = {
          ArrowLeft: [-8, 0],
          ArrowRight: [8, 0],
          ArrowUp: [0, 8],
          ArrowDown: [0, -8],
        };
        if (direction[event.key]) {
          event.preventDefault();
          pan(...direction[event.key]);
        }
      }}
    >
      <header className="telescope-header">
        <div>
          <h2 id={`${id}-title`}>{location.label}</h2>
          <p className="telescope-time">
            {preview ? "Tonight" : "Live"} ·{" "}
            <time dateTime={time.toISOString()}>{localTime}</time>
          </p>
        </div>
        <button
          className="quiet-button"
          ref={closeButton}
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>

      <div className="telescope-stage">
        <div className="telescope-aperture">
          <svg
            className="telescope-sky"
            viewBox="-300 -300 600 600"
            role="img"
            aria-label={`Star chart above ${location.label}, ${localTime}`}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0)
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              pointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
              });
              if (pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()];
                pinch.current = {
                  distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
                  zoom: aim.zoom,
                };
              }
            }}
            onPointerMove={(event) => {
              const previous = pointers.current.get(event.pointerId);
              if (!previous) return;
              pointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
              });
              if (pointers.current.size >= 2) {
                const [a, b] = [...pointers.current.values()];
                const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
                const start = pinch.current ?? { distance, zoom: aim.zoom };
                pinch.current = start;
                setAim((current) => ({
                  ...current,
                  zoom: clampZoom((start.zoom * distance) / start.distance),
                }));
                return;
              }
              const scale =
                70 / event.currentTarget.getBoundingClientRect().width;
              pan(
                (previous.x - event.clientX) * scale,
                (event.clientY - previous.y) * scale,
              );
            }}
            onPointerUp={(event) => {
              pointers.current.delete(event.pointerId);
              pinch.current = null;
            }}
            onPointerCancel={(event) => {
              pointers.current.delete(event.pointerId);
              pinch.current = null;
            }}
            onLostPointerCapture={(event) => {
              pointers.current.delete(event.pointerId);
              pinch.current = null;
            }}
            onWheel={(event) => {
              if (event.deltaY && !event.ctrlKey && !event.metaKey)
                zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
            }}
          >
            <defs>
              <radialGradient id={`${id}-glow`}>
                <stop stopColor="#e5edff" stopOpacity="0.3" />
                <stop offset="1" stopColor="#ccdfff" stopOpacity="0" />
              </radialGradient>
            </defs>
            {projected.map((star) => {
              const radius = Math.max(0.65, 2.8 - star.magnitude * 0.36);
              return (
                <g key={star.id} data-star-id={star.id}>
                  {star.magnitude < 2 && (
                    <circle
                      cx={star.x}
                      cy={star.y}
                      r={radius * 5}
                      fill={`url(#${id}-glow)`}
                    />
                  )}
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={radius}
                    fill={star.color}
                    opacity={Math.max(0.4, 1 - star.magnitude * 0.08)}
                  />
                  {star.name && star.magnitude < 3 && (
                    <text
                      x={star.x + 8}
                      y={star.y - 9}
                      fill="#c5cbd1"
                      fontSize="10"
                      fontFamily="inherit"
                    >
                      {star.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="telescope-reticle" aria-hidden="true" />
        </div>
      </div>

      <footer className="telescope-controls">
        <div className="telescope-readout">
          <span aria-hidden="true" className="telescope-desktop-hint">
            Drag or arrows to aim · Scroll or +/− to zoom
          </span>
          <span aria-hidden="true" className="telescope-touch-hint">
            Drag to aim · Pinch to zoom
          </span>
          <span className="telescope-sr-only" id={`${id}-controls`}>
            Aim with the arrow keys. Zoom with plus or minus. Escape closes the
            telescope.
          </span>
        </div>
        <p className="telescope-attribution">
          <a
            href={`${import.meta.env.BASE_URL}stargazing-data.txt`}
            target="_blank"
            rel="noopener noreferrer"
          >
            HYG catalogue
          </a>
        </p>
      </footer>
    </div>
  );
}
