import { useCallback, useMemo, useRef, type RefCallback } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { KickResult } from "../core/fieldGoal";
import {
  STADIUM_KICKS,
} from "../core/stadiumChallenge";
import { useGame } from "../core/store";

export type StadiumPhase = "power" | "aim" | "flight" | "result";

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

export function StadiumGameHud({
  attempt,
  wind,
  phase,
  finished,
  results,
  lockedPower,
  powerTarget,
  aimWindow,
  cursor,
  readTiming,
  onAction,
  onClose,
}: {
  attempt: number;
  wind: number;
  phase: StadiumPhase;
  finished: boolean;
  results: readonly KickResult[];
  lockedPower: number;
  powerTarget: number;
  aimWindow: readonly [number, number];
  cursor: RefCallback<HTMLSpanElement>;
  readTiming: () => number;
  onAction: (sample?: number) => void;
  onClose: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
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
  const outcome = result;
  const status =
    phase === "power"
      ? "Stop the bar in green."
      : phase === "aim"
        ? "Now line up the kick."
        : phase === "flight"
          ? "In flight"
          : outcome;
  const action =
    phase === "power"
      ? "Set power"
      : phase === "aim" || phase === "flight"
        ? "Kick"
        : finished
          ? "Play again"
          : "Next kick";
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
            <button
              type="button"
              aria-disabled={phase === "flight"}
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
          </div>
        </div>
      </section>
    </Html>
  );
}
