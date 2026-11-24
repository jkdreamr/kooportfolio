import { useCallback, useMemo, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { KickResult } from "../core/fieldGoal";
import {
  STADIUM_KICKS,
  STADIUM_TARGET,
  type StadiumScore,
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
  cursor?: RefObject<HTMLSpanElement | null>;
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
  score,
  best,
  attempt,
  wind,
  phase,
  finished,
  result,
  lockedPower,
  powerTarget,
  aimWindow,
  cursor,
  onAction,
  onClose,
}: {
  score: StadiumScore;
  best: number;
  attempt: number;
  wind: number;
  phase: StadiumPhase;
  finished: boolean;
  result: KickResult | null;
  lockedPower: number;
  powerTarget: number;
  aimWindow: readonly [number, number];
  cursor: RefObject<HTMLSpanElement | null>;
  onAction: () => void;
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
  const win = score.points >= STADIUM_TARGET;
  const outcome = result === "Good" ? `Good! +${2 + score.streak}` : result;
  const status =
    phase === "power"
      ? "Tap or press Space in the green."
      : phase === "aim"
        ? "Time the aim."
        : phase === "flight"
          ? "In flight"
          : finished
            ? `${outcome} · ${win ? "Target hit" : "Target missed"}`
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
          <span>
            {score.points} / {STADIUM_TARGET} <small>PTS</small>
          </span>
          <small>BEST {best}</small>
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
            {status}
          </p>
          <div className="stadium-game-controls">
            <div className="stadium-game-info">
              <span>
                Kick {attempt + 1}/{STADIUM_KICKS.length}
              </span>
              {score.streak > 1 && <strong>{score.streak} in a row</strong>}
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
              onClick={onAction}
            >
              {action}
            </button>
          </div>
        </div>
      </section>
    </Html>
  );
}
