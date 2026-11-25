import { useCallback, useMemo, useRef, type RefCallback } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { KickResult } from "../core/fieldGoal";
import { STADIUM_KICKS } from "../core/stadiumChallenge";
import { useGame } from "../core/store";

export type StadiumPhase = "power" | "aim" | "flight" | "result";
export type StadiumOutcome = KickResult | "Blocked";

function TimingBar({
  label,
  window,
  cursor,
  locked,
  active = false,
}: {
  label: string;
  window?: readonly [number, number];
  cursor?: RefCallback<HTMLSpanElement>;
  locked?: number;
  active?: boolean;
}) {
  return (
    <div className="stadium-game-bar" data-active={active}>
      <span>{label}</span>
      <div className="stadium-game-track" aria-hidden="true">
        {window && (
          <span
            className="stadium-game-zone"
            style={{
              left: `${window[0] * 100}%`,
              width: `${(window[1] - window[0]) * 100}%`,
            }}
          />
        )}
        {(cursor || locked !== undefined) && (
          <span
            className="stadium-game-cursor"
            ref={cursor}
            style={
              locked === undefined ? undefined : { left: `${locked * 100}%` }
            }
          />
        )}
      </div>
    </div>
  );
}

function outcomeText(
  result: StadiumOutcome | undefined,
  postHit: "post" | "crossbar" | null,
) {
  if (result === "Good")
    return postHit === "post"
      ? "In off the post!"
      : postHit === "crossbar"
        ? "In off the bar!"
        : "Good!";
  if (result === "Blocked") return "Blocked at the line!";
  if (!result) return "";
  return postHit
    ? `Off the ${postHit === "post" ? "post" : "crossbar"}!`
    : result;
}

export function StadiumGameHud({
  attempt,
  wind,
  phase,
  finished,
  results,
  postHit,
  lockedPower,
  powerTarget,
  aimWindow,
  cursor,
  rushBar,
  readTiming,
  onAction,
  onSteer,
  onClose,
}: {
  attempt: number;
  wind: number;
  phase: StadiumPhase;
  finished: boolean;
  results: readonly StadiumOutcome[];
  postHit: "post" | "crossbar" | null;
  lockedPower: number;
  powerTarget: number;
  aimWindow: readonly [number, number];
  cursor: RefCallback<HTMLSpanElement>;
  rushBar: RefCallback<HTMLSpanElement>;
  readTiming: () => number;
  onAction: (sample?: number) => void;
  onSteer: (dir: number) => void;
  onClose: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const hidden = useGame((s) => s.paused || s.panel !== "none" || s.build);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const focusAction = useCallback(
    (button: HTMLButtonElement | null) =>
      button?.focus({ preventScroll: true }),
    [],
  );
  const keySample = useRef<number | undefined>(undefined);
  const pointerSample = useRef<number | undefined>(undefined);
  const result = results[attempt];
  const outcome = outcomeText(result, postHit);
  const status =
    phase === "power"
      ? "Stop the bar in green."
      : phase === "aim"
        ? "Quick, line up the kick!"
        : phase === "flight"
          ? "Steer it!"
          : finished
            ? `${outcome} · Round over`
            : outcome;
  const action =
    phase === "power"
      ? "Set power"
      : phase === "aim"
        ? "Kick"
        : finished
          ? "Play again"
          : "Next kick";
  const steerButton = (dir: number, label: string) => (
    <button
      key={dir}
      type="button"
      className="stadium-game-steer"
      aria-label={dir < 0 ? "Curve left" : "Curve right"}
      onPointerDown={(event) => {
        if (event.isPrimary && event.button === 0) {
          event.currentTarget.setPointerCapture(event.pointerId);
          onSteer(dir);
        }
      }}
      onPointerUp={() => onSteer(0)}
      onPointerCancel={() => onSteer(0)}
      onLostPointerCapture={() => onSteer(0)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );
  return hidden ? null : (
    <Html
      fullscreen
      portal={portal}
      zIndexRange={[40, 40]}
      calculatePosition={(_object, _camera, size) => [
        size.width / 2,
        size.height / 2,
      ]}
    >
      <section
        className="stadium-game-stage"
        aria-label="49ers field goals"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (
            event.code === "Space" &&
            event.target instanceof HTMLButtonElement
          )
            event.stopPropagation();
        }}
      >
        <div className="stadium-game-score">
          <strong>49ERS</strong>
          <small>FIELD GOALS</small>
        </div>
        <button
          className="stadium-game-close"
          type="button"
          onClick={onClose}
          aria-label="Close field goals"
        >
          Close
        </button>
        <div className="stadium-game-dock">
          <p
            role="status"
            data-result={phase === "result" ? result : undefined}
          >
            <span key={phase === "result" ? attempt : phase}>{status}</span>
          </p>
          <div className="stadium-game-controls">
            <div className="stadium-game-info">
              <div className="stadium-game-progress">
                <span>
                  Kick {attempt + 1}/{STADIUM_KICKS.length}
                </span>
                <div className="stadium-game-kicks" aria-hidden="true">
                  {STADIUM_KICKS.map((_, index) => (
                    <i
                      key={index}
                      data-state={
                        results[index] === "Good"
                          ? "made"
                          : results[index]
                            ? "missed"
                            : index === attempt
                              ? "current"
                              : undefined
                      }
                    />
                  ))}
                </div>
              </div>
              {(phase === "power" || phase === "aim") && (
                <div
                  className="stadium-game-rush"
                  role="progressbar"
                  aria-label="Rush closing in"
                >
                  <span ref={rushBar} />
                </div>
              )}
              <span>
                {wind
                  ? `Wind ${Math.round(Math.abs(wind) * 10)} ${wind > 0 ? "→" : "←"}`
                  : "Wind calm"}
              </span>
            </div>
            <div className="stadium-game-bars">
              <TimingBar
                label="Power"
                active={phase === "power"}
                window={[powerTarget, 1]}
                cursor={phase === "power" ? cursor : undefined}
                locked={phase === "power" ? undefined : lockedPower}
              />
              <TimingBar
                label="Aim"
                active={phase === "aim"}
                window={phase !== "power" ? aimWindow : undefined}
                cursor={phase !== "power" ? cursor : undefined}
              />
            </div>
            {phase === "flight" ? (
              <div className="stadium-game-steer-pad">
                {steerButton(-1, "◀")}
                {steerButton(1, "▶")}
              </div>
            ) : (
              <button
                type="button"
                ref={focusAction}
                onPointerDown={(event) => {
                  if (event.isPrimary && event.button === 0)
                    pointerSample.current = readTiming();
                }}
                onPointerCancel={() => {
                  pointerSample.current = undefined;
                }}
                onBlur={() => {
                  keySample.current = undefined;
                }}
                onKeyDown={(event) => {
                  if (event.code !== "Space" && event.key !== "Enter") return;
                  if (event.repeat) event.preventDefault();
                  else keySample.current = readTiming();
                }}
                onClick={(event) => {
                  const sample =
                    event.detail === 0
                      ? keySample.current
                      : pointerSample.current;
                  keySample.current = pointerSample.current = undefined;
                  onAction(sample);
                }}
              >
                <span>{action}</span>
                {(phase === "power" || phase === "aim") && (
                  <kbd aria-hidden="true">Space</kbd>
                )}
              </button>
            )}
          </div>
        </div>
      </section>
    </Html>
  );
}
