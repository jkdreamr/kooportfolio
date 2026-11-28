/**
 * The race HUD (PLAN_GAMES §2.2) and the boathouse race select. Place,
 * lap, the Power Ten meter in three charges, split and gap, the mini-map
 * (dots moved by the race loop), the next-turn arrow, the first-race
 * tutorial, a controls card on the count-in, and touch controls: hold the
 * left or right of the steering pad (or drag across it), and on the right a
 * Power Ten and a Hold Water button.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../core/store";
import { course as getCourse } from "../core/rowCourse";
import type { Cup, RaceMode } from "../core/rowing";
import { CUP_NAMES, endTutorial, miniMap, race, rowTouch, useRaceHud, useRowOptions } from "./Rowing";

/** Touch-first device (coarse pointer): touch glyphs instead of keys. */
function useTouch() {
  const [touch] = useState(() => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
  return touch;
}
const K = ({ children }: { children: React.ReactNode }) => <kbd className="row-kbd">{children}</kbd>;

/** The three tutorial prompts: what to do, with key or touch glyphs. */
function Tutorial({ step, touch }: { step: number; touch: boolean }) {
  const body =
    step === 1 ? (
      <>
        <b>Steer</b>
        <span>{touch ? <>Hold the left or right of the pad ◀ ▶</> : <><K>A</K> <K>D</K> or <K>←</K> <K>→</K> to steer</>}</span>
      </>
    ) : step === 2 ? (
      <>
        <b>Power Ten: a burst of speed</b>
        <span>{touch ? <>Tap <K>Power ten</K> when the bar is full</> : <>Press <K>Space</K> when a bar is full</>}</span>
      </>
    ) : (
      <>
        <b>Follow the line</b>
        <span>Row over the arrows and pass close to the buoy under the yellow marker</span>
      </>
    );
  return (
    <div className="row-tut" role="status">
      <small>Step {step} of 3</small>
      {body}
      <button onClick={() => endTutorial(false)}>Skip tutorial</button>
    </div>
  );
}

const ORD = ["", "1st", "2nd", "3rd", "4th"];
const DIFFICULTY: Readonly<Record<Cup, string>> = { novice: "Easy", varsity: "Medium", head: "Hard" };
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

/** Hold the left or right half to steer that way; drag for finer control. */
function SteerStrip() {
  const origin = useRef<number | null>(null);
  const [side, setSide] = useState(0);
  const reset = () => {
    origin.current = null;
    rowTouch.steer = 0;
    setSide(0);
  };
  useEffect(() => reset, []);
  return (
    <div
      className="row-strip"
      role="group"
      aria-label="Steer: hold the left or right side, or drag"
      data-side={side}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = e.clientX;
        const r = e.currentTarget.getBoundingClientRect();
        const s = e.clientX < r.left + r.width / 2 ? -1 : 1;
        rowTouch.steer = s;
        setSide(s);
      }}
      onPointerMove={(e) => {
        if (origin.current === null) return;
        const dx = e.clientX - origin.current;
        if (Math.abs(dx) < 14) return;
        const r = e.currentTarget.getBoundingClientRect();
        // Dragging across the pad steers by where the finger is now.
        const s = Math.max(-1, Math.min(1, ((e.clientX - (r.left + r.width / 2)) / r.width) * 3));
        rowTouch.steer = s;
        setSide(Math.sign(Math.round(s * 2)));
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <span aria-hidden="true">◀</span>
      <small>Steer</small>
      <span aria-hidden="true">▶</span>
    </div>
  );
}

export function RowingHud() {
  const h = useRaceHud();
  const touch = useTouch();
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
      {h.boats > 1 && h.turn !== 0 && !h.finished && (
        <div className="row-turn" data-dir={h.turn > 0 ? "left" : "right"} aria-hidden="true">
          <span>{h.turn > 0 ? "↰" : "↱"}</span>
          <small>{h.turnIn > 0 ? `${h.turn > 0 ? "Left" : "Right"} bend · ${h.turnIn} m` : `${h.turn > 0 ? "Left" : "Right"} bend`}</small>
        </div>
      )}
      {h.count > 0 && (
        <div className="countdown" aria-hidden="true">
          <span>{h.count}</span>
          <small>{touch ? "Tap Power ten on GO for a rocket start" : "Press Space on GO for a rocket start"}</small>
        </div>
      )}
      {h.count > 0 && (
        <dl className="row-controls" aria-label="Controls">
          <div>
            <dt>Steer</dt>
            <dd>{touch ? "Hold left / right of the pad" : <><K>A</K><K>D</K> or <K>←</K><K>→</K></>}</dd>
          </div>
          <div>
            <dt>Power Ten (boost)</dt>
            <dd>{touch ? "Big orange button" : <K>Space</K>}</dd>
          </div>
          <div>
            <dt>Hold water (tight turns)</dt>
            <dd>{touch ? "Hold button" : <><K>S</K> or <K>Shift</K></>}</dd>
          </div>
          <div>
            <dt>Goal</dt>
            <dd>Follow the arrows · {h.laps} laps · finish 1st</dd>
          </div>
        </dl>
      )}
      {h.tut > 0 && h.count === 0 && !h.finished && <Tutorial step={h.tut} touch={touch} />}
      {h.coach && <p className="row-coach">{h.coach}</p>}
      {h.wrong && <p className="row-wrong">Wrong way</p>}
      {h.armed && <p className="row-chip">Slingshot ready</p>}
      {!h.armed && h.wake && <p className="row-chip row-chip--wake">Slipstream</p>}
      <div className="row-meter" data-ready={charges > 0} aria-label={`Power Ten: ${charges} of 3 charges`}>
        <small>
          Power ten{" "}
          <em>{h.boosting ? "Go go go!" : charges > 0 ? (touch ? "ready: tap" : <>ready: <K>Space</K></>) : "charging: clean lines, slipstreams"}</em>
        </small>
        <div>
          {[0, 1, 2].map((i) => (
            <span key={i} data-full={i < charges}>
              <i style={{ transform: `scaleX(${i < charges ? 1 : i === charges ? part : 0})` }} />
            </span>
          ))}
        </div>
      </div>
      <p className="row-keys keyboard-hint">
        <K>A</K>
        <K>D</K> steer · <K>Space</K> Power Ten · <K>S</K> hold water (tight turns)
      </p>
      <SteerStrip />
      <div className="row-buttons">
        <button className="row-hold" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerCancel={hold(false)} onPointerLeave={hold(false)}>
          Hold
        </button>
        <button className="row-boost" data-ready={charges > 0} aria-label={`Power ten, ${charges} charges`} onPointerDown={boost(true)} onPointerUp={boost(false)} onPointerCancel={boost(false)} onPointerLeave={boost(false)}>
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
      <p className="race-select-how">
        You steer the boat; the crew rows. <span className="keyboard-hint">A/D steer · Space boost · S tight turns.</span> Follow the arrows on the water.
      </p>
      {(["novice", "varsity", "head"] as Cup[]).map((cup) => {
        const place = bests?.[`rowing.gp.place.${cup}`];
        return (
          <button key={cup} onClick={() => pick("gp", cup)}>
            <b>
              <i className="race-diff" data-cup={cup}>
                {DIFFICULTY[cup]}
              </i>{" "}
              Grand Prix · {CUP_NAMES[cup]}
            </b>
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
