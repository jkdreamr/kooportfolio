/**
 * The rowing race HUD and the boathouse race select, moved out of
 * `ui/Hud.tsx` (PLAN_GAMES J0) unchanged. Owned by the rowing game.
 */
import { useEffect, useRef, useState } from "react";
import { runtime, useGame } from "../core/store";
import {
  catchBoosted,
  catchReady,
  CATCH_WINDOW_START,
  dailySeed,
} from "../core/rowing";
import { useRaceCatch, useRaceHud } from "./Rowing";

function RaceCatch() {
  const race = useRaceCatch();
  const ready = catchReady(race);
  const boosted = catchBoosted(race);
  return (
    <div className="race-catch">
      <div className="race-catch-track" aria-hidden="true">
        <i style={{ left: `${CATCH_WINDOW_START * 100}%` }} />
        <b style={{ left: `${race.stroke * 100}%` }} />
      </div>
      <button
        type="button"
        data-ready={ready}
        data-boosted={boosted}
        disabled={race.time <= 0 || race.finished}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          runtime.raceCatch = true;
        }}
        onClick={(event) => {
          if (event.detail === 0) runtime.raceCatch = true;
        }}
      >
        {ready ? "Catch now" : boosted ? "Good catch" : "Catch"}
      </button>
    </div>
  );
}

export function RowingHud() {
  const { race } = useRaceHud();
  const pointers = useRef(new Map<number, "left" | "right" | "burst">());
  const [held, setHeld] = useState<string[]>([]);
  const updateTouch = () => {
    const values = [...pointers.current.values()];
    runtime.steer =
      Number(values.includes("right")) - Number(values.includes("left"));
    runtime.burst = values.includes("burst");
    setHeld(values);
  };
  const touchButton = (control: "left" | "right" | "burst") => ({
    "data-held": held.includes(control),
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, control);
      updateTouch();
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
    onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(event.pointerId);
      updateTouch();
    },
  });
  useEffect(
    () => () => {
      runtime.steer = 0;
      runtime.burst = false;
      runtime.raceCatch = false;
    },
    [],
  );
  return (
    <>
      <div className="challenge-heading">
        <h1>Regatta</h1>
        <p className="keyboard-hint">
          A / D steer · 1 / 2 / 3 pace · R to catch · hold Space to burst
        </p>
        <p className="touch-hint">Tap Catch in green · hold Burst</p>
      </div>
      <div className="race-progress">
        <div
          style={{ width: `${(race.distance / runtime.raceLength) * 100}%` }}
        />
        <span>Start</span>
        <span>
          {Math.floor(race.distance)} / {runtime.raceLength} m
        </span>
        <span>Finish</span>
      </div>
      {race.time < 0 && (
        <div className="countdown">
          <span>{Math.ceil(-race.time)}</span>
          <small>Ready</small>
        </div>
      )}
      <div className="race-instruments">
        <div>
          <small>Speed</small>
          <strong>
            {race.speed.toFixed(1)}
            <em> m/s</em>
          </strong>
        </div>
      </div>
      <div className="race-control-panel">
        <div className="stamina-label">
          <span>Crew energy</span>
          <b>{Math.round(race.stamina)}%</b>
        </div>
        <div className="energy-track">
          <i style={{ width: `${race.stamina}%` }} />
        </div>
        <div className="cadence-switch">
          {[
            [24, "Settle"],
            [30, "Rhythm"],
            [36, "Push"],
          ].map(([n, label]) => (
            <button
              className={runtime.raceCadence === n ? "selected" : ""}
              key={n}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                runtime.raceCadence = Number(n);
              }}
            >
              <small>{n} SPM</small>
              {label}
            </button>
          ))}
        </div>
        <RaceCatch />
        <p>
          {race.bank
            ? "Stay inside the buoys."
            : race.stamina < 20
              ? "Low energy. Settle."
              : "Stay in the pale current."}
        </p>
      </div>
      <div className="race-touch">
        <button aria-label="Steer left" {...touchButton("left")}>
          ←
        </button>
        <button className="burst" {...touchButton("burst")}>
          Burst
        </button>
        <button aria-label="Steer right" {...touchButton("right")}>
          →
        </button>
      </div>
    </>
  );
}

/** The boathouse's race picker, shown while standing at the race spot. */
export function BoathouseRaceSelect() {
  const go = useGame((s) => s.go);
  return (
    <div className="race-select">
      <button
        onClick={() => {
          runtime.raceLength = 360;
          runtime.raceSeed = 1;
          runtime.raceMode = "sprint";
          go("rowing");
        }}
      >
        <b>Sprint</b>
        <span>360 m · about 40 sec →</span>
      </button>
      <button
        onClick={() => {
          runtime.raceLength = 750;
          runtime.raceSeed = 2;
          runtime.raceMode = "regatta";
          go("rowing");
        }}
      >
        <b>Regatta</b>
        <span>750 m · about 80 sec →</span>
      </button>
      <button
        onClick={() => {
          runtime.raceLength = 750;
          runtime.raceSeed = dailySeed();
          runtime.raceMode = "daily";
          go("rowing");
        }}
      >
        <b>Daily river</b>
        <span>Same UTC daily seed · unranked →</span>
      </button>
    </div>
  );
}
