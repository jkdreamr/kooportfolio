/**
 * The race HUD (PLAN_GAMES §2.2) and the boathouse race select. Place,
 * lap, the Power Ten meter in three charges, split and gap, the mini-map
 * (dots moved by the race loop), the staged coach, and touch controls: the
 * left half is a steering strip, right a Power Ten and a Hold Water button.
 */
import { useEffect, useMemo, useRef } from "react";
import { useGame } from "../core/store";
import { course as getCourse } from "../core/rowCourse";
import type { Cup, RaceMode } from "../core/rowing";
import { CUP_NAMES, miniMap, race, rowTouch, useRaceHud, useRowOptions } from "./Rowing";

const ORD = ["", "1st", "2nd", "3rd", "4th"];
const DOTS = ["#c8463a", "#7186bd", "#f3efe4", "#4a9485"];

function MiniMap() {
  const mode = useRaceHud((s) => s.mode);
  const c = race.course;
  const { path, w, h } = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < c.n; i++) {
      minX = Math.min(minX, c.x[i]);
      maxX = Math.max(maxX, c.x[i]);
      minZ = Math.min(minZ, -c.y[i]);
      maxZ = Math.max(maxZ, -c.y[i]);
    }
    const size = 96;
    const scale = size / Math.max(maxX - minX, maxZ - minZ, 1);
    miniMap.scale = scale;
    miniMap.cx = minX;
    miniMap.cy = minZ;
    let d = "";
    for (let i = 0; i < c.n; i += 6) d += `${i ? "L" : "M"}${((c.x[i] - minX) * scale).toFixed(1)} ${((-c.y[i] - minZ) * scale).toFixed(1)}`;
    if (c.closed) d += "Z";
    return { path: d, w: (maxX - minX) * scale, h: (maxZ - minZ) * scale };
    // The course changes with the mode.
  }, [c, mode]);
  useEffect(() => () => void (miniMap.dots.length = 0), []);
  return (
    <svg className="row-map" width={w + 12} height={h + 12} viewBox={`-6 -6 ${w + 12} ${h + 12}`} aria-hidden="true">
      <path d={path} />
      {DOTS.map((fill, i) => (
        <circle key={i} r={i === 0 ? 4 : 3} cx={0} cy={0} fill={fill} ref={(el) => void (miniMap.dots[i] = el)} />
      ))}
    </svg>
  );
}

function SteerStrip() {
  const origin = useRef<number | null>(null);
  const reset = () => {
    origin.current = null;
    rowTouch.steer = 0;
  };
  useEffect(() => reset, []);
  return (
    <div
      className="row-strip"
      role="group"
      aria-label="Steer: drag left or right"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (origin.current === null) return;
        rowTouch.steer = Math.max(-1, Math.min(1, (e.clientX - origin.current) / 80));
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    />
  );
}

export function RowingHud() {
  const h = useRaceHud();
  const hold = (on: boolean) => (e: React.PointerEvent) => {
    e.preventDefault();
    rowTouch.hold = on;
  };
  const boost = (on: boolean) => (e: React.PointerEvent) => {
    e.preventDefault();
    rowTouch.boost = on;
  };
  useEffect(
    () => () => {
      rowTouch.steer = 0;
      rowTouch.boost = rowTouch.hold = false;
    },
    [],
  );
  const charges = Math.floor(h.meter / 100),
    part = (h.meter % 100) / 100;
  return (
    <div className="row-hud" data-boost={h.boosting}>
      <div className="row-place" aria-label={`${ORD[h.place]} of ${h.boats}`}>
        {h.boats > 1 ? (
          <>
            <b>{h.place}</b>
            <small>{ORD[h.place].slice(-2)} / {h.boats}</small>
          </>
        ) : (
          <small>{h.ghost ? "vs your ghost" : "Time trial"}</small>
        )}
      </div>
      <div className="row-lap">
        <small>Lap</small>
        <b>
          {Math.min(h.lap, h.laps)} / {h.laps}
        </b>
        {h.gap && <em>{h.gap}</em>}
        {h.split && <i>{h.split}</i>}
      </div>
      <MiniMap />
      {h.count > 0 && (
        <div className="countdown" aria-hidden="true">
          <span>{h.count}</span>
          <small>Call the Power Ten on Go</small>
        </div>
      )}
      {h.coach && <p className="row-coach">{h.coach}</p>}
      {h.wrong && <p className="row-wrong">Wrong way</p>}
      {h.armed && <p className="row-chip">Slingshot ready</p>}
      {!h.armed && h.wake && <p className="row-chip row-chip--wake">Slipstream</p>}
      <div className="row-meter" aria-label={`Power Ten: ${charges} of 3 charges`}>
        {[0, 1, 2].map((i) => (
          <span key={i} data-full={i < charges}>
            <i style={{ transform: `scaleX(${i < charges ? 1 : i === charges ? part : 0})` }} />
          </span>
        ))}
        <small>Power ten</small>
      </div>
      <p className="row-keys keyboard-hint">A / D steer · Space Power Ten · S or Shift hold water</p>
      <SteerStrip />
      <div className="row-buttons">
        <button className="row-hold" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerCancel={hold(false)} onPointerLeave={hold(false)}>
          Hold
        </button>
        <button className="row-boost" data-ready={charges > 0} onPointerDown={boost(true)} onPointerUp={boost(false)} onPointerCancel={boost(false)} onPointerLeave={boost(false)}>
          Power ten
        </button>
      </div>
      <p className="rowing-live sr-only" aria-live="polite" role="status">
        {h.announce}
      </p>
    </div>
  );
}

/** The boathouse's race picker, shown while standing at the race spot. */
export function BoathouseRaceSelect() {
  const go = useGame((s) => s.go);
  const bests = useGame((s) => s.save.bests);
  const pick = (mode: RaceMode, cup: Cup = "novice") => {
    useRowOptions.setState({ mode, cup });
    go("rowing");
  };
  const loop = getCourse("loop");
  return (
    <div className="race-select">
      {(["novice", "varsity", "head"] as Cup[]).map((cup) => {
        const place = bests?.[`rowing.gp.place.${cup}`];
        return (
          <button key={cup} onClick={() => pick("gp", cup)}>
            <b>Grand Prix · {CUP_NAMES[cup]}</b>
            <span>
              {loop.name}, 3 laps vs three crews{place ? ` · best ${ORD[place]}` : ""} →
            </span>
          </button>
        );
      })}
      <button onClick={() => pick("tt")}>
        <b>Time Trial</b>
        <span>Solo, 3 laps, race your ghost →</span>
      </button>
      <button onClick={() => pick("daily", "varsity")}>
        <b>Daily river</b>
        <span>River Run, today&apos;s seed · local →</span>
      </button>
    </div>
  );
}
