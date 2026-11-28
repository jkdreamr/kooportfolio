import { useCallback, useMemo, useRef, type RefCallback } from "react";
import { screenOverlayNoOcclude } from "../world/screenOverlay";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { KickResult } from "../core/fieldGoal";
import { MISSES_ALLOWED, DAILY_DISTANCES, snapClock, windMph, type Attempt, type Drive, type DriveMode } from "../core/stadiumChallenge";
import { useGame } from "../core/store";
import { ResultCard } from "../ui/ResultCard";

export type StadiumPhase = "power" | "aim" | "flight" | "result";
export type StadiumOutcome = KickResult;

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
        {window && window[1] > window[0] && (
          <span className="stadium-game-zone" style={{ left: `${window[0] * 100}%`, width: `${(window[1] - window[0]) * 100}%` }} />
        )}
        {(cursor || locked !== undefined) && (
          <span className="stadium-game-cursor" ref={cursor} style={locked === undefined ? undefined : { left: `${locked * 100}%` }} />
        )}
      </div>
    </div>
  );
}

/** Two words on why a kick missed (or how it went in). */
function outcomeText(result: StadiumOutcome | undefined, hit: "post" | "crossbar" | null) {
  if (result === "Good") return hit === "post" ? "In off the upright!" : hit === "crossbar" ? "Over off the bar!" : "It's good!";
  if (result === "Blocked") return "Blocked: too slow";
  if (result === "Doink") return `Off the ${hit === "crossbar" ? "crossbar" : "upright"}`;
  return result ?? "";
}

export function StadiumGameHud({
  attempt,
  drive,
  phase,
  last,
  summary,
  lockedPower,
  powerWindow,
  aimWindow,
  cursor,
  clockBar,
  readElapsed,
  onAction,
  onClose,
}: {
  attempt: Attempt;
  drive: Drive;
  phase: StadiumPhase;
  last: { result: StadiumOutcome; hit: "post" | "crossbar" | null; points: number; overswing: boolean } | null;
  summary: null | { score: number; longest: number; made: number; newBest: boolean; mode: DriveMode };
  lockedPower: number;
  powerWindow: readonly [number, number];
  aimWindow: readonly [number, number];
  cursor: RefCallback<HTMLSpanElement>;
  clockBar: RefCallback<HTMLSpanElement>;
  readElapsed: () => number;
  onAction: (elapsed?: number) => void;
  onClose: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const portal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);
  const focusAction = useCallback((button: HTMLButtonElement | null) => button?.focus({ preventScroll: true }), []);
  const keySample = useRef<number | undefined>(undefined);
  const pointerSample = useRef<number | undefined>(undefined);
  const timed = Number.isFinite(snapClock(attempt.rung));
  const wind = attempt.spot.wind;
  const windText = wind ? `wind ${windMph(wind)} mph ${wind > 0 ? "→" : "←"}` : "wind calm";
  const outcome = last && phase === "result" ? outcomeText(last.result, last.hit) : "";
  const status =
    phase === "power"
      ? attempt.rung === 0 && drive.mode === "drive"
        ? "Stop the power bar in green, then the aim arrow on the posts."
        : timed
          ? "Snap! Set the power before the ring runs out."
          : "Stop the power bar in green."
      : phase === "aim"
        ? "Aim at the posts."
        : phase === "flight"
          ? ""
          : `${outcome}${last && last.points ? ` · +${last.points}` : ""}`;
  const action = phase === "power" ? "Set power" : phase === "aim" ? "Kick" : drive.over ? "Play again" : "Next kick";
  const missesLeft = MISSES_ALLOWED - drive.misses;
  const over = phase === "result" && drive.over && summary;
  return hidden ? null : (
    <Html
      onOcclude={screenOverlayNoOcclude}
      fullscreen
      portal={portal}
      zIndexRange={[40, 40]}
      calculatePosition={(_object, _camera, size) => [size.width / 2, size.height / 2]}
    >
      <section
        className="stadium-game-stage"
        aria-label="49ers field goals"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.code === "Space" && event.target instanceof HTMLButtonElement) event.stopPropagation();
        }}
      >
        <div className="stadium-game-score">
          <strong>{attempt.gameWinner ? "0:03 · GAME-WINNER" : `${attempt.yards}-YARD ATTEMPT`}</strong>
          <small>
            {drive.score} pts · {drive.mode === "daily" ? `kick ${Math.min(drive.kicks + 1, DAILY_DISTANCES.length)}/${DAILY_DISTANCES.length}` : `misses left ${"●".repeat(Math.max(0, missesLeft))}${"○".repeat(MISSES_ALLOWED - Math.max(0, missesLeft))}`}
          </small>
        </div>
        <button className="stadium-game-close" type="button" onClick={onClose} aria-label="Close field goals">
          Close
        </button>
        {over ? (
          <div className="stadium-game-dock stadium-game-result">
            <p className="stadium-game-eyebrow">{summary.mode === "daily" ? "Daily kicks" : "Drive over"}</p>
            <ResultCard
              score={summary.score}
              unit="points"
              best={summary.newBest}
              game="stadium"
              detail={`Longest ${summary.longest ? `${summary.longest} yd` : "none"} · ${summary.made} made`}
              onReplay={() => onAction()}
              onBack={onClose}
              backLabel="Leave the field"
            />
          </div>
        ) : (
          <div className="stadium-game-dock">
            <p role="status" aria-live="polite" data-result={phase === "result" ? last?.result : undefined}>
              <span key={phase === "result" ? drive.kicks : phase}>{status}</span>
            </p>
            <div className="stadium-game-controls">
              <div className="stadium-game-info">
                <span>
                  {attempt.yards}-yard attempt · {windText}
                </span>
                {timed && (phase === "power" || phase === "aim") && (
                  <div className="stadium-game-rush" role="progressbar" aria-label={phase === "power" ? "Snap clock" : "Swing window"}>
                    <span ref={clockBar} />
                  </div>
                )}
              </div>
              <div className="stadium-game-bars">
                <TimingBar
                  label="Power"
                  active={phase === "power"}
                  window={powerWindow}
                  cursor={phase === "power" ? cursor : undefined}
                  locked={phase === "power" ? undefined : lockedPower}
                />
                <TimingBar label="Aim" active={phase === "aim"} window={phase !== "power" ? aimWindow : undefined} cursor={phase === "aim" ? cursor : undefined} />
              </div>
              {phase !== "flight" && (
                <button
                  type="button"
                  className="stadium-game-action"
                  ref={focusAction}
                  onPointerDown={(event) => {
                    if (event.isPrimary && event.button === 0) pointerSample.current = readElapsed();
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
                    else keySample.current = readElapsed();
                  }}
                  onClick={(event) => {
                    const sample = event.detail === 0 ? keySample.current : pointerSample.current;
                    keySample.current = pointerSample.current = undefined;
                    onAction(sample);
                  }}
                >
                  <span>{action}</span>
                  {(phase === "power" || phase === "aim") && <kbd aria-hidden="true">Space</kbd>}
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </Html>
  );
}
