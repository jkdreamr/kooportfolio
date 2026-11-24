import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  clampZoom,
  INITIAL_AIM,
  MAX_ZOOM,
  MIN_ZOOM,
  observeSky,
  panSky,
  projectStar,
  SKY_LOCATIONS,
  solarAltitude,
  tonightAtLocation,
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
  const [preview, setPreview] = useState(false);
  const [guides, setGuides] = useState(false);
  const [aim, setAim] = useState(INITIAL_AIM);
  const [targetId, setTargetId] = useState<number | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const id = useId();
  const timestamp = preview
    ? tonightAtLocation(new Date(now), location).getTime()
    : now;
  const sky = useMemo(
    () => observeSky(new Date(timestamp), location),
    [timestamp, location],
  );
  const sunAltitude = solarAltitude(new Date(timestamp), location);
  const night = sunAltitude < -6;
  const magnitudeLimit = Math.min(6, Math.max(0, (-sunAltitude - 6) * 0.75));
  const target = sky.find((star) => star.id === targetId);
  const viewingAim = target
    ? { azimuth: target.azimuth, altitude: target.altitude, zoom: aim.zoom }
    : aim;
  const targets = sky
    .filter(
      (star) =>
        star.name &&
        star.magnitude < 3 &&
        star.magnitude <= magnitudeLimit &&
        star.altitude > 10,
    )
    .sort((a, b) => a.magnitude - b.magnitude);
  const projected = night
    ? sky
        .filter((star) => star.magnitude <= magnitudeLimit)
        .flatMap((star) => {
          const point = projectStar(star, viewingAim);
          return point ? [{ ...star, ...point }] : [];
        })
    : [];
  const localTime = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(timestamp);

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
    setTargetId(null);
    setAim(panSky(viewingAim, dx, dy));
  }
  function changeTime(nextPreview: boolean) {
    setPreview(nextPreview);
    setNow(Date.now());
    setTargetId(null);
    setAim(INITIAL_AIM);
  }

  return (
    <div
      className={`telescope-view${night ? "" : " telescope-day"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key === "Tab") {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),select:not(:disabled),a[href]",
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
        if (
          !night ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.target instanceof HTMLSelectElement
        )
          return;
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
            <span className="telescope-sr-only">
              {preview ? "Tonight preview: " : "Live sky: "}
            </span>
            <time dateTime={new Date(timestamp).toISOString()}>
              {localTime}
            </time>
          </p>
        </div>
        <button
          className="quiet-button telescope-close"
          ref={closeButton}
          type="button"
          onClick={onClose}
        >
          Back
        </button>
      </header>

      <div className="telescope-stage">
        <div className="telescope-aperture">
          <svg
            className="telescope-sky"
            viewBox="-300 -300 600 600"
            role="img"
            aria-label={`${night ? "Star chart" : "Daylight sky"} above ${location.label}, ${localTime}`}
            onPointerDown={(event) => {
              if (
                !night ||
                (event.pointerType === "mouse" && event.button !== 0)
              )
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
              if (!previous || !night) return;
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
              if (night && !event.ctrlKey && !event.metaKey)
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
                  {guides && star.name && star.magnitude < 3 && (
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
          {!night && (
            <p className="telescope-day-message" role="status">
              {sunAltitude > 0 ? "Daylight" : "Twilight"} in {location.label}.
              <br />
              <span>Try tonight’s sky below.</span>
            </p>
          )}
        </div>
      </div>

      <footer className="telescope-controls">
        <div className="telescope-main-controls">
          <div
            className="telescope-time-row"
            role="group"
            aria-label="Sky time"
          >
            <button
              className="quiet-button"
              type="button"
              aria-pressed={!preview}
              onClick={() => changeTime(false)}
            >
              Live
            </button>
            <button
              className="quiet-button"
              type="button"
              aria-pressed={preview}
              onClick={() => changeTime(true)}
            >
              Tonight
            </button>
          </div>
          <label className="telescope-target">
            <span className="telescope-sr-only">Point telescope at</span>
            <select
              className="quiet-button"
              value={target?.id ?? ""}
              disabled={!night}
              onChange={(event) => {
                setTargetId(
                  event.target.value ? Number(event.target.value) : null,
                );
                setAim(INITIAL_AIM);
              }}
            >
              <option value="">Explore sky</option>
              {targets.map((star) => (
                <option key={star.id} value={star.id}>
                  {star.name}
                </option>
              ))}
              {target && !targets.some((star) => star.id === target.id) && (
                <option value={target.id}>{target.name}</option>
              )}
            </select>
          </label>
          <button
            className="quiet-button telescope-names"
            type="button"
            disabled={!night}
            aria-pressed={guides}
            onClick={() => setGuides(!guides)}
          >
            Names
          </button>
        </div>
        <div className="telescope-desktop-controls">
          <div className="telescope-zoom">
            <button
              className="quiet-button"
              type="button"
              disabled={!night || aim.zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              onClick={() => zoomBy(1 / 1.25)}
            >
              −
            </button>
            <output aria-label="Field of view">
              {Math.round(70 / aim.zoom)}°
            </output>
            <button
              className="quiet-button"
              type="button"
              disabled={!night || aim.zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              onClick={() => zoomBy(1.25)}
            >
              +
            </button>
          </div>
          <div
            className="telescope-pan"
            role="group"
            aria-label="Aim telescope"
          >
            <button
              className="quiet-button"
              type="button"
              disabled={!night}
              aria-label="Aim left"
              onClick={() => pan(-8, 0)}
            >
              ←
            </button>
            <button
              className="quiet-button"
              type="button"
              disabled={!night}
              aria-label="Aim up"
              onClick={() => pan(0, 8)}
            >
              ↑
            </button>
            <button
              className="quiet-button"
              type="button"
              disabled={!night}
              aria-label="Aim down"
              onClick={() => pan(0, -8)}
            >
              ↓
            </button>
            <button
              className="quiet-button"
              type="button"
              disabled={!night}
              aria-label="Aim right"
              onClick={() => pan(8, 0)}
            >
              →
            </button>
          </div>
          <button
            className="quiet-button"
            type="button"
            disabled={!night}
            onClick={() => {
              setTargetId(null);
              setAim(INITIAL_AIM);
            }}
          >
            Recenter
          </button>
        </div>
        <div className="telescope-readout">
          <output aria-label="Telescope direction">
            {Math.round(viewingAim.azimuth)}° az ·{" "}
            {Math.round(viewingAim.altitude)}° alt
          </output>
          <output className="telescope-touch-fov" aria-label="Field of view">
            {Math.round(70 / aim.zoom)}° field
          </output>
          <span className="telescope-desktop-hint">Drag · Scroll</span>
          <span className="telescope-touch-hint">Drag · Pinch</span>
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
