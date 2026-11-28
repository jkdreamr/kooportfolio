/**
 * The court HUD (PLAN_GAMES §2.1): the lobby (mode and rival ladder) and,
 * in play, the score bug, shot clock, the release meter, coach and calls,
 * touch controls and the result card. Per-frame values (meter, clock) are
 * written by the court loop into refs bound here; React only re-renders on
 * score changes and calls.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { runtime, useGame } from "../core/store";
import { touch } from "../core/input";
import { useGameMode } from "../core/gameMode";
import { useLauncherHosted } from "../core/launchers";
import { RIVALS, RIVAL_ORDER } from "../core/hoopsRival";
import { ResultCard } from "../ui/ResultCard";
import { RoomStory } from "../ui/RoomStory";
import {
  CourtControls,
  MODES,
  beginRound,
  bindMeter,
  bindShotClock,
  bindTags,
  closeCourt,
  pressMove,
  useBasketHud,
  useBasketOptions,
} from "./Basketball";

function MovePad() {
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const origin = useRef<[number, number] | null>(null);
  const reset = () => {
    origin.current = null;
    touch.x = touch.z = 0;
    setKnob([0, 0]);
  };
  useEffect(() => reset, []);
  return (
    <div
      className="bt-pad"
      role="group"
      aria-label="Move"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = [r.left + r.width / 2, r.top + r.height / 2];
      }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const x = (e.clientX - origin.current[0]) / 44,
          z = (e.clientY - origin.current[1]) / 44;
        const len = Math.max(1, Math.hypot(x, z));
        touch.x = x / len;
        touch.z = z / len;
        setKnob([touch.x * 34, touch.z * 34]);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <span style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  );
}

export function PlayHud() {
  const hud = useBasketHud();
  const { mode, rival } = useBasketOptions();
  const meterRoot = useRef<HTMLDivElement>(null),
    fill = useRef<HTMLElement>(null),
    green = useRef<HTMLElement>(null),
    odds = useRef<HTMLParagraphElement>(null),
    intent = useRef<HTMLParagraphElement>(null);
  const clock = useCallback((el: HTMLElement | null) => bindShotClock(el), []);
  useEffect(() => {
    bindMeter(meterRoot.current, fill.current, green.current);
    bindTags(odds.current, intent.current);
    return () => {
      bindMeter(null, null, null);
      bindTags(null, null);
    };
  }, []);
  useEffect(
    () => () => {
      touch.x = touch.z = 0;
      runtime.shooting = runtime.shoot = false;
    },
    [],
  );
  const shootDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    runtime.shooting = true;
  };
  const shootUp = () => {
    if (runtime.shooting) runtime.shoot = true;
    runtime.shooting = false;
  };
  const r = RIVALS[rival];
  const nextRival = RIVAL_ORDER[RIVAL_ORDER.indexOf(rival) + 1];
  return (
    <section className="bt-hud" aria-label="Basketball game" data-fire={hud.fire} onPointerDown={(e) => e.stopPropagation()}>
      <header className="bt-bug">
        {mode === "1v1" ? (
          <div className="bt-score" aria-label={`You ${hud.score[0]}, ${r.name} ${hud.score[1]}, first to 15`}>
            <span data-ball={hud.offense === 0}>
              <small>You</small>
              <b>{hud.score[0]}</b>
            </span>
            <i aria-hidden="true">to 15</i>
            <span data-ball={hud.offense === 1} style={{ ["--shirt" as string]: r.shirt }}>
              <small>{r.name.replace("The ", "")}</small>
              <b>{hud.score[1]}</b>
            </span>
          </div>
        ) : (
          <div className="bt-score bt-score--solo">
            <span data-ball="true">
              <small>{MODES[mode].label}</small>
              <b>{hud.points}</b>
            </span>
            {hud.streak > 1 && <i>{hud.streak} in a row</i>}
          </div>
        )}
        <div className="bt-clock" aria-hidden="true">
          <small>{mode === "1v1" ? "Shot" : "Time"}</small>
          <b ref={clock}>12</b>
        </div>
        <div className="bt-actions">
          <button onClick={() => useGame.setState({ paused: true })} aria-label="Pause">
            II
          </button>
          <button onClick={closeCourt} aria-label="Close basketball game">
            ✕
          </button>
        </div>
      </header>
      {!hud.result && (
        <>
          <p className="bt-call" role="status" aria-live="polite" key={hud.feedback + hud.score.join()}>
            {hud.feedback}
          </p>
          {hud.coach && (
            <p className="bt-coach" key={hud.coachStep}>
              {hud.coachStep > 0 && <small>{hud.coachStep}/3</small>}
              {hud.coach}
            </p>
          )}
          {hud.takeBack && hud.holding && <p className="bt-chip bt-chip--back">Take it back past the arc</p>}
          <p className="bt-odds" ref={odds} data-on="false" aria-hidden="true" />
          <p className="bt-intent" ref={intent} data-on="false" aria-hidden="true" />
          {hud.fire && <p className="bt-chip bt-chip--fire">On fire</p>}
          <div className="bt-meter" ref={meterRoot} data-on="false" aria-hidden="true">
            <b ref={green} />
            <i ref={fill} />
          </div>
          <MovePad />
          <div className="bt-buttons">
            <button
              className="bt-move"
              onPointerDown={(e) => {
                e.preventDefault();
                pressMove();
              }}
            >
              {hud.holding ? "Juke" : "Steal"}
            </button>
            <button
              className="bt-shoot"
              onPointerDown={shootDown}
              onPointerUp={shootUp}
              onPointerCancel={() => (runtime.shooting = false)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                  e.preventDefault();
                  e.stopPropagation();
                  runtime.shooting = true;
                }
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  shootUp();
                }
              }}
            >
              {hud.holding ? "Shoot" : "Jump"}
            </button>
          </div>
          <p className="bt-keys keyboard-hint">
            WASD move · hold Space, let go in the green · Shift: juke, or toward the rim to drive and dunk · on D: Space blocks, Shift steals
          </p>
        </>
      )}
      <p className="sr-only" aria-live="polite">
        {hud.announce}
      </p>
      {hud.result && (
        <div className="bt-result" role="dialog" aria-label={hud.result.title}>
          <span>{hud.result.won ? "Final" : "Game"}</span>
          <h2>{hud.result.title}</h2>
          {hud.result.medal && <p className="bt-medal">{hud.result.medal}</p>}
          <ResultCard
            game={mode === "1v1" ? "basketball" : undefined}
            score={hud.result.score}
            unit={hud.result.unit}
            best={hud.result.best}
            detail={hud.result.detail}
            onReplay={() => beginRound()}
            onBack={closeCourt}
            backLabel="Back to the court"
          />
          {mode === "1v1" && hud.result.won && nextRival && (
            <button className="quiet-button bt-next" onClick={() => beginRound("1v1", nextRival)}>
              Take on {RIVALS[nextRival].name} →
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Everything the HUD shows on the court. */
export function BasketballHud({ hidden }: { hidden: boolean }) {
  const playing = useGameMode((s) => s.active?.id === "basketball");
  const hosted = useLauncherHosted("basketball");
  // In play the HUD is drawn over the canvas by Basketball.tsx.
  if (playing) return null;
  return (
    <>
      <div className="challenge-heading bt-heading">
        <h1>Blacktop</h1>
        <p className="touch-hint">1v1 to 15 · drag to move · Shoot and Juke buttons · drive at the rim to dunk</p>
      </div>
      <CourtControls hidePlay={hosted} />
      <RoomStory scene="basketball" hidden={hidden} />
    </>
  );
}
