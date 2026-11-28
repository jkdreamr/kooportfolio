import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clampZoom,
  INITIAL_AIM,
  lunarPosition,
  observeSky,
  panSky,
  projectStar,
  SKY_LOCATIONS,
  solarPosition,
  starVisibility,
  telescopeSkyState,
  telescopeSkyTime,
  wrapDegrees,
  type Horizontal,
  type SkyAim,
  type SkyWorld,
  type TelescopeSky,
} from "../core/stargazing";
import { rgbHex, TIME_PRESETS, wrapHour } from "../core/daylight";
import { autoHour, useTimeOfDay } from "../core/timeOfDay";
import { scopeScale, scopeSkyColor, villageSun } from "../core/telescopeClouds";
import { useGame } from "../core/store";
import { ScopeSky, warmScopeSky } from "./telescopeSky";
import "./telescope.css";

const RAD = Math.PI / 180;
const VIEW_UNITS = 600;
/** Magnitude bands: each fades as one group (8 CSS opacity transitions, not
 * thousands), so dusk brings stars in smoothly, brightest first. */
const BANDS = Array.from({ length: 9 }, (_, i) => i - 1.5); // band centres
const bandOf = (magnitude: number) =>
  Math.max(0, Math.min(BANDS.length - 1, Math.floor(magnitude + 2)));
const MOON_RADIUS = 13;
/** Sky gradient stops down the eyepiece (fractions of its height). */
const SKY_STOPS = [0, 0.25, 0.5, 0.75, 1];
/** Labels never render under 12 CSS px, whatever the eyepiece's size. */
const LABEL_PX = 12;

/** With the sun low the eyepiece opens on it (sunrise or sunset over the
 * cloud sea, the sun a little right of centre); otherwise due south. */
function openingAim(hour: number): SkyAim {
  const sun = villageSun(hour);
  return sun.altitude > -7 && sun.altitude < 16
    ? { azimuth: wrapDegrees(sun.azimuth - 13), altitude: 14, zoom: 1 }
    : INITIAL_AIM;
}

// Walking up to the telescope paints the cloud shapes in the browser's idle
// moments, so the eyepiece opens with its weather ready.
if (typeof window !== "undefined")
  useGame.subscribe((state, previous) => {
    if (state.near === "stargazing" && previous.near !== "stargazing")
      warmScopeSky();
  });

/** Screen direction (unit, SVG y down) from the view centre towards `target`. */
function screenDirection(target: Horizontal, aim: SkyAim) {
  const az = aim.azimuth * RAD,
    alt = aim.altitude * RAD;
  const x = target.east * Math.cos(az) - target.north * Math.sin(az);
  const y = -(
    -target.east * Math.sin(alt) * Math.sin(az) -
    target.north * Math.sin(alt) * Math.cos(az) +
    target.up * Math.cos(alt)
  );
  const length = Math.hypot(x, y);
  return length > 1e-6 ? { x: x / length, y: y / length } : { x: 0, y: -1 };
}
function angleBetween(a: Horizontal, aim: SkyAim) {
  const az = aim.azimuth * RAD,
    alt = aim.altitude * RAD;
  const dot =
    a.east * Math.cos(alt) * Math.sin(az) +
    a.north * Math.cos(alt) * Math.cos(az) +
    a.up * Math.sin(alt);
  return Math.acos(Math.max(-1, Math.min(1, dot))) / RAD;
}
/** Lit-limb path of a Moon of radius r, lit side towards +x. */
function moonPath(r: number, illumination: number) {
  const rx = Math.max(0.01, r * Math.abs(1 - 2 * illumination));
  return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${illumination > 0.5 ? 1 : 0} 0 ${-r} Z`;
}
/** Daytime/twilight caption. Its text is kept while it fades out (`shown`
 * false), so it never blanks before it has faded. */
function captionFor(sky: TelescopeSky, skipping: boolean) {
  const shown = sky.phase !== "night" && sky.stars < 0.6;
  if (skipping) return { text: "Night is falling…", skip: false, shown };
  return sky.phase === "day"
    ? {
        text: "Stars come out after sunset — come back tonight, or skip to night.",
        skip: true,
        shown,
      }
    : {
        text: "Twilight — the brightest stars are appearing.",
        skip: true,
        shown,
      };
}

/** Real stars, Moon and Sun for the instant the GAME clock shows (today's
 * date at the village hour), under the village's own sky colours. */
export function TelescopeView({
  onClose,
  worldId = "home",
}: {
  onClose: () => void;
  worldId?: SkyWorld;
}) {
  const location = SKY_LOCATIONS[worldId];
  const [now, setNow] = useState(() => Date.now());
  const [aim, setAim] = useState(() =>
    openingAim(useTimeOfDay.getState().hour),
  );
  const cloudCanvas = useRef<HTMLCanvasElement>(null);
  const cloudLayer = useRef<ScopeSky | null>(null);
  const [cloudsReady, setCloudsReady] = useState(false);
  // Eyepiece width in CSS px, for the label size floor.
  const [aperture, setAperture] = useState(VIEW_UNITS);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const id = useId();
  // The village clock (4 Hz while it glides), not the visitor's real clock.
  const hour = useTimeOfDay((state) => state.hour);
  const mode = useTimeOfDay((state) => state.mode);
  const timeZone = useTimeOfDay((state) => state.timeZone);
  // Star positions follow the hour the clock is heading to (minute steps),
  // so a skip to night never spins the chart through the glide.
  const targetMinute = Math.round(
    wrapHour(
      mode === "auto"
        ? autoHour(timeZone, new Date(now))
        : TIME_PRESETS[mode].hour,
    ) * 60,
  );
  const time = useMemo(
    () => telescopeSkyTime(new Date(now), location, targetMinute / 60),
    [now, location, targetMinute],
  );
  const sky = telescopeSkyState(hour);
  const stars = useMemo(() => observeSky(time, location), [time, location]);
  // Header, Sun and Moon follow the live village clock (cheap, and a skip
  // then sets the Sun and fades its glare with the sky, like a time-lapse).
  const shownTime = useMemo(
    () => telescopeSkyTime(new Date(now), location, hour),
    [now, location, hour],
  );
  const moon = useMemo(
    () => lunarPosition(shownTime, location),
    [shownTime, location],
  );
  const sun = useMemo(
    () => solarPosition(shownTime, location),
    [shownTime, location],
  );
  // Only the bands the sky shows are built: by day a pan projects no stars.
  const bandMask = BANDS.reduce(
    (mask, band, i) =>
      starVisibility(band, sky.magnitudeLimit) > 0.001 ? mask | (1 << i) : mask,
    0,
  );
  const labelSize =
    Math.round(Math.max(10, (LABEL_PX * VIEW_UNITS) / aperture) * 2) / 2;
  const bands = useMemo(() => {
    const groups = BANDS.map(() => [] as ReactNode[]);
    if (!bandMask) return groups;
    for (const star of stars) {
      if (!(bandMask & (1 << bandOf(star.magnitude)))) continue;
      const point = projectStar(star, aim);
      if (!point) continue;
      const radius = Math.max(0.65, 2.8 - star.magnitude * 0.36);
      groups[bandOf(star.magnitude)].push(
        <g key={star.id} data-star-id={star.id}>
          {star.magnitude < 2 && (
            <circle
              cx={point.x}
              cy={point.y}
              r={radius * 5}
              fill={`url(#${id}-glow)`}
            />
          )}
          <circle
            cx={point.x}
            cy={point.y}
            r={radius}
            fill={star.color}
            opacity={Math.max(0.4, 1 - star.magnitude * 0.08)}
          />
          {star.name && star.magnitude < 3 && (
            <text
              x={point.x + 8}
              y={point.y - 9}
              fill="#c5cbd1"
              fontSize={labelSize}
              fontFamily="inherit"
            >
              {star.name}
            </text>
          )}
        </g>,
      );
    }
    return groups;
  }, [stars, aim, id, bandMask, labelSize]);
  const moonPoint = projectStar(moon, aim);
  const moonAngle = useMemo(() => {
    // Lit limb faces the Sun: a small step from the Moon along the great
    // circle towards it, projected.
    const d = moon.east * sun.east + moon.north * sun.north + moon.up * sun.up;
    const toward = {
      east: sun.east - d * moon.east,
      north: sun.north - d * moon.north,
      up: sun.up - d * moon.up,
    };
    const length = Math.hypot(toward.east, toward.north, toward.up) || 1;
    const step = { ...moon };
    step.east += (toward.east / length) * 0.01;
    step.north += (toward.north / length) * 0.01;
    step.up += (toward.up / length) * 0.01;
    const a = projectStar(moon, aim),
      b = projectStar(step, aim);
    return a && b ? Math.atan2(b.y - a.y, b.x - a.x) / RAD : 0;
  }, [moon, sun, aim]);
  const halfField = 35 / aim.zoom;
  // The village's own gradient (horizon, mid, zenith) down the eyepiece.
  const skyScale = scopeScale(aim.zoom);
  const skyStops = SKY_STOPS.map((offset) =>
    rgbHex(
      scopeSkyColor(
        sky.palette,
        sky.stars,
        aim.altitude - Math.atan(((offset - 0.5) * VIEW_UNITS) / skyScale) / RAD,
      ),
    ),
  );
  // The scenery sun is the village's (its sky is keyed to the hour); the
  // weather layer draws its disc and bloom. Out of view, its glare still
  // enters from the rim on the Sun's side.
  const scenerySun = useMemo(() => villageSun(hour), [hour]);
  const sunUp = Math.max(0, Math.min(1, (scenerySun.altitude + 2) / 4));
  const sunAngle = angleBetween(scenerySun, aim);
  const outside = Math.max(
    0,
    Math.min(1, (sunAngle - halfField * 0.7) / (halfField * 0.45)),
  );
  const glare =
    sky.daylight *
    sunUp *
    Math.max(0, Math.min(1, (80 - sunAngle) / 60)) ** 2 *
    outside *
    0.6;
  const glareAt = screenDirection(scenerySun, aim);
  const moonOpacity =
    moon.altitude > -1 ? 0.62 + 0.38 * (1 - sky.daylight) : 0;
  const skipping = mode === "night" && sky.phase !== "night";
  const caption = captionFor(sky, skipping);
  const visibleCount = bands.reduce(
    (sum, group, i) =>
      sum + (starVisibility(BANDS[i], sky.magnitudeLimit) > 0.5 ? group.length : 0),
    0,
  );
  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: location.timeZone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    [location],
  );
  const localTime = timeFormat.format(shownTime);
  const phaseLabel =
    sky.phase === "day" ? "Daytime" : sky.phase === "twilight" ? "Twilight" : "Night";

  // The weather layer: created first, so the aim and hour effects below
  // reach it in the same commit and it draws in step with the star chart.
  useLayoutEffect(() => {
    const canvas = cloudCanvas.current;
    if (!canvas) return;
    const layer = new ScopeSky(canvas);
    cloudLayer.current = layer;
    layer.onReady = () => setCloudsReady(true);
    const motion =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const applyMotion = () => layer.setReducedMotion(!!motion?.matches);
    applyMotion();
    motion?.addEventListener("change", applyMotion);
    const measure = () => {
      const width = canvas.clientWidth;
      if (!width) return;
      // Clouds are soft: 1.5x is all the density they can use.
      layer.resize(
        Math.min(1000, width * Math.min(window.devicePixelRatio || 1, 1.5)),
      );
      setAperture(width);
    };
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(canvas);
    layer.start();
    return () => {
      layer.stop();
      layer.onReady = null;
      observer?.disconnect();
      motion?.removeEventListener("change", applyMotion);
      cloudLayer.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    cloudLayer.current?.setHour(hour);
  }, [hour]);
  useLayoutEffect(() => {
    cloudLayer.current?.setAim(aim);
  }, [aim]);
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
              "button:not([disabled]),a[href]",
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
            {phaseLabel} ·{" "}
            <time dateTime={shownTime.toISOString()}>{localTime}</time>
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
            aria-label={`${phaseLabel} sky above ${location.label}, ${localTime}: ${
              visibleCount ? `${visibleCount} stars in view` : "no stars visible yet"
            }${moonPoint && moonOpacity ? ", the Moon is in view" : ""}`}
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
              <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
                {skyStops.map((color, i) => (
                  <stop
                    key={i}
                    className="telescope-fade"
                    offset={SKY_STOPS[i]}
                    style={{ stopColor: color }}
                  />
                ))}
              </linearGradient>
              <radialGradient id={`${id}-sun`}>
                <stop stopColor={rgbHex(sky.palette.sun)} stopOpacity="0.95" />
                <stop
                  offset="0.45"
                  stopColor={rgbHex(sky.palette.sun)}
                  stopOpacity="0.35"
                />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`${id}-moon`}>
                <stop offset="0.45" stopColor="#f1f4ff" stopOpacity="0.28" />
                <stop offset="1" stopColor="#d9e4ff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect
              x="-300"
              y="-300"
              width="600"
              height="600"
              fill={`url(#${id}-sky)`}
            />
            {bands.map((group, i) => {
              const opacity = starVisibility(BANDS[i], sky.magnitudeLimit);
              return opacity > 0.001 && group.length ? (
                <g
                  key={i}
                  className="telescope-fade"
                  style={{ opacity }}
                  data-band={BANDS[i]}
                >
                  {group}
                </g>
              ) : null;
            })}
            {moonPoint && moonOpacity > 0 && (
              <g
                className="telescope-fade telescope-moon"
                style={{ opacity: moonOpacity }}
                transform={`translate(${moonPoint.x} ${moonPoint.y}) rotate(${moonAngle})`}
                data-moon={moon.illumination.toFixed(2)}
              >
                <circle
                  r={MOON_RADIUS * 2.6}
                  fill={`url(#${id}-moon)`}
                  opacity={1 - sky.daylight}
                />
                <circle
                  r={MOON_RADIUS}
                  fill="#26324a"
                  opacity={0.55 * (1 - sky.daylight)}
                />
                <path
                  d={moonPath(MOON_RADIUS, moon.illumination)}
                  fill="#eef1f6"
                />
                {(1 - sky.daylight) * moon.illumination > 0.2 && (
                  <text
                    x={MOON_RADIUS + 6}
                    y={-MOON_RADIUS - 4}
                    fill="#c5cbd1"
                    fontSize={labelSize}
                    fontFamily="inherit"
                    transform={`rotate(${-moonAngle})`}
                  >
                    Moon
                  </text>
                )}
              </g>
            )}
            <circle
              className="telescope-fade"
              cx={glareAt.x * 390}
              cy={glareAt.y * 390}
              r={330}
              fill={`url(#${id}-sun)`}
              style={{ opacity: glare }}
              pointerEvents="none"
            />
          </svg>
          <canvas
            ref={cloudCanvas}
            className={`telescope-clouds${cloudsReady ? " is-ready" : ""}`}
            aria-hidden="true"
          />
          <div className="telescope-reticle" aria-hidden="true" />
        </div>
        <div
          className={`telescope-caption${caption.shown ? "" : " is-hidden"}`}
          role="status"
          aria-hidden={!caption.shown}
        >
          <p>{caption.text}</p>
          {caption.skip && (
            <button
              className="quiet-button"
              type="button"
              disabled={!caption.shown}
              onClick={() => useTimeOfDay.getState().setMode("night")}
            >
              Skip to night
            </button>
          )}
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
