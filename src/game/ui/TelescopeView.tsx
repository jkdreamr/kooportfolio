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
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null);
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
        if (!night || event.target instanceof HTMLSelectElement) return;
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
          <h2 id={`${id}-title`}>
            Telescope <span>— {location.label}</span>
          </h2>
          <p className="telescope-time">
            {preview ? "Tonight preview" : "Live"} ·{" "}
            <time dateTime={new Date(timestamp).toISOString()}>
              {localTime}
            </time>
          </p>
        </div>
        <button
          className="telescope-close"
          ref={closeButton}
          type="button"
          onClick={onClose}
        >
          Back <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="telescope-aperture">
        <svg
          className="telescope-sky"
          viewBox="-300 -300 600 600"
          role="img"
          aria-label={`${night ? "Star chart" : "Daylight sky"} above ${location.label}, ${localTime}`}
          onPointerDown={(event) => {
            if (!night) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
          }}
          onPointerMove={(event) => {
            const previous = drag.current;
            if (!previous || previous.pointer !== event.pointerId || !night)
              return;
            const scale =
              70 / event.currentTarget.getBoundingClientRect().width;
            pan(
              (previous.x - event.clientX) * scale,
              (event.clientY - previous.y) * scale,
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
            if (night) zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
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

      <footer className="telescope-controls">
        <div className="telescope-time-row" role="group" aria-label="Sky time">
          <button
            type="button"
            aria-pressed={!preview}
            onClick={() => changeTime(false)}
          >
            Live
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => changeTime(true)}
          >
            Tonight · 10 pm
          </button>
          <output aria-label="Telescope direction">
            {Math.round(viewingAim.azimuth)}° az ·{" "}
            {Math.round(viewingAim.altitude)}° alt
          </output>
        </div>
        <div className="telescope-target-row">
          <label>
            <span className="telescope-sr-only">Point telescope at</span>
            <select
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
            type="button"
            disabled={!night}
            aria-pressed={guides}
            onClick={() => setGuides(!guides)}
          >
            Star names
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
            <output aria-label="Field of view">
              {Math.round(70 / aim.zoom)}°
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
              onClick={() => pan(-8, 0)}
            >
              ←
            </button>
            <button
              type="button"
              disabled={!night}
              aria-label="Aim up"
              onClick={() => pan(0, 8)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={!night}
              aria-label="Aim down"
              onClick={() => pan(0, -8)}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={!night}
              aria-label="Aim right"
              onClick={() => pan(8, 0)}
            >
              →
            </button>
          </div>
          <button
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
        <p className="telescope-attribution">
          Clear-sky chart ·{" "}
          <a
            href={`${import.meta.env.BASE_URL}stargazing-data.txt`}
            target="_blank"
            rel="noopener noreferrer"
          >
            HYG catalogue &amp; model
          </a>
        </p>
      </footer>
    </div>
  );
}
